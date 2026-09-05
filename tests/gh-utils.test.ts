/**
 * The shared GitHub helpers.
 *
 * The base64 pair exists because bookmark titles are not ASCII and GitHub
 * chunks its output; the pagination walk exists because a user-to-server token
 * only sees repos through installations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppNotInstalledError, decodeBase64, encodeBase64, fetchGitHubRepos } from '@/entrypoints/bookmarks/gh-utils'

let fetchMock: ReturnType<typeof vi.fn>

const page = (body: unknown, next?: string) => ({
    ok: true,
    status: 200,
    statusText: '',
    json: async () => body,
    headers: new Headers(next ? { Link: `<${next}>; rel="next", <last>; rel="last"` } : {}),
})

beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('base64', () => {
    it('round-trips non-ASCII titles', () => {
        const value = JSON.stringify({ title: 'Café — 日本語 — Ω' })

        expect(decodeBase64(encodeBase64(value))).toBe(value)
    })

    it('decodes the newline-chunked form the Contents API returns', () => {
        const chunked = encodeBase64('{"title":"Docs"}').replace(/(.{4})/g, '$1\n')

        expect(decodeBase64(chunked)).toBe('{"title":"Docs"}')
    })

    it('round-trips an empty string', () => {
        expect(decodeBase64(encodeBase64(''))).toBe('')
    })
})

describe('fetchGitHubRepos', () => {
    it('throws its own error type when the app is installed nowhere', async () => {
        fetchMock.mockResolvedValueOnce(page({ installations: [] }))

        await expect(fetchGitHubRepos('token')).rejects.toBeInstanceOf(AppNotInstalledError)
    })

    it('follows the Link header until there is no next page', async () => {
        fetchMock
            .mockResolvedValueOnce(page({ installations: [{ id: 1 }] }, 'https://api.github.com/page2'))
            .mockResolvedValueOnce(page({ installations: [{ id: 2 }] }))
            .mockResolvedValueOnce(page({ repositories: [{ full_name: 'b/one' }] }))
            .mockResolvedValueOnce(page({ repositories: [{ full_name: 'a/two' }] }))

        await expect(fetchGitHubRepos('token')).resolves.toEqual(['a/two', 'b/one'])
        expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('merges and sorts repos across installations', async () => {
        fetchMock
            .mockResolvedValueOnce(page({ installations: [{ id: 1 }, { id: 2 }] }))
            .mockResolvedValueOnce(page({ repositories: [{ full_name: 'zed/repo' }] }))
            .mockResolvedValueOnce(page({ repositories: [{ full_name: 'alpha/repo' }] }))

        await expect(fetchGitHubRepos('token')).resolves.toEqual(['alpha/repo', 'zed/repo'])
    })

    it('throws when a page fails rather than returning a partial list', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: async () => ({}),
            headers: new Headers(),
        })

        await expect(fetchGitHubRepos('token')).rejects.toThrow(/403 Forbidden/)
    })
})
