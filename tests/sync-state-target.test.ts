/**
 * Retargeting, from the sync loop's side: what a pass does when the stored base
 * and version were recorded against a different target than the one it is
 * talking to.
 *
 * `sync-state-reset.test.ts` covers the *ordering* — that the state is cleared
 * before the credential write that rebuilds the adapter. That ordering only ever
 * covered state already stored when the user acted, and two windows escape it:
 * a pass already in flight, which holds its adapter and its base in memory and
 * re-records both when it finishes; and a pass that starts in the gap before
 * `Storage` finishes its asynchronous rebuild, which is handed the outgoing
 * adapter with the state already cleared. Both leave state describing one target
 * while the extension is pointed at another, and no ordering of two writes closes
 * either.
 *
 * So these tests do not assert that the stale write never happens — it does, and
 * two of them provoke it deliberately. They assert that it is *labelled*, and
 * that the next pass throws it away instead of reading it as a list of bookmarks
 * to delete.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runSync } from '@/entrypoints/background'
import { Storage } from '@/entrypoints/bookmarks/storage'
import { NilStorageAdapter } from '@/entrypoints/bookmarks/nil-adapter'
import {
    selectSyncRepo,
    syncBaseBookmarks,
    syncLastSyncValueSetting,
    syncStateTargetSetting,
} from '@/entrypoints/shared/localsettings'
import type { BookmarkEntry, ReadData, StorageAdapter } from '@/entrypoints/shared/types'
import { FakeBookmarks, installFakeBookmarks } from './fake-bookmarks'
import { bar, bm, other, tree } from './helpers'

const CHROME_BAR = 'Bookmarks bar'

const REPO_A = 'github-repo:owner/repo-a'
const REPO_B = 'github-repo:owner/repo-b'

/**
 * In-memory sync target.
 *
 * Conditional reads are honoured, since that is what puts the loop on its
 * "remote unchanged" path; conditional *writes* are not — a concurrent update is
 * a different subject, and every write here succeeds and issues a fresh version.
 */
class FakeTarget implements StorageAdapter {
    readonly providerId = 'fake'
    /** Every `knownVersion` this target was asked for, in order. */
    readonly reads: string[] = []
    private writes = 0

    /**
     * @param targetId - Identity the sync state gets labelled with.
     * @param content - What the target already holds; `''` for a target with no
     * file yet.
     * @param version - Version token `content` sits at.
     * @param beforeWrite - Runs inside `write`, i.e. part-way through a pass, so
     * a test can move the world while one is in flight.
     */
    constructor(
        readonly targetId: string,
        private content = '',
        private version = '',
        private beforeWrite?: () => Promise<void>,
    ) {}

    read = async (knownVersion: string): Promise<ReadData> => {
        this.reads.push(knownVersion)

        if (knownVersion !== '' && knownVersion === this.version) {
            return { changed: false, content: '', blobVersion: this.version }
        }

        return { changed: true, content: this.content, blobVersion: this.version }
    }

    write = async (content: string): Promise<string> => {
        await this.beforeWrite?.()

        this.content = content
        this.version = `${this.targetId}-v${++this.writes}`

        return this.version
    }

    registerWatchers = () => undefined
    unregisterWatchers = () => undefined

    /** What the target holds now. */
    held = (): BookmarkEntry | null => (this.content ? (JSON.parse(this.content) as BookmarkEntry) : null)
}

let fake: FakeBookmarks

beforeEach(() => {
    fake = installFakeBookmarks()
})

/** Runs one pass against `adapter`, standing in for whatever `Storage` currently holds. */
const syncWith = async (adapter: StorageAdapter): Promise<void> => {
    vi.spyOn(Storage, 'instance').mockResolvedValue({
        getStorageAdapter: () => adapter,
    } as unknown as Storage)

    await runSync()
}

/** Puts bookmarks in the browser's toolbar folder. */
const seedLocal = (...bookmarks: { title: string; url: string }[]) =>
    fake.seed(
        fake.idAt(CHROME_BAR),
        bookmarks.map(({ title, url }) => ({ title, url })),
    )

/** The state a profile holds after a successful pass against `targetId`. */
const seedSyncedWith = async (targetId: string, base: BookmarkEntry, version: string) => {
    await syncStateTargetSetting.setValue(targetId)
    await syncBaseBookmarks.setValue(base)
    await syncLastSyncValueSetting.setValue(version)
}

/** Serialized target contents holding `bookmarks` on the toolbar. */
const remoteHolding = (...bookmarks: { title: string; url: string }[]) =>
    JSON.stringify(tree(bar(...bookmarks.map(({ title, url }) => bm(title, url))), other()))

const onlyInA = { title: 'OnlyInA', url: 'https://a.dev' }
const onlyInB = { title: 'OnlyInB', url: 'https://b.dev' }
const localNew = { title: 'LocalNew', url: 'https://new.dev' }

/** Toolbar contents as `{title, url}`, in tree order. */
const toolbar = () => fake.shapeOf(CHROME_BAR).map(({ title, url }) => ({ title, url }))

describe('labelling what a pass records', () => {
    it('names the target the state was recorded from', async () => {
        seedLocal(onlyInA)
        const repoA = new FakeTarget(REPO_A)

        await syncWith(repoA)

        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)
        expect(await syncBaseBookmarks.getValue()).not.toBeNull()
        expect(await syncLastSyncValueSetting.getValue()).toBe(`${REPO_A}-v1`)
    })

    it('names the target the pass actually used, not the one now configured', async () => {
        // The in-flight window. The pass starts against repo A; the user picks
        // repo B while it is mid-write, which clears the sync state — and then
        // the pass finishes and writes state back. That write is not preventable
        // from the settings side: it is a pass that was already running.
        seedLocal(onlyInA, localNew)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        const repoA = new FakeTarget(REPO_A, remoteHolding(onlyInA), 'a-v1', () =>
            selectSyncRepo('owner/repo-b'),
        )
        await syncWith(repoA)

        // Re-recorded after the retarget, exactly as the race describes — but
        // wearing repo A's name rather than passing itself off as repo B's.
        expect(await syncBaseBookmarks.getValue()).not.toBeNull()
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)
    })
})

describe('a pass whose stored state belongs to another target', () => {
    it('merges instead of deleting, after a pass finished against the old repo', async () => {
        // Continues the in-flight case above: repo B's turn. Before the label
        // existed, repo A's base was adopted here, every bookmark in it was
        // missing from repo B, and the remote-only branch deleted all of them
        // from the browser.
        seedLocal(onlyInA, localNew)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        await syncWith(
            new FakeTarget(REPO_A, remoteHolding(onlyInA), 'a-v1', () => selectSyncRepo('owner/repo-b')),
        )

        const repoB = new FakeTarget(REPO_B, remoteHolding(onlyInB), 'b-v1')
        await syncWith(repoB)

        expect(toolbar()).toEqual([onlyInA, localNew, onlyInB])
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_B)
    })

    it('merges instead of deleting, after a pass ran on the outgoing adapter', async () => {
        // The rebuild-lag window, which needs no pass in flight at all. The
        // retarget clears the state and writes ghRepo, but `Storage` rebuilds
        // asynchronously, so a tick landing in that gap still gets repo A — and
        // records a full base against it.
        seedLocal(onlyInA)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        await selectSyncRepo('owner/repo-b')
        expect(await syncBaseBookmarks.getValue()).toBeNull()

        await syncWith(new FakeTarget(REPO_A, remoteHolding(onlyInA), 'a-v1'))
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)

        await syncWith(new FakeTarget(REPO_B, remoteHolding(onlyInB), 'b-v1'))

        expect(toolbar()).toEqual([onlyInA, onlyInB])
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_B)
    })

    it('drops the version token with the base, so the read is not made conditional', async () => {
        // A token issued by another target is meaningless here: it either 304s a
        // read that should have returned the whole file, or fails every write as
        // a conflict. `checkRemote` reads it from storage itself, so discarding
        // the base is not enough — the token has to go too.
        seedLocal(onlyInA)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        const repoB = new FakeTarget(REPO_B, remoteHolding(onlyInB), 'a-v1')
        await syncWith(repoB)

        expect(repoB.reads).toEqual([''])
        expect(toolbar()).toEqual([onlyInA, onlyInB])
    })

    it('discards unlabelled state, so a profile synced before the label re-merges once', async () => {
        // Every existing install upgrades into exactly this: a real base and a
        // real version, with nothing saying whose they are. Trusting them would
        // put the one case the label exists for beyond its reach.
        seedLocal(onlyInA)
        await syncBaseBookmarks.setValue(tree(bar(bm(onlyInA.title, onlyInA.url)), other()))
        await syncLastSyncValueSetting.setValue('a-v1')

        const repoA = new FakeTarget(REPO_A, '', '')
        await syncWith(repoA)

        expect(repoA.reads).toEqual([''])
        expect(toolbar()).toEqual([onlyInA])
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)
    })
})

describe('a pass whose stored state is its own', () => {
    it('still applies a genuine remote deletion', async () => {
        // The guard has to be narrow. Discarding a base that *does* describe this
        // target would leave the extension unable to propagate any deletion at
        // all — every pass would merge the two trees and resurrect whatever the
        // user removed.
        seedLocal(onlyInA)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        await syncWith(new FakeTarget(REPO_A, remoteHolding(), 'a-v2'))

        expect(toolbar()).toEqual([])
        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)
        expect(await syncLastSyncValueSetting.getValue()).toBe('a-v2')
    })

    it('reads conditionally, on the token it recorded', async () => {
        seedLocal(onlyInA)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        const repoA = new FakeTarget(REPO_A, remoteHolding(onlyInA), 'a-v1')
        await syncWith(repoA)

        expect(repoA.reads).toEqual(['a-v1'])
    })
})

describe('a targetless adapter', () => {
    it('leaves the stored state alone rather than claiming or invalidating it', async () => {
        // `NilStorageAdapter` is what a profile holds while the configured
        // backend resolves, and whenever the backend is None. Treating it as a
        // target of its own would throw away a base that is still correct for the
        // repo it names — on every worker start.
        seedLocal(onlyInA)
        await seedSyncedWith(REPO_A, tree(bar(bm(onlyInA.title, onlyInA.url)), other()), 'a-v1')

        await syncWith(new NilStorageAdapter())

        expect(await syncStateTargetSetting.getValue()).toBe(REPO_A)
        expect(await syncBaseBookmarks.getValue()).not.toBeNull()
        expect(await syncLastSyncValueSetting.getValue()).toBe('a-v1')
    })

    it('cannot record state under a name of its own', async () => {
        // It refuses to write, so there is no successful pass to record — which
        // is what keeps an empty label from ever being mistaken for a real one.
        seedLocal(onlyInA)

        await expect(syncWith(new NilStorageAdapter())).rejects.toThrow()
        expect(await syncStateTargetSetting.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })
})
