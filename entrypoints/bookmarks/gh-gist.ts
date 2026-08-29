/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub Gist implementation
 */

import type { StorageAdapter, StorageMetadata, SyncData } from '../shared/types'

export class GitHubGistAdapter implements StorageAdapter {
    readonly providerId: string = 'github-gist'

    hasChanged(knownVersion: string): Promise<{ changed: boolean; currentVersion: string }> {
        throw new Error('Method not implemented.')
    }
    read(): Promise<SyncData> {
        throw new Error('Method not implemented.')
    }
    write(content: string, previousVersion?: string): Promise<StorageMetadata> {
        throw new Error('Method not implemented.')
    }
}
