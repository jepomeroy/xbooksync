/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub Gist implementation
 */

import { registerSettingsWatcher, GitHubSettingsKeys, unregisterSettingsWatcher } from '../shared/localsettings'
import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'
import { API_ROOT, decodeBase64, encodeBase64 } from './gh-utils'

export class GitHubRepoAdapter implements StorageAdapter {
    readonly providerId: string = 'github-repo'
    private bookmarkFilename: string = 'bookmarks.json'

    constructor(
        private token: string,
        private repo: string,
    ) {}

    private getRequestInit = (knownVersion?: string): RequestInit => {
        return {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                // Belt and braces with no-store below: an empty If-None-Match
                // stops a conditional request even if something else primed the
                // cache. hasChanged passes a real ETag on purpose, to let GitHub
                // itself answer 304 when nothing changed.
                'If-None-Match': knownVersion ? `"${knownVersion}"` : '',
            },
            // Chrome caches GitHub's ETag and revalidates on the next call,
            // which can surface as a 304 with an empty body instead of the
            // cached 200. no-store keeps the response out of the cache so
            // there's nothing to revalidate against — the conditional check
            // above is explicit, not something the browser injected.
            cache: 'no-store',
        }
    }

    private getPayload = (content: string, sha?: string): BodyInit => {
        return JSON.stringify({
            message: 'XBookSync updated bookmarks',
            content: encodeBase64(content),
            ...(sha && { sha }),
        })
    }

    async read(knownVersion: string): Promise<ReadData> {
        const url = `${API_ROOT}/repos/${this.repo}/contents/${this.bookmarkFilename}`
        const response: Response = await fetch(url, this.getRequestInit(knownVersion))

        // GitHub itself confirms nothing changed, with no body to parse.
        if (response.status === 304) {
            return { changed: false, content: '', blobVersion: knownVersion }
        }

        if (!response.ok) {
            // first time using this repo, no file present
            if (response.status == 404) {
                return { changed: true, content: '', blobVersion: '' }
            }

            throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${url}`)
        }

        const body = (await response.json()) as { content: string; sha: string }

        return { changed: knownVersion !== body.sha, content: decodeBase64(body.content), blobVersion: body.sha }
    }

    async write(content: string, previousBlobVersion?: string): Promise<string> {
        const url = `${API_ROOT}/repos/${this.repo}/contents/${this.bookmarkFilename}`
        const reqInit = this.getRequestInit()
        reqInit.method = 'PUT'
        reqInit.body = this.getPayload(content, previousBlobVersion)

        const response: Response = await fetch(url, reqInit)

        if (!response.ok) {
            throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${url}`)
        }

        const commit = (await response.json()) as { content: { sha: string } }

        return commit.content.sha
    }

    registerWatchers(callback: SyncCallback): void {
        registerSettingsWatcher(`${this.providerId}-token`, GitHubSettingsKeys.ghAuthToken, callback)
        registerSettingsWatcher(`${this.providerId}-repo`, GitHubSettingsKeys.ghRepo, callback)
    }

    unregisterWatchers(): void {
        unregisterSettingsWatcher(`${this.providerId}-token`)
        unregisterSettingsWatcher(`${this.providerId}-repo`)
    }
}
