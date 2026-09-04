/**
 * The pure half of `sync.ts`: `flatten`, `diffBase`, `hasModifications`.
 *
 * No browser, no network. These pin the identity scheme, which is what decides
 * whether an edit reads as a modification or as a delete-plus-create.
 */

import { describe, expect, it } from 'vitest'
import { BookmarkType } from '@/entrypoints/shared/types'
import { diffBase, flatten, hasModifications } from '@/entrypoints/bookmarks/sync'
import { bar, bm, flatOf, folder, other, tree } from './helpers'

describe('flatten', () => {
    it('omits the anchor folders themselves', () => {
        const flat = flatOf(tree(bar(bm('Docs', 'https://a.dev')), other()))

        expect([...flat.keys()]).toEqual(['bookmarks bar/https://a.dev'])
    })

    it('keys a nested node by its path and records its parent', () => {
        const flat = flatOf(tree(bar(folder('Work', bm('Docs', 'https://a.dev')))))

        expect(flat.get('bookmarks bar/Work')?.parentKey).toBe('bookmarks bar')
        expect(flat.get('bookmarks bar/Work/https://a.dev')?.parentKey).toBe('bookmarks bar/Work')
    })

    it('keeps the two anchors in separate namespaces', () => {
        const flat = flatOf(tree(bar(bm('Docs', 'https://a.dev')), other(bm('Docs', 'https://a.dev'))))

        expect([...flat.keys()]).toEqual(['bookmarks bar/https://a.dev', 'other bookmarks/https://a.dev'])
    })

    it('collapses two bookmarks sharing a url in one folder', () => {
        // Documents a real limitation: the second wins, and the first becomes
        // invisible to both the diff and the apply pass. See the leak this
        // causes in apply-remote.test.ts.
        const flat = flatOf(tree(bar(bm('First', 'https://a.dev'), bm('Second', 'https://a.dev'))))

        expect(flat.size).toBe(1)
        expect(flat.get('bookmarks bar/https://a.dev')?.node.title).toBe('Second')
    })

    it('starts a nested walk from an anchor with an empty parent key', () => {
        const flat = flatten(bar(bm('Docs', 'https://a.dev')))

        expect(flat.get('bookmarks bar/https://a.dev')?.parentKey).toBe('bookmarks bar')
    })
})

describe('diffBase', () => {
    it('reports nothing for an unchanged tree', () => {
        const snapshot = tree(bar(folder('Work', bm('Docs', 'https://a.dev'))), other())

        expect(hasModifications(diffBase(flatOf(snapshot), flatOf(snapshot)))).toBe(false)
    })

    it('treats a retitled bookmark at the same url as changed', () => {
        const diff = diffBase(
            flatOf(tree(bar(bm('Docs', 'https://a.dev')))),
            flatOf(tree(bar(bm('Documentation', 'https://a.dev')))),
        )

        expect(diff.added.size).toBe(0)
        expect(diff.removed.size).toBe(0)
        expect(diff.changed.get('bookmarks bar/https://a.dev')?.before.title).toBe('Docs')
        expect(diff.changed.get('bookmarks bar/https://a.dev')?.after.title).toBe('Documentation')
    })

    it('treats an edited url as a remove plus an add, not a change', () => {
        // The url is part of the key, so there is no key under which the old and
        // new node meet. `compareBookmarks` never gets to compare urls at all.
        const diff = diffBase(
            flatOf(tree(bar(bm('Docs', 'https://a.dev')))),
            flatOf(tree(bar(bm('Docs', 'https://b.dev')))),
        )

        expect(diff.changed.size).toBe(0)
        expect([...diff.added.keys()]).toEqual(['bookmarks bar/https://b.dev'])
        expect([...diff.removed.keys()]).toEqual(['bookmarks bar/https://a.dev'])
    })

    it('treats a bookmark moved between folders as a remove plus an add', () => {
        const before = flatOf(tree(bar(folder('Work', bm('Docs', 'https://a.dev')), folder('Home'))))
        const after = flatOf(tree(bar(folder('Work'), folder('Home', bm('Docs', 'https://a.dev')))))
        const diff = diffBase(before, after)

        expect([...diff.added.keys()]).toEqual(['bookmarks bar/Home/https://a.dev'])
        expect([...diff.removed.keys()]).toEqual(['bookmarks bar/Work/https://a.dev'])
    })

    it('reports a renamed folder and every descendant as removed and re-added', () => {
        const before = flatOf(tree(bar(folder('Work', bm('Docs', 'https://a.dev')))))
        const after = flatOf(tree(bar(folder('Job', bm('Docs', 'https://a.dev')))))
        const diff = diffBase(before, after)

        expect([...diff.added.keys()]).toEqual(['bookmarks bar/Job', 'bookmarks bar/Job/https://a.dev'])
        expect([...diff.removed.keys()]).toEqual(['bookmarks bar/Work', 'bookmarks bar/Work/https://a.dev'])
        expect(diff.changed.size).toBe(0)
    })

    it('ignores anchor titles that differ by browser', () => {
        // The whole point of keying anchors by type: Chrome writes "Bookmarks
        // bar" and Firefox "Bookmarks Toolbar", and neither is a real edit.
        const chrome = tree({ type: BookmarkType.bookmarkbar, title: 'Bookmarks bar', children: [] })
        const firefox = tree({ type: BookmarkType.bookmarkbar, title: 'Bookmarks Toolbar', children: [] })

        expect(hasModifications(diffBase(flatOf(chrome), flatOf(firefox)))).toBe(false)
    })

    it('reports a node that only the base holds as removed', () => {
        const diff = diffBase(flatOf(tree(bar(bm('Docs', 'https://a.dev')))), flatOf(tree(bar())))

        expect([...diff.removed.keys()]).toEqual(['bookmarks bar/https://a.dev'])
    })

    it('reports a type change at one key as changed', () => {
        // A folder and a bookmark can only collide when a folder is titled like
        // a url, but `compareBookmarks` short-circuits on type either way.
        const before = flatOf(tree(bar(folder('https://a.dev'))))
        const after = flatOf(tree(bar(bm('https://a.dev', 'https://a.dev'))))

        expect(diffBase(before, after).changed.size).toBe(1)
    })

    it('lists parents before their children, so an apply pass can create in order', () => {
        const diff = diffBase(
            flatOf(tree(bar())),
            flatOf(tree(bar(folder('Work', folder('Deep', bm('Docs', 'https://a.dev')))))),
        )

        expect([...diff.added.keys()]).toEqual([
            'bookmarks bar/Work',
            'bookmarks bar/Work/Deep',
            'bookmarks bar/Work/Deep/https://a.dev',
        ])
    })
})

describe('hasModifications', () => {
    it('is false only when all three sets are empty', () => {
        const empty = flatOf(tree(bar()))

        expect(hasModifications(diffBase(empty, empty))).toBe(false)
        expect(hasModifications(diffBase(empty, flatOf(tree(bar(bm('Docs', 'https://a.dev'))))))).toBe(true)
    })
})
