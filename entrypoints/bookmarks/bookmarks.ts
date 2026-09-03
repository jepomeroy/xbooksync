/**
 * Bookmark tree access.
 *
 * Reads the browser's bookmark tree via `browser.bookmarks`, serializes it into
 * the `content` string that a {@link StorageAdapter} round-trips, and applies an
 * incoming tree back onto the browser. Sorting (see `sortedSetting` and
 * `sortOrderSetting`) is applied here, on the way out.
 *
 */

import { BookmarkType, type BookmarkEntry, type FlatBookmarks, type LocalBookmarkEntry } from '../shared/types'
import { flatten } from './diff'

export class Bookmarks<T extends BookmarkEntry = BookmarkEntry> {
    private rootBookmark: T | null

    constructor() {
        this.rootBookmark = null
    }

    /** a per-browser table plus a classifier, used only at the top level */
    static RootFolderTitles: Record<string, { bookmarkbar: string; other: string }> = {
        chrome: { bookmarkbar: 'Bookmarks bar', other: 'Other bookmarks' },
        firefox: { bookmarkbar: 'Bookmarks Toolbar', other: 'Other Bookmarks' },
    }

    /** What every browser's remote file agrees to call these two, regardless of who synced first. */
    static CanonicalRootTitle = { bookmarkbar: 'Bookmarks Bar', other: 'Other Bookmarks' } as const

    /** flatten bookmarks to a map for diff */
    public flatten(): FlatBookmarks<T> {
        const flat: FlatBookmarks<T> = new Map()

        // Only do bookmark bar and other, root is not a real bookmark
        this.rootBookmark?.children?.map(b => {
            flatten(b, '', flat)
        })

        return flat
    }

    /** Parses a raw browser bookmark tree into the internal representation. */
    public fromBrowswer(this: Bookmarks<LocalBookmarkEntry>, rawBookmarks: Browser.bookmarks.BookmarkTreeNode) {
        // Convert the browser bookmarks to extension types
        this.rootBookmark = this.parseBookmarks(rawBookmarks)
    }

    /** Sets the internal representation directly from already-parsed bookmark data (e.g. read from storage). */
    public fromXbsBookmarks(this: Bookmarks<BookmarkEntry>, bookmarks: BookmarkEntry) {
        this.rootBookmark = bookmarks
    }

    /** Returns the current bookmark tree, or null if nothing has been loaded yet. */
    public getBookmarks(): T | null {
        return this.rootBookmark
    }

    /** Serializes the current bookmark tree to the JSON string a {@link StorageAdapter} round-trips. */
    public getContent(): string {
        const strip = (b: BookmarkEntry): BookmarkEntry => {
            return {
                type: b.type,
                title:
                    b.type === BookmarkType.bookmarkbar
                        ? Bookmarks.CanonicalRootTitle.bookmarkbar
                        : b.type === BookmarkType.other
                          ? Bookmarks.CanonicalRootTitle.other
                          : b.title,
                url: b.url,
                children: b.children?.map(strip),
            }
        }

        return JSON.stringify(this.rootBookmark ? strip(this.rootBookmark) : {})
    }

    /** Locates the browser's top-level bookmark folders within the raw tree and converts their contents. */
    private parseBookmarks(rawBookmarks: Browser.bookmarks.BookmarkTreeNode): LocalBookmarkEntry {
        const children: LocalBookmarkEntry[] = []

        for (const node of rawBookmarks.children ?? []) {
            const rootKind = this.classifyRoot(node.title)
            if (!rootKind) continue

            children.push({
                id: node.id,
                index: node.index,
                parentId: node.parentId,
                title: node.title,
                type: rootKind,
                children: (node.children ?? []).map(child => this.parseNode(child)),
            })
        }

        return { id: rawBookmarks.id, type: BookmarkType.folder, children }
    }

    /** Recursively converts raw bookmark tree nodes into {@link LocalBookmarkEntry} entries. */
    private parseNode(node: Browser.bookmarks.BookmarkTreeNode): LocalBookmarkEntry {
        return {
            id: node.id,
            index: node.index,
            parentId: node.parentId,
            title: node.title,
            url: node.url,
            type: this.getBookmarkType(node.title, node.url),
            children: (node.children ?? []).map(child => this.parseNode(child)),
        }
    }
    private classifyRoot(title: string): BookmarkType.bookmarkbar | BookmarkType.other | undefined {
        const titles = Bookmarks.RootFolderTitles[import.meta.env.BROWSER]
        if (title === titles?.bookmarkbar) return BookmarkType.bookmarkbar
        if (title === titles?.other) return BookmarkType.other
        return undefined
    }

    /** Classifies a node as a bookmark, plain folder, or one of the special root folders. */
    private getBookmarkType = (title: string, url: string | undefined): BookmarkType => {
        if (url == undefined) {
            return BookmarkType.folder
        }

        return BookmarkType.bookmark
    }
}
