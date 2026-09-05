/**
 * `applyRemote` against an in-memory bookmarks tree.
 *
 * This is the only code that mutates the user's real bookmarks, so the
 * assertions are on the resulting tree rather than on the calls made to get
 * there.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { applyRemote, diffBase } from '@/entrypoints/bookmarks/sync'
import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import type { BookmarkEntry, LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FakeBookmarks, installFakeBookmarks, type SeedNode } from './fake-bookmarks'
import { bar, bm, flatOf, folder, other, tree } from './helpers'

const CHROME_BAR = 'Bookmarks bar'

let fake: FakeBookmarks

beforeEach(() => {
    fake = installFakeBookmarks()
})

/** Reads the browser tree back through the same path the sync loop uses. */
const readLocal = async (): Promise<Bookmarks<LocalBookmarkEntry>> => {
    const local = new Bookmarks<LocalBookmarkEntry>()
    const [root] = await browser.bookmarks.getTree()
    local.fromBrowser(root as unknown as Browser.bookmarks.BookmarkTreeNode)
    return local
}

/**
 * Runs the remote-only path: the browser holds `local`, the target holds
 * `remote`, and the base is whatever both agreed on last.
 */
const applyOnto = async (remote: BookmarkEntry, base: BookmarkEntry) => {
    const local = await readLocal()
    const baseFlat = flatOf(base)
    const remoteFlat = flatOf(remote)

    await applyRemote({
        diff: diffBase(baseFlat, remoteFlat),
        remoteFlat,
        localFlat: local.flatten(),
        baseFlat,
        localRoot: local.getBookmarks(),
    })
}

/** Arranges the browser side and returns the equivalent tree for use as a base. */
const seedLocal = (nodes: SeedNode[]): void => fake.seed(fake.idAt(CHROME_BAR), nodes)

describe('additions', () => {
    it('creates a bookmark the target has and the browser does not', async () => {
        const base = tree(bar())
        await applyOnto(tree(bar(bm('Docs', 'https://a.dev'))), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'Docs', url: 'https://a.dev' }])
    })

    it('creates missing ancestors before the node that needs them', async () => {
        await applyOnto(tree(bar(folder('Work', folder('Deep', bm('Docs', 'https://a.dev'))))), tree(bar()))

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Work',
                children: [{ title: 'Deep', children: [{ title: 'Docs', url: 'https://a.dev' }] }],
            },
        ])
    })

    it('creates into the other anchor, not just the toolbar', async () => {
        await applyOnto(tree(bar(), other(bm('Docs', 'https://a.dev'))), tree(bar(), other()))

        expect(fake.shapeOf('Other bookmarks')).toEqual([{ title: 'Docs', url: 'https://a.dev' }])
        expect(fake.shapeOf(CHROME_BAR)).toEqual([])
    })

    it('leaves a node the browser already has alone', async () => {
        seedLocal([{ title: 'Docs', url: 'https://a.dev' }])
        const existingId = fake.idAt(CHROME_BAR, 'Docs')

        await applyOnto(
            tree(bar(bm('Docs', 'https://a.dev'), bm('Blog', 'https://b.dev'))),
            tree(bar(bm('Docs', 'https://a.dev'))),
        )

        expect(fake.idAt(CHROME_BAR, 'Docs')).toBe(existingId)
        expect(fake.shapeOf(CHROME_BAR)).toHaveLength(2)
    })
})

describe('changes', () => {
    it('retitles in place, preserving the node id', async () => {
        seedLocal([{ title: 'Docs', url: 'https://a.dev' }])
        const id = fake.idAt(CHROME_BAR, 'Docs')
        const base = tree(bar(bm('Docs', 'https://a.dev')))

        await applyOnto(tree(bar(bm('Documentation', 'https://a.dev'))), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'Documentation', url: 'https://a.dev' }])
        expect(fake.idAt(CHROME_BAR, 'Documentation')).toBe(id)
    })
})

describe('removals', () => {
    it('removes a bookmark the target dropped', async () => {
        seedLocal([
            { title: 'Docs', url: 'https://a.dev' },
            { title: 'Blog', url: 'https://b.dev' },
        ])
        const base = tree(bar(bm('Docs', 'https://a.dev'), bm('Blog', 'https://b.dev')))

        await applyOnto(tree(bar(bm('Docs', 'https://a.dev'))), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'Docs', url: 'https://a.dev' }])
    })

    it('removes a populated folder as a tree rather than a bare node', async () => {
        // `remove` on a non-empty folder throws in both browsers; the type
        // switch in applyRemote is what avoids it.
        seedLocal([{ title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] }])
        const base = tree(bar(folder('Work', bm('Docs', 'https://a.dev'))))

        await applyOnto(tree(bar()), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([])
    })

    it('skips descendants of a folder it already removed', async () => {
        // Without `ancestorRemoved` the nested keys would resolve to ids that
        // removeTree has already deleted, and the fake would throw.
        seedLocal([
            {
                title: 'Work',
                children: [{ title: 'Deep', children: [{ title: 'Docs', url: 'https://a.dev' }] }],
            },
        ])
        const base = tree(bar(folder('Work', folder('Deep', bm('Docs', 'https://a.dev')))))

        await expect(applyOnto(tree(bar()), base)).resolves.toBeUndefined()
        expect(fake.shapeOf(CHROME_BAR)).toEqual([])
    })

    it('leaves a duplicate url behind when its twin is removed', async () => {
        // The flat map holds one entry per key, so only one of the two ids is
        // ever known. Documents the leak that flatten's collision creates.
        seedLocal([
            { title: 'First', url: 'https://a.dev' },
            { title: 'Second', url: 'https://a.dev' },
        ])
        const base = tree(bar(bm('Second', 'https://a.dev')))

        await applyOnto(tree(bar()), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'First', url: 'https://a.dev' }])
    })
})

describe('folder rename', () => {
    it('preserves contents by creating before removing', async () => {
        seedLocal([{ title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] }])
        const base = tree(bar(folder('Work', bm('Docs', 'https://a.dev'))))

        await applyOnto(tree(bar(folder('Job', bm('Docs', 'https://a.dev')))), base)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            { title: 'Job', children: [{ title: 'Docs', url: 'https://a.dev' }] },
        ])
    })

    it('does not preserve node identity across the rename', async () => {
        // A rename is a remove plus an add, so the bookmark is recreated and its
        // browser-side metadata — date added, favicon association — is lost.
        seedLocal([{ title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] }])
        const before = fake.idAt(CHROME_BAR, 'Work', 'Docs')
        const base = tree(bar(folder('Work', bm('Docs', 'https://a.dev'))))

        await applyOnto(tree(bar(folder('Job', bm('Docs', 'https://a.dev')))), base)

        expect(fake.idAt(CHROME_BAR, 'Job', 'Docs')).not.toBe(before)
    })
})

describe('preconditions', () => {
    it('fails loudly when the local tree has no anchors to create into', async () => {
        // What a non-English browser produces: `classifyRoot` matches nothing,
        // so `parseBookmarks` yields no anchors and `ensure` cannot resolve a
        // parent for a top-level create.
        installFakeBookmarks('Lesezeichenleiste', 'Weitere Lesezeichen')

        await expect(applyOnto(tree(bar(bm('Docs', 'https://a.dev'))), tree(bar()))).rejects.toThrow(
            /remote key has no node/,
        )
    })
})
