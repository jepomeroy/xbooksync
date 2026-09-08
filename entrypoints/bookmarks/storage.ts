import {
    ghAuthToken,
    ghRepo,
    registerSettingsWatcher,
    SettingsKeys,
    storageSetting,
    unregisterSettingsWatcher,
} from '../shared/localsettings'
import { StorageBackend, type StorageAdapter } from '@/entrypoints/shared/types'
import { GitHubRepoAdapter } from './gh-repo-adapter'
import { NilStorageAdapter } from './nil-adapter'

/** Watcher key used to identify this singleton's own settings subscription. */
const storageMgr = 'storage-mgr'

/**
 * Singleton owning the active {@link StorageAdapter}, swapped whenever the
 * storage-type setting changes.
 *
 * A singleton so there is exactly one live adapter, and so exactly one set of
 * settings watchers: the watcher names adapters register under are derived from
 * `providerId`, so a second instance of the same adapter type would register
 * over the first's subscriptions and leave that instance permanently deaf to
 * the settings it depends on.
 */
export class Storage {
    static #instance: Storage
    private storageAdapter: StorageAdapter

    /**
     * Tail of the rebuild queue: every rebuild is chained onto this rather than
     * started immediately, so two settings changes in quick succession are
     * applied one after the other instead of concurrently.
     *
     * Rebuilding is asynchronous and re-registers watchers at the end, so two
     * overlapping passes would each register under the same watcher names and
     * only one set could ever be unregistered again — the leak this queue
     * exists to prevent. Chrome dispatches a storage event to a *copy* of the
     * listener list, so a single change carrying both watched keys reaches both
     * watchers even though the first one to run tears the other down; that is
     * the overlap this has to survive.
     */
    private rebuilds: Promise<void> = Promise.resolve()

    /** Set by {@link cleanup}; stops a queued rebuild from re-registering watchers on the way out. */
    private disposed = false

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
    public static async instance(): Promise<Storage> {
        if (!Storage.#instance) {
            const adapter = new NilStorageAdapter()
            Storage.#instance = new Storage(adapter)
            await Storage.#instance.handleStorageChange()
        }

        return await Storage.#instance
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
     *
     * A rebuild queued behind this one is abandoned rather than allowed to
     * re-register what was just torn down, which is what makes this the last
     * word on the subject.
     */
    public cleanup = () => {
        this.disposed = true
        unregisterSettingsWatcher(storageMgr)
        this.storageAdapter.unregisterWatchers()
    }

    /**
     * Queues a rebuild of the active adapter.
     *
     * Serves as both the initial build and the change handler, and is what
     * adapters pass to their own `registerWatchers` — so a token or repo edit
     * comes back through here and reconstructs the adapter around the new value.
     *
     * Queued rather than run, so overlapping changes rebuild in sequence; see
     * {@link rebuilds}. The returned promise settles when this rebuild — and
     * everything queued ahead of it — is done, which is what
     * {@link Storage.instance} awaits for the first build.
     *
     * @returns A promise that always resolves: a rebuild that throws leaves the
     * previous adapter in place and is logged, rather than poisoning the queue
     * for every change after it or surfacing as an unhandled rejection in the
     * watcher callbacks, which ignore what this returns.
     */
    private handleStorageChange = (): Promise<void> => {
        this.rebuilds = this.rebuilds
            .then(() => this.rebuild())
            .catch((error: unknown) => {
                console.error('[xbooksync] storage adapter rebuild failed', error)
            })

        return this.rebuilds
    }

    /**
     * Replaces the active adapter with one built for the currently selected
     * storage type.
     *
     * The new adapter registers its watchers before the old one's are dropped,
     * and the old one's are dropped only when the two are different providers.
     * Watcher names are derived from `providerId`, so an adapter replacing one
     * of its own type registers under exactly the names the outgoing adapter
     * holds — unregistering the outgoing one afterwards would take the incoming
     * one's subscriptions with it. Keeping them live across a same-provider
     * rebuild is also what stops a credential change landing mid-rebuild from
     * going unnoticed: it fires the still-registered watcher and queues the
     * follow-up rebuild that picks it up.
     *
     * The switch's default covers every backend without an adapter of its own,
     * {@link StorageBackend.None} included, with the no-op adapter.
     */
    private rebuild = async (): Promise<void> => {
        if (this.disposed) return

        const previous = this.storageAdapter

        let next: StorageAdapter
        switch (await storageSetting.getValue()) {
            // case StorageBackend.GitHubGist:
            case StorageBackend.GitHubRepo:
                next = await this.makeGHRepo()
                break
            //     case StorageBackend.GitLabRepo:
            //     case StorageBackend.S3:
            //
            default:
                next = new NilStorageAdapter()
        }

        if (previous.providerId !== next.providerId) previous.unregisterWatchers()

        this.storageAdapter = next
    }

    /**
     * Builds a {@link GitHubRepoAdapter} from the currently stored token and
     * repo, and wires up its watchers.
     *
     * Token and repo may both still be empty here — nothing blocks construction
     * before the user has signed in, and the resulting requests simply fail.
     *
     * The re-read after `registerWatchers` closes the window where a write is
     * seen by neither path. On the first build after a worker start, and when
     * swapping in from another backend, there are no token/repo watchers live
     * while the values are being read, so a write landing then fires nothing —
     * and the adapter would hold a stale credential until some later change
     * happened to rebuild it. One check suffices: a write before it is visible
     * to the re-read, and a write after it reaches the watchers registered
     * above. Correcting it is left to a queued rebuild rather than a retry here,
     * so this cannot spin.
     */
    private makeGHRepo = async (): Promise<StorageAdapter> => {
        const token = await ghAuthToken.getValue()
        const repo = await ghRepo.getValue()

        const ghAdapter = new GitHubRepoAdapter(token, repo)
        ghAdapter.registerWatchers(this.handleStorageChange)

        if ((await ghAuthToken.getValue()) !== token || (await ghRepo.getValue()) !== repo) {
            void this.handleStorageChange()
        }

        return ghAdapter
    }
}
