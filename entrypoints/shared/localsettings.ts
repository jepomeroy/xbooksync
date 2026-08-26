import type { Unwatch, WatchCallback } from 'wxt/utils/storage'
import { SortOrderType, StorageType } from './types'

const watchers = new Map<string, Unwatch>()
/**
 * Typed accessors for every persisted setting.
 *
 * `storage` is auto-imported by WXT. Defining each key once here keeps the popup
 * and the background worker reading the same key under the same type — the
 * string literals are otherwise easy to drift apart. Each item carries a
 * fallback so a read before {@link setDefaultSettings} has run still yields a
 * usable value.
 */

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
    storageFilePath: 'local:storageFilePath',
    sortOrder: 'local:sortOrder',
    sorted: 'local:sortBookmarks',
    syncEnabled: 'local:syncEnabled',
    syncRate: 'local:syncrate',
    lastSync: 'local:lastSyncDateTime',
} as const satisfies Record<string, StorageItemKey>

/** Union of the keys in {@link SettingsKeys}. */
export type SettingsKey = (typeof SettingsKeys)[keyof typeof SettingsKeys]

/** Which sync target the bookmark tree is written to. */
export const storageSetting = storage.defineItem<StorageType>(SettingsKeys.storage, {
    fallback: StorageType.File,
})

/** Destination path, only meaningful when {@link storageSetting} is `File`. */
export const storageFilePathSetting = storage.defineItem<string>(SettingsKeys.storageFilePath, {
    fallback: '',
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
export const syncLastSyncSetting = storage.defineItem<string>(SettingsKeys.lastSync, {
    // default to Unix Epoch if we've never synced before
    fallback: new Date(0).toISOString(),
})

/**
 * Install-time value for each setting.
 *
 * Typed as a total `Record` over {@link SettingsKey}, so adding a key to
 * {@link SettingsKeys} without seeding it here fails to compile.
 */
const defaultSettings: Record<SettingsKey, unknown> = {
    [SettingsKeys.storage]: StorageType.File,
    [SettingsKeys.storageFilePath]: '~/tmp', // FIXME: Hardcoded for testing, should be an empty string
    [SettingsKeys.sortOrder]: SortOrderType.Ascending,
    [SettingsKeys.sorted]: false,
    [SettingsKeys.syncEnabled]: true,
    [SettingsKeys.syncRate]: 30, // FIXME: Hardcoded for testing, should be 900
    [SettingsKeys.lastSync]: new Date(0).toISOString(),
}

/**
 * Seeds every setting with its default. Called from the background worker's
 * `onInstalled` handler.
 *
 * Written as one `setItems` batch rather than per-item `setValue` calls so a
 * half-initialized settings state can't be observed.
 */
export const setDefaultSettings = async () => {
    await storage.setItems(
        Object.entries(defaultSettings).map(([key, value]) => ({ key: key as SettingsKey, value })),
    )
}

export const registerSettingsWatcher = <T>(
    name: string,
    setting: SettingsKey,
    callback: WatchCallback<T | null>,
) => {
    const unwatch = storage.watch<T>(setting, callback)
    watchers.set(name, unwatch)
}

export const unregisterSettingsWatcher = (name: string) => {
    const unwatch = watchers.get(name)

    if (unwatch) {
        unwatch()
        watchers.delete(name)
    }
}
