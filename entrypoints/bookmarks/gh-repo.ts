/**
 * {@link StorageAdapter} implementations, one per {@link StorageType}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub repository implementation, backed by the Contents API.
 */

import { registerSettingsWatcher, GitHubSettingsKeys, unregisterSettingsWatcher } from '../shared/localsettings'
import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'
import { API_ROOT, decodeBase64, encodeBase64 } from './gh-utils'

/** {@link StorageAdapter} that reads and writes the bookmark file in a GitHub repository via the Contents API. */
export class GitHubRepoAdapter implements StorageAdapter {
    readonly providerId: string = 'github-repo'
    /** Path, within the repo, of the file the bookmark tree is stored in. */
    private bookmarkFilename: string = 'bookmarks.json'

    constructor(
        private token: string,
        private repo: string,
    ) {}

    /** Builds fetch options carrying the auth and API-version headers, plus a conditional-request ETag. */
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

    /** Builds the JSON body for a Contents API write, including the prior `sha` when updating an existing file. */
    private getPayload = (content: string, sha?: string): BodyInit => {
        return JSON.stringify({
            message: 'XBookSync updated bookmarks',
            content: encodeBase64(content),
            ...(sha && { sha }),
        })
    }

    /** Reads the bookmark file's content and current blob SHA, using a conditional request when a known version is given. */
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

    /** Writes content to the bookmark file, creating it or updating it based on the given blob SHA. */
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

    /** Invokes `callback` whenever the auth token or target repo setting changes. */
    registerWatchers(callback: SyncCallback): void {
        registerSettingsWatcher(`${this.providerId}-token`, GitHubSettingsKeys.ghAuthToken, callback)
        registerSettingsWatcher(`${this.providerId}-repo`, GitHubSettingsKeys.ghRepo, callback)
    }

    /** Removes the watchers registered by {@link registerWatchers}. */
    unregisterWatchers(): void {
        unregisterSettingsWatcher(`${this.providerId}-token`)
        unregisterSettingsWatcher(`${this.providerId}-repo`)
    }
}
