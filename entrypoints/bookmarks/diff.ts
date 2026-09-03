import { BookmarkType, type BookmarkEntry, type DiffResultType, type FlatBookmarks } from '@/entrypoints/shared/types'

const identityKey = (node: BookmarkEntry, parentPath: string): string => {
    switch (node.type) {
        case BookmarkType.bookmarkbar:
        case BookmarkType.other:
            return node.type // one of each per tree, title-independent
        case BookmarkType.bookmark:
            return `${parentPath}/${node.url}`
        case BookmarkType.folder:
        default:
            return `${parentPath}/${node.title}`
    }
}

const compareBookmarks = (left: BookmarkEntry, right: BookmarkEntry): boolean => {
    if (left.type !== right.type) return false
    switch (left.type) {
        case BookmarkType.bookmark:
            return left.title === right.title && left.url === right.url
        case BookmarkType.folder:
            return left.title === right.title
        case BookmarkType.bookmarkbar:
        case BookmarkType.other:
            return true // same anchor either way; title differing by browser isn't a real change
        default:
            return false
    }
}

export const diffBase = (baseMap: FlatBookmarks, otherMap: FlatBookmarks): DiffResultType => {
    const diffResult = emptyDiffResult()

    otherMap.forEach((entry, key) => {
        const baseEntry = baseMap.get(key)

        if (!baseEntry) {
            diffResult.added.set(key, entry)
        } else if (!compareBookmarks(entry, baseEntry)) {
            diffResult.changed.set(key, { before: baseEntry, after: entry })
        }
    })

    baseMap.forEach((entry, key) => {
        if (!otherMap.has(key)) {
            diffResult.removed.set(key, entry)
        }
    })

    return diffResult
}

export const flatten = <T extends BookmarkEntry>(
    node: T,
    parentPath = '',
    out: FlatBookmarks<T> = new Map(),
): FlatBookmarks<T> => {
    const key = identityKey(node, parentPath)

    // The two anchor folders always exist in every tree — they're never
    // themselves added/removed/changed, only their contents are.
    const isAnchor = node.type === BookmarkType.bookmarkbar || node.type === BookmarkType.other
    if (!isAnchor) {
        out.set(key, node)
    }

    const childPath = node.type === BookmarkType.bookmark ? parentPath : key
    for (const child of node.children ?? []) {
        flatten(child, childPath, out)
    }

    return out
}

export const hasModifications = (drt: DiffResultType): boolean => {
    return drt.added.size > 0 || drt.changed.size > 0 || drt.removed.size > 0
}

export const emptyDiffResult = (): DiffResultType => {
    return { added: new Map(), removed: new Map(), changed: new Map() }
}

/** Plain-object view of a diff for logging — `Map` contents don't survive `JSON.stringify`. */
export const diffSummary = (diff: DiffResultType) => ({
    added: Object.fromEntries(diff.added),
    removed: Object.fromEntries(diff.removed),
    changed: Object.fromEntries(diff.changed),
})
