import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'

/** No-op {@link StorageAdapter} used before a real sync target is configured. */
export class NilStorageAdapter implements StorageAdapter {
    providerId = 'nil-adapter'

    /** Always reports nothing to sync. */
    async read(_knownVersion: string): Promise<ReadData> {
        return { changed: false, content: '', blobVersion: '' }
    }

    /** Discards the write. */
    async write(_content: string, _previousBlobVersion?: string): Promise<string> {
        return ''
    }

    /** No settings to watch. */
    registerWatchers(_callback: SyncCallback): void {
        return
    }

    /** No watchers to remove. */
    unregisterWatchers(): void {
        return
    }
}
