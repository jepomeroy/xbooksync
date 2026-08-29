/**
 * GitHub App user authentication via the OAuth device flow.
 *
 * The GitHub App must have "Enable Device Flow" turned on in its settings.
 */

import { ghAuthToken } from '../shared/localsettings'

const CLIENT_ID = 'Iv23li5nB1ImpNBqC3wl'
/** The app's URL slug — the `github.com/apps/<slug>` segment on its public page. */
const APP_SLUG = 'xbooksync'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

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

interface DeviceCodeResponse {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
}

const sleep = (seconds: number) => new Promise(resolve => setTimeout(resolve, seconds * 1000))

/**
 * Runs the device flow to completion and returns a user access token.
 *
 * @param onPrompt  Called once, as soon as the user code is available. Use it to
 *                  display the code and open the verification page; this call
 *                  then blocks polling GitHub until the user finishes.
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

        const tokenData = await tokenResponse.json()

        if (!tokenData.error) {
            // Store token.
            await ghAuthToken.setValue(tokenData.access_token)
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
