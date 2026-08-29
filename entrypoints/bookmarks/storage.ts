/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — local file, GitHub
 * repo or Gist, GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * TODO: Only the local-file adapter is not in scope. This might not be doable since
 * Firefox does not support FileSystemDirectoryHandle and the necessary showOpenFilePicker
 * or showOpenDirectoryPicker. Support would work for work for Chrome since that already
 * syncs through google services. This will probably be removed from the repo.
 */

import type { StorageAdapter, SyncData, StorageMetadata } from '../shared/types'

export class LocalFileSystemAdapter implements StorageAdapter {
    readonly providerId = 'local-fs'
    readonly bookmarksFilename = 'bookmarks.json'

    /**
     * @param dirHandle Handle to the root directory selected by the user
     * @param filePath Relative path inside the directory (e.g., 'bookmarks/sync.json' or 'bookmarks.json')
     */
    constructor(
        private dirHandle: FileSystemDirectoryHandle,
        private filePath: string = 'bookmarks.json',
    ) {}

    private async computeHash(text: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(text)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
    }

    async hasChanged(knownVersion: string): Promise<{ changed: boolean; currentVersion: string }> {
        const file = await this.dirHandle.getFile()
        // Fast path: Check last modified timestamp or hash
        const content = await file.text()
        const currentVersion = await this.computeHash(content)
        return {
            changed: currentVersion !== knownVersion,
            currentVersion,
        }
    }

    async read(): Promise<SyncData> {
        const file = await this.fileHandle.getFile()
        const content = await file.text()
        const version = await this.computeHash(content)
        return {
            content,
            metadata: { version, lastModified: file.lastModified },
        }
    }

    async write(content: string): Promise<StorageMetadata> {
        const writable = await this.fileHandle.createWritable()
        await writable.write(content)
        await writable.close()

        const version = await this.computeHash(content)
        return { version, lastModified: Date.now() }
    }
}
