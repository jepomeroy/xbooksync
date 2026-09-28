import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'

/**
 * Groups bookmarks that share a URL.
 *
 * Only an exact string match counts, so `https://a.com` and `https://a.com/`
 * aren't duplicates. Bookmarks with no URL are grouped under `'blank'`.
 *
 * @param bookmarks - Tree already loaded with `fromBrowser`.
 * @returns One array per URL with two or more bookmarks, in tree order, or `[]`
 * if no tree is loaded.
 */
export const findDuplicateBookmarks = async (
    bookmarks: Bookmarks<LocalBookmarkEntry>,
): Promise<LocalBookmarkEntry[][]> => {
    const groupedMap = new Map<string, LocalBookmarkEntry[]>()
    const root = bookmarks.getBookmarks()

    if (!root) return []

    const evalDuplicateBookmarks = async (entry: LocalBookmarkEntry): Promise<void> => {
        if (entry.type === BookmarkType.bookmark) {
            const key = entry.url ?? 'blank'

            if (groupedMap.has(key)) {
                groupedMap.get(key)?.push(entry)
            } else {
                groupedMap.set(key, [entry])
            }
        } else {
            for (const child of entry.children ?? []) {
                await evalDuplicateBookmarks(child as LocalBookmarkEntry)
            }
        }
    }

    await evalDuplicateBookmarks(root)

    const duplicateMap = []

    for (const entries of groupedMap.values()) {
        if (entries.length >= 2) {
            duplicateMap.push(entries)
        }
    }

    return duplicateMap
}

/**
 * Finds folders with no children.
 *
 * A folder holding only empty folders isn't reported itself; only its empty
 * children are. So deleting results can leave new empty folders for the next run.
 *
 * @param bookmarks - Tree already loaded with `fromBrowser`.
 * @returns The empty folders, or `[]` if no tree is loaded.
 */
export const findEmptyFolders = async (bookmarks: Bookmarks<LocalBookmarkEntry>): Promise<LocalBookmarkEntry[]> => {
    const root = bookmarks.getBookmarks()

    if (!root) return []

    const evalEmptyFolder = async (entry: LocalBookmarkEntry): Promise<LocalBookmarkEntry[]> => {
        const emptyBookMarks: LocalBookmarkEntry[] = []

        if (entry.type === BookmarkType.folder && entry.children?.length === 0) {
            emptyBookMarks.push(entry)
        } else {
            for (const child of entry.children ?? []) {
                const empty = await evalEmptyFolder(child as LocalBookmarkEntry)
                emptyBookMarks.push(...empty)
            }
        }

        return emptyBookMarks
    }

    return await evalEmptyFolder(root)
}
