/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — local file, GitHub
 * repo or Gist, GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * TODO: not implemented yet; only the local-file adapter is in scope for now.
 */

export {}
