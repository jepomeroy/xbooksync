/**
 * Bookmark tree access.
 *
 * Reads the browser's bookmark tree via `browser.bookmarks`, serializes it into
 * the `content` string that a {@link StorageAdapter} round-trips, and applies an
 * incoming tree back onto the browser. Sorting (see `sortedSetting` and
 * `sortOrderSetting`) is applied here, on the way out.
 *
 */

import { BookmarkType, getBookmarkType, type BookmarkEntryType, type BrowserRootType } from '../shared/types'

export class BookmarkParser {
    rootBookmark: BookmarkEntryType
    rootTypes: BrowserRootType[]

    constructor(rawBookmarks: Browser.bookmarks.BookmarkTreeNode[]) {
        // Get the valid bookmarks for this browser
        this.rootTypes = this.getBrowserRoots()
        // Convert the browser bookmarks to extension types
        this.rootBookmark = this.parseBookmarks(rawBookmarks)
    }

    private getBrowserRoots(): BrowserRootType[] {
        if (import.meta.env.BROWSER === 'chrome') {
            return [
                {
                    title: 'Bookmarks bar',
                    id: 0,
                },

                {
                    title: 'Other bookmarks',
                    id: 1,
                },
            ]
        } else if (import.meta.env.BROWSER === 'firefox') {
            return [
                {
                    title: 'Bookmarks Toolbar',
                    id: 0,
                },

                {
                    title: 'Other Bookmarks',
                    id: 1,
                },
            ]
        } else {
            return []
        }
    }

    private parseBookmarks(rawBookmarks: Browser.bookmarks.BookmarkTreeNode[]): BookmarkEntryType {
        const rootBookmark: BookmarkEntryType = {
            type: BookmarkType.root,
            children: [],
        }

        const matchingChildren: Browser.bookmarks.BookmarkTreeNode[] = []
        const validBookmarkCollectionTitles = new Set(this.rootTypes.map(root => root.title))

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

        if (rootBookmark.children) {
            rootBookmark.children.forEach((child: BookmarkEntryType) => this.setMappingId(child))
        }

        return rootBookmark
    }

    private parseNodes(nodes: Browser.bookmarks.BookmarkTreeNode[]): BookmarkEntryType[] {
        const children: BookmarkEntryType[] = []

        for (const node of nodes) {
            const child: BookmarkEntryType = {
                id: node.id,
                index: node.index,
                parentId: node.parentId,
                title: node.title,
                url: node.url,
                type: getBookmarkType(node.url),
            }

            if (node.children) {
                child.children = this.parseNodes(node.children)
            }

            children.push(child)
        }

        return children
    }

    private setMappingId(bookmark: BookmarkEntryType) {
        this.getBrowserRoots().forEach((root: BrowserRootType) => {
            if (root.title === bookmark.title) {
                bookmark.mappingId = root.id

                return
            }
        })
    }
}

export class Bookmarks {
    parser: BookmarkParser

    constructor(parser: BookmarkParser) {
        this.parser = parser
    }

    private parseBookmarks(browserBookmarks: Browser.bookmarks.BookmarkTreeNode[]): BookmarkType[] {
        const bookmarks: BookmarkType[] = []
        browserBookmarks.forEach(b => {
            console.log(b)
        })

        return bookmarks
    }
}
