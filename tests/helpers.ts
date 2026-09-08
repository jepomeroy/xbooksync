/** Builders for the tree shapes the diff and apply passes operate on. */

import { flatten } from '@/entrypoints/bookmarks/sync'
import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type BookmarkEntry, type FlatBookmarks } from '@/entrypoints/shared/types'

export const bm = (title: string, url: string): BookmarkEntry => ({ type: BookmarkType.bookmark, title, url })

export const folder = (title: string, ...children: BookmarkEntry[]): BookmarkEntry => ({
    type: BookmarkType.folder,
    title,
    children,
})

export const bar = (...children: BookmarkEntry[]): BookmarkEntry => ({
    type: BookmarkType.bookmarkbar,
    title: Bookmarks.CanonicalRootTitle.bookmarkbar,
    children,
})

export const other = (...children: BookmarkEntry[]): BookmarkEntry => ({
    type: BookmarkType.other,
    title: Bookmarks.CanonicalRootTitle.other,
    children,
})

/** The unnamed container above the two anchors — what `getContent` serializes. */
export const tree = (...anchors: BookmarkEntry[]): BookmarkEntry => ({
    type: BookmarkType.folder,
    children: anchors,
})

/**
 * The key `flatten` hands the nth node whose identity collides with an earlier
 * one — the second twin is `dup(key, 2)`. Spelled out here rather than imported
 * so the tests pin the format instead of restating it.
 */
export const dup = (key: string, ordinal: number): string => `${key}\u0000${ordinal}`

/**
 * Flattens a whole tree the way `Bookmarks.flatten` does — starting at the
 * anchors, since the container above them is not a real bookmark.
 */
export const flatOf = (root: BookmarkEntry): FlatBookmarks => {
    const out: FlatBookmarks = new Map()
    root.children?.forEach(anchor => flatten(anchor, '', out))
    return out
}
