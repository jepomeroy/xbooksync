/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub Gist implementation
 */

import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'

/** {@link StorageAdapter} for a GitHub Gist target. Not yet implemented. */
export class GitHubGistAdapter implements StorageAdapter {
    readonly providerId: string = 'github-gist'

    /** Not yet implemented. */
    read(knownVersion: string): Promise<ReadData> {
        throw new Error('Method not implemented.')
    }

    /** Not yet implemented. */
    write(content: string, previousBlobVersion?: string): Promise<string> {
        throw new Error('Method not implemented.')
    }

    /** Not yet implemented. */
    registerWatchers(callback: SyncCallback): void {
        throw new Error('Method not implemented.')
    }

    /** Not yet implemented. */
    unregisterWatchers(): void {
        throw new Error('Method not implemented.')
    }
}
