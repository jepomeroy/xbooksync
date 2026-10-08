/**
 * `sortIfEnabled` against an in-memory bookmarks tree, and its place at the end
 * of `runSync`.
 *
 * Like `applyRemote`, the sort mutates the user's real bookmarks, so the
 * assertions are on the resulting tree. The exception is the move count: an
 * already-sorted tree making no calls at all is part of the contract, since the
 * sort runs on every pass and each move fires an `onMoved`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sortIfEnabled } from '@/entrypoints/bookmarks/sort'
import { runSync } from '@/entrypoints/background'
import { Storage } from '@/entrypoints/bookmarks/storage'
import {
    sortedSetting,
    sortFoldersSetting,
    sortOrderSetting,
    syncBaseBookmarks,
    syncLastSyncValueSetting,
    syncStateTargetSetting,
} from '@/entrypoints/shared/localsettings'
import {
    BookmarkEvent,
    SortFolders,
    SortOrder,
    type BookmarkEntry,
    type ReadData,
    type SelfWrite,
    type StorageAdapter,
} from '@/entrypoints/shared/types'
import { FakeBookmarks, installFakeBookmarks, type SeedNode, type TreeShape } from './fake-bookmarks'
import { bar, bm, other, tree } from './helpers'

const CHROME_BAR = 'Bookmarks bar'
const CHROME_OTHER = 'Other bookmarks'

let fake: FakeBookmarks

beforeEach(async () => {
    fake = installFakeBookmarks()
    await sortedSetting.setValue(true)
})

/** A bookmark whose url is derived from its title, so tests only spell the title. */
const b = (title: string): SeedNode => ({ title, url: `https://example.dev/${encodeURIComponent(title)}` })

/** A folder. */
const f = (title: string, ...children: SeedNode[]): SeedNode => ({ title, children })

/** A Firefox separator. */
const sep = (): SeedNode => ({ title: '', type: 'separator' })

const seedBar = (...nodes: SeedNode[]) => fake.seed(fake.idAt(CHROME_BAR), nodes)

/** One level of titles, with separators shown as `---`. */
const titles = (nodes: TreeShape[]): string[] => nodes.map(n => (n.type === 'separator' ? '---' : n.title))

const barTitles = () => titles(fake.shapeOf(CHROME_BAR))

/** Counts `move` calls without changing what they do. */
const spyMoves = () => vi.spyOn(fake.api, 'move')

describe('when sorting is off', () => {
    it('leaves the tree exactly as it was', async () => {
        await sortedSetting.setValue(false)
        seedBar(b('Charlie'), b('Alpha'), b('Bravo'))
        const moves = spyMoves()

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Charlie', 'Alpha', 'Bravo'])
        expect(moves).not.toHaveBeenCalled()
    })
})

describe('ordering', () => {
    it('sorts ascending with folders first by default', async () => {
        seedBar(b('Charlie'), f('Zulu'), b('Alpha'), f('Mike'), b('Bravo'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Mike', 'Zulu', 'Alpha', 'Bravo', 'Charlie'])
    })

    it('keeps folders first when descending, reversing only the titles', async () => {
        await sortOrderSetting.setValue(SortOrder.Descending)
        seedBar(b('Alpha'), f('Mike'), b('Charlie'), f('Zulu'), b('Bravo'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Zulu', 'Mike', 'Charlie', 'Bravo', 'Alpha'])
    })

    it('interleaves folders and bookmarks when told to sort them together', async () => {
        await sortFoldersSetting.setValue(SortFolders.BookmarksAndFolders)
        seedBar(b('Delta'), f('Charlie'), b('Bravo'), f('Alpha'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    })

    it('ignores case and accents', async () => {
        seedBar(b('bravo'), b('Charlie'), b('Álpha'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Álpha', 'bravo', 'Charlie'])
    })

    it('orders numbers by value rather than character by character', async () => {
        seedBar(b('Item 10'), b('Item 2'), b('Item 1'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Item 1', 'Item 2', 'Item 10'])
    })

    it('sorts an untitled bookmark by its url', async () => {
        seedBar(b('https://m.dev'), { title: '', url: 'https://b.dev' }, b('https://z.dev'))

        await sortIfEnabled()

        expect(fake.shapeOf(CHROME_BAR).map(n => n.title || n.url)).toEqual([
            'https://b.dev',
            'https://m.dev',
            'https://z.dev',
        ])
    })

    it('keeps equal titles in their current order', async () => {
        seedBar({ title: 'Same', url: 'https://2.dev' }, { title: 'Same', url: 'https://1.dev' })
        const moves = spyMoves()

        await sortIfEnabled()

        expect(fake.shapeOf(CHROME_BAR).map(n => n.url)).toEqual(['https://2.dev', 'https://1.dev'])
        expect(moves).not.toHaveBeenCalled()
    })
})

describe('scope', () => {
    it('sorts inside nested folders', async () => {
        seedBar(f('Work', b('Zeta'), f('Deep', b('Yankee'), b('Xray')), b('Echo')))

        await sortIfEnabled()

        const [work] = fake.shapeOf(CHROME_BAR)
        expect(titles(work!.children!)).toEqual(['Deep', 'Echo', 'Zeta'])
        expect(titles(work!.children![0]!.children!)).toEqual(['Xray', 'Yankee'])
    })

    it('sorts both anchors', async () => {
        seedBar(b('Bravo'), b('Alpha'))
        fake.seed(fake.idAt(CHROME_OTHER), [b('Delta'), b('Charlie')])

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Alpha', 'Bravo'])
        expect(titles(fake.shapeOf(CHROME_OTHER))).toEqual(['Charlie', 'Delta'])
    })

    it('leaves root folders that are not synced alone', async () => {
        // Firefox's "Bookmarks Menu" and "Mobile Bookmarks" sit beside the two
        // anchors. Sync doesn't cover them, so neither does the sort.
        fake.seed('0', [f('Bookmarks Menu', b('Bravo'), b('Alpha'))])

        await sortIfEnabled()

        const menu = fake.root.children!.find(n => n.title === 'Bookmarks Menu')!
        expect(menu.children!.map(n => n.title)).toEqual(['Bravo', 'Alpha'])
    })

    it('sorts each run between separators on its own, leaving the separators in place', async () => {
        seedBar(b('Delta'), b('Alpha'), sep(), b('Charlie'), b('Bravo'), sep(), f('Zulu'), b('Echo'), f('Mike'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Alpha', 'Delta', '---', 'Bravo', 'Charlie', '---', 'Mike', 'Zulu', 'Echo'])
    })
})

describe('moves', () => {
    it('makes no moves when the tree is already sorted', async () => {
        seedBar(f('Alpha', b('Bravo'), b('Charlie')), b('Delta'), b('Echo'))
        const moves = spyMoves()

        await sortIfEnabled()

        expect(moves).not.toHaveBeenCalled()
    })

    it('reaches a fully reversed folder in one pass', async () => {
        // The worst case for the front-to-back fill, and the one that would
        // expose an off-by-one in a move towards a higher index.
        seedBar(b('Echo'), b('Delta'), b('Charlie'), b('Bravo'), b('Alpha'))

        await sortIfEnabled()

        expect(barTitles()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    })

    it('is idempotent: a second sort makes no moves', async () => {
        seedBar(b('Charlie'), f('Zulu', b('Yankee'), b('Xray')), b('Alpha'))
        await sortIfEnabled()

        const moves = spyMoves()
        await sortIfEnabled()

        expect(moves).not.toHaveBeenCalled()
    })

    it('records every move before making it, so the onMoved echo is ignored', async () => {
        seedBar(b('Charlie'), b('Bravo'), b('Alpha'))

        const recorded: SelfWrite[] = []
        const unrecorded: string[] = []
        const move = fake.api.move
        vi.spyOn(fake.api, 'move').mockImplementation(async (id, destination) => {
            if (!recorded.some(w => w.event === BookmarkEvent.moved && w.id === id)) unrecorded.push(id)
            return move(id, destination)
        })

        await sortIfEnabled(write => recorded.push(write))

        expect(recorded.length).toBeGreaterThan(0)
        expect(recorded.every(w => w.event === BookmarkEvent.moved)).toBe(true)
        expect(unrecorded).toEqual([])
    })
})

/**
 * In-memory sync target. Reads are conditional on the version, so a test can put
 * `runSync` on its "remote unchanged" path; every write succeeds.
 */
class FakeTarget implements StorageAdapter {
    readonly providerId = 'fake'
    readonly targetId = 'fake:target'
    private writes = 0

    constructor(
        private content: string,
        private version: string,
    ) {}

    read = async (knownVersion: string): Promise<ReadData> =>
        knownVersion === this.version
            ? { changed: false, content: '', blobVersion: this.version }
            : { changed: true, content: this.content, blobVersion: this.version }

    write = async (content: string): Promise<string> => {
        this.content = content
        this.version = `v-written-${++this.writes}`
        return this.version
    }

    registerWatchers = () => undefined
    unregisterWatchers = () => undefined
}

describe('runSync', () => {
    const alpha = b('Alpha') as { title: string; url: string }
    const bravo = b('Bravo') as { title: string; url: string }
    const charlie = b('Charlie') as { title: string; url: string }

    const remote = (...bms: { title: string; url: string }[]) =>
        tree(bar(...bms.map(x => bm(x.title, x.url))), other())

    /** Runs one pass against a target holding `held` at `version`, after the last sync recorded `base` at `'v1'`. */
    const syncAgainst = async (base: BookmarkEntry, held: BookmarkEntry, version: string) => {
        await syncStateTargetSetting.setValue('fake:target')
        await syncBaseBookmarks.setValue(base)
        await syncLastSyncValueSetting.setValue('v1')

        const target = new FakeTarget(JSON.stringify(held), version)
        vi.spyOn(Storage, 'instance').mockResolvedValue({
            getStorageAdapter: () => target,
        } as unknown as Storage)

        await runSync()
    }

    it('sorts when neither side changed', async () => {
        seedBar(charlie, alpha)

        await syncAgainst(remote(alpha, charlie), remote(alpha, charlie), 'v1')

        expect(barTitles()).toEqual(['Alpha', 'Charlie'])
    })

    it('sorts after pushing a local-only change', async () => {
        seedBar(charlie, bravo, alpha)

        await syncAgainst(remote(alpha, charlie), remote(alpha, charlie), 'v1')

        expect(barTitles()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('sorts what a remote-only change created, which lands at the end', async () => {
        seedBar(bravo, charlie)

        await syncAgainst(remote(bravo, charlie), remote(bravo, charlie, alpha), 'v2')

        expect(barTitles()).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('sorts after a merge, without resurrecting what the remote removed', async () => {
        // Local added Charlie; remote removed Bravo and added Alpha.
        seedBar(charlie, bravo)

        await syncAgainst(remote(bravo), remote(alpha), 'v2')

        expect(barTitles()).toEqual(['Alpha', 'Charlie'])
    })

    it('leaves the order alone when sorting is off', async () => {
        await sortedSetting.setValue(false)
        seedBar(charlie, alpha)

        await syncAgainst(remote(alpha, charlie), remote(alpha, charlie), 'v1')

        expect(barTitles()).toEqual(['Charlie', 'Alpha'])
    })
})
