/**
 * `Bookmarks` parsing and serialization.
 *
 * `getContent` is the contract with the remote file: whatever it emits is what
 * another browser will parse, so the canonicalization is what lets Chrome and
 * Firefox share one file.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FakeBookmarks, installFakeBookmarks } from './fake-bookmarks'

const CHROME_BAR = 'Bookmarks bar'

let fake: FakeBookmarks

// `RootFolderTitles` is a mutable static, and one test below repoints it to
// stand in for a Firefox build. Snapshot it so that stays local to the test.
const rootTitles = { ...Bookmarks.RootFolderTitles }

beforeEach(() => {
    fake = installFakeBookmarks()
})

afterEach(() => {
    Bookmarks.RootFolderTitles = { ...rootTitles }
})

const readLocal = async (): Promise<Bookmarks<LocalBookmarkEntry>> => {
    const local = new Bookmarks<LocalBookmarkEntry>()
    const [root] = await browser.bookmarks.getTree()
    local.fromBrowswer(root as unknown as Browser.bookmarks.BookmarkTreeNode)
    return local
}

describe('fromBrowswer', () => {
    it('keeps only the two known root folders', async () => {
        fake.seed('0', [{ title: 'Mobile bookmarks', children: [{ title: 'Docs', url: 'https://a.dev' }] }])

        const root = (await readLocal()).getBookmarks()

        expect(root?.children?.map(child => child.type)).toEqual([BookmarkType.bookmarkbar, BookmarkType.other])
    })

    it('classifies a node with no url as a folder', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] }])

        const work = (await readLocal()).getBookmarks()?.children?.[0]?.children?.[0]

        expect(work?.type).toBe(BookmarkType.folder)
        expect(work?.children?.[0]?.type).toBe(BookmarkType.bookmark)
    })

    it('yields no anchors when the browser titles them in another language', async () => {
        // The failure mode behind the empty-tree write: `RootFolderTitles` is
        // hardcoded English, so a localized profile parses to nothing.
        installFakeBookmarks('Lesezeichenleiste', 'Weitere Lesezeichen')

        expect((await readLocal()).flatten().size).toBe(0)
    })
})

describe('getContent', () => {
    it('rewrites both anchor titles to the canonical form', async () => {
        const content = JSON.parse((await readLocal()).getContent())

        expect(content.children.map((child: { title: string }) => child.title)).toEqual([
            Bookmarks.CanonicalRootTitle.bookmarkbar,
            Bookmarks.CanonicalRootTitle.other,
        ])
    })

    it('drops the browser-side ids and indexes', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Docs', url: 'https://a.dev' }])

        const content = (await readLocal()).getContent()

        expect(content).not.toMatch(/"id"|"index"|"parentId"/)
    })

    it('emits an empty object when nothing has been loaded', () => {
        expect(new Bookmarks().getContent()).toBe('{}')
    })

    it('produces the same bytes from either browser naming', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Docs', url: 'https://a.dev' }])
        const fromChrome = (await readLocal()).getContent()

        // Firefox's titles, reached by pointing the lookup at them — the same
        // effect a `BROWSER=firefox` build has on `classifyRoot`.
        Bookmarks.RootFolderTitles.chrome = { bookmarkbar: 'Bookmarks Toolbar', other: 'Other Bookmarks' }
        const firefox = installFakeBookmarks('Bookmarks Toolbar', 'Other Bookmarks')
        firefox.seed(firefox.idAt('Bookmarks Toolbar'), [{ title: 'Docs', url: 'https://a.dev' }])
        const fromFirefox = (await readLocal()).getContent()

        expect(fromFirefox).toBe(fromChrome)
    })
})

describe('round trip', () => {
    it('flattens identically before and after a serialization pass', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [
            { title: 'Work', children: [{ title: 'Docs', url: 'https://a.dev' }] },
            { title: 'Blog', url: 'https://b.dev' },
        ])
        const local = await readLocal()

        const reparsed = new Bookmarks()
        reparsed.fromXbsBookmarks(JSON.parse(local.getContent()))

        expect([...reparsed.flatten().keys()]).toEqual([...local.flatten().keys()])
    })

    it('survives an empty remote payload without throwing', () => {
        // What `checkRemote` hands it when the target has no file yet.
        const remote = new Bookmarks()
        remote.fromXbsBookmarks(JSON.parse('{}'))

        expect(remote.flatten().size).toBe(0)
    })
})
