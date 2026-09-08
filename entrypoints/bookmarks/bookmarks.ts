/**
 * Bookmark tree representation.
 *
 * Holds one tree — read from `browser.bookmarks`, or parsed back out of a sync
 * target — and converts between that and the `content` string a
 * {@link StorageAdapter} round-trips. Writing a tree *back* onto the browser is
 * `applyRemote` in `sync.ts`, not here.
 *
 * TODO: sorting (`sortedSetting` / `sortOrderSetting`) belongs on the way out of
 * `getContent`, but isn't implemented yet — the two settings are stored and
 * surfaced in the options page and otherwise unused.
 */

import {
    BookmarkType,
    type BookmarkEntry,
    type FlatBookmarks,
    type LocalBookmarkEntry,
} from '@/entrypoints/shared/types'
import { flatten } from './sync'

/**
 * One bookmark tree, in whichever representation its source provides.
 *
 * @typeParam T - Node type held. `LocalBookmarkEntry` when the tree came from
 * the browser and still carries node ids; plain `BookmarkEntry` when it came
 * from a sync target, where ids are meaningless.
 */
export class Bookmarks<T extends BookmarkEntry = BookmarkEntry> {
    private rootBookmark: T | null

    constructor() {
        this.rootBookmark = null
    }

    /**
     * What each browser names its two top-level folders, keyed by
     * `import.meta.env.BROWSER`.
     *
     * The names differ per browser and are the only thing identifying these
     * folders in the raw tree, so recognizing them is a table lookup rather than
     * anything structural — see {@link classifyRoot}.
     */
    static RootFolderTitles: Record<string, { bookmarkbar: string; other: string }> = {
        chrome: { bookmarkbar: 'Bookmarks bar', other: 'Other bookmarks' },
        firefox: { bookmarkbar: 'Bookmarks Toolbar', other: 'Other Bookmarks' },
    }

    /**
     * What every browser's remote file agrees to call these two, regardless of
     * who synced first.
     *
     * {@link getContent} substitutes these on the way out, so a tree written by
     * Chrome and read by Firefox doesn't look like a pair of renamed folders.
     */
    static CanonicalRootTitle = { bookmarkbar: 'Bookmarks Bar', other: 'Other Bookmarks' } as const

    /**
     * Flattens the tree into the key-addressed map the diff works against.
     *
     * @returns A map covering both anchor folders' contents. Empty if no tree
     * has been loaded.
     */
    public flatten(): FlatBookmarks<T> {
        const flat: FlatBookmarks<T> = new Map()

        // Walk from each anchor rather than the root: the root is a synthetic
        // container with no key of its own.
        this.rootBookmark?.children?.map(b => {
            flatten(b, '', flat)
        })

        return flat
    }

    /**
     * Parses a raw browser bookmark tree into the internal representation,
     * replacing anything already held.
     *
     * The `this` annotation restricts this to a `Bookmarks<LocalBookmarkEntry>`:
     * a browser tree always carries node ids, and the narrower element type is
     * what lets callers read `.id` off the result without a cast.
     *
     * @param rawBookmarks - Root node from `browser.bookmarks.getTree()`.
     */
    public fromBrowser(this: Bookmarks<LocalBookmarkEntry>, rawBookmarks: Browser.bookmarks.BookmarkTreeNode) {
        // Convert the browser bookmarks to extension types
        this.rootBookmark = this.parseBookmarks(rawBookmarks)
    }

    /**
     * Adopts an already-parsed tree — one read back from a sync target, or the
     * stored base snapshot — replacing anything already held.
     *
     * Taken as-is with no validation, so the caller owns the risk of a
     * malformed payload.
     *
     * @param bookmarks - Root of the parsed tree.
     */
    public fromXbsBookmarks(this: Bookmarks<BookmarkEntry>, bookmarks: BookmarkEntry) {
        this.rootBookmark = bookmarks
    }

    /**
     * The current bookmark tree.
     *
     * Returns the live reference, not a copy — mutating it mutates this instance.
     *
     * @returns The tree root, or null if nothing has been loaded yet.
     */
    public getBookmarks(): T | null {
        return this.rootBookmark
    }

    /**
     * Serializes the current bookmark tree to the JSON string a
     * {@link StorageAdapter} round-trips.
     *
     * Strips everything profile-local — node ids, indexes, parent links — and
     * substitutes {@link CanonicalRootTitle} for the two anchors, so the same
     * tree serializes identically from any browser.
     *
     * @returns The JSON payload, or `'{}'` if no tree has been loaded.
     */
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

    /**
     * Locates the browser's top-level bookmark folders within the raw tree and
     * converts their contents.
     *
     * Anything under the root that isn't one of the two recognized anchors is
     * dropped — Firefox's mobile and tags folders, for instance — so only the
     * two folders both browsers have are ever synced.
     *
     * @param rawBookmarks - Raw tree root, whose own title is meaningless.
     * @returns A synthetic root folder holding one entry per recognized anchor.
     */
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

    /**
     * Recursively converts raw bookmark tree nodes into {@link LocalBookmarkEntry}
     * entries.
     *
     * @param node - Node to convert, along with everything beneath it.
     */
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

    /**
     * Identifies which of the two anchor folders a top-level node is, by title.
     *
     * Only meaningful directly under the tree root — a nested folder that
     * happens to be called "Bookmarks bar" would match too.
     *
     * @param title - The node's title, as the browser reports it.
     * @returns The anchor's type, or undefined for anything not recognized —
     * including every node when `import.meta.env.BROWSER` isn't a key of
     * {@link RootFolderTitles}, which drops the whole tree.
     */
    private classifyRoot(title: string): BookmarkType.bookmarkbar | BookmarkType.other | undefined {
        const titles = Bookmarks.RootFolderTitles[import.meta.env.BROWSER]
        if (title === titles?.bookmarkbar) return BookmarkType.bookmarkbar
        if (title === titles?.other) return BookmarkType.other
        return undefined
    }

    /**
     * Classifies a non-root node as a bookmark or a plain folder.
     *
     * Never returns an anchor type — the two root folders are classified by
     * {@link classifyRoot} before this is reached.
     *
     * @param title - Unused. Kept because separators and other title-only node
     * kinds would have to be told apart here.
     * @param url - The node's url; its absence is what marks a folder.
     */
    private getBookmarkType = (title: string, url: string | undefined): BookmarkType => {
        if (url == undefined) {
            return BookmarkType.folder
        }

        return BookmarkType.bookmark
    }
}
