import { SortOrderType, StorageType } from './constants'

export const storageType = storage.defineItem<StorageType>('local:storage', {
    fallback: StorageType.File,
})

export const storageFilePathType = storage.defineItem<string>('local:storageFilePath', {
    fallback: '',
})

export const sortOrderType = storage.defineItem<SortOrderType>('local:sortOrder', {
    fallback: SortOrderType.Ascending,
})

export const sortedType = storage.defineItem<boolean>('local:sortBookmarks', {
    fallback: false,
})

export const syncEnableType = storage.defineItem<boolean>('local:syncEnabled', {
    fallback: true,
})

export const syncRateType = storage.defineItem<number>('local:syncrate', {
    fallback: 900,
})

export const syncLastSyncType = storage.defineItem<string>('local:lastSyncDateTime', {
    // default to Unix Epoch if we've never synced before
    fallback: new Date(0).toISOString(),
})
