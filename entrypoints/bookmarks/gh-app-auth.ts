/**
 * GitHub App user authentication via the OAuth device flow.
 *
 * The device flow is used because it needs no client secret and no redirect
 * URI — neither of which an extension can hold safely — at the cost of the user
 * typing a code on github.com.
 *
 * The GitHub App must have "Enable Device Flow" turned on in its settings.
 */

import {
    ghAuthToken,
    ghAuthTokenExpiresAt,
    ghRefreshToken,
    ghRefreshTokenExpiresAt,
    GitHubSettingsKeys,
} from '../shared/localsettings'

const CLIENT_ID = 'Iv23li5nB1ImpNBqC3wl'
/** The app's URL slug — the `github.com/apps/<slug>` segment on its public page. */
const APP_SLUG = 'xbooksync'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const REFRESH_GRANT_TYPE = 'refresh_token'

/**
 * How long before the stated expiry a token is treated as already expired, so
 * a request isn't sent with one that lapses in flight.
 */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

/**
 * Web Lock name serializing refreshes across the background worker and the
 * options page, which share an origin but not memory. Refresh tokens are single
 * use, so two contexts refreshing at once would have the loser spend a token the
 * winner already consumed — and GitHub answers that by failing the refresh.
 */
const REFRESH_LOCK = 'xbooksync-gh-token-refresh'

/**
 * Where the user installs the app on an account.
 *
 * Authorizing via the device flow yields a token but grants it no repository
 * access — that comes from a separate installation, so a fresh login can end up
 * seeing nothing until the user has been here.
 */
export const INSTALL_URL = `https://github.com/apps/${APP_SLUG}/installations/new`

/** Shown to the user so they can enter the code on GitHub. */
export interface DeviceCodePrompt {
    /** The code the user types into {@link verificationUri}. */
    userCode: string
    /** Where the user enters the code — open this in a tab. */
    verificationUri: string
    /** Wall-clock time the code stops working. */
    expiresAt: Date
}

/** Raw response body from GitHub's device code endpoint. */
interface DeviceCodeResponse {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

/**
 * Raw response body from GitHub's access token endpoint, for both the device
 * flow poll and a refresh.
 *
 * The endpoint answers 200 for errors too, so success and failure share a shape
 * and are told apart by `error`. The expiry fields and `refresh_token` are
 * absent when the app has token expiration turned off.
 */
interface TokenResponse {
    access_token?: string
    /** Seconds until `access_token` expires. */
    expires_in?: number
    refresh_token?: string
    /** Seconds until `refresh_token` expires. */
    refresh_token_expires_in?: number
    /** New polling interval in seconds, sent with `slow_down`. */
    interval?: number
    error?: string
    error_description?: string
}

/**
 * Resolves after the given number of seconds.
 *
 * @param seconds - Delay; GitHub states its polling interval in seconds, hence
 * the unit.
 */
const sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000))

/**
 * Persists a successful token response.
 *
 * One batch, so another context never reads a new access token next to the old
 * refresh token (or the reverse) — after a refresh the old pair is dead on
 * GitHub's side, and a mixed pair would leave nothing that works.
 *
 * @param data - Token response with `access_token` set.
 * @param issuedAt - Time to measure the expiries from; taken before the request
 *                   went out, so any error makes them early rather than late.
 */
const storeTokens = async (data: TokenResponse, issuedAt: number) => {
    const expiresAt = (seconds?: number) => (seconds === undefined ? null : issuedAt + seconds * 1000)

    await storage.setItems([
        { key: GitHubSettingsKeys.ghAuthToken, value: data.access_token },
        { key: GitHubSettingsKeys.ghAuthTokenExpiresAt, value: expiresAt(data.expires_in) },
        { key: GitHubSettingsKeys.ghRefreshToken, value: data.refresh_token ?? '' },
        { key: GitHubSettingsKeys.ghRefreshTokenExpiresAt, value: expiresAt(data.refresh_token_expires_in) },
    ])
}

/**
 * Runs `task` holding {@link REFRESH_LOCK}, or directly where Web Locks are
 * unavailable (tests, very old browsers).
 */
const withRefreshLock = <T>(task: () => Promise<T>): Promise<T> =>
    typeof navigator !== 'undefined' && navigator.locks
        ? (navigator.locks.request(REFRESH_LOCK, task) as Promise<T>)
        : task()

/**
 * Exchanges the stored refresh token for a new token pair, unless another
 * context already replaced `current`.
 *
 * Never throws: every failure returns `current`, so the caller's request goes
 * out (or is retried) with the token it had and fails, if it fails, with the
 * ordinary 401 that sends the user to log in again.
 *
 * @param current - The access token the caller believes is current.
 * @returns The new access token, a newer one another context stored, or
 * `current` when no refresh was possible.
 */
const refreshGitHubToken = (current: string): Promise<string> =>
    withRefreshLock(async () => {
        // Whoever held the lock before us may have refreshed already, which
        // also consumed the refresh token we would otherwise read below.
        const latest = await ghAuthToken.getValue()
        if (latest !== current) return latest

        const refreshToken = await ghRefreshToken.getValue()
        const refreshExpiresAt = await ghRefreshTokenExpiresAt.getValue()
        if (refreshToken === '' || (refreshExpiresAt !== null && Date.now() >= refreshExpiresAt)) {
            return current
        }

        try {
            const issuedAt = Date.now()
            const response = await fetch(ACCESS_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                },
                // No client secret: GitHub doesn't require one for tokens that
                // came from the device flow, which is the only way these do.
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    grant_type: REFRESH_GRANT_TYPE,
                    refresh_token: refreshToken,
                }),
            })

            const data = (await response.json()) as TokenResponse
            if (!response.ok || data.error || !data.access_token) {
                console.warn('[xbooksync] GitHub token refresh failed', data.error_description ?? data.error)
                return current
            }

            await storeTokens(data, issuedAt)
            return data.access_token
        } catch (error) {
            console.warn('[xbooksync] GitHub token refresh failed', error)
            return current
        }
    })

/**
 * The stored access token, refreshed first if it has expired or is about to.
 *
 * Doubles as the retry hook for a 401 — see `fetchWithToken` in `gh-utils.ts`:
 * passing the token that was just rejected forces a refresh even when the stored
 * expiry says it should still be good, which covers tokens stored before expiry
 * was tracked and a token revoked early.
 *
 * @param rejectedToken - A token GitHub just answered 401 to, if any.
 * @returns A token to send — `''` when signed out. When a forced refresh isn't
 * possible this is `rejectedToken` itself, which tells the caller not to retry.
 */
export const getGitHubToken = async (rejectedToken?: string): Promise<string> => {
    const token = await ghAuthToken.getValue()
    if (token === '') return token

    if (rejectedToken === undefined) {
        const expiresAt = await ghAuthTokenExpiresAt.getValue()
        if (expiresAt === null || Date.now() < expiresAt - EXPIRY_MARGIN_MS) return token
    }

    return await refreshGitHubToken(rejectedToken ?? token)
}

/**
 * Runs the device flow to completion and returns a user access token.
 *
 * Stores the token in {@link ghAuthToken} — with its refresh token and both
 * expiries — as well as returning it, so a caller that only needs it persisted
 * can ignore the return value.
 *
 * @param onPrompt  Called once, as soon as the user code is available. Use it to
 *                  display the code and open the verification page; this call
 *                  then blocks polling GitHub until the user finishes.
 * @returns The user-to-server access token. Note this grants no repository
 *          access on its own — that requires the app to be installed on an
 *          account, which is a separate step at {@link INSTALL_URL}.
 * @throws If the user denies authorization, the code expires, or GitHub returns
 *         an error. There is no cancellation path short of that expiry, so a
 *         caller that abandons the flow leaves it polling until the deadline.
 */
export async function loginWithGitHubApp(onPrompt: (prompt: DeviceCodePrompt) => void): Promise<string> {
    // 1. Ask GitHub for a device/user code pair.
    const codeResponse = await fetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: new URLSearchParams({ client_id: CLIENT_ID }),
    })

    if (!codeResponse.ok) {
        throw new Error(
            `Error authorizing device with GitHub: status - ${codeResponse.status} error - ${codeResponse.statusText}`,
        )
    }

    const codeData = await codeResponse.json()
    if (codeData.error) {
        throw new Error(`GitHub device code request failed: ${codeData.error_description ?? codeData.error}`)
    }

    const { device_code, user_code, verification_uri, expires_in, interval } = codeData as DeviceCodeResponse
    const deadline = Date.now() + expires_in * 1000

    onPrompt({
        userCode: user_code,
        verificationUri: verification_uri,
        expiresAt: new Date(deadline),
    })

    // Poll until the user approves, denies, or the code expires. GitHub sets
    // the starting interval and asks us to back off further via `slow_down`.
    let pollInterval = interval

    while (Date.now() < deadline) {
        await sleep(pollInterval)

        const issuedAt = Date.now()
        const tokenResponse = await fetch(ACCESS_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                device_code,
                grant_type: DEVICE_GRANT_TYPE,
            }),
        })

        const tokenData = (await tokenResponse.json()) as TokenResponse

        if (!tokenData.error && tokenData.access_token) {
            await storeTokens(tokenData, issuedAt)
            return tokenData.access_token
        }

        switch (tokenData.error) {
            case 'authorization_pending':
                break
            case 'slow_down':
                pollInterval = tokenData.interval ?? pollInterval + 5
                break
            case 'expired_token':
                throw new Error('The device code expired before it was authorized.')
            case 'access_denied':
                throw new Error('GitHub authorization was denied.')
            default:
                throw new Error(`OAuth error: ${tokenData.error_description ?? tokenData.error}`)
        }
    }

    throw new Error('The device code expired before it was authorized.')
}
