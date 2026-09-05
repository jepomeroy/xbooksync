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
    /** Display name. Absent on the synthetic tree root. */
    title?: string
    /** Target address. Set only on {@link BookmarkType.bookmark} entries. */
    url?: string
    type: BookmarkType
    /** Present on folders and anchors; absent (or empty) on bookmarks. */
    children?: BookmarkEntry[]
}

/**
 * A {@link BookmarkEntry} that came from `browser.bookmarks` and still carries
 * its node id. `id` is required: the browser always supplies one, and the apply
 * pass addresses every create/update/remove by it.
 */
export type LocalBookmarkEntry = BookmarkEntry & {
    id: string
    index?: number
    parentId?: string
    children?: LocalBookmarkEntry[]
}

/** Browsers this extension supports. */
export enum BrowserType {
    Chrome = 'chrome',
    Firefox = 'firefox',
}

/** One node of a flattened tree, plus the key of the node it hangs off. */
export type FlatEntry<T extends BookmarkEntry = BookmarkEntry> = {
    node: T
    /**
     * Identity key of this node's parent, or `''` when the parent is the tree
     * root. Anchor folders key to their bare {@link BookmarkType}, so this is
     * how a create walks back up to a parent that exists.
     */
    parentKey: string
}

/**
 * A whole bookmark tree keyed by identity rather than by browser node id, so
 * trees from different browsers can be compared directly.
 *
 * Keys are the path-based identity assigned by `identityKey` in
 * `entrypoints/bookmarks/sync.ts`. The two anchor folders are deliberately
 * absent — see `flatten` there.
 */
export type FlatBookmarks<T extends BookmarkEntry = BookmarkEntry> = Map<string, FlatEntry<T>>

/**
 * Result of a diff and used to resolve bookmark changes.
 *
 * Every map is keyed by the same identity key as the {@link FlatBookmarks} it
 * was derived from.
 */
export type DiffResultType = {
    /** Present in the compared tree but not in base. */
    added: Map<string, BookmarkEntry>
    /** Present in base but not in the compared tree. */
    removed: Map<string, BookmarkEntry>
    /**
     * Present in both, but not equal. A change that alters a bookmark's url or a
     * folder's title changes its key too, so it surfaces as an add plus a remove
     * rather than landing here — in practice this holds title-only edits to
     * bookmarks.
     */
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
 *
 * @param sortOrderStr - Candidate value, matched against the enum's string values.
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
    GitLabRepo = 'GitLab Repo',
    S3 = 'S3',
}

/**
 * Narrows an arbitrary string to a {@link StorageBackend}, defaulting to
 * {@link StorageBackend.GitHubRepo}. See {@link getSortOrder} for why this is needed.
 *
 * The cases match the enum's display strings, so renaming a member's value means
 * updating them here too — and silently re-homes anyone whose stored setting
 * held the old value.
 *
 * @param storageTypeStr - Candidate value, matched against the enum's string values.
 */
export const getStorageBackend = (storageTypeStr: string): StorageBackend => {
    switch (storageTypeStr) {
        case 'GitHub Repo':
            return StorageBackend.GitHubRepo
        case 'GitHub Gist':
            return StorageBackend.GitHubGist
        case 'GitLab Repo':
            return StorageBackend.GitLabRepo
        case 'S3':
            return StorageBackend.S3
        default:
            return StorageBackend.GitHubRepo
    }
}

/** Notification that something a sync depends on changed; takes no arguments and returns nothing. */
export type SyncCallback = () => void

/** A payload read from a target, paired with the revision it was read at. */
export type ReadData = {
    /**
     * False when the target is still at `knownVersion`, in which case `content`
     * is empty and must not be parsed.
     */
    changed: boolean
    /** Serialized bookmark tree. Empty string when unchanged, or when the target holds nothing yet. */
    content: string
    /** Target-specific version token: ETag, commit SHA, MD5, or content hash */
    blobVersion: string
}

/**
 * Contract every sync target implements. Implementations live one per file
 * alongside this — `gh-repo.ts`, `gh-gist.ts`, `nil-adapter.ts`; the `Storage`
 * singleton in `entrypoints/bookmarks/storage.ts` picks between them from the
 * {@link StorageBackend} the options page has stored.
 *
 * Version tokens are deliberately opaque strings — each target uses whatever it
 * has (ETag, commit SHA, hash) and only ever compares tokens it issued itself.
 */
export type StorageAdapter = {
    /** Identifier for logging and persistent storage keys (e.g., 'github-gist', 's3') */
    readonly providerId: string

    /**
     * Reads content along with its current version token.
     *
     * @param knownVersion - Version token from the last read or write, or `''`
     * if this target has never been read. Targets that support conditional reads
     * use it to answer "unchanged" without transferring the body.
     * @returns The payload and its version. A target holding no file yet reports
     * changed with empty content rather than throwing.
     */
    read(knownVersion: string): Promise<ReadData>

    /**
     * Writes content to storage and returns updated version metadata.
     *
     * @param content - Serialized bookmark tree to store.
     * @param previousBlobVersion - Previous BLOB version the write is based on. Targets that
     * support it should use this for a conditional write so a concurrent update
     * from another browser is rejected rather than silently overwritten. Omit to
     * create the file for the first time.
     * @returns The version token the write produced, to be passed as
     * `knownVersion`/`previousBlobVersion` next time.
     */
    write(content: string, previousBlobVersion?: string): Promise<string>

    /**
     * Subscribes to the settings this target depends on, so the adapter can be
     * rebuilt when its credentials or location change.
     *
     * @param callback - Invoked on every such change.
     */
    registerWatchers(callback: SyncCallback): void

    /** Drops every watcher {@link registerWatchers} added. Must be safe to call when none were. */
    unregisterWatchers(): void
}

// Messaging types

/** Popup -> background: run a sync immediately, ignoring the sync interval. */
export const SyncNowMessage = 'sync-now'

/** Sync error classifications */
export enum SyncErrorKind {
    RemoteMissing = 'remote-missing',
    AuthRequired = 'auth-required',
    Conflict = 'conflict',
    Network = 'network',
    ServerError = 'server-error',
    Unknown = 'unknown',
}

/** Local storage Sync Error type */
export type SyncErrorType = {
    kind: SyncErrorKind
    message: string
    at: string
}

/** Outcome of a background operation reported back to the popup. */
export enum Status {
    Success = 0,
    Error = 1,
}

/** Reply shape for every `browser.runtime` message the background handles. */
export type MessageResponse = {
    /**
     * Whether the worker accepted the message — not whether the work it kicked
     * off succeeded. See `handleMessages` in `entrypoints/background.ts`.
     */
    status: Status
    /** Detail for the user: an error reason, or a summary of what synced. Never populated yet. */
    result?: string
}
