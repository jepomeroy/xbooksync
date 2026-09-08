/**
 * The `Storage` singleton's adapter rebuilds, and the watcher registry they
 * depend on.
 *
 * Everything here is about one invariant: however many settings changes arrive,
 * and in whatever order, the extension ends up with exactly one live adapter and
 * exactly one set of watchers — all of them reachable by `cleanup`. A watcher
 * that outlives its adapter cannot be unregistered again, and keeps rebuilding
 * storage for the lifetime of the worker.
 *
 * `vi.resetModules` before each case is what makes that testable: both the
 * `Storage` singleton and the watcher registry are module-level state, so a
 * fresh registry per test is the only way to start from no watchers at all.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { StorageBackend } from '@/entrypoints/shared/types'

type StorageModule = typeof import('@/entrypoints/bookmarks/storage')
type SettingsModule = typeof import('@/entrypoints/shared/localsettings')

/** Loads `Storage` and the settings module fresh, with no state carried over from an earlier test. */
const load = async (): Promise<{ Storage: StorageModule['Storage']; settings: SettingsModule }> => {
    vi.resetModules()

    const [storageModule, settings] = await Promise.all([
        import('@/entrypoints/bookmarks/storage'),
        import('@/entrypoints/shared/localsettings'),
    ])

    return { Storage: storageModule.Storage, settings }
}

/** Lets queued rebuilds run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

type StorageChanges = Record<string, { newValue?: unknown; oldValue?: unknown }>
type ChangeListener = (changes: StorageChanges) => void

/**
 * Takes over `storage.onChanged` so the test decides what a change event
 * delivers.
 *
 * Two reasons. The listener count is the only direct measure of whether a
 * watcher leaked — a leaked one is by definition no longer reachable through the
 * registry. And `dispatch` copies the listener list before delivering, which is
 * what Chrome does and what makes concurrent rebuilds possible: a listener
 * removed by an earlier listener in the same event still runs. The fake browser
 * iterates the live array instead, so a change carrying two watched keys reaches
 * only the first watcher there and the overlap never happens.
 *
 * Recording `addListener` rather than wrapping it also means writes no longer
 * notify anyone on their own, so the only dispatches are the explicit ones
 * below.
 */
const captureListeners = () => {
    const live = new Set<ChangeListener>()
    const area = fakeBrowser.storage.local.onChanged

    vi.spyOn(area, 'addListener').mockImplementation(listener => {
        live.add(listener as ChangeListener)
    })
    vi.spyOn(area, 'removeListener').mockImplementation(listener => {
        live.delete(listener as ChangeListener)
    })

    return {
        count: () => live.size,
        dispatch: (changes: StorageChanges) => [...live].forEach(listener => listener(changes)),
    }
}

/**
 * The credentials the live adapter is actually holding, read off the request it
 * issues rather than out of its private fields.
 *
 * A 404 with no known version is the adapter's "first use of this repo" path, so
 * this observes the request without provoking an error.
 */
const credentialsInUse = async (adapter: { read: (version: string) => Promise<unknown> }) => {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: '',
        json: async () => ({}),
    })

    const realFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof fetch
    try {
        await adapter.read('')
    } finally {
        globalThis.fetch = realFetch
    }

    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined
    if (!call) throw new Error('the adapter issued no request')

    const [url, init] = call
    return { url, authorization: (init.headers as Record<string, string>).Authorization }
}

/** State a profile holds once it is syncing with a GitHub repo. */
const seedGitHub = async (settings: SettingsModule, token: string, repo: string) => {
    await settings.storageSetting.setValue(StorageBackend.GitHubRepo)
    await settings.ghAuthToken.setValue(token)
    await settings.ghRepo.setValue(repo)
}

let modules: { Storage: StorageModule['Storage']; settings: SettingsModule }

beforeEach(async () => {
    modules = await load()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('registerSettingsWatcher', () => {
    it('replaces a name already in use instead of losing the handle', async () => {
        const { settings } = modules
        const first = vi.fn()
        const second = vi.fn()

        settings.registerSettingsWatcher('probe', settings.GitHubSettingsKeys.ghRepo, first)
        settings.registerSettingsWatcher('probe', settings.GitHubSettingsKeys.ghRepo, second)
        await settings.ghRepo.setValue('owner/repo-a')
        await settle()

        // The first subscription is gone, not merely unreachable.
        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledOnce()
    })

    it('leaves nothing behind once the name is unregistered', async () => {
        const { settings } = modules
        const first = vi.fn()
        const second = vi.fn()

        settings.registerSettingsWatcher('probe', settings.GitHubSettingsKeys.ghRepo, first)
        settings.registerSettingsWatcher('probe', settings.GitHubSettingsKeys.ghRepo, second)
        settings.unregisterSettingsWatcher('probe')
        await settings.ghRepo.setValue('owner/repo-a')
        await settle()

        expect(first).not.toHaveBeenCalled()
        expect(second).not.toHaveBeenCalled()
    })
})

describe('adapter rebuilds', () => {
    it('registers one watcher per setting it depends on', async () => {
        const { Storage, settings } = modules
        await seedGitHub(settings, 'tok-a', 'owner/repo-a')

        const listeners = captureListeners()
        const instance = await Storage.instance()
        await settle()

        // Storage type, plus the adapter's token and repo.
        expect(listeners.count()).toBe(3)

        instance.cleanup()
        expect(listeners.count()).toBe(0)
    })

    it('leaves one live set of watchers when a change reaches both of them at once', async () => {
        // The leak this is guarding: a rebuild is asynchronous and re-registers
        // at the end, so two overlapping rebuilds each register under the same
        // names and only the last pair stays reachable. Chrome delivers a
        // batched write as one event to a copy of the listener list, which is
        // how both watchers come to be running at the same time.
        const { Storage, settings } = modules
        await seedGitHub(settings, 'tok-a', 'owner/repo-a')

        const listeners = captureListeners()
        const instance = await Storage.instance()
        await settle()

        await settings.ghAuthToken.setValue('tok-b')
        await settings.ghRepo.setValue('owner/repo-b')
        listeners.dispatch({
            ghAuthToken: { newValue: 'tok-b', oldValue: 'tok-a' },
            ghRepo: { newValue: 'owner/repo-b', oldValue: 'owner/repo-a' },
        })
        await settle()

        expect(listeners.count()).toBe(3)

        instance.cleanup()
        expect(listeners.count()).toBe(0)
    })

    it('rebuilds around the new credentials rather than the ones it started with', async () => {
        const { Storage, settings } = modules
        await seedGitHub(settings, 'tok-a', 'owner/repo-a')

        const listeners = captureListeners()
        const instance = await Storage.instance()
        await settle()

        await settings.ghAuthToken.setValue('tok-b')
        await settings.ghRepo.setValue('owner/repo-b')
        listeners.dispatch({
            ghAuthToken: { newValue: 'tok-b', oldValue: 'tok-a' },
            ghRepo: { newValue: 'owner/repo-b', oldValue: 'owner/repo-a' },
        })
        await settle()

        await expect(credentialsInUse(instance.getStorageAdapter())).resolves.toEqual({
            url: 'https://api.github.com/repos/owner/repo-b/contents/bookmarks.json',
            authorization: 'Bearer tok-b',
        })
    })

    it('picks up a credential change that lands while the adapter is being built', async () => {
        // The window: on the first build there are no token or repo watchers
        // live yet, so a write landing between reading the values and
        // subscribing fires nothing at all. Simulated by writing the token from
        // inside the repo read, which is exactly where that gap sits.
        const { Storage, settings } = modules
        await seedGitHub(settings, 'tok-a', 'owner/repo-a')

        const readRepo = settings.ghRepo.getValue.bind(settings.ghRepo)
        let landed = false
        vi.spyOn(settings.ghRepo, 'getValue').mockImplementation(async () => {
            const repo = await readRepo()
            if (!landed) {
                landed = true
                await settings.ghAuthToken.setValue('tok-b')
            }
            return repo
        })

        captureListeners()
        const instance = await Storage.instance()
        await settle()

        const { authorization } = await credentialsInUse(instance.getStorageAdapter())
        expect(authorization).toBe('Bearer tok-b')
    })

    it('drops the adapter watchers when the backend no longer needs them', async () => {
        const { Storage, settings } = modules
        await seedGitHub(settings, 'tok-a', 'owner/repo-a')

        const listeners = captureListeners()
        await Storage.instance()
        await settle()

        await settings.storageSetting.setValue(StorageBackend.None)
        listeners.dispatch({ storage: { newValue: StorageBackend.None, oldValue: StorageBackend.GitHubRepo } })
        await settle()

        // Only the storage-type watcher, which is how the profile finds its way
        // back to a real adapter.
        expect(listeners.count()).toBe(1)
    })
})
