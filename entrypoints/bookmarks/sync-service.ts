/**
 * Sync scheduling: when a pass runs, and what is allowed to trigger one.
 *
 * The merge itself lives in `sync.ts` and `runSync` in `entrypoints/background.ts`;
 * nothing here knows what a bookmark is. What it owns is everything around a
 * pass — collapsing a burst of triggers into one, keeping two passes from
 * overlapping, ignoring the events a pass causes itself, and refusing to hammer
 * a target that just failed.
 *
 * Every field is in-memory and therefore lost whenever MV3 tears the worker
 * down. That is deliberate and safe: the engine is snapshot-based, so a pass
 * that never runs is only a delayed sync, never a lost edit — the next one
 * diffs the whole tree and finds whatever was missed. Nothing here may become
 * load-bearing for correctness.
 */

import { syncEnableSetting } from '../shared/localsettings'
import { BookmarkEvent, type SelfWrite, type SyncTrigger } from '../shared/types'

/**
 * The fields of an `onCreated` payload that identify the node, structurally
 * compatible with `Browser.bookmarks.BookmarkTreeNode`.
 *
 * Spelled out here rather than imported so this module keeps knowing nothing
 * about bookmarks beyond the shape it has to match against.
 */
export type CreatedNode = { parentId?: string; title: string; url?: string }

/**
 * Separator inside a create's content key.
 *
 * NUL, for the same reason `sync.ts` uses it: the parts are user-controlled, and
 * any printable separator could appear inside a title and let one node's key
 * collide with another's.
 */
const KEY_MARK = '\u0000'

/**
 * Key for a create, from the three fields that describe what was made.
 *
 * Not unique — browsers allow the same url twice in one folder, and a pass can
 * legitimately create both — which is why {@link SyncService} records a
 * timestamp *per* mutation under this key rather than one per key.
 */
const createKey = (parentId: string, title?: string, url?: string): string =>
    `${BookmarkEvent.created}${KEY_MARK}${parentId}${KEY_MARK}${title ?? ''}${KEY_MARK}${url ?? ''}`

/** Key a recorded mutation is filed under; see {@link SyncService.markSelfWrite}. */
const selfWriteKey = (write: SelfWrite): string =>
    write.event === BookmarkEvent.created
        ? createKey(write.parentId, write.title, write.url)
        : `${write.event}:${write.id}`

/** One sync pass. `onSelfWrite` must be threaded through to `applyRemote`. */
export type RunSync = (onSelfWrite: (write: SelfWrite) => void) => Promise<void>

/**
 * Outcome hook, called once per pass with the error it threw or null.
 *
 * Reporting is the caller's business — badges and notifications need
 * `browser.action` and the notification settings, which is background worker
 * territory. The service only needs to *know* a pass failed, for the cooldown.
 * Should not throw; one that does is caught and logged by `reportSafely` rather
 * than allowed into the pass loop.
 */
export type SyncReport = (error: unknown) => Promise<void>

/**
 * Owns the lifecycle of sync passes.
 *
 * States, as the fields encode them:
 *
 * - idle — `inFlight` null, no debounce timer;
 * - pending — a debounce window is open, waiting out a burst of bookmark events;
 * - running — `inFlight` set;
 * - running + dirty — something changed after the running pass took its
 *   snapshot, so another pass follows this one.
 */
export class SyncService {
    /** How long a burst of bookmark events is allowed to settle before a pass. */
    private static readonly DEBOUNCE_MS = 3_000

    /**
     * How long a self-inflicted event stays suppressible.
     *
     * Entries are consumed by the echo they match, so this only bounds the ones
     * that never arrive — an `update` the browser decided was a no-op, or a pass
     * whose events were dropped by a teardown.
     */
    private static readonly ECHO_TTL_MS = 60_000

    /** How often expired self-write records are swept out; see {@link sweepSelfWrites}. */
    private static readonly ECHO_SWEEP_MS = 1_000

    /**
     * How long after a failure bookmark activity stops triggering passes.
     *
     * A failed pass records no base, so every subsequent trigger repeats the
     * same doomed read/apply/write. The common case is a 409 from another
     * browser syncing first, which is expected and resolves itself — but only on
     * its own schedule, and retrying it at the speed of bookmark events is how
     * you end up hammering the API. The tick alarm is the retry path; this only
     * bars the bookmark one, so `manual` still works and `alarm` still retries.
     */
    private static readonly FAILURE_COOLDOWN_MS = 60_000

    /**
     * Ceiling on consecutive passes in one `runUntilClean` loop.
     *
     * The loop is driven by `dirty`, which is set by real triggers arriving
     * mid-pass, so it terminates on its own as soon as the user stops editing.
     * This is insurance against a trigger source nobody anticipated feeding
     * itself: overshooting the cap just defers the rest to the next tick.
     */
    private static readonly MAX_PASSES = 5

    /**
     * Best-effort ceiling on an import.
     *
     * `onImportEnded` is what normally clears {@link importing}, and a worker
     * teardown clears it too by construction. This covers the remaining case —
     * a live worker that is told an import began and never told it ended, which
     * would otherwise leave bookmark triggers switched off for the session.
     */
    private static readonly IMPORT_WATCHDOG_MS = 300_000

    /** The running pass, or null when idle. Shared with every caller that arrives during it. */
    private inFlight: Promise<void> | null = null

    /** Something changed after the running pass read the local tree, so it needs another. */
    private dirty = false

    /** Set between `onImportBegan` and `onImportEnded`; see {@link onImportBegan}. */
    private importing = false

    /** Timestamp of the last failed pass; 0 when the last pass succeeded. */
    private failedAt = 0

    /**
     * Each mutation we caused, keyed by {@link selfWriteKey}, against the times
     * it was recorded — ascending, one entry per mutation.
     *
     * A list rather than a single timestamp because a create key is not unique:
     * one pass can create two bookmarks with the same url in the same folder,
     * and each of them owes us an echo.
     */
    private selfWrites = new Map<string, number[]>()

    /** When {@link sweepSelfWrites} last ran. */
    private sweptAt = 0

    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private debouncePromise: Promise<void> | null = null
    private debounceFire: ((pass: Promise<void>) => void) | null = null

    private importWatchdog: ReturnType<typeof setTimeout> | null = null

    /**
     * @param runSync - Runs one pass. Errors propagate: the service needs them
     * for the cooldown and hands them to `report`.
     * @param report - Called once per pass with the error, or null on success.
     */
    constructor(
        private runSync: RunSync,
        private report: SyncReport = async () => {},
    ) {}

    /**
     * Every trigger enters here, and {@link runIfEnabled} below is the only
     * place the master switch is read — callers should not pre-check it.
     *
     * A trigger arriving mid-pass does not start a second one. It marks the
     * running pass dirty and joins it, and the loop in {@link runUntilClean}
     * runs again once it finishes: the running pass read the local tree before
     * this change existed, so merely joining it would record a base that omits
     * the change and leave it unsynced until the next tick.
     *
     * @param trigger - What asked for the sync. Only `bookmark` is subject to
     * the post-failure cooldown; the tick alarm and the popup's button are how a
     * user or a schedule gets a retry regardless.
     * @returns The pass this trigger joined or started. Never rejects — failures
     * go to `report`.
     */
    public request = (trigger: SyncTrigger): Promise<void> => {
        if (trigger === 'bookmark' && Date.now() - this.failedAt < SyncService.FAILURE_COOLDOWN_MS) {
            return Promise.resolve()
        }

        if (this.inFlight) {
            this.dirty = true
            return this.inFlight
        }

        // Assigned before the first suspension point inside runIfEnabled can
        // yield, so a caller arriving in the same tick sees the pass rather than
        // starting a second one.
        this.inFlight = this.runIfEnabled().finally(() => {
            this.inFlight = null
        })

        return this.inFlight
    }

    /**
     * Reads the master switch, then runs passes until there is nothing left.
     *
     * Split out of {@link request} so the switch is read *after* `inFlight` is
     * assigned. Read before it, its `await` would be a suspension point ahead of
     * the `inFlight` check, and two triggers delivered in the same tick — the
     * startup pass and a tick alarm, say — could both find it null and start a
     * pass each, which is the one thing this class exists to prevent. Everything
     * in `request` above the assignment must stay synchronous for that reason.
     */
    private runIfEnabled = async (): Promise<void> => {
        if (!(await syncEnableSetting.getValue())) return

        await this.runUntilClean()
    }

    /**
     * Entry point for the four `browser.bookmarks` listeners.
     *
     * The two filters run synchronously, before anything is awaited: the echo
     * check races the mutation that recorded it, and awaiting storage first
     * would widen that window for no reason.
     *
     * @param event - Which listener fired.
     * @param id - Node id the event carries.
     * @param node - The created node, which `onCreated` delivers alongside the
     * id. Required to recognize our own creates, which are recorded by content;
     * without it a create is always treated as the user's.
     * @returns The pass this event eventually lands in, so the listener can await
     * it and keep the worker from going idle underneath the debounce.
     */
    public onBookmarkEvent = (event: BookmarkEvent, id: string, node?: CreatedNode): Promise<void> => {
        if (this.importing || this.isEcho(event, id, node)) return Promise.resolve()

        return this.requestDebounced()
    }

    /**
     * Records a mutation this extension is about to be told about.
     *
     * Passed into `runSync` and threaded to `applyRemote`, which calls it before
     * each create/update/remove. Without it every remote-driven pass triggers
     * another pass from its own writes — wasted round-trips normally, and an
     * unbounded retry loop when the write that follows fails and leaves no base
     * recorded.
     *
     * Keyed by event as well as identity because a node legitimately produces
     * several events over its life: suppressing by bare id would let our own
     * `create` swallow the user's rename of that node a second later.
     */
    public markSelfWrite = (write: SelfWrite): void => {
        const key = selfWriteKey(write)
        const records = this.selfWrites.get(key)

        if (records) records.push(Date.now())
        else this.selfWrites.set(key, [Date.now()])
    }

    /**
     * Suspends bookmark triggers for the duration of an import.
     *
     * Chrome fires `onCreated` per node while importing an HTML file and
     * documents `onImportBegan`/`onImportEnded` precisely so observers can
     * ignore the burst. Without that, a debounce window closing mid-import
     * pushes a half-imported tree and records it as the base.
     */
    public onImportBegan = (): void => {
        this.importing = true

        if (this.importWatchdog) clearTimeout(this.importWatchdog)
        this.importWatchdog = setTimeout(() => {
            this.importing = false
            this.importWatchdog = null
        }, SyncService.IMPORT_WATCHDOG_MS)
    }

    /** Re-enables bookmark triggers and syncs the imported tree as one change. */
    public onImportEnded = (): Promise<void> => {
        this.importing = false

        if (this.importWatchdog) {
            clearTimeout(this.importWatchdog)
            this.importWatchdog = null
        }

        return this.requestDebounced()
    }

    /**
     * Collapses a burst of bookmark events into one pass, {@link DEBOUNCE_MS}
     * after the last of them.
     *
     * Every caller in a window gets the same promise, and it is resolved *with*
     * the pass rather than before it — so awaiting this awaits the sync itself,
     * not merely its scheduling. Superseding a window clears its timer, never
     * its promise, so a caller whose timer was cleared is still holding the live
     * one.
     *
     * The timer is ordinary `setTimeout`, which MV3 does not guarantee across a
     * suspend. What makes it dependable enough is the margin: Chrome resets the
     * worker's 30s idle timer on every incoming event and extension API call,
     * and the window is three seconds. A window lost to a teardown falls to the
     * tick alarm, which is why {@link DEBOUNCE_MS} must stay far below 30s.
     */
    private requestDebounced = (): Promise<void> => {
        this.debouncePromise ??= new Promise<void>(resolve => {
            this.debounceFire = resolve
        })
        const window = this.debouncePromise

        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        this.debounceTimer = setTimeout(() => {
            const fire = this.debounceFire

            // Cleared before firing, so an event arriving during the pass opens a
            // fresh window instead of joining the one that has already closed.
            this.debounceTimer = null
            this.debouncePromise = null
            this.debounceFire = null

            fire?.(this.request('bookmark'))
        }, SyncService.DEBOUNCE_MS)

        return window
    }

    /**
     * Runs passes until one completes with nothing left to pick up.
     *
     * `dirty` is cleared *before* the pass rather than after, so a trigger that
     * arrives while it runs is not wiped out by the pass it was too late for.
     *
     * A failure ends the loop even when dirty. Repeating a pass that just threw
     * reproduces the failure immediately — the base is unrecorded, so the next
     * pass does the same work against the same state — which is the retry loop
     * the cooldown exists to prevent.
     */
    private runUntilClean = async (): Promise<void> => {
        for (let pass = 0; pass < SyncService.MAX_PASSES; pass++) {
            this.dirty = false

            try {
                await this.runSync(this.markSelfWrite)
            } catch (error) {
                this.failedAt = Date.now()
                await this.reportSafely(error)
                return
            }

            this.failedAt = 0
            await this.reportSafely(null)

            if (!this.dirty) return
        }
    }

    /**
     * Calls {@link report} without letting it break the loop above.
     *
     * {@link SyncReport} says a reporter must not throw, but the real one
     * touches storage, `browser.action` and `browser.notifications` — any of
     * which can reject on a profile where the user revoked the notification
     * permission, or where a quota is full. A rejection escaping here would
     * propagate out through {@link request}, which is documented never to
     * reject: `void request('manual')` would become an unhandled rejection, the
     * startup and alarm listeners would reject inside the browser's dispatch,
     * and on the success path the `dirty` re-run would be skipped, deferring an
     * edit to the next tick. Nothing is lost by swallowing it — `failedAt`, the
     * only state the service keeps about the outcome, is already set.
     */
    private reportSafely = async (error: unknown): Promise<void> => {
        try {
            await this.report(error)
        } catch (reportError) {
            console.error('[xbooksync] sync outcome reporting failed', reportError)
        }
    }

    /**
     * Whether this event is the echo of a mutation we made, consuming the record
     * if so — each mutation we caused buys one free pass.
     *
     * A create is matched on the content we asked for, since that is all we knew
     * before making the call; a node the browser stored under a url it
     * normalized differently simply does not match, which costs the wasted pass
     * this suppression exists to save but is never wrong about whose edit it was.
     *
     * Expiry is decided here, on the record that was actually matched, rather
     * than left to {@link sweepSelfWrites}: the sweep is a memory measure and
     * runs on its own cadence, so nothing may depend on it having caught up.
     */
    private isEcho = (event: BookmarkEvent, id: string, node?: CreatedNode): boolean => {
        const now = Date.now()
        this.sweepSelfWrites(now)

        const key =
            event === BookmarkEvent.created
                ? node && createKey(node.parentId ?? '', node.title, node.url)
                : `${event}:${id}`
        if (key === undefined) return false

        const records = this.selfWrites.get(key)
        if (records === undefined) return false

        // Consumed either way: each mutation we caused buys one free pass, and a
        // record too old to suppress is of no use to anyone. Oldest first, which
        // is the order the echoes arrive in.
        const at = records.shift()
        if (records.length === 0) this.selfWrites.delete(key)

        return at !== undefined && at >= now - SyncService.ECHO_TTL_MS
    }

    /**
     * Drops expired records, at most once per {@link ECHO_SWEEP_MS}.
     *
     * Rate-limited because the map holds an entry per node a pass touched and
     * the echo burst that follows delivers roughly one event per entry: sweeping
     * the whole map on each of them is quadratic in the size of the apply, which
     * on a first pull against a large library is enough to stall the worker's
     * only thread. Swept here rather than on a timer — the map is read on this
     * path alone, and a timer would hold the worker awake to do it.
     */
    private sweepSelfWrites = (now: number): void => {
        if (now - this.sweptAt < SyncService.ECHO_SWEEP_MS) return
        this.sweptAt = now

        const cutoff = now - SyncService.ECHO_TTL_MS
        for (const [key, records] of this.selfWrites) {
            // Ascending, so the expired ones are a prefix.
            const live = records.findIndex(at => at >= cutoff)

            if (live === -1) this.selfWrites.delete(key)
            else if (live > 0) records.splice(0, live)
        }
    }
}
