import {
    BookmarkType,
    Status,
    SyncErrorKind,
    SyncNowMessage,
    type BookmarkEntry,
    type DiffResultType,
    type FlatBookmarks,
    type LocalBookmarkEntry,
    type MessageResponse,
    type StorageAdapter,
} from '@/entrypoints/shared/types'
import {
    notificationsEnableSetting,
    registerSettingsWatcher,
    setDefaultSettings,
    SettingsKeys,
    syncBaseBookmarks,
    syncLastErrorSetting,
    syncLastSyncDateSetting,
    syncLastSyncValueSetting,
    unregisterSettingsWatcher,
} from '@/entrypoints/shared/localsettings'

import { Alarm, TickAlarmName } from './bookmarks/alarm'
import { Bookmarks } from './bookmarks/bookmarks'
import { Storage } from './bookmarks/storage'
import { applyRemote, diffBase, emptyDiffResult, hasModifications } from './bookmarks/sync'
import { AppNotInstalledError, GitHubApiError, RemoteFileMissingError } from './bookmarks/gh-utils'
import { syncErrorMessage } from '@/entrypoints/shared/syncutils'

/**
 * Background service worker.
 *
 * Listeners are registered synchronously at the top level: MV3 tears the worker
 * down when idle and replays events into a fresh one, so anything registered
 * inside an async callback would miss events after the first suspend.
 */

const storage = Storage.instance

/**
 * One side of a three-way comparison — the local browser, or the sync target —
 * in the three forms the merge needs it.
 *
 * @typeParam T - Node type of this side's tree. The local side is
 * `LocalBookmarkEntry`, since it carries the browser node ids the apply pass
 * addresses; the remote side is plain `BookmarkEntry`.
 */
export type SyncSide<T extends BookmarkEntry = BookmarkEntry> = {
    /** The tree itself. */
    tree: Bookmarks<T>
    /** {@link tree} flattened, for keyed lookups during apply. */
    flat: FlatBookmarks<T>
    /** What this side changed relative to the base snapshot. */
    diff: DiffResultType
    /**
     * Version token this side was read at. Remote side only, and only when the
     * read actually returned content — an unchanged read leaves it undefined.
     */
    version?: string
}

/**
 * Shape check for a payload read back from a sync target, before it's adopted
 * as the remote tree.
 *
 * `fromXbsBookmarks` takes its input as-is with no validation — by design, for
 * the base-snapshot case where the input is our own previously-written output.
 * The remote read is different: it's someone else's file, possibly hand-edited
 * or truncated, and adopting a malformed shape flattens to an empty tree, which
 * diffs as "everything was removed" and drives `removeTree` for real. This is
 * the check standing between that and actual data loss.
 *
 * @param value - Parsed JSON from a target read.
 * @returns Whether it's usable as a bookmark tree root: a folder whose children
 * include both anchors.
 */
const isValidRemoteTree = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false

    const { type, children } = value as BookmarkEntry
    if (type !== BookmarkType.folder || !Array.isArray(children)) return false

    const hasBookmarkBar = children.some(c => c && typeof c === 'object' && c.type === BookmarkType.bookmarkbar)
    const hasOther = children.some(c => c && typeof c === 'object' && c.type === BookmarkType.other)

    return hasBookmarkBar && hasOther
}

/**
 * Reads the browser's current bookmark tree and diffs it against the base.
 *
 * @param baseMap - Flattened base snapshot from the last successful sync.
 * @returns The local side of the comparison. `version` is never set: the local
 * tree has no version token, only the sync target does.
 */
const checkLocal = async (baseMap: FlatBookmarks): Promise<SyncSide<LocalBookmarkEntry>> => {
    // browser's current bookmark tree.
    const local: Bookmarks<LocalBookmarkEntry> = new Bookmarks<LocalBookmarkEntry>()
    const [root] = await browser.bookmarks.getTree()
    if (root) {
        local.fromBrowser(root)
    }
    const flat = local.flatten()

    return { tree: local, flat, diff: diffBase(baseMap, flat) }
}

/**
 * Reads the sync target and diffs it against the base.
 *
 * @param adapter - Adapter for the configured target.
 * @param baseMap - Flattened base snapshot from the last successful sync.
 * @returns The remote side of the comparison. When the target is still at the
 * version last seen, this is an empty tree with an empty diff and no `version` —
 * indistinguishable from "remote has no changes", which is exactly how the
 * caller treats it.
 */
const checkRemote = async (adapter: StorageAdapter, baseMap: FlatBookmarks): Promise<SyncSide> => {
    const lastChange = await syncLastSyncValueSetting.getValue()
    const readData = await adapter.read(lastChange)

    if (!readData.changed) {
        return { tree: new Bookmarks(), flat: new Map(), diff: emptyDiffResult() }
    }

    const remote: Bookmarks = new Bookmarks()
    if (readData.content !== '') {
        const parsed: unknown = JSON.parse(readData.content)
        if (!isValidRemoteTree(parsed)) {
            throw new Error('[xbooksync] remote content is not a valid bookmark tree')
        }

        remote.fromXbsBookmarks(parsed as BookmarkEntry)
    }

    const flat = remote.flatten()
    return { tree: remote, flat, diff: diffBase(baseMap, flat), version: readData.blobVersion }
}

/**
 * Re-reads the browser's bookmark tree, with no diff.
 *
 * Used after {@link applyRemote} has mutated the tree, to capture the merged
 * result — the pre-apply tree from {@link checkLocal} is stale by then, and the
 * new nodes' ids exist only in the browser.
 */
const readLocal = async (): Promise<Bookmarks<LocalBookmarkEntry>> => {
    const local: Bookmarks<LocalBookmarkEntry> = new Bookmarks<LocalBookmarkEntry>()
    const [root] = await browser.bookmarks.getTree()
    if (root) {
        local.fromBrowser(root)
    }

    return local
}

/**
 * One sync pass: three-way merge between the browser, the sync target, and the
 * base snapshot recorded at the end of the last successful pass.
 *
 * Diffing both sides against that common ancestor is what distinguishes a real
 * edit from a stale copy, and gives four cases:
 *
 * - neither side changed — nothing to do;
 * - local only — push the browser's tree to the target;
 * - remote only — apply the target's tree to the browser;
 * - both — apply remote onto local, then push the merged result back.
 *
 * Every branch that changes something ends by recording the new version token,
 * the timestamp, and a fresh base snapshot; getting that base wrong is what
 * would make the next pass misread an old edit as a new one.
 *
 * Failures propagate: an adapter that throws aborts the pass with the stored
 * version and base untouched, so the next tick retries from the same state.
 */
const runSync = async () => {
    const now = new Date().toISOString()
    const adapter = storage.getStorageAdapter()

    // base bookmarks from last sync
    const baseSnapshot = await syncBaseBookmarks.getValue()
    const base = new Bookmarks()
    if (baseSnapshot) base.fromXbsBookmarks(baseSnapshot)

    const baseMap = base.flatten()
    const localSync = await checkLocal(baseMap)
    const remoteSync = await checkRemote(adapter, baseMap)

    if (!hasModifications(localSync.diff) && !hasModifications(remoteSync.diff)) {
        // Both sides still match the base. Nothing to write, and crucially
        // nothing to record either — leaving the stored version and base alone
        // keeps the next pass comparing against the same ancestor.
        return
    } else if (hasModifications(localSync.diff) && !hasModifications(remoteSync.diff)) {
        // Local-only: the browser is ahead, so push it and let the conditional
        // write reject if the target moved between the read above and here.
        const lastChange = await syncLastSyncValueSetting.getValue()
        const currVersion = await adapter.write(localSync.tree.getContent(), remoteSync.version ?? lastChange)

        // Update the Sync Value and Date
        await syncLastSyncValueSetting.setValue(currVersion)
        await syncLastSyncDateSetting.setValue(now)

        // The base is stored in the same canonical form that was just written.
        await syncBaseBookmarks.setValue(JSON.parse(localSync.tree.getContent()))
    } else if (!hasModifications(localSync.diff) && hasModifications(remoteSync.diff)) {
        // Remote-only: the browser still matches the base, so the target's tree
        // can be applied wholesale. This is the case applyRemote's preconditions
        // are written for.
        await applyRemote({
            diff: remoteSync.diff,
            remoteFlat: remoteSync.flat,
            localFlat: localSync.flat,
            baseFlat: baseMap,
            localRoot: localSync.tree.getBookmarks(),
        })

        // Always set here: this branch is only reached on a changed read.
        if (remoteSync.version) await syncLastSyncValueSetting.setValue(remoteSync.version)
        await syncLastSyncDateSetting.setValue(now)
        // The remote tree is what the browser now holds, so it becomes the next
        // base — re-serialized rather than stored as parsed, so the shape comes
        // from `getContent` here as it does in every other branch instead of
        // from whatever the target happened to hold.
        await syncBaseBookmarks.setValue(JSON.parse(remoteSync.tree.getContent()))
    } else {
        // Both sides changed. Fold the remote diff into the local tree, then
        // push the result — so the write carries local edits the target hasn't
        // seen as well as the remote ones just applied.
        //
        // Note this resolves conflicts in the remote's favour without saying so:
        // applyRemote's preconditions don't hold here (see its doc comment), so
        // a node edited locally and removed remotely is removed, and a node
        // edited on both sides takes the remote title.
        await applyRemote({
            diff: remoteSync.diff,
            remoteFlat: remoteSync.flat,
            localFlat: localSync.flat,
            baseFlat: baseMap,
            localRoot: localSync.tree.getBookmarks(),
        })

        // applyRemote mutated the browser directly, so the tree read before it
        // is stale — only a re-read has the merged result and the created ids.
        const merged = await readLocal()

        // Based on the version just read, not the one last written: the target
        // moved, and passing the stale token would make the write fail.
        const currVersion = await adapter.write(merged.getContent(), remoteSync.version)

        // Track the new version
        await syncLastSyncValueSetting.setValue(currVersion)
        await syncLastSyncDateSetting.setValue(now)
        // The base is stored in the same canonical form that was just written.
        await syncBaseBookmarks.setValue(JSON.parse(merged.getContent()))
    }
}

// Collapses overlapping triggers (tick alarm, manual "sync now") into the same
// in-flight pass instead of racing two runSync calls against the browser and
// the sync target.
let inFlight: Promise<void> | null = null
const syncFunc = () =>
    (inFlight ??= runSync()
        .then(async () => {
            await syncLastErrorSetting.setValue(null)
            await setBadge('', '')
        })
        .catch(async error => {
            const kind = classifySyncError(error)
            console.error(`[xbooksync] sync failed: ${kind}`, error)

            await syncLastErrorSetting.setValue({
                kind,
                message: error instanceof Error ? error.message : String(error),
                at: new Date().toISOString(),
            })

            if (await notificationsEnableSetting.getValue()) {
                const badge = badgeForErrorKind(kind)
                await setBadge(badge.text, badge.color)

                // The badge is easy to miss when the icon isn't pinned to the
                // toolbar — fall back to a notification for the kinds that were
                // worth badging in the first place. Conflicts stay silent either
                // way; see badgeForErrorKind.
                if (badge.text && !(await isPinned())) {
                    browser.notifications.create({
                        type: 'basic',
                        iconUrl: browser.runtime.getURL('/icon/128.png'),
                        title: 'XBookSync sync failed',
                        message: syncErrorMessage(kind),
                    })
                }
            }
        })
        .finally(() => {
            inFlight = null
        }))

const classifySyncError = (error: unknown): SyncErrorKind => {
    if (error instanceof RemoteFileMissingError) return SyncErrorKind.RemoteMissing
    if (error instanceof AppNotInstalledError) return SyncErrorKind.AuthRequired

    if (error instanceof GitHubApiError) {
        if (error.status === 401 || error.status === 403) return SyncErrorKind.AuthRequired
        if (error.status === 409 || error.status === 422) return SyncErrorKind.Conflict
        if (error.status >= 500) return SyncErrorKind.ServerError
        return SyncErrorKind.Unknown
    }

    if (error instanceof TypeError) return SyncErrorKind.Network

    return SyncErrorKind.Unknown
}

/**
 * Sets the extension icon's badge, on whichever action API this build's
 * manifest exposes.
 *
 * Chrome's MV3 manifest declares `action`; Firefox's MV2 manifest — this
 * project's Firefox build target, see `.output/firefox-mv2*` — declares
 * `browser_action` instead, so the runtime object is `browser.browserAction`.
 * Same methods either way, just under a different name, which is why
 * `browser.action.setBadgeText` throws "browser.action is undefined" on
 * Firefox.
 *
 * @param text - Badge text; `''` clears it.
 * @param color - Badge background color; ignored when `text` is `''`.
 */
const setBadge = async (text: string, color: string): Promise<void> => {
    const action = browser.action ?? browser.browserAction
    await action.setBadgeText({ text })
    if (text) await action.setBadgeBackgroundColor({ color })
}

/**
 * Badge shown on the extension icon for a sync failure.
 *
 * Blank for {@link SyncErrorKind.Conflict}: a stale-SHA write conflict just
 * means another browser synced first, which is expected under normal
 * multi-device use and resolves itself on the next tick — badging it would
 * train the user to ignore the badge.
 *
 * @param kind - Classification from {@link classifySyncError}.
 */
const badgeForErrorKind = (kind: SyncErrorKind): { text: string; color: string } => {
    switch (kind) {
        case SyncErrorKind.RemoteMissing:
        case SyncErrorKind.Unknown:
            return { text: '!', color: '#dc2626' }
        case SyncErrorKind.AuthRequired:
        case SyncErrorKind.Network:
        case SyncErrorKind.ServerError:
            return { text: '!', color: '#f59e0b' }
        case SyncErrorKind.Conflict:
            return { text: '', color: '#00000000' }
    }
}

/**
 * Whether the extension's icon is pinned to the visible toolbar, as opposed to
 * sitting behind the puzzle-piece overflow menu where the badge set above is
 * easy to miss.
 *
 * Chrome-only: `getUserSettings` has no Firefox equivalent, so there's no
 * signal there — default to "assume pinned" and rely on the badge alone.
 */
const isPinned = async (): Promise<boolean> => {
    if (!import.meta.env.CHROME) return true

    const { isOnToolbar } = await browser.action.getUserSettings()
    return isOnToolbar
}

const alarm = new Alarm(syncFunc)

export default defineBackground(() => {
    // On first install
    browser.runtime.onInstalled.addListener(handleSetup)

    // On browser start
    browser.runtime.onStartup.addListener(handleStartup)

    // On message from popup
    browser.runtime.onMessage.addListener(handleMessages)

    // On every scheduled tick
    browser.alarms.onAlarm.addListener(alarm.handleTickAlarm)

    // Cleanup any settings watcher
    browser.runtime.onSuspend.addListener(() => {
        unregisterSettingsWatcher(TickAlarmName)
        storage.cleanup()
    })

    // Not just on install: a worker revived by any event re-runs this, which is
    // what repairs the alarm if it was ever lost (browser update, profile move).
    void alarm.ensureTickAlarm()

    // listen for changes to the sync rate
    void registerSettingsWatcher<number>(TickAlarmName, SettingsKeys.syncRate, (_newVal, _oldVal) => {
        alarm.resetTickAlarm()
    })
})

/**
 * Routes messages from the popup.
 *
 * {@link SyncNowMessage} is fired and forgotten — the reply says the sync was
 * *started*, not that it succeeded, since `syncFunc` is deliberately not awaited
 * here. Reporting the real outcome would mean awaiting it and replying from the
 * promise, which is what the open channel below already allows for.
 *
 * @param message - The message name; anything unrecognized is answered with
 * {@link Status.Error}.
 * @param _ - Sender, unused: the popup is the only thing that messages the
 * worker, so there is nothing to distinguish.
 * @param sendResponse - Reply callback, invoked exactly once on every path.
 * @returns `true`, keeping the message channel open for an asynchronous
 * `sendResponse`. Not needed by the current synchronous path, but returning
 * false would close the channel and break the awaited variant above.
 */
const handleMessages = (
    message: string,
    _: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
) => {
    // Default to Error so an unrecognized message reports failure rather than a
    // silent success.
    const response: MessageResponse = {
        status: Status.Error,
    }

    if (message === SyncNowMessage) {
        // call the bookmark sync function
        syncFunc()
        response.status = Status.Success
    }

    sendResponse(response)

    return true
}

/**
 * Restores the tick alarm at the start of each browser session.
 *
 * Alarms are session scoped — Firefox creates them for the current session
 * only, and Chrome clears them on restart unless `persistAcrossSessions` was
 * set — so last session's alarm is already gone by the time this runs.
 *
 * Registering the listener is key to running the extension:
 * profile startup fires `onStartup` but invokes no other worker events, so
 * without it nothing would start the worker to re-create the alarm and ticks
 * would stay dead until the popup happened to send a message.
 */
const handleStartup = async () => {
    await alarm.ensureTickAlarm()
}

/**
 * Seeds default settings on install so the popup never renders against empty
 * storage.
 *
 * Fires on update as well as install, but {@link setDefaultSettings} seeds a
 * profile only once, so an existing profile's settings survive an update rather
 * than being overwritten with defaults.
 *
 * @param _ - Install reason and previous version, unused.
 */
const handleSetup = async (_: Browser.runtime.InstalledDetails) => {
    await setDefaultSettings()
}
