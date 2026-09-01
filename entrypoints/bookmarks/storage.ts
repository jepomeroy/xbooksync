import {
    ghAuthToken,
    ghRepo,
    registerSettingsWatcher,
    SettingsKeys,
    storageSetting,
    unregisterSettingsWatcher,
} from '../shared/localsettings'
import { StorageType, type StorageAdapter } from '@/entrypoints/shared/types'
import { GitHubRepoAdapter } from './gh-repo'
import { NilStorageAdapter } from './nil-adapter'

/** Watcher key used to identify this singleton's own settings subscription. */
const storageMgr = 'storage-mgr'

/** Singleton owning the active {@link StorageAdapter}, swapped whenever the storage-type setting changes. */
export class Storage {
    static #instance: Storage
    private storageAdapter: StorageAdapter

    private constructor(storageAdapter: StorageAdapter) {
        this.storageAdapter = storageAdapter
        // Watch for storage type change e.g. GH Repo -> GH Gist
        registerSettingsWatcher(storageMgr, SettingsKeys.storage, this.handleStorageChange)
    }

    /** Lazily creates the singleton, starting with a {@link NilStorageAdapter} until the real target loads. */
    public static get instance(): Storage {
        if (!Storage.#instance) {
            const adapter = new NilStorageAdapter()
            Storage.#instance = new Storage(adapter)
            Storage.#instance.handleStorageChange()
        }

        return Storage.#instance
    }

    /** Returns the currently active storage adapter. */
    public getStorageAdapter = (): StorageAdapter => {
        return this.storageAdapter
    }

    /** Unregisters this singleton's own watcher and the active adapter's watchers. */
    public cleanup = () => {
        unregisterSettingsWatcher(storageMgr)
        this.storageAdapter.unregisterWatchers()
    }

    /** Rebuilds the active adapter for the currently selected storage type. */
    private handleStorageChange = async () => {
        // cleanup potentially old storage adapter
        this.storageAdapter.unregisterWatchers()

        switch (await storageSetting.getValue()) {
            // case StorageType.GitHubGist:
            case StorageType.GitHubRepo:
                this.storageAdapter = await this.makeGHRepo()
            //     case StorageType.GitlabRepo:
            //     case StorageType.S3:
        }
    }

    /** Builds a {@link GitHubRepoAdapter} from the currently stored token and repo, and wires up its watchers. */
    private makeGHRepo = async (): Promise<StorageAdapter> => {
        const token = await ghAuthToken.getValue()
        const repo = await ghRepo.getValue()

        const ghAdapter = new GitHubRepoAdapter(token, repo)
        ghAdapter.registerWatchers(this.handleStorageChange)

        return ghAdapter
    }
}
