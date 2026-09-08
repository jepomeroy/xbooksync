import { NotConfiguredError, type ReadData, type StorageAdapter, type SyncCallback } from '../shared/types'

/**
 * No-op {@link StorageAdapter} used before a real sync target is configured.
 *
 * Two situations land here: the `Storage` singleton resolves the configured
 * backend asynchronously, so something has to answer during that window; and
 * {@link StorageBackend.None} — the install-time default — has no adapter of its
 * own, so an unconfigured profile stays on this one indefinitely.
 *
 * Reads are honest no-ops: "nothing changed" is true of a target that does not
 * exist, and it costs the caller nothing. Writes are not, and must throw — see
 * {@link write}.
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
     * Refuses the write: there is no target, so nothing can be stored.
     *
     * Deliberately not a silent no-op. A returned version token means "this
     * content is now on the target", and the sync loop answers it by recording a
     * fresh base snapshot. Reporting success here would stamp a base describing
     * a tree that no target holds — and the next pass against a real, empty
     * target would then diff that base against nothing, read it as a removal of
     * every bookmark, and apply it. The read side stays a no-op precisely
     * because "nothing changed" is true and costs nothing.
     *
     * @param _content - Ignored; there is nowhere to put it.
     * @param _previousBlobVersion - Ignored.
     * @throws {NotConfiguredError} Always.
     */
    async write(_content: string, _previousBlobVersion?: string): Promise<string> {
        throw new NotConfiguredError()
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
