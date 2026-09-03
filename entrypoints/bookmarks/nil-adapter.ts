import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'

/**
 * No-op {@link StorageAdapter} used before a real sync target is configured.
 *
 * The `Storage` singleton resolves the configured backend asynchronously, so
 * something has to answer in the meantime. Every method here succeeds and does
 * nothing, which makes an early tick a harmless no-op rather than an error —
 * contrast `GitHubGistAdapter`, whose stubs throw.
 */
export class NilStorageAdapter implements StorageAdapter {
    providerId = 'nil-adapter'

    /**
     * Always reports nothing to sync, so the caller takes its "no changes" path
     * and leaves the stored base and version untouched.
     *
     * @param _knownVersion - Ignored; there is no target to compare against.
     */
    async read(_knownVersion: string): Promise<ReadData> {
        return { changed: false, content: '', blobVersion: '' }
    }

    /**
     * Discards the write and reports success.
     *
     * @param _content - Ignored.
     * @param _previousBlobVersion - Ignored.
     * @returns An empty version token. That is the same value as "never read",
     * so the next read against a real adapter is unconditional and fetches the
     * target in full.
     */
    async write(_content: string, _previousBlobVersion?: string): Promise<string> {
        return ''
    }

    /**
     * No settings to watch.
     *
     * @param _callback - Ignored, and so never invoked.
     */
    registerWatchers(_callback: SyncCallback): void {
        return
    }

    /** No watchers to remove. Safe to call, which is what lets `Storage` swap adapters unconditionally. */
    unregisterWatchers(): void {
        return
    }
}
