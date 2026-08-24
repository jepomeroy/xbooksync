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

/** Which sync target the bookmark tree is written to. */
export const storageSetting = storage.defineItem<StorageType>('local:storage', {
    fallback: StorageType.File,
})

/** Destination path, only meaningful when {@link storageSetting} is `File`. */
export const storageFilePathSetting = storage.defineItem<string>('local:storageFilePath', {
    fallback: '',
})

/** Sort direction; ignored unless {@link sortedSetting} is on. */
export const sortOrderSetting = storage.defineItem<SortOrderType>('local:sortOrder', {
    fallback: SortOrderType.Ascending,
})

/** Whether bookmarks are sorted before being written out. */
export const sortedSetting = storage.defineItem<boolean>('local:sortBookmarks', {
    fallback: false,
})

/** Master switch; when off, neither scheduled nor manual syncs run. */
export const syncEnableSetting = storage.defineItem<boolean>('local:syncEnabled', {
    fallback: true,
})

/** Seconds between automatic syncs. */
export const syncRateSetting = storage.defineItem<number>('local:syncrate', {
    fallback: 900,
})

/** ISO timestamp of the last successful sync. */
export const syncLastSyncSetting = storage.defineItem<string>('local:lastSyncDateTime', {
    // default to Unix Epoch if we've never synced before
    fallback: new Date(0).toISOString(),
})

/**
 * Seeds every setting with its default. Called from the background worker's
 * `onInstalled` handler.
 *
 * Written as one `setItems` batch rather than per-item `setValue` calls so a
 * half-initialized settings state can't be observed.
 */
export const setDefaultSettings = async () => {
    await storage.setItems([
        { key: 'local:storage', value: StorageType.File },
        { key: 'local:storageFilePath', value: '~/tmp' }, // FIXME: Hardcoded for testing, should be an empty string
        { key: 'local:sortOrder', value: SortOrderType.Ascending },
        { key: 'local:sortBookmarks', value: false },
        { key: 'local:syncEnabled', value: true },
        { key: 'local:syncrate', value: 30 }, // FIXME: Hardcoded for testing, should be an empty string
        { key: 'local:lastSyncDateTime', value: new Date(0).toISOString() },
    ])
}

export const registerSyncRateWatcher = (name: string, callback: WatchCallback<number | null>) => {
    const unwatch = storage.watch<number>('local:syncrate', callback)
    watchers.set(name, unwatch)
}

export const unregisterSyncRateWatcher = (name: string) => {
    const unwatch = watchers.get(name)

    if (unwatch) {
        unwatch()
    }
}
