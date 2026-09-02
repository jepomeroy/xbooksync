// Bookmarks

/** Kind of node a bookmark tree entry represents. */
export enum BookmarkType {
    folder = 'folder',
    bookmark = 'bookmark',
    bookmarkbar = 'bookmarks bar',
    other = 'other bookmarks',
}

/**
 * Object representing a bookmark. This is used for create, update, and storage
 * representations of all bookmarks.
 */
export type BookmarkEntry = {
    title?: string
    url?: string
    type: BookmarkType
    children?: BookmarkEntry[]
}

export type LocalBookmarkEntry = BookmarkEntry & {
    id?: string
    index?: number
    parentId?: string
    children?: LocalBookmarkEntry[]
}

/** Browsers this extension supports. */
export enum BrowserType {
    Chrome = 'chrome',
    Firefox = 'firefox',
}

export type FlatBookmarks = Map<string, BookmarkEntry>

/** Result of a diff and used to resolve bookmark changes. */
export type DiffResultType = {
    added: Map<string, BookmarkEntry>
    removed: Map<string, BookmarkEntry>
    changed: Map<string, { before: BookmarkEntry; after: BookmarkEntry }>
}

// Sorting Types

/** Direction bookmarks are sorted in when sorting is enabled. */
export enum SortOrder {
    Ascending = 'Ascending',
    Descending = 'Descending',
}

/**
 * Narrows an arbitrary string to a {@link SortOrder}.
 *
 * Needed at every boundary where the value arrives untyped — `<select>` change
 * events and previously persisted settings — since neither can be trusted to
 * hold a current enum member. Unrecognized input falls back to
 * {@link SortOrder.Ascending} rather than throwing.
 */
export const getSortOrder = (sortOrderStr: string): SortOrder => {
    switch (sortOrderStr) {
        case 'Ascending':
            return SortOrder.Ascending
        case 'Descending':
            return SortOrder.Descending
        default:
            return SortOrder.Ascending
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
export enum StorageBackend {
    GitHubRepo = 'GitHub Repo',
    GitHubGist = 'GitHub Gist',
    GitlabRepo = 'Gitlab Repo',
    S3 = 'S3',
}

/**
 * Narrows an arbitrary string to a {@link StorageBackend}, defaulting to
 * {@link StorageBackend.GitHubRepo}. See {@link getSortOrder} for why this is needed.
 */
export const getStorageBackend = (storageTypeStr: string): StorageBackend => {
    switch (storageTypeStr) {
        case 'GitHub Repo':
            return StorageBackend.GitHubRepo
        case 'GitHub Gist':
            return StorageBackend.GitHubGist
        case 'Gitlab Repo':
            return StorageBackend.GitlabRepo
        case 'S3':
            return StorageBackend.S3
        default:
            return StorageBackend.GitHubRepo
    }
}

/** Callback sync function */
export type SyncCallback = () => void

/** A payload read from a target, paired with the revision it was read at. */
export type ReadData = {
    /** Change flag */
    changed: boolean
    /** Serialized bookmark tree */
    content: string
    /** Target-specific version token: ETag, commit SHA, MD5, or content hash */
    blobVersion: string
}

/**
 * Contract every sync target implements. Implementations live in
 * `entrypoints/bookmarks/storage.ts`; the popup picks between them via
 * {@link StorageBackend}.
 *
 * Version tokens are deliberately opaque strings — each target uses whatever it
 * has (ETag, commit SHA, hash) and only ever compares tokens it issued itself.
 */
export type StorageAdapter = {
    /** Identifier for logging and persistent storage keys (e.g., 'github-gist', 's3') */
    readonly providerId: string

    /** Reads content along with its current version blob SHA */
    read(knownVersion: string): Promise<ReadData>

    /**
     * Writes content to storage and returns updated version metadata.
     *
     * @param previousBlobVersion - Previou BLOB version the write is based on. Targets that
     * support it should use this for a conditional write so a concurrent update
     * from another browser is rejected rather than silently overwritten.
     */
    write(content: string, previousBlobVersion?: string): Promise<string>

    registerWatchers(callback: SyncCallback): void

    unregisterWatchers(): void
}

// Messaging types

/** Outcome of a background operation reported back to the popup. */
export enum Status {
    Success = 0,
    Error = 1,
}

/** Reply shape for every `browser.runtime` message the background handles. */
export type MessageResponse = {
    status: Status
    /** Detail for the user: an error reason, or a summary of what synced */
    result?: string
}

/** Popup -> background: run a sync immediately, ignoring the sync interval. */
export const SyncNowMessage = 'sync-now'
