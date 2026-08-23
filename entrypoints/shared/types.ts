// Sorting Types
export enum SortOrderType {
    Ascending = 'Ascending',
    Descending = 'Descending',
}

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
export enum StorageType {
    File = 'File',
    GitHubRepo = 'GitHub Repo',
    GitHubGist = 'GitHub Gist',
    GitlabRepo = 'Gitlab Repo',
    S3 = 'S3',
}

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

export interface StorageMetadata {
    /** Target-specific version token: ETag, commit SHA, MD5, or content hash */
    version: string
    /** ISO timestamp or Epoch ms of last remote modification */
    lastModified?: number | string
}

export interface SyncData {
    content: string
    metadata: StorageMetadata
}

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

    /** Writes content to storage and returns updated version metadata */
    write(content: string, previousVersion?: string): Promise<StorageMetadata>
}

// Messaging types
export enum StatusType {
    Success, // 0
    Error, // 1
}

export type MessageResponse = {
    status: StatusType
    result?: string
}

export const SyncNowMessage = 'sync-now'
