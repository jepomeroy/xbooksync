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

export class GitHubGistAdapter implements StorageAdapter {
    readonly providerId: string = 'github-gist'

    read(knownVersion: string): Promise<ReadData> {
        throw new Error('Method not implemented.')
    }

    write(content: string, previousBlobVersion?: string): Promise<string> {
        throw new Error('Method not implemented.')
    }

    registerWatchers(callback: SyncCallback): void {
        throw new Error('Method not implemented.')
    }

    unregisterWatchers(): void {
        throw new Error('Method not implemented.')
    }
}
