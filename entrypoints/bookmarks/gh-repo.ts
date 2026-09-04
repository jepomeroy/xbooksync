/**
 * {@link StorageAdapter} implementations, one per {@link StorageBackend}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub repository implementation, backed by the Contents API. The
 * opaque version token in that interface is a git blob SHA here, which the
 * Contents API both reports on read and requires on an update.
 */

import { registerSettingsWatcher, GitHubSettingsKeys, unregisterSettingsWatcher } from '../shared/localsettings'
import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'
import { API_ROOT, decodeBase64, encodeBase64, RemoteFileMissingError } from './gh-utils'

/** {@link StorageAdapter} that reads and writes the bookmark file in a GitHub repository via the Contents API. */
export class GitHubRepoAdapter implements StorageAdapter {
    readonly providerId: string = 'github-repo'
    /** Path, within the repo, of the file the bookmark tree is stored in. */
    private bookmarkFilename: string = 'bookmarks.json'

    /**
     * @param token - GitHub App user-to-server token, from {@link ghAuthToken}.
     * @param repo - Target repository as `owner/name`, from {@link ghRepo}.
     *
     * Both are captured at construction, so the `Storage` singleton rebuilds
     * this adapter rather than mutating it when either setting changes.
     */
    constructor(
        private token: string,
        private repo: string,
    ) {}

    /**
     * Builds fetch options carrying the auth and API-version headers, plus a
     * conditional-request ETag.
     *
     * @param knownVersion - Blob SHA to make the request conditional on. Omit
     * for writes, and for any read that should always return a body.
     */
    private getRequestInit = (knownVersion?: string): RequestInit => {
        return {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                // Belt and braces with no-store below: an empty If-None-Match
                // stops a conditional request even if something else primed the
                // cache.
                //
                // With a version, this is a best-effort 304: the token is a blob
                // SHA, not the ETag GitHub issued for this response, so a match
                // is not guaranteed. `read` therefore compares SHAs itself and
                // treats 304 as an optimization rather than the mechanism.
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

    /**
     * Builds the JSON body for a Contents API write, including the prior `sha`
     * when updating an existing file.
     *
     * @param content - Serialized bookmark tree; base64-encoded here, as the API
     * requires.
     * @param sha - Blob SHA being replaced. Omitting it asks GitHub to create
     * the file, which fails if it already exists; including a stale one fails as
     * a conflict. Either way a concurrent update is rejected rather than lost.
     */
    private getPayload = (content: string, sha?: string): BodyInit => {
        return JSON.stringify({
            message: 'XBookSync updated bookmarks',
            content: encodeBase64(content),
            ...(sha && { sha }),
        })
    }

    /**
     * Reads the bookmark file's content and current blob SHA, using a
     * conditional request when a known version is given.
     *
     * @param knownVersion - Blob SHA from the last read or write, or `''` if the
     * repo has never been read.
     * @returns The decoded content and its blob SHA. A repo with no bookmark
     * file yet reports changed with empty content, which the sync loop then
     * treats as an empty remote tree.
     * @throws {RemoteFileMissingError} When the file is absent but `knownVersion`
     * is set — a deletion rather than a first run.
     * @throws On any other error response.
     */
    async read(knownVersion: string): Promise<ReadData> {
        const url = `${API_ROOT}/repos/${this.repo}/contents/${this.bookmarkFilename}`
        const response: Response = await fetch(url, this.getRequestInit(knownVersion))

        // GitHub itself confirms nothing changed, with no body to parse.
        if (response.status === 304) {
            return { changed: false, content: '', blobVersion: knownVersion }
        }

        if (!response.ok) {
            if (response.status == 404) {
                // No file and no version ever recorded: first use of this repo,
                // so an empty remote is the honest answer.
                if (knownVersion === '') {
                    return { changed: true, content: '', blobVersion: '' }
                }

                // A known version means the file was there at the last sync and
                // has since been deleted. That reads downstream as an empty
                // remote tree — indistinguishable from the user clearing every
                // bookmark — so refuse the pass rather than act on the guess.
                throw new RemoteFileMissingError(this.repo, this.bookmarkFilename)
            }

            throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${url}`)
        }

        const body = (await response.json()) as { content: string; sha: string }

        return { changed: knownVersion !== body.sha, content: decodeBase64(body.content), blobVersion: body.sha }
    }

    /**
     * Writes content to the bookmark file, creating it or updating it based on
     * the given blob SHA.
     *
     * @param content - Serialized bookmark tree to commit.
     * @param previousBlobVersion - Blob SHA this write is based on; omit to
     * create the file.
     * @returns The blob SHA of the committed file, to be carried into the next
     * read or write.
     * @throws On any error response, including the 409/422 GitHub answers when
     * the SHA is stale — which is the conflict signal, currently indistinguishable
     * from a transport failure to the caller.
     */
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

    /**
     * Invokes `callback` whenever the auth token or target repo setting changes.
     *
     * Names both watchers after {@link providerId}, so a second adapter of this
     * type would clobber the first's subscriptions — safe only because the
     * `Storage` singleton keeps exactly one adapter alive at a time.
     *
     * @param callback - Notified on either change; in practice `Storage`'s
     * rebuild, since this adapter captures token and repo at construction.
     */
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
