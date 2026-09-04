/**
 * Shared GitHub helpers: base64 for the Contents API, pagination, and repo
 * discovery. The adapters in `gh-repo.ts` / `gh-gist.ts` build on these.
 */

/** Base URL for the REST API. Note the OAuth endpoints in `gh-app-auth.ts` live on github.com instead. */
export const API_ROOT = 'https://api.github.com'

/**
 * The token is valid but reaches no repos, because the app isn't installed on
 * any account. Its own type so the UI can offer the install link rather than
 * showing a dead-end message.
 */
/**
 * The bookmark file is gone from a target that previously held it.
 *
 * Its own type because it is not interchangeable with a first run: both answer
 * 404, but an empty tree from a repo that used to have one diffs as "every
 * bookmark was deleted", and the sync loop would carry that out against the
 * browser. Only a known prior version tells the two apart.
 */
export class RemoteFileMissingError extends Error {
    constructor(repo: string, path: string) {
        super(`${path} is missing from ${repo}, but was present at the last sync.`)
        this.name = 'RemoteFileMissingError'
    }
}

export class AppNotInstalledError extends Error {
    constructor() {
        super('This GitHub App is not installed on any account.')
        this.name = 'AppNotInstalledError'
    }
}

/*
 * Both paginated endpoints used here wrap their results in an object — with a
 * `total_count` alongside — rather than returning a bare array, and each uses a
 * different key. That is why `paginate` takes an `unwrap` function instead of
 * casting the body to an array. Only the fields actually read are declared.
 */

/** One page of `/user/installations`. */
interface InstallationsPage {
    installations: { id: number }[]
}

/** One page of `/user/installations/{id}/repositories`. */
interface RepositoriesPage {
    repositories: { full_name: string }[]
}

/**
 * The `rel="next"` target from a `Link` header, or null on the last page.
 *
 * GitHub's header looks like `<url>; rel="next", <url>; rel="last"`; only the
 * `next` link matters, and its absence is what ends the walk.
 *
 * @param linkHeader - Raw `Link` header, or null when the response carried none.
 */
const nextPageUrl = (linkHeader: string | null) => linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null

/**
 * Decodes a GitHub base64 payload to a string.
 *
 * GitHub's base64 content is chunked with newlines and may contain non-ASCII
 * bookmark titles, so this has to go through TextDecoder rather than atob()
 * alone — atob yields one char per byte, which mangles any multi-byte UTF-8.
 *
 * @param base64 - Base64 as GitHub returns it, newlines and all.
 */
export const decodeBase64 = (base64: string) => {
    const binary = atob(base64.replace(/\n/g, ''))
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}

/**
 * Encodes a string as the base64 GitHub's content field requires.
 *
 * Bookmark titles may contain non-ASCII characters, so this has to go through
 * TextEncoder rather than btoa() alone — btoa throws on any code point above
 * U+00FF. Inverse of {@link decodeBase64}.
 *
 * @param content - Text to encode, typically a serialized bookmark tree.
 */
export const encodeBase64 = (content: string) => {
    const bytes = new TextEncoder().encode(content)
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
    return btoa(binary)
}

/**
 * Every page of a paginated endpoint, concatenated.
 *
 * Follows `Link: rel="next"` rather than counting pages, so it stops exactly
 * when GitHub says there is no more. There is no page cap: a token reaching a
 * very large number of repos makes a correspondingly long series of requests.
 *
 * @typeParam Body - Shape of one page's JSON body.
 * @typeParam Item - Element type being collected.
 * @param url      Endpoint URL without a query string; `per_page` is appended here.
 * @param token    Bearer token for the request.
 * @param unwrap   Pulls the array out of one page's body; its parameter type
 *                 doubles as the assertion made about that body.
 * @returns Every item from every page, in the order GitHub returned them.
 * @throws On the first non-OK response, discarding any pages already collected.
 */
const paginate = async <Body, Item>(url: string, token: string, unwrap: (body: Body) => Item[]): Promise<Item[]> => {
    const items: Item[] = []
    let next: string | null = `${url}?per_page=100`

    while (next) {
        const response: Response = await fetch(next, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                // Belt and braces with no-store below: an empty If-None-Match
                // stops a conditional request even if something else primed the
                // cache.
                'If-None-Match': '',
            },
            // Chrome caches GitHub's ETag and revalidates on the next call,
            // which can surface as a 304 with an empty body instead of the
            // cached 200. no-store keeps the response out of the cache so
            // there's nothing to revalidate against.
            cache: 'no-store',
        })

        if (!response.ok) {
            throw new Error(`GitHub request failed (${response.status} ${response.statusText}): ${next}`)
        }

        items.push(...unwrap((await response.json()) as Body))
        next = nextPageUrl(response.headers.get('Link'))
    }

    return items
}

/**
 * Every repo the token can reach, as `owner/name`.
 *
 * The device flow issues a *user-to-server* token, which sees repos only
 * through the app's installations. `/user/repos` answers 200 with `[]` for such
 * a token, so the list has to be assembled per installation instead.
 *
 * Doubles as the connectivity check the options page relies on: succeeding here
 * is the only proof the token both works and reaches something.
 *
 * @param token - User-to-server token from the device flow.
 * @returns Full names, sorted for stable display in the repo picker. May contain
 * duplicates if one repo is reachable through two installations.
 * @throws {AppNotInstalledError} When the token is valid but the app is
 * installed nowhere — a distinct type because the fix is a visit to
 * {@link INSTALL_URL}, not a retry.
 */
export const fetchGitHubRepos = async (token: string) => {
    // Where the app is installed — one entry per user or org account.
    const installations = await paginate(
        `${API_ROOT}/user/installations`,
        token,
        (body: InstallationsPage) => body.installations,
    )

    if (installations.length === 0) {
        throw new AppNotInstalledError()
    }

    // Independent per installation, so fetch them together rather than serially.
    const repoLists = await Promise.all(
        installations.map(installation =>
            paginate(
                `${API_ROOT}/user/installations/${installation.id}/repositories`,
                token,
                (body: RepositoriesPage) => body.repositories,
            ),
        ),
    )

    const repos = repoLists.flat()

    return repos.map(repo => repo.full_name).sort((a, b) => a.localeCompare(b))
}
