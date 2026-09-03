import {
    BookmarkType,
    type BookmarkEntry,
    type DiffResultType,
    type FlatBookmarks,
    type LocalBookmarkEntry,
} from '@/entrypoints/shared/types'

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

/**
 * Applies a remote-only diff onto the browser's bookmark tree.
 *
 * Only correct when the local diff is empty: base and local are identical then,
 * so a key in `removed`/`changed` is guaranteed to resolve locally and a key in
 * `added` is guaranteed not to. The merge path can't reuse this as-is.
 *
 * Creates run before removals — a folder rename arrives as a remove plus an add
 * of the same content, and creating first keeps that content present throughout.
 */
export const applyRemote = async ({
    diff,
    remoteFlat,
    localFlat,
    baseFlat,
    localRoot,
}: {
    diff: DiffResultType
    remoteFlat: FlatBookmarks
    localFlat: FlatBookmarks<LocalBookmarkEntry>
    baseFlat: FlatBookmarks
    localRoot: LocalBookmarkEntry | null
}): Promise<void> => {
    // Key -> browser node id, for everything that exists locally right now.
    const idFor = new Map<string, string>()
    localFlat.forEach((entry, key) => idFor.set(key, entry.node.id))

    // Anchors never appear in a flat map (see `flatten`), but every top-level
    // create needs one as its parent. `identityKey` keys them by bare type.
    // Annotated: `LocalBookmarkEntry` is an intersection, so `children` widens to
    // `BookmarkEntry[] & LocalBookmarkEntry[]` and `find` would drop the id.
    const roots: LocalBookmarkEntry[] = localRoot?.children ?? []
    for (const anchorType of [BookmarkType.bookmarkbar, BookmarkType.other]) {
        const anchor = roots.find(node => node.type === anchorType)
        if (anchor) idFor.set(anchorType, anchor.id)
    }

    /**
     * Resolves a key to a local node id, creating the node and any missing
     * ancestors on the way. Recursion terminates at an anchor, or at any node
     * that already exists locally.
     */
    const ensure = async (key: string): Promise<string> => {
        const known = idFor.get(key)
        if (known) return known

        const entry = remoteFlat.get(key)
        if (!entry) throw new Error(`[xbooksync] remote key has no node: ${key}`)

        const created = await browser.bookmarks.create({
            parentId: await ensure(entry.parentKey),
            title: entry.node.title,
            url: entry.node.url,
        })

        idFor.set(key, created.id)
        return created.id
    }

    for (const key of diff.added.keys()) {
        await ensure(key)
    }

    for (const [key, { after }] of diff.changed) {
        const id = idFor.get(key)
        if (id) await browser.bookmarks.update(id, { title: after.title, url: after.url })
    }

    /** True when an ancestor is also being removed, so `removeTree` already took this node. */
    const ancestorRemoved = (key: string): boolean => {
        let parentKey = baseFlat.get(key)?.parentKey
        while (parentKey && baseFlat.has(parentKey)) {
            // Terminates at an anchor key, which is never in the map.
            if (diff.removed.has(parentKey)) return true
            parentKey = baseFlat.get(parentKey)?.parentKey
        }
        return false
    }

    for (const [key, node] of diff.removed) {
        const id = idFor.get(key)
        if (!id || ancestorRemoved(key)) continue

        await (node.type === BookmarkType.bookmark ? browser.bookmarks.remove(id) : browser.bookmarks.removeTree(id))
    }
}

export const diffBase = (baseMap: FlatBookmarks, otherMap: FlatBookmarks): DiffResultType => {
    const diffResult = emptyDiffResult()

    otherMap.forEach((entry, key) => {
        const baseEntry = baseMap.get(key)

        if (!baseEntry) {
            diffResult.added.set(key, entry.node)
        } else if (!compareBookmarks(entry.node, baseEntry.node)) {
            diffResult.changed.set(key, { before: baseEntry.node, after: entry.node })
        }
    })

    baseMap.forEach((entry, key) => {
        if (!otherMap.has(key)) {
            diffResult.removed.set(key, entry.node)
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
        out.set(key, { node, parentKey: parentPath })
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
