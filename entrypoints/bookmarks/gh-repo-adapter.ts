/**
 * {@link StorageAdapter} implementations, one per {@link StorageBackend}.
 *
 * Each adapter owns the details of talking to its target — GitHub repo or Gist,
 * GitLab repo, S3 — and hides them behind the shared interface in
 * `entrypoints/shared/types.ts`, so the sync loop never branches on target type.
 *
 * This is the GitHub repository implementation, backed by the Contents API. The
 * opaque version token in that interface is a git blob SHA here, which the
 * Contents API both reports on read and requires on an update — and which also
 * addresses the Blobs API directly, the fallback `read` uses for files the
 * Contents API will not inline.
 */

import { registerSettingsWatcher, GitHubSettingsKeys, unregisterSettingsWatcher } from '../shared/localsettings'
import type { ReadData, StorageAdapter, SyncCallback } from '../shared/types'
import { API_ROOT, decodeBase64, encodeBase64, GitHubApiError, RemoteFileMissingError } from './gh-utils'

/**
 * Ceiling on what the Blobs API will return, per GitHub's documentation.
 *
 * Nothing this extension writes should approach it — 100 MB of serialized
 * bookmarks is on the order of a million entries — but a file that large is
 * refused with a legible message rather than left to surface as the 403 the
 * endpoint answers with, which `classifySyncError` would read as an auth
 * problem and send the user off to reconnect GitHub for no reason.
 */
const BLOB_API_MAX_BYTES = 100 * 1024 * 1024

/** Body shape of a Contents API read; only the fields this adapter acts on are declared. */
interface ContentsResponse {
    /** Base64 of the file, or `''` when `encoding` is `'none'`. */
    content: string
    /**
     * How `content` is encoded. `'base64'` normally; `'none'` once the file
     * passes the size the Contents API will inline, which is what makes the
     * Blobs fallback necessary. Optional because a non-github.com deployment
     * may omit it, in which case base64 is the safe assumption.
     */
    encoding?: string
    /** Git blob SHA — this adapter's version token, and the Blobs API's address. */
    sha: string
    /** File size in bytes. */
    size?: number
}

/** {@link StorageAdapter} that reads and writes the bookmark file in a GitHub repository via the Contents API. */
export class GitHubRepoAdapter implements StorageAdapter {
    readonly providerId: string = 'github-repo'
    /** Path, within the repo, of the file the bookmark tree is stored in. */
    private bookmarkFilename: string = 'bookmarks.json'

    /**
     * The repo this adapter reads and writes, qualified by provider so it can
     * never collide with another backend's naming.
     *
     * A getter rather than a stored field only because {@link repo} is a
     * constructor parameter property; it is as immutable as the adapter is —
     * `Storage` rebuilds rather than repoints.
     *
     * Empty while no repo is selected, which is the {@link StorageAdapter.targetId}
     * contract's "pointed at nothing". Every request this adapter would issue
     * without a repo is malformed anyway, so it has nothing to claim.
     */
    get targetId(): string {
        return this.repo ? `${this.providerId}:${this.repo}` : ''
    }

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
     * treats as an empty remote tree — the only case in which empty content is
     * a truthful answer, since {@link decodeContents} refuses to invent one.
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

            throw new GitHubApiError(response.status, response.statusText, response.url)
        }

        const body = (await response.json()) as ContentsResponse

        return {
            changed: knownVersion !== body.sha,
            content: await this.decodeContents(body),
            blobVersion: body.sha,
        }
    }

    /**
     * Turns a Contents API body into the file's text, going back to GitHub for
     * it when the response declines to carry it.
     *
     * The Contents API only inlines files up to 1 MB. Past that it answers a
     * perfectly ordinary 200 whose `content` is `''` and whose `encoding` is
     * `'none'`, expecting the caller to fetch the body another way. Since an
     * empty string is a valid base64 payload that decodes without complaint, a
     * reader that ignores `encoding` gets `''` back and cannot tell it apart
     * from a genuinely empty file — which downstream diffs as the removal of
     * every bookmark. Reading `encoding` is what closes that.
     *
     * The Blobs API is the documented way to fetch those bodies, and it is
     * addressed by exactly the blob SHA this adapter already carries as its
     * version token.
     *
     * @param body - Parsed Contents API response.
     * @returns The file's decoded text.
     * @throws If the file is too large even for the Blobs API, or the response
     * declares an encoding neither path understands.
     */
    private decodeContents = async (body: ContentsResponse): Promise<string> => {
        // Absent `encoding` means a deployment that doesn't send the field;
        // base64 is what the Contents API has always meant by a populated
        // `content`, so keep reading it that way.
        if (body.encoding === undefined || body.encoding === 'base64') {
            return decodeBase64(body.content)
        }

        if (body.encoding !== 'none') {
            throw new Error(`[xbooksync] unsupported content encoding from GitHub: ${body.encoding}`)
        }

        if (body.size !== undefined && body.size > BLOB_API_MAX_BYTES) {
            throw new Error(
                `[xbooksync] ${this.bookmarkFilename} is ${body.size} bytes, past the ${BLOB_API_MAX_BYTES}-byte limit the GitHub API can return.`,
            )
        }

        return await this.readBlob(body.sha)
    }

    /**
     * Fetches a blob's content by SHA, for the files the Contents API won't inline.
     *
     * No conditional header: this only runs once the caller already knows it
     * needs the body, and a blob is immutable at a given SHA, so there is
     * nothing for a revalidation to save.
     *
     * @param sha - Git blob SHA, from the Contents API response.
     * @returns The blob's decoded text.
     * @throws {GitHubApiError} On any error response.
     * @throws If the blob comes back in an encoding this can't decode.
     */
    private readBlob = async (sha: string): Promise<string> => {
        const url = `${API_ROOT}/repos/${this.repo}/git/blobs/${sha}`
        const response: Response = await fetch(url, this.getRequestInit())

        if (!response.ok) {
            throw new GitHubApiError(response.status, response.statusText, response.url)
        }

        const blob = (await response.json()) as { content: string; encoding?: string }

        // The Blobs API answers in base64 for anything it will return at all,
        // so a different encoding here means something changed upstream —
        // better to say so than to hand back a silently wrong tree.
        if (blob.encoding !== undefined && blob.encoding !== 'base64') {
            throw new Error(`[xbooksync] unsupported blob encoding from GitHub: ${blob.encoding}`)
        }

        return decodeBase64(blob.content)
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
     * @throws {GitHubApiError} On any error response, including the 409/422
     * GitHub answers when the SHA is stale — carries the status so the caller
     * can tell that conflict apart from a transport failure.
     */
    async write(content: string, previousBlobVersion?: string): Promise<string> {
        const url = `${API_ROOT}/repos/${this.repo}/contents/${this.bookmarkFilename}`
        const reqInit = this.getRequestInit()
        reqInit.method = 'PUT'
        reqInit.body = this.getPayload(content, previousBlobVersion)

        const response: Response = await fetch(url, reqInit)

        if (!response.ok) {
            throw new GitHubApiError(response.status, response.statusText, response.url)
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
