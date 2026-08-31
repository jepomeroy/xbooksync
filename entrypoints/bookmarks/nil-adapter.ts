import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'

export class NilStorageAdapter implements StorageAdapter {
    providerId = 'nil-adapter'

    async read(_knownVersion: string): Promise<ReadData> {
        return { changed: false, content: '', blobVersion: '' }
    }

    async write(_content: string, _previousBlobVersion?: string): Promise<string> {
        return ''
    }

    registerWatchers(_callback: SyncCallback): void {
        return
    }

    unregisterWatchers(): void {
        return
    }
}
