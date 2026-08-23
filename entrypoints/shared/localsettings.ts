import { SortOrderType, StorageType } from './types'

export const storageSetting = storage.defineItem<StorageType>('local:storage', {
    fallback: StorageType.File,
})

export const storageFilePathSetting = storage.defineItem<string>('local:storageFilePath', {
    fallback: '',
})

export const sortOrderSetting = storage.defineItem<SortOrderType>('local:sortOrder', {
    fallback: SortOrderType.Ascending,
})

export const sortedSetting = storage.defineItem<boolean>('local:sortBookmarks', {
    fallback: false,
})

export const syncEnableSetting = storage.defineItem<boolean>('local:syncEnabled', {
    fallback: true,
})

export const syncRateSetting = storage.defineItem<number>('local:syncrate', {
    fallback: 900,
})

export const syncLastSyncSetting = storage.defineItem<string>('local:lastSyncDateTime', {
    // default to Unix Epoch if we've never synced before
    fallback: new Date(0).toISOString(),
})

export const setStorageDefault = async () => {
    await storage.setItems([
        { key: 'local:storage', value: StorageType.File },
        { key: 'local:storageFilePath', value: '~/tmp' }, // FIXME: Hardcoded for testing, should be an empty string
        { key: 'local:sortOrder', value: SortOrderType.Ascending },
        { key: 'local:sortBookmarks', value: false },
        { key: 'local:syncEnabled', value: true },
        { key: 'local:syncrate', value: 900 },
        { key: 'local:lastSyncDateTime', value: new Date(0).toISOString() },
    ])
}
