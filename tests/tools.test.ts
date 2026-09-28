/**
 * The Tools tab scanners: `findDuplicateBookmarks` and `findEmptyFolders`.
 *
 * Both read a tree already loaded with `fromBrowser`, so these seed the fake
 * browser and load it the same way the Tools page does.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { findDuplicateBookmarks, findEmptyFolders } from '@/entrypoints/options/tools/tools'
import { FakeBookmarks, installFakeBookmarks } from './fake-bookmarks'

const CHROME_BAR = 'Bookmarks bar'
const CHROME_OTHER = 'Other bookmarks'

let fake: FakeBookmarks

beforeEach(() => {
    fake = installFakeBookmarks()
})

const readLocal = async (): Promise<Bookmarks<LocalBookmarkEntry>> => {
    const local = new Bookmarks<LocalBookmarkEntry>()
    const [root] = await browser.bookmarks.getTree()
    local.fromBrowser(root as unknown as Browser.bookmarks.BookmarkTreeNode)
    return local
}

const ids = (entries: LocalBookmarkEntry[]): string[] => entries.map(entry => entry.id)

describe('findDuplicateBookmarks', () => {
    it('returns nothing when no tree is loaded', async () => {
        expect(await findDuplicateBookmarks(new Bookmarks<LocalBookmarkEntry>())).toEqual([])
    })

    it('returns nothing when every url is unique', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'A', url: 'https://a.dev' },
            { title: 'B', url: 'https://b.dev' },
        ])

        expect(await findDuplicateBookmarks(await readLocal())).toEqual([])
    })

    it('groups bookmarks sharing a url in the same folder', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'First', url: 'https://a.dev' },
            { title: 'Second', url: 'https://a.dev' },
        ])

        const groups = await findDuplicateBookmarks(await readLocal())

        expect(groups.map(ids)).toEqual([[fake.idAt(CHROME_BAR, 'First'), fake.idAt(CHROME_BAR, 'Second')]])
    })

    it('groups across folders and across both anchors, in tree order', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Top', url: 'https://a.dev' },
            { title: 'Work', children: [{ title: 'Nested', url: 'https://a.dev' }] },
        ])
        fake.seed(fake.idAt(CHROME_OTHER), [{ title: 'Other', url: 'https://a.dev' }])

        const groups = await findDuplicateBookmarks(await readLocal())

        expect(groups.map(ids)).toEqual([
            [fake.idAt(CHROME_BAR, 'Top'), fake.idAt(CHROME_BAR, 'Work', 'Nested'), fake.idAt(CHROME_OTHER, 'Other')],
        ])
    })

    it('reports each duplicated url as its own group', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'A1', url: 'https://a.dev' },
            { title: 'B1', url: 'https://b.dev' },
            { title: 'A2', url: 'https://a.dev' },
            { title: 'B2', url: 'https://b.dev' },
            { title: 'C', url: 'https://c.dev' },
        ])

        const groups = await findDuplicateBookmarks(await readLocal())

        expect(groups.map(group => group.map(entry => entry.title))).toEqual([
            ['A1', 'A2'],
            ['B1', 'B2'],
        ])
    })

    it('treats urls differing only by a trailing slash as distinct', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'A', url: 'https://a.dev' },
            { title: 'B', url: 'https://a.dev/' },
        ])

        expect(await findDuplicateBookmarks(await readLocal())).toEqual([])
    })

    it('ignores folders that share a title', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Work', children: [] },
            { title: 'Work', children: [] },
        ])

        expect(await findDuplicateBookmarks(await readLocal())).toEqual([])
    })

    it('groups bookmarks with no url under one key', async () => {
        // The browser never produces this (no url means folder), but a parsed
        // tree typed as a bookmark without a url shouldn't crash the scan.
        const local = new Bookmarks<LocalBookmarkEntry>()
        const blank = (id: string): LocalBookmarkEntry => ({ id, type: BookmarkType.bookmark, title: id })
        Object.assign(local, {
            rootBookmark: { id: '0', type: BookmarkType.folder, children: [blank('x'), blank('y')] },
        })

        const groups = await findDuplicateBookmarks(local)

        expect(groups.map(ids)).toEqual([['x', 'y']])
    })
})

describe('findEmptyFolders', () => {
    it('returns nothing when no tree is loaded', async () => {
        expect(await findEmptyFolders(new Bookmarks<LocalBookmarkEntry>())).toEqual([])
    })

    it('never reports the anchor folders, even when empty', async () => {
        expect(await findEmptyFolders(await readLocal())).toEqual([])
    })

    it('finds empty folders at any depth, in tree order', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Empty', children: [] },
            { title: 'Work', children: [{ title: 'Deep', children: [] }, { title: 'Docs', url: 'https://a.dev' }] },
        ])
        fake.seed(fake.idAt(CHROME_OTHER), [{ title: 'Later', children: [] }])

        const empty = await findEmptyFolders(await readLocal())

        expect(ids(empty)).toEqual([
            fake.idAt(CHROME_BAR, 'Empty'),
            fake.idAt(CHROME_BAR, 'Work', 'Deep'),
            fake.idAt(CHROME_OTHER, 'Later'),
        ])
    })

    it('ignores folders that hold a bookmark', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] }])

        expect(await findEmptyFolders(await readLocal())).toEqual([])
    })

    it('reports only the innermost folder of an empty chain', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Outer', children: [{ title: 'Inner', children: [] }] }])

        const empty = await findEmptyFolders(await readLocal())

        expect(ids(empty)).toEqual([fake.idAt(CHROME_BAR, 'Outer', 'Inner')])
    })
})
