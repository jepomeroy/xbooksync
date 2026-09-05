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
