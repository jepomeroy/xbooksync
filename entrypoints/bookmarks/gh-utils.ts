export const API_ROOT = 'https://api.github.com'

/**
 * The token is valid but reaches no repos, because the app isn't installed on
 * any account. Its own type so the UI can offer the install link rather than
 * showing a dead-end message.
 */
export class AppNotInstalledError extends Error {
    constructor() {
        super('This GitHub App is not installed on any account.')
        this.name = 'AppNotInstalledError'
    }
}

/**
 * Both endpoints used here answer with a `{ total_count, ... }` object rather
 * than a bare array, under a different key each.
 */
interface InstallationsPage {
    installations: { id: number }[]
}

interface RepositoriesPage {
    repositories: { full_name: string }[]
}

/**
 * The `rel="next"` target from a `Link` header, or null on the last page.
 *
 * GitHub's header looks like `<url>; rel="next", <url>; rel="last"`; only the
 * `next` link matters, and its absence is what ends the walk.
 */
const nextPageUrl = (linkHeader: string | null) => linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null

// GitHub's base64 content is chunked with newlines and may contain non-ASCII
// bookmark titles, so this has to go through TextDecoder rather than atob() alone.
export const decodeBase64 = (base64: string) => {
    const binary = atob(base64.replace(/\n/g, ''))
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)))
}

// GitHub's content field must be a base64 string, and bookmark titles may
// contain non-ASCII characters, so this has to go through TextEncoder rather
// than btoa() alone.
export const encodeBase64 = (content: string) => {
    const bytes = new TextEncoder().encode(content)
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
    return btoa(binary)
}

/**
 * Every page of a paginated endpoint, concatenated.
 *
 * @param unwrap  Pulls the array out of one page's body; its parameter type
 *                doubles as the assertion made about that body.
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
