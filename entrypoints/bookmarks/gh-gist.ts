/**
 * {@link StorageAdapter} implementations, one per {@link StorageBackend}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub Gist implementation — a stub. Every method throws, so
 * nothing may select this backend until it is written: `Storage.handleStorageChange`
 * has no case for it, and the options page routes Gist to `Unimplemented`.
 */

import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'

/**
 * {@link StorageAdapter} for a GitHub Gist target.
 *
 * Signatures only — every method throws. The shape is here so the class
 * satisfies the interface while the Gist backend is unimplemented; contrast
 * `NilStorageAdapter`, which implements the same interface as working no-ops
 * and is what the sync loop actually falls back to.
 */
export class GitHubGistAdapter implements StorageAdapter {
    readonly providerId: string = 'github-gist'

    /**
     * Not yet implemented. Would read the gist file's content and revision id,
     * the gist to use coming from {@link ghGist}.
     *
     * @param knownVersion - Revision this side was last seen at.
     * @throws Always.
     */
    read(knownVersion: string): Promise<ReadData> {
        throw new Error('Method not implemented.')
    }

    /**
     * Not yet implemented. Would PATCH the gist and return the new revision id.
     *
     * @param content - Serialized bookmark tree.
     * @param previousBlobVersion - Revision the write is based on. Note the Gist
     * API takes no conditional-update parameter, so this backend will need
     * another way to detect a concurrent write.
     * @throws Always.
     */
    write(content: string, previousBlobVersion?: string): Promise<string> {
        throw new Error('Method not implemented.')
    }

    /**
     * Not yet implemented. Would watch {@link ghAuthToken} and {@link ghGist}.
     *
     * @param callback - Notified when either changes.
     * @throws Always — including from `Storage.cleanup`, so wiring this backend
     * up before implementing it would break shutdown.
     */
    registerWatchers(callback: SyncCallback): void {
        throw new Error('Method not implemented.')
    }

    /**
     * Not yet implemented.
     *
     * @throws Always. See the note on {@link registerWatchers}.
     */
    unregisterWatchers(): void {
        throw new Error('Method not implemented.')
    }
}
