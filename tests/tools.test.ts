/**
 * The Tools tab scanners (`findDuplicateBookmarks`, `findDuplicateFolders`,
 * `findEmptyFolders`) and the folder merge, `mergeDuplicateFolders`.
 *
 * The scanners read a tree already loaded with `fromBrowser`, so these seed the
 * fake browser and load it the same way the Tools page does. The merge works
 * on the live tree, so its tests assert on the fake's resulting shape.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'
import {
    findDuplicateBookmarks,
    findDuplicateFolders,
    findEmptyFolders,
    mergeDuplicateFolders,
} from '@/entrypoints/options/tools/tools'
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

describe('findDuplicateFolders', () => {
    /** Scans the way the Tools page does, keyed on each folder's full path. */
    const scan = async (): Promise<LocalBookmarkEntry[][]> => {
        const local = await readLocal()
        return findDuplicateFolders(local, id => local.buildPath(id))
    }

    it('returns nothing when no tree is loaded', async () => {
        const local = new Bookmarks<LocalBookmarkEntry>()
        expect(await findDuplicateFolders(local, id => id)).toEqual([])
    })

    it('groups same-titled folders under the same parent', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [] },
            { title: 'Docs', children: [] },
            { title: 'Dev', children: [] },
        ])

        const groups = await scan()

        expect(groups.map(group => group.map(entry => entry.title))).toEqual([['Dev', 'Dev']])
    })

    it('ignores same-titled folders under different parents', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Dev', children: [] }])
        fake.seed(fake.idAt(CHROME_OTHER), [{ title: 'Dev', children: [] }])

        expect(await scan()).toEqual([])
    })

    it('treats titles differing only by case as distinct', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [] },
            { title: 'dev', children: [] },
        ])

        expect(await scan()).toEqual([])
    })

    it('reports nested duplicates as their own group', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'Tools', children: [] }] },
            { title: 'Dev', children: [{ title: 'Tools', children: [] }] },
        ])

        const groups = await scan()

        expect(groups.map(group => group.length)).toEqual([2, 2])
        expect(groups[1]?.map(entry => entry.title)).toEqual(['Tools', 'Tools'])
    })
})

describe('mergeDuplicateFolders', () => {
    /** Ids of the bar's top-level folders titled `title`, in tree order. */
    const folderIds = async (title: string): Promise<string[]> =>
        (await browser.bookmarks.getChildren(fake.idAt(CHROME_BAR)))
            .filter(child => child.title === title && child.url === undefined)
            .map(child => child.id)

    /** Merges every top-level `title` folder in the bar into the first one. */
    const merge = async (title = 'Dev') => {
        const [target, ...sources] = await folderIds(title)
        await mergeDuplicateFolders(target!, sources)
    }

    it('moves the contents of each duplicate into the target and removes the duplicates', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'A', url: 'https://a.dev' }] },
            { title: 'Docs', url: 'https://docs.dev' },
            { title: 'Dev', children: [{ title: 'B', url: 'https://b.dev' }] },
            { title: 'Dev', children: [{ title: 'C', url: 'https://c.dev' }] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    { title: 'A', url: 'https://a.dev' },
                    { title: 'B', url: 'https://b.dev' },
                    { title: 'C', url: 'https://c.dev' },
                ],
            },
            { title: 'Docs', url: 'https://docs.dev' },
        ])
    })

    it('drops a bookmark whose url the target already has', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'A', url: 'https://a.dev' }] },
            {
                title: 'Dev',
                children: [
                    { title: 'A again', url: 'https://a.dev' },
                    { title: 'B', url: 'https://b.dev' },
                ],
            },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    { title: 'A', url: 'https://a.dev' },
                    { title: 'B', url: 'https://b.dev' },
                ],
            },
        ])
    })

    it('merges same-titled subfolders at every depth', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'Tools', children: [{ title: 'X', url: 'https://x.dev' }] }] },
            {
                title: 'Dev',
                children: [
                    {
                        title: 'Tools',
                        children: [
                            { title: 'X again', url: 'https://x.dev' },
                            { title: 'Deep', children: [{ title: 'Y', url: 'https://y.dev' }] },
                        ],
                    },
                ],
            },
            {
                title: 'Dev',
                children: [{ title: 'Tools', children: [{ title: 'Deep', children: [{ title: 'Z', url: 'https://z.dev' }] }] }],
            },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    {
                        title: 'Tools',
                        children: [
                            { title: 'X', url: 'https://x.dev' },
                            {
                                title: 'Deep',
                                children: [
                                    { title: 'Y', url: 'https://y.dev' },
                                    { title: 'Z', url: 'https://z.dev' },
                                ],
                            },
                        ],
                    },
                ],
            },
        ])
    })

    it('cleans up duplicates the target already held', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            {
                title: 'Dev',
                children: [
                    { title: 'A', url: 'https://a.dev' },
                    { title: 'A again', url: 'https://a.dev' },
                    { title: 'Tools', children: [{ title: 'X', url: 'https://x.dev' }] },
                    { title: 'Tools', children: [{ title: 'Y', url: 'https://y.dev' }] },
                ],
            },
            { title: 'Dev', children: [] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    { title: 'A', url: 'https://a.dev' },
                    {
                        title: 'Tools',
                        children: [
                            { title: 'X', url: 'https://x.dev' },
                            { title: 'Y', url: 'https://y.dev' },
                        ],
                    },
                ],
            },
        ])
    })

    it('removes subfolders left empty, including chains of empty folders', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'A', url: 'https://a.dev' }, { title: 'Old', children: [] }] },
            { title: 'Dev', children: [{ title: 'Outer', children: [{ title: 'Inner', children: [] }] }] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'Dev', children: [{ title: 'A', url: 'https://a.dev' }] }])
    })

    it('keeps the same url in different subfolders', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: 'A', url: 'https://a.dev' }] },
            { title: 'Dev', children: [{ title: 'Tools', children: [{ title: 'A', url: 'https://a.dev' }] }] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    { title: 'A', url: 'https://a.dev' },
                    { title: 'Tools', children: [{ title: 'A', url: 'https://a.dev' }] },
                ],
            },
        ])
    })

    it('keeps the target itself even when the merge leaves it empty', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [] },
            { title: 'Dev', children: [{ title: 'Old', children: [] }] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([{ title: 'Dev', children: [] }])
    })

    it('leaves Firefox separators in place', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Dev', children: [{ title: '', type: 'separator' }, { title: 'A', url: 'https://a.dev' }] },
            { title: 'Dev', children: [{ title: '', type: 'separator' }, { title: 'B', url: 'https://b.dev' }] },
        ])

        await merge()

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            {
                title: 'Dev',
                children: [
                    { title: '', type: 'separator' },
                    { title: 'A', url: 'https://a.dev' },
                    { title: '', type: 'separator' },
                    { title: 'B', url: 'https://b.dev' },
                ],
            },
        ])
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
