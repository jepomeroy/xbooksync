import type { Unwatch, WatchCallback } from 'wxt/utils/storage'
import { SortOrderType, StorageType, type BookmarkEntryType } from './types'

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
    syncRate: 'local:syncrate',
    lastSyncDate: 'local:lastSyncDateTime',
    lastSyncValue: 'local:lastSyncValue',
    baseBookmarks: 'local:baseBookmarks',
} as const satisfies Record<string, StorageItemKey>

/** Union of the keys in {@link SettingsKeys}. */
export type SettingsKey = (typeof SettingsKeys)[keyof typeof SettingsKeys]

/** Which sync target the bookmark tree is written to. */
export const storageSetting = storage.defineItem<StorageType>(SettingsKeys.storage, {
    fallback: StorageType.GitHubRepo,
})

/** Sort direction; ignored unless {@link sortedSetting} is on. */
export const sortOrderSetting = storage.defineItem<SortOrderType>(SettingsKeys.sortOrder, {
    fallback: SortOrderType.Ascending,
})

/** Whether bookmarks are sorted before being written out. */
export const sortedSetting = storage.defineItem<boolean>(SettingsKeys.sorted, {
    fallback: false,
})

/** Master switch; when off, neither scheduled nor manual syncs run. */
export const syncEnableSetting = storage.defineItem<boolean>(SettingsKeys.syncEnabled, {
    fallback: true,
})

/** Seconds between automatic syncs. */
export const syncRateSetting = storage.defineItem<number>(SettingsKeys.syncRate, {
    fallback: 900,
})

/** ISO timestamp of the last successful sync. */
export const syncLastSyncDateSetting = storage.defineItem<string>(SettingsKeys.lastSyncDate, {
    // default to Unix Epoch if we've never synced before
    fallback: new Date(0).toISOString(),
})

/** Last sync value from the configured adapter. */
export const syncLastSyncValueSetting = storage.defineItem<string>(SettingsKeys.lastSyncValue, {
    fallback: '',
})

/** Base Bookmarks for three-way comparisons */
export const syncBaseBookmarks = storage.defineItem<BookmarkEntryType | null>(SettingsKeys.baseBookmarks, {
    fallback: null,
})

/**
 * GitHub storage settings.
 *
 * Shared by both the GH Repo and GH Gist storage types.
 */

export const GitHubSettingsKeys = {
    ghAuthToken: 'local:ghAuthToken',
    ghGist: 'local:ghGist',
    ghRepo: 'local:ghRepo',
} as const satisfies Record<string, StorageItemKey>

/** Union of the keys in {@link GitHubSettingsKeys}. */
export type GitHubSettingsKey = (typeof GitHubSettingsKeys)[keyof typeof GitHubSettingsKeys]

/** GitHub App Auth token for access to GH Repos and Gists. */
export const ghAuthToken = storage.defineItem<string>(GitHubSettingsKeys.ghAuthToken, {
    fallback: '',
})

/** GitHub Gist ID used as the sync target, when the Gist storage type is selected. */
export const ghGist = storage.defineItem<string>(GitHubSettingsKeys.ghGist, {
    fallback: '',
})

/** GitHub Repo to use for storage. */
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
    [SettingsKeys.storage]: StorageType.GitHubRepo,
    [SettingsKeys.sortOrder]: SortOrderType.Ascending,
    [SettingsKeys.sorted]: false,
    [SettingsKeys.syncEnabled]: true,
    [SettingsKeys.syncRate]: 30, // FIXME: Hardcoded for testing, should be 900
    [SettingsKeys.lastSyncDate]: new Date(0).toISOString(),
    [SettingsKeys.lastSyncValue]: '',
    [SettingsKeys.baseBookmarks]: null,
}

const debugGitHubSettings: Record<GitHubSettingsKey, unknown> = {
    // FIXME Everything below here is for debugging and developement remove before release
    // DO NOT COMMIT this with the ghAuthToken set!!!
    // Change it to a blank and paste it in from a locally stored location
    [GitHubSettingsKeys.ghAuthToken]: '',
    [GitHubSettingsKeys.ghGist]: '',
    [GitHubSettingsKeys.ghRepo]: 'jepomeroy/bookmarks',
}

/**
 * Seeds every setting with its default. Called from the background worker's
 * `onInstalled` handler.
 *
 * Written as one `setItems` batch rather than per-item `setValue` calls so a
 * half-initialized settings state can't be observed.
 */
export const setDefaultSettings = async () => {
    await storage.setItems(Object.entries(defaultSettings).map(([key, value]) => ({ key: key as SettingsKey, value })))
    await storage.setItems(
        Object.entries(debugGitHubSettings).map(([key, value]) => ({ key: key as GitHubSettingsKey, value })),
    )
}

/** Subscribes to changes on a stored setting, keyed by a caller-chosen name so it can later be unregistered. */
export const registerSettingsWatcher = <T>(
    name: string,
    setting: StorageItemKey,
    callback: WatchCallback<T | null>,
) => {
    const unwatch = storage.watch<T>(setting, callback)
    watchers.set(name, unwatch)
}

/** Removes a settings watcher previously registered under `name` via {@link registerSettingsWatcher}. */
export const unregisterSettingsWatcher = (name: string) => {
    const unwatch = watchers.get(name)

    if (unwatch) {
        unwatch()
        watchers.delete(name)
    }
}
