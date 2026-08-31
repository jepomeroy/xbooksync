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

const storageMgr = 'storage-mgr'

export class Storage {
    static #instance: Storage
    private storageAdapter: StorageAdapter

    private constructor(storageAdapter: StorageAdapter) {
        this.storageAdapter = storageAdapter
        // Watch for storage type change e.g. GH Repo -> GH Gist
        registerSettingsWatcher(storageMgr, SettingsKeys.storage, this.handleStorageChange)
    }

    public static get instance(): Storage {
        if (!Storage.#instance) {
            const adapter = new NilStorageAdapter()
            Storage.#instance = new Storage(adapter)
            Storage.#instance.handleStorageChange()
        }

        return Storage.#instance
    }

    public getStorageAdapter = (): StorageAdapter => {
        return this.storageAdapter
    }

    public cleanup = () => {
        unregisterSettingsWatcher(storageMgr)
        this.storageAdapter.unregisterWatchers()
    }

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

    private makeGHRepo = async (): Promise<StorageAdapter> => {
        const token = await ghAuthToken.getValue()
        const repo = await ghRepo.getValue()

        const ghAdapter = new GitHubRepoAdapter(token, repo)
        ghAdapter.registerWatchers(this.handleStorageChange)

        return ghAdapter
    }
}
