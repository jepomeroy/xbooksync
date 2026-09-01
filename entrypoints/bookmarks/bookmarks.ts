/**
 * Bookmark tree access.
 *
 * Reads the browser's bookmark tree via `browser.bookmarks`, serializes it into
 * the `content` string that a {@link StorageAdapter} round-trips, and applies an
 * incoming tree back onto the browser. Sorting (see `sortedSetting` and
 * `sortOrderSetting`) is applied here, on the way out.
 *
 */

import { BookmarkType, type BookmarkEntryType, type BrowserRootType } from '../shared/types'

export class Bookmarks {
    private rootBookmark: BookmarkEntryType | null
    private rootTypes: BrowserRootType | null

    constructor() {
        this.rootBookmark = null
        // Get the valid bookmarks for this browser
        this.rootTypes = Bookmarks.getBrowserRoots()
    }

    /** Parses a raw browser bookmark tree into the internal representation. */
    public fromBrowswer(rawBookmarks: Browser.bookmarks.BookmarkTreeNode[]) {
        // Convert the browser bookmarks to extension types
        this.rootBookmark = this.parseBookmarks(rawBookmarks)
    }

    /** Sets the internal representation directly from already-parsed bookmark data (e.g. read from storage). */
    public fromXbsBookmarks(bookmarks: BookmarkEntryType) {
        this.rootBookmark = bookmarks
    }

    /** Returns the current bookmark tree, or null if nothing has been loaded yet. */
    public getBookmarks(): BookmarkEntryType | null {
        return this.rootBookmark
    }

    /** Serializes the current bookmark tree to the JSON string a {@link StorageAdapter} round-trips. */
    public getContent(): string {
        return JSON.stringify(this.rootBookmark ? this.rootBookmark : {})
    }

    /** Returns the current browser's top-level bookmark folder titles, or null if the browser is unrecognized. */
    static getBrowserRoots(): BrowserRootType | null {
        if (import.meta.env.BROWSER === 'chrome') {
            return {
                bookmarkTitle: 'Bookmarks bar',
                otherTitle: 'Other bookmarks',
            }
        } else if (import.meta.env.BROWSER === 'firefox') {
            return {
                bookmarkTitle: 'Bookmarks Toolbar',
                otherTitle: 'Other Bookmarks',
            }
        } else {
            return null
        }
    }

    /** Locates the browser's top-level bookmark folders within the raw tree and converts their contents. */
    private parseBookmarks(rawBookmarks: Browser.bookmarks.BookmarkTreeNode[]): BookmarkEntryType {
        const rootBookmark: BookmarkEntryType = {
            type: BookmarkType.root,
            children: [],
        }

        const matchingChildren: Browser.bookmarks.BookmarkTreeNode[] = []
        const validBookmarkCollectionTitles = new Set(
            this.rootTypes ? [this.rootTypes.bookmarkTitle, this.rootTypes.otherTitle] : [],
        )

        const locateRootNodes = (nodes: Browser.bookmarks.BookmarkTreeNode[]) => {
            for (const node of nodes) {
                if (node.title && validBookmarkCollectionTitles.has(node.title)) {
                    matchingChildren.push(node)
                } else {
                    if (node.children) {
                        locateRootNodes(node.children)
                    }
                }
            }
        }

        locateRootNodes(rawBookmarks)

        rootBookmark.children = this.parseNodes(matchingChildren)

        return rootBookmark
    }

    /** Recursively converts raw bookmark tree nodes into {@link BookmarkEntryType} entries. */
    private parseNodes(nodes: Browser.bookmarks.BookmarkTreeNode[]): BookmarkEntryType[] {
        const children: BookmarkEntryType[] = []

        for (const node of nodes) {
            const child: BookmarkEntryType = {
                title: node.title,
                url: node.url,
                type: this.getBookmarkType(node.title, node.url),
            }

            if (node.children) {
                child.children = this.parseNodes(node.children)
            }

            children.push(child)
        }

        return children
    }

    /** Classifies a node as a bookmark, plain folder, or one of the special root folders. */
    private getBookmarkType = (title: string, url: string | undefined): BookmarkType => {
        if (url == undefined) {
            if (this.rootTypes && title === this.rootTypes.bookmarkTitle) {
                return BookmarkType.bookmarkbar
            }
            if (this.rootTypes && title === this.rootTypes.otherTitle) {
                return BookmarkType.other
            }
            return BookmarkType.folder
        }

        return BookmarkType.bookmark
    }
}
