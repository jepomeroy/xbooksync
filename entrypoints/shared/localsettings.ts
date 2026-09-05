import type { Unwatch, WatchCallback } from 'wxt/utils/storage'
import { SortOrder, StorageBackend, type BookmarkEntry, type SyncErrorType } from './types'

/**
 * Typed accessors for every persisted setting.
 *
 * `storage` is auto-imported by WXT. Defining each key once here keeps the popup
 * and the background worker reading the same key under the same type — the
 * string literals are otherwise easy to drift apart. Each item carries a
 * fallback so a read before {@link setDefaultSettings} has run still yields a
 * usable value.
 */

/** Active settings watchers, keyed by the caller-chosen name passed to {@link registerSettingsWatcher}. */
const watchers = new Map<string, Unwatch>()

/**
 * Every storage key this extension owns, declared once.
 *
 * `satisfies` keeps each entry checked against WXT's `area:name` shape while
 * `as const` preserves the literals, so {@link SettingsKey} is the exact union
 * rather than `string`. Anything taking a key — watchers, batch writes — should
 * be typed against that union so a misspelled key is a compile error instead of
 * a listener that silently never fires.
 */
export const SettingsKeys = {
    storage: 'local:storage',
    sortOrder: 'local:sortOrder',
    sorted: 'local:sortBookmarks',
    syncEnabled: 'local:syncEnabled',
    notificationsEnabled: 'local:notificationsEnabled',
    syncRate: 'local:syncrate',
    syncLastError: 'local:syncLastError',
    lastSyncDate: 'local:lastSyncDateTime',
    lastSyncValue: 'local:lastSyncValue',
    baseBookmarks: 'local:baseBookmarks',
} as const satisfies Record<string, StorageItemKey>

/** Union of the keys in {@link SettingsKeys}. */
export type SettingsKey = (typeof SettingsKeys)[keyof typeof SettingsKeys]

/** Which sync target the bookmark tree is written to. */
export const storageSetting = storage.defineItem<StorageBackend>(SettingsKeys.storage, {
    fallback: StorageBackend.GitHubRepo,
})

/**
 * Sort direction; would be ignored unless {@link sortedSetting} is on.
 *
 * Stored and surfaced in the options page, but not yet read by the sync path —
 * see the TODO in `entrypoints/bookmarks/bookmarks.ts`.
 */
export const sortOrderSetting = storage.defineItem<SortOrder>(SettingsKeys.sortOrder, {
    fallback: SortOrder.Ascending,
})

/** Whether bookmarks are sorted before being written out. Not yet applied — see {@link sortOrderSetting}. */
export const sortedSetting = storage.defineItem<boolean>(SettingsKeys.sorted, {
    fallback: false,
})

/**
 * Master switch. Checked on each alarm tick and by the popup's sync button, so
 * turning it off stops both — but it does not cancel the alarm, which keeps
 * firing and returning early.
 */
export const syncEnableSetting = storage.defineItem<boolean>(SettingsKeys.syncEnabled, {
    fallback: true,
})

/**
 * Notifications switch. Checked on each tick if there is a {@link syncLastErrorSetting} value,
 * then notifications on Chrome can be disabled and not displayed. The extension badge is still
 * displayed.
 */
export const notificationsEnableSetting = storage.defineItem<boolean>(SettingsKeys.notificationsEnabled, {
    fallback: true,
})

/**
 * Seconds between automatic syncs.
 *
 * Converted to the alarm's `periodInMinutes` and floored at 30s, the shortest
 * period the browsers honor — see `getTickPeriodInMinutes` in
 * `entrypoints/bookmarks/alarm.ts`.
 */
export const syncRateSetting = storage.defineItem<number>(SettingsKeys.syncRate, {
    fallback: 900,
})

/** Last Sync error encountered */
export const syncLastErrorSetting = storage.defineItem<SyncErrorType | null>(SettingsKeys.syncLastError, {
    fallback: null,
})

/**
 * ISO timestamp of the last sync that changed something; a pass with nothing to do leaves it alone.
 * A null valule means no sync has occurred for the current adapter
 * */
export const syncLastSyncDateSetting = storage.defineItem<string | null>(SettingsKeys.lastSyncDate, {
    // default to null
    fallback: null,
})

/**
 * Version token the sync target was last seen at — a GitHub blob SHA today,
 * an ETag or hash for other targets.
 *
 * Opaque here: only the adapter that issued it interprets it. Empty means the
 * target has never been read, which every adapter treats as "fetch everything".
 */
export const syncLastSyncValueSetting = storage.defineItem<string>(SettingsKeys.lastSyncValue, {
    fallback: '',
})

/**
 * Tree as of the last successful sync — the common ancestor both sides are
 * diffed against.
 *
 * Null before the first sync, which makes both diffs pure additions and so
 * merges the two trees rather than deleting either.
 */
export const syncBaseBookmarks = storage.defineItem<BookmarkEntry | null>(SettingsKeys.baseBookmarks, {
    fallback: null,
})

/**
 * GitHub storage settings.
 *
 * Kept separate from {@link SettingsKeys} because they are target-specific
 * rather than app-wide, and shared by both the GH Repo and GH Gist storage
 * types — the token buys access to both.
 */

export const GitHubSettingsKeys = {
    ghAuthToken: 'local:ghAuthToken',
    ghGist: 'local:ghGist',
    ghRepo: 'local:ghRepo',
} as const satisfies Record<string, StorageItemKey>

/** Union of the keys in {@link GitHubSettingsKeys}. */
export type GitHubSettingsKey = (typeof GitHubSettingsKeys)[keyof typeof GitHubSettingsKeys]

/**
 * GitHub App user-to-server token, from the device flow in `gh-app-auth.ts`.
 *
 * Empty means signed out, which is what the options page keys its Login /
 * Revoke button off. A non-empty token still reaches no repos until the app is
 * installed on an account — see `fetchGitHubRepos`.
 */
export const ghAuthToken = storage.defineItem<string>(GitHubSettingsKeys.ghAuthToken, {
    fallback: '',
})

/** GitHub Gist ID used as the sync target, when the Gist storage type is selected. */
export const ghGist = storage.defineItem<string>(GitHubSettingsKeys.ghGist, {
    fallback: '',
})

/** Repo to sync to, as `owner/name`. Empty until the user picks one from the options page. */
export const ghRepo = storage.defineItem<string>(GitHubSettingsKeys.ghRepo, {
    fallback: '',
})

/**
 * Install-time value for each setting.
 *
 * Typed as a total `Record` over {@link SettingsKey}, so adding a key to
 * {@link SettingsKeys} without seeding it here fails to compile.
 */
const defaultSettings: Record<SettingsKey, unknown> = {
    [SettingsKeys.storage]: StorageBackend.None,
    [SettingsKeys.sortOrder]: SortOrder.Ascending,
    [SettingsKeys.sorted]: false,
    [SettingsKeys.syncEnabled]: true,
    [SettingsKeys.notificationsEnabled]: import.meta.env.BROWSER === 'chrome' ? true : false, // chrome-only
    [SettingsKeys.syncRate]: 900,
    [SettingsKeys.syncLastError]: null,
    [SettingsKeys.lastSyncDate]: null,
    [SettingsKeys.lastSyncValue]: '',
    [SettingsKeys.baseBookmarks]: null,
}

/**
 * Development-only seed values for the GitHub settings, so a freshly installed
 * unpacked build syncs without going through the device flow first.
 *
 * {@link setDefaultSettings} writes these only under `import.meta.env.DEV`, so a
 * release build never seeds them and a fresh install cannot start out pointed at
 * whatever is baked in here. That gate — not remembering to blank the values
 * before a release — is what keeps them out of a shipped build.
 *
 * They still reach a real profile in dev, and a token left below is still baked
 * into every `.output` bundle, so treat this as a file that holds a live
 * credential even though it must never carry one into a commit.
 */
const debugGitHubSettings: Record<GitHubSettingsKey, unknown> = {
    // DO NOT COMMIT this with the ghAuthToken set!!!
    // Change it to a blank and paste it in from a locally stored location
    [GitHubSettingsKeys.ghAuthToken]: '',
    [GitHubSettingsKeys.ghGist]: '',
    [GitHubSettingsKeys.ghRepo]: 'jepomeroy/bookmarks-testing',
}

/**
 * Marks that {@link setDefaultSettings} has already seeded this profile, so
 * defaults are applied once rather than overwritten on each update.
 *
 * Deliberately outside {@link SettingsKeys}: it is bookkeeping rather than a
 * user setting, and listing it there would oblige {@link defaultSettings} to
 * seed it — which would mean writing the flag as part of the batch it guards.
 */
const initialized: StorageItemKey = 'local:initialized'

/**
 * Seeds every setting with its default. Called from the background worker's
 * `onInstalled` handler.
 *
 * Seeds once per profile, not once per install: `onInstalled` also fires on
 * extension update, so the {@link initialized} flag is what keeps an update from
 * resetting settings the user has since configured. Clearing that flag — or
 * clearing extension storage — makes the next call seed again.
 *
 * Written as one `setItems` batch rather than per-item `setValue` calls so a
 * half-initialized settings state can't be observed. The GitHub block is a
 * second batch and the flag a third write, so the three are not atomic with
 * respect to each other: a failure partway through leaves the flag unset, and
 * the next call re-seeds from the top.
 */
export const setDefaultSettings = async () => {
    // get init state
    const init = await storage.getItem<boolean>(initialized)

    // Default the backend to GH and the sync rate to 30s for DEV
    if (import.meta.env.DEV) {
        storageSetting.setValue(StorageBackend.GitHubRepo)
        syncRateSetting.setValue(30)
    }

    // Check if default should be applied, do so only if they've never been set
    // Otherwise, this would overwrite existing setting
    if (init == null || init == false) {
        await storage.setItems(
            Object.entries(defaultSettings).map(([key, value]) => ({ key: key as SettingsKey, value })),
        )

        // If this is dev, set configured debugging values
        if (import.meta.env.DEV) {
            await storage.setItems(
                Object.entries(debugGitHubSettings).map(([key, value]) => ({ key: key as GitHubSettingsKey, value })),
            )
        }

        await storage.setItem<boolean>(initialized, true)
    }
}

/**
 * Subscribes to changes on a stored setting, keyed by a caller-chosen name so it
 * can later be unregistered.
 *
 * One watcher per name: registering a second under a name already in use
 * silently drops the first handle, leaking that subscription — it keeps firing
 * with no way to stop it. Callers that re-register (React components, the
 * storage singleton) either register once or unregister first.
 *
 * @typeParam T - Type stored under `setting`; the callback receives `T | null`,
 * null being what a cleared key reports.
 * @param name - Unique name for this subscription, passed back to
 * {@link unregisterSettingsWatcher}.
 * @param setting - Key to watch, from {@link SettingsKeys} or
 * {@link GitHubSettingsKeys}.
 * @param callback - Invoked with the new and old values on every change.
 */
export const registerSettingsWatcher = <T>(
    name: string,
    setting: StorageItemKey,
    callback: WatchCallback<T | null>,
) => {
    const unwatch = storage.watch<T>(setting, callback)
    watchers.set(name, unwatch)
}

/**
 * Removes a settings watcher previously registered under `name` via
 * {@link registerSettingsWatcher}.
 *
 * @param name - Name the watcher was registered under. An unknown name is a
 * no-op, so this is safe to call unconditionally from cleanup paths.
 */
export const unregisterSettingsWatcher = (name: string) => {
    const unwatch = watchers.get(name)

    if (unwatch) {
        unwatch()
        watchers.delete(name)
    }
}
