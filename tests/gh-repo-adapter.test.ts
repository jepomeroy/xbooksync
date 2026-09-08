/**
 * `GitHubRepoAdapter` against a stubbed `fetch`.
 *
 * `read` has five outcomes that the sync loop reacts to very differently, and
 * two of them are reached by the same 404.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubRepoAdapter } from '@/entrypoints/bookmarks/gh-repo-adapter'
import { RemoteFileMissingError } from '@/entrypoints/bookmarks/gh-utils'

const REPO = 'someone/bookmarks'
const CONTENTS_URL = `https://api.github.com/repos/${REPO}/contents/bookmarks.json`

let fetchMock: ReturnType<typeof vi.fn>

/** A `fetch` reply carrying a body, since happy-dom's Response is not used here. */
const reply = (status: number, body?: unknown, statusText = '') => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    headers: new Headers(),
})

/** Base64 of a JSON payload, the way the Contents API returns it. */
const encoded = (value: unknown) => btoa(JSON.stringify(value))

/**
 * The request the adapter issued. Throws when there was none, so the assertions
 * below can index into it without repeating an undefined check.
 */
const request = (): [string, RequestInit] => {
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error('fetch was never called')
    return call as [string, RequestInit]
}

beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const adapter = () => new GitHubRepoAdapter('token', REPO)

describe('read', () => {
    it('reports no change on a 304 without parsing a body', async () => {
        fetchMock.mockResolvedValue({ ...reply(304), json: async () => expect.unreachable('body was parsed') })

        await expect(adapter().read('sha-1')).resolves.toEqual({
            changed: false,
            content: '',
            blobVersion: 'sha-1',
        })
    })

    it('sends the known version as a conditional request', async () => {
        fetchMock.mockResolvedValue(reply(304))
        await adapter().read('sha-1')

        const [url, init] = request()
        expect(url).toBe(CONTENTS_URL)
        expect((init.headers as Record<string, string>)['If-None-Match']).toBe('"sha-1"')
        expect(init.cache).toBe('no-store')
    })

    it('treats a 404 with no known version as an empty first run', async () => {
        fetchMock.mockResolvedValue(reply(404, undefined, 'Not Found'))

        await expect(adapter().read('')).resolves.toEqual({ changed: true, content: '', blobVersion: '' })
    })

    it('treats a 404 with a known version as a deleted file', async () => {
        // The distinction that keeps a deleted target from reading as "the user
        // cleared every bookmark" and being applied to the browser.
        fetchMock.mockResolvedValue(reply(404, undefined, 'Not Found'))

        await expect(adapter().read('sha-1')).rejects.toBeInstanceOf(RemoteFileMissingError)
    })

    it('decodes content and reports a change when the sha moved', async () => {
        const payload = { type: 'folder', children: [] }
        fetchMock.mockResolvedValue(reply(200, { content: encoded(payload), sha: 'sha-2' }))

        await expect(adapter().read('sha-1')).resolves.toEqual({
            changed: true,
            content: JSON.stringify(payload),
            blobVersion: 'sha-2',
        })
    })

    it('reports no change when the returned sha matches the known one', async () => {
        // Chrome can serve a cached 200 instead of the 304 the header asked for,
        // so the sha comparison has to stand on its own.
        fetchMock.mockResolvedValue(reply(200, { content: encoded({}), sha: 'sha-1' }))

        await expect(adapter().read('sha-1')).resolves.toMatchObject({ changed: false, blobVersion: 'sha-1' })
    })

    it('throws on any other error status', async () => {
        fetchMock.mockResolvedValue(reply(500, undefined, 'Internal Server Error'))

        await expect(adapter().read('sha-1')).rejects.toThrow(/500 Internal Server Error/)
    })
})

describe('write', () => {
    it('includes the prior sha when updating an existing file', async () => {
        fetchMock.mockResolvedValue(reply(200, { content: { sha: 'sha-3' } }))

        await expect(adapter().write('{}', 'sha-2')).resolves.toBe('sha-3')

        const [, init] = request()
        expect(init.method).toBe('PUT')
        expect(JSON.parse(init.body as string)).toMatchObject({ sha: 'sha-2', content: btoa('{}') })
    })

    it('omits the sha when creating the file', async () => {
        fetchMock.mockResolvedValue(reply(200, { content: { sha: 'sha-1' } }))
        await adapter().write('{}')

        expect(JSON.parse(request()[1].body as string)).not.toHaveProperty('sha')
    })

    it('throws when the conditional write is rejected', async () => {
        // A 409 means another browser wrote between the read and this call; the
        // sync pass must abort rather than record a version it did not produce.
        fetchMock.mockResolvedValue(reply(409, undefined, 'Conflict'))

        await expect(adapter().write('{}', 'stale')).rejects.toThrow(/409 Conflict/)
    })
})

/**
 * Files past 1 MB, which the Contents API will not inline.
 *
 * It answers an ordinary 200 whose `content` is `''` and whose `encoding` is
 * `'none'`, expecting the body to be fetched from the Blobs API instead. The
 * trap is that `''` is itself valid base64: a reader that ignores `encoding`
 * decodes it without error and cannot tell a 2 MB file from an empty one.
 */
describe('read of a file too large to inline', () => {
    const BLOBS_URL = (sha: string) => `https://api.github.com/repos/${REPO}/git/blobs/${sha}`
    const payload = { type: 'folder', children: [{ type: 'bookmarks bar' }, { type: 'other bookmarks' }] }

    /** Contents says "too big, go to the blob"; the Blobs API then serves the body. */
    const oversized = (sha = 'sha-big', size = 2_000_000) => {
        fetchMock
            .mockResolvedValueOnce(reply(200, { content: '', encoding: 'none', sha, size }))
            .mockResolvedValueOnce(reply(200, { content: encoded(payload), encoding: 'base64', sha }))
    }

    it('falls back to the Blobs API instead of decoding the empty content', async () => {
        // Regression guard. Reading `content` here yields '', which downstream
        // flattens to an empty tree and diffs as a removal of every bookmark.
        oversized()

        await expect(adapter().read('sha-old')).resolves.toEqual({
            changed: true,
            content: JSON.stringify(payload),
            blobVersion: 'sha-big',
        })
    })

    it('addresses the blob by the sha the Contents API reported', async () => {
        oversized('sha-big')
        await adapter().read('sha-old')

        expect(fetchMock.mock.calls[0]?.[0]).toBe(CONTENTS_URL)
        expect(fetchMock.mock.calls[1]?.[0]).toBe(BLOBS_URL('sha-big'))
    })

    it('still reports no change when the sha matches, despite the second fetch', async () => {
        // `changed` comes from the sha, not from the body, so an unchanged
        // oversized file must not read as one that emptied itself.
        oversized('sha-same')

        await expect(adapter().read('sha-same')).resolves.toMatchObject({
            changed: false,
            blobVersion: 'sha-same',
        })
    })

    it('surfaces a Blobs API failure rather than falling back to empty content', async () => {
        fetchMock
            .mockResolvedValueOnce(reply(200, { content: '', encoding: 'none', sha: 'sha-big', size: 2_000_000 }))
            .mockResolvedValueOnce(reply(500, undefined, 'Internal Server Error'))

        await expect(adapter().read('sha-old')).rejects.toThrow(/500 Internal Server Error/)
    })

    it('refuses a file past what the Blobs API can return, without calling it', async () => {
        // That endpoint answers 403 over 100 MB, which `classifySyncError` reads
        // as an auth problem — so the size is checked before the request.
        fetchMock.mockResolvedValue(
            reply(200, { content: '', encoding: 'none', sha: 'sha-huge', size: 200 * 1024 * 1024 }),
        )

        await expect(adapter().read('sha-old')).rejects.toThrow(/past the .* limit/)
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('refuses an encoding neither path understands', async () => {
        fetchMock.mockResolvedValue(reply(200, { content: 'whatever', encoding: 'utf-16', sha: 'sha-odd' }))

        await expect(adapter().read('sha-old')).rejects.toThrow(/unsupported content encoding/)
    })

    it('reads a normally-sized file inline, without a second request', async () => {
        fetchMock.mockResolvedValue(reply(200, { content: encoded(payload), encoding: 'base64', sha: 'sha-small' }))

        await expect(adapter().read('sha-old')).resolves.toMatchObject({ content: JSON.stringify(payload) })
        expect(fetchMock).toHaveBeenCalledOnce()
    })
})
