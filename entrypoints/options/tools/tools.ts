import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'

export const findDuplicateBookmarks = async (
    bookmarks: Bookmarks<LocalBookmarkEntry>,
): Promise<LocalBookmarkEntry[][]> => {
    const groupedMap = new Map<string, LocalBookmarkEntry[]>()
    const root = bookmarks.getBookmarks()

    if (!root) return [[]]

    const evalDuplicateBookmarks = async (entry: LocalBookmarkEntry): Promise<void> => {
        if (entry.type === BookmarkType.bookmark) {
            const key = entry.url ?? 'blank'

            if (groupedMap.has(key)) {
                groupedMap.get(key)?.push(entry)
            } else {
                groupedMap.set(key, [entry])
            }
        } else {
            entry.children?.forEach(async child => {
                await evalDuplicateBookmarks(child as LocalBookmarkEntry)
            })
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

export const findEmptyFolders = async (bookmarks: Bookmarks<LocalBookmarkEntry>): Promise<LocalBookmarkEntry[]> => {
    const root = bookmarks.getBookmarks()

    if (!root) return []

    const evalEmptyFolder = async (entry: LocalBookmarkEntry): Promise<LocalBookmarkEntry[]> => {
        const emptyBookMarks: LocalBookmarkEntry[] = []

        if (entry.type === BookmarkType.folder && entry.children?.length === 0) {
            emptyBookMarks.push(entry)
        } else {
            entry.children?.forEach(async child => {
                const empty = await evalEmptyFolder(child as LocalBookmarkEntry)
                emptyBookMarks.push(...empty)
            })
        }

        return emptyBookMarks
    }

    return await evalEmptyFolder(root)
}
