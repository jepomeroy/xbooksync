// Bookmarks

export enum BookmarkType {
    folder = 'folder',
    bookmark = 'bookmark',
    root = 'root',
}

export const getBookmarkType = (bookmarkTypeStr: string | undefined): BookmarkType => {
    if (bookmarkTypeStr == undefined) {
        return BookmarkType.folder
    }

    return BookmarkType.bookmark
}

/**
 * Object representing a bookmark. This is used for create, update, and storage
 * representations of all bookmarks.
 */
export type BookmarkEntryType = {
    id?: string
    index?: number
    parentId?: string
    title?: string
    url?: string
    type: BookmarkType
    mappingId?: number
    children?: BookmarkEntryType[]
}

export enum BrowserType {
    Chrome = 'chrome',
    Firefox = 'firefox',
}

export type BrowserRootType = {
    title: string
    id: number
}

/**
 * Enumeration of supported bookmark folders
 */
export enum BookmarkFolderTypes {
    BookmarkBar = 'bookmarks-bar',
    Other = 'other',
}

// Sorting Types

/** Direction bookmarks are sorted in when sorting is enabled. */
export enum SortOrderType {
    Ascending = 'Ascending',
    Descending = 'Descending',
}

/**
 * Narrows an arbitrary string to a {@link SortOrderType}.
 *
 * Needed at every boundary where the value arrives untyped — `<select>` change
 * events and previously persisted settings — since neither can be trusted to
 * hold a current enum member. Unrecognized input falls back to
 * {@link SortOrderType.Ascending} rather than throwing.
 */
export const getSortOrderType = (sortOrderStr: string): SortOrderType => {
    switch (sortOrderStr) {
        case 'Ascending':
            return SortOrderType.Ascending
        case 'Descending':
            return SortOrderType.Descending
        default:
            return SortOrderType.Ascending
    }
}

// Storage Types

/**
 * Sync targets the extension can write the bookmark tree to.
 *
 * Values double as the display label in the storage `<select>`, so changing one
 * changes what the user sees — and invalidates any setting already persisted
 * under the old value.
 */
export enum StorageType {
    File = 'File',
    GitHubRepo = 'GitHub Repo',
    GitHubGist = 'GitHub Gist',
    GitlabRepo = 'Gitlab Repo',
    S3 = 'S3',
}

/**
 * Narrows an arbitrary string to a {@link StorageType}, defaulting to
 * {@link StorageType.File}. See {@link getSortOrderType} for why this is needed.
 */
export const getStorageType = (storageTypeStr: string): StorageType => {
    switch (storageTypeStr) {
        case 'File':
            return StorageType.File
        case 'GitHub Repo':
            return StorageType.GitHubRepo
        case 'GitHub Gist':
            return StorageType.GitHubGist
        case 'Gitlab Repo':
            return StorageType.GitlabRepo
        case 'S3':
            return StorageType.S3
        default:
            return StorageType.File
    }
}

/** Revision information a target reports back about the copy it holds. */
export interface StorageMetadata {
    /** Target-specific version token: ETag, commit SHA, MD5, or content hash */
    version: string
    /** ISO timestamp or Epoch ms of last remote modification */
    lastModified?: number | string
}

/** A payload read from a target, paired with the revision it was read at. */
export interface SyncData {
    /** Serialized bookmark tree */
    content: string
    metadata: StorageMetadata
}

/**
 * Contract every sync target implements. Implementations live in
 * `entrypoints/bookmarks/storage.ts`; the popup picks between them via
 * {@link StorageType}.
 *
 * Version tokens are deliberately opaque strings — each target uses whatever it
 * has (ETag, commit SHA, hash) and only ever compares tokens it issued itself.
 */
export interface StorageAdapter {
    /** Identifier for logging and persistent storage keys (e.g., 'github-gist', 's3') */
    readonly providerId: string

    /**
     * Lightweight change detection.
     * Compares remote version state against a known version token without downloading full payload.
     */
    hasChanged(knownVersion: string): Promise<{ changed: boolean; currentVersion: string }>

    /** Reads content along with its current version metadata */
    read(): Promise<SyncData>

    /**
     * Writes content to storage and returns updated version metadata.
     *
     * @param previousVersion - Version the write is based on. Targets that
     * support it should use this for a conditional write so a concurrent update
     * from another browser is rejected rather than silently overwritten.
     */
    write(content: string, previousVersion?: string): Promise<StorageMetadata>
}

// Messaging types

/** Outcome of a background operation reported back to the popup. */
export enum StatusType {
    Success, // 0
    Error, // 1
}

/** Reply shape for every `browser.runtime` message the background handles. */
export type MessageResponse = {
    status: StatusType
    /** Detail for the user: an error reason, or a summary of what synced */
    result?: string
}

/** Popup -> background: run a sync immediately, ignoring the sync interval. */
export const SyncNowMessage = 'sync-now'
