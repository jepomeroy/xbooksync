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
 * Groups folders that share a full path, i.e. same-titled folders under the
 * same parent path.
 *
 * Only an exact string match counts, so `TypeScript` and `typescript`
 * aren't duplicates. Untitled folders are skipped.
 *
 * @param bookmarks - Tree already loaded with `fromBrowser`.
 * @param buildPath - Resolves a folder id to its full path, used as the group key.
 * @returns One array per path with two or more folders, in tree order, or `[]`
 * if no tree is loaded.
 */
export const findDuplicateFolders = async (
    bookmarks: Bookmarks<LocalBookmarkEntry>,
    buildPath: (id: string) => string,
): Promise<LocalBookmarkEntry[][]> => {
    const groupedMap = new Map<string, LocalBookmarkEntry[]>()
    const root = bookmarks.getBookmarks()

    if (!root) return []

    const evalDuplicateBookmarks = async (entry: LocalBookmarkEntry): Promise<void> => {
        if (entry.type === BookmarkType.folder && entry.title) {
            const key = buildPath(entry.id)

            if (groupedMap.has(key)) {
                groupedMap.get(key)?.push(entry)
            } else {
                groupedMap.set(key, [entry])
            }
        }

        for (const child of entry.children ?? []) {
            await evalDuplicateBookmarks(child as LocalBookmarkEntry)
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
 * Merges duplicate folders into one: moves the contents of every `sourceIds`
 * folder into `targetId`, removes the sources, then cleans up the target with
 * {@link collapseFolder} so no duplicate bookmarks, duplicate folders or empty
 * folders are left behind.
 *
 * Works on the browser's live tree, not a loaded snapshot.
 *
 * @param targetId - Folder the others are merged into.
 * @param sourceIds - Folders emptied into the target and removed.
 */
export const mergeDuplicateFolders = async (targetId: string, sourceIds: string[]): Promise<void> => {
    for (const sourceId of sourceIds) {
        for (const child of await browser.bookmarks.getChildren(sourceId)) {
            await browser.bookmarks.move(child.id, { parentId: targetId })
        }

        await browser.bookmarks.remove(sourceId)
    }

    await collapseFolder(targetId)
}

/**
 * Removes duplicates inside a folder, recursively.
 *
 * Within each folder: a bookmark whose URL already appears earlier in that
 * folder is removed; a subfolder whose title matches an earlier subfolder has
 * its contents moved into that one and is removed. Each remaining subfolder
 * is then collapsed the same way, and removed if it ends up empty.
 *
 * Bookmarks are compared per folder, so the same URL in two different
 * subfolders is kept. Firefox separators are left in place.
 *
 * @param folderId - Folder to clean up. It is never removed itself.
 */
const collapseFolder = async (folderId: string): Promise<void> => {
    const seenUrls = new Set<string>()
    const foldersByTitle = new Map<string, string>()

    for (const child of await browser.bookmarks.getChildren(folderId)) {
        // Firefox separators have no url either, so they'd pass for untitled folders. Leave them be.
        if ((child as { type?: string }).type === 'separator') continue

        if (child.url != undefined) {
            if (seenUrls.has(child.url)) {
                await browser.bookmarks.remove(child.id)
            } else {
                seenUrls.add(child.url)
            }
            continue
        }

        const existingId = foldersByTitle.get(child.title)

        if (existingId) {
            for (const grandchild of await browser.bookmarks.getChildren(child.id)) {
                await browser.bookmarks.move(grandchild.id, { parentId: existingId })
            }
            await browser.bookmarks.remove(child.id)
        } else {
            foldersByTitle.set(child.title, child.id)
        }
    }

    // Recurse after the whole level is merged, so each subfolder holds everything it will get.
    for (const subfolderId of foldersByTitle.values()) {
        await collapseFolder(subfolderId)

        if ((await browser.bookmarks.getChildren(subfolderId)).length === 0) {
            await browser.bookmarks.remove(subfolderId)
        }
    }
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
