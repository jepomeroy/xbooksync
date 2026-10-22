/**
 * Token refresh for GitHub App user tokens, which expire after 8 hours.
 *
 * Refresh tokens are single use, so the cases that matter most are the ones
 * that must *not* refresh: a token that is still good, and one another context
 * already replaced.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGitHubToken } from '@/entrypoints/bookmarks/gh-app-auth'
import { fetchWithToken } from '@/entrypoints/bookmarks/gh-utils'
import {
    ghAuthToken,
    ghAuthTokenExpiresAt,
    ghRefreshToken,
    ghRefreshTokenExpiresAt,
} from '@/entrypoints/shared/localsettings'

let fetchMock: ReturnType<typeof vi.fn>

const reply = (status: number, body?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
    headers: new Headers(),
})

const HOUR = 60 * 60 * 1000

const refreshed = {
    access_token: 'ghu_new',
    expires_in: 28800,
    refresh_token: 'ghr_new',
    refresh_token_expires_in: 15897600,
}

/** A signed-in profile whose access token expires `expiresIn` ms from now. */
const seed = async (expiresIn: number | null) => {
    await ghAuthToken.setValue('ghu_old')
    await ghAuthTokenExpiresAt.setValue(expiresIn === null ? null : Date.now() + expiresIn)
    await ghRefreshToken.setValue('ghr_old')
    await ghRefreshTokenExpiresAt.setValue(Date.now() + 1000 * HOUR)
}

beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('getGitHubToken', () => {
    it('returns the stored token without refreshing while it is still good', async () => {
        await seed(HOUR)

        await expect(getGitHubToken()).resolves.toBe('ghu_old')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('returns an empty token when signed out', async () => {
        await expect(getGitHubToken()).resolves.toBe('')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refreshes a token about to expire and stores the new pair', async () => {
        await seed(60 * 1000)
        fetchMock.mockResolvedValueOnce(reply(200, refreshed))

        await expect(getGitHubToken()).resolves.toBe('ghu_new')

        const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as URLSearchParams
        expect(body.get('grant_type')).toBe('refresh_token')
        expect(body.get('refresh_token')).toBe('ghr_old')
        expect(await ghAuthToken.getValue()).toBe('ghu_new')
        expect(await ghRefreshToken.getValue()).toBe('ghr_new')
        expect(await ghAuthTokenExpiresAt.getValue()).toBeGreaterThan(Date.now() + 7 * HOUR)
    })

    it('forces a refresh for a rejected token even when its expiry looks fine', async () => {
        await seed(null)
        fetchMock.mockResolvedValueOnce(reply(200, refreshed))

        await expect(getGitHubToken('ghu_old')).resolves.toBe('ghu_new')
    })

    it('hands back a token another context already refreshed instead of spending the refresh token', async () => {
        await seed(HOUR)
        await ghAuthToken.setValue('ghu_other')

        await expect(getGitHubToken('ghu_old')).resolves.toBe('ghu_other')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('keeps the current token when GitHub refuses the refresh', async () => {
        await seed(null)
        fetchMock.mockResolvedValueOnce(reply(200, { error: 'bad_refresh_token' }))
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        await expect(getGitHubToken('ghu_old')).resolves.toBe('ghu_old')
        expect(await ghRefreshToken.getValue()).toBe('ghr_old')
    })

    it('does not try to refresh without a refresh token', async () => {
        await seed(null)
        await ghRefreshToken.setValue('')

        await expect(getGitHubToken('ghu_old')).resolves.toBe('ghu_old')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('fetchWithToken', () => {
    const authOf = (call: number) =>
        ((fetchMock.mock.calls[call]![1] as RequestInit).headers as Record<string, string>).Authorization

    it('retries once with a renewed token after a 401', async () => {
        fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200))
        const getToken = vi.fn(async (rejected?: string) => (rejected ? 'tok-b' : 'tok-a'))

        const response = await fetchWithToken('https://api.github.com/x', { headers: {} }, getToken)

        expect(response.status).toBe(200)
        expect(authOf(0)).toBe('Bearer tok-a')
        expect(authOf(1)).toBe('Bearer tok-b')
    })

    it('returns the 401 without retrying when no new token is available', async () => {
        fetchMock.mockResolvedValueOnce(reply(401))

        const response = await fetchWithToken('https://api.github.com/x', { headers: {} }, async () => 'tok-a')

        expect(response.status).toBe(401)
        expect(fetchMock).toHaveBeenCalledOnce()
    })
})
