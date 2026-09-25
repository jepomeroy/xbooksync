import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'

export const findDuplicateBookmarks = async (
    bookmarks: Bookmarks<LocalBookmarkEntry>,
): Promise<LocalBookmarkEntry[]> => {
    const titleSet = new Set()
    const urlSet = new Set()
    const duplicateBookmarks: LocalBookmarkEntry[] = []
    const root = bookmarks.getBookmarks()

    if (!root) return []

    const evalDuplicateBookmarks = async (entry: LocalBookmarkEntry): Promise<void> => {
        if (entry.type === BookmarkType.bookmark) {
            const titleMatch = titleSet.has(entry.title)
            const urlMatch = urlSet.has(entry.url)

            if (titleMatch || urlMatch) {
                duplicateBookmarks.push(entry)
            }

            titleSet.add(entry.title)
            urlSet.add(entry.url)
        } else {
            entry.children?.forEach(async child => {
                await evalDuplicateBookmarks(child as LocalBookmarkEntry)
            })
        }
    }

    await evalDuplicateBookmarks(root)

    return duplicateBookmarks
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
