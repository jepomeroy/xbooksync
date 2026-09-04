import {
    ghAuthToken,
    ghRepo,
    registerSettingsWatcher,
    SettingsKeys,
    storageSetting,
    unregisterSettingsWatcher,
} from '../shared/localsettings'
import { StorageBackend, type StorageAdapter } from '@/entrypoints/shared/types'
import { GitHubRepoAdapter } from './gh-repo'
import { NilStorageAdapter } from './nil-adapter'

/** Watcher key used to identify this singleton's own settings subscription. */
const storageMgr = 'storage-mgr'

/**
 * Singleton owning the active {@link StorageAdapter}, swapped whenever the
 * storage-type setting changes.
 *
 * A singleton so there is exactly one live adapter, and so exactly one set of
 * settings watchers: the watcher names adapters register under are derived from
 * `providerId`, so a second instance of the same adapter type would silently
 * clobber the first's subscriptions.
 */
export class Storage {
    static #instance: Storage
    private storageAdapter: StorageAdapter

    /** @param storageAdapter Adapter to start with, replaced as soon as the stored setting resolves. */
    private constructor(storageAdapter: StorageAdapter) {
        this.storageAdapter = storageAdapter
        // Watch for storage type change e.g. GH Repo -> GH Gist
        registerSettingsWatcher(storageMgr, SettingsKeys.storage, this.handleStorageChange)
    }

    /**
     * Lazily creates the singleton, starting with a {@link NilStorageAdapter}
     * until the real target loads.
     *
     * The real adapter is built asynchronously, so the first getter call — and
     * possibly the first sync after it — sees the no-op adapter. That is why
     * `NilStorageAdapter` reports "unchanged" rather than throwing: an early
     * tick has to be harmless.
     */
    public static get instance(): Storage {
        if (!Storage.#instance) {
            const adapter = new NilStorageAdapter()
            Storage.#instance = new Storage(adapter)
            Storage.#instance.handleStorageChange()
        }

        return Storage.#instance
    }

    /**
     * The currently active storage adapter.
     *
     * Read fresh on each use rather than cached by callers, since a settings
     * change replaces the instance.
     */
    public getStorageAdapter = (): StorageAdapter => {
        return this.storageAdapter
    }

    /**
     * Unregisters this singleton's own watcher and the active adapter's
     * watchers.
     *
     * Called from the worker's `onSuspend`. The singleton itself is not torn
     * down — it dies with the worker, and a revived worker builds a new one.
     */
    public cleanup = () => {
        unregisterSettingsWatcher(storageMgr)
        this.storageAdapter.unregisterWatchers()
    }

    /**
     * Rebuilds the active adapter for the currently selected storage type.
     *
     * Serves as both the initial build and the change handler, and is what
     * adapters pass to their own `registerWatchers` — so a token or repo edit
     * comes back through here and reconstructs the adapter around the new value.
     *
     * The switch has no default: selecting a backend without a case leaves the
     * previous adapter in place with its watchers already unregistered, so it
     * keeps working but stops noticing settings changes. Only reachable if the
     * options page starts offering a backend before there is an adapter for it.
     */
    private handleStorageChange = async () => {
        // cleanup potentially old storage adapter
        this.storageAdapter.unregisterWatchers()

        switch (await storageSetting.getValue()) {
            // case StorageBackend.GitHubGist:
            case StorageBackend.GitHubRepo:
                this.storageAdapter = await this.makeGHRepo()
            //     case StorageBackend.GitLabRepo:
            //     case StorageBackend.S3:
        }
    }

    /**
     * Builds a {@link GitHubRepoAdapter} from the currently stored token and
     * repo, and wires up its watchers.
     *
     * Token and repo may both still be empty here — nothing blocks construction
     * before the user has signed in, and the resulting requests simply fail.
     */
    private makeGHRepo = async (): Promise<StorageAdapter> => {
        const token = await ghAuthToken.getValue()
        const repo = await ghRepo.getValue()

        const ghAdapter = new GitHubRepoAdapter(token, repo)
        ghAdapter.registerWatchers(this.handleStorageChange)

        return ghAdapter
    }
}
