/**
 * Tree comparison and reconciliation.
 *
 * Bookmark node ids are per-profile, so comparing two browsers' trees means
 * discarding ids and keying on identity instead: `flatten` turns a tree into a
 * key-addressed map, `diffBase` compares one such map against the base snapshot
 * from the last sync, and `applyRemote` writes a diff back through
 * `browser.bookmarks`. The sync loop that drives all three lives in
 * `entrypoints/background.ts`.
 */

import {
    BookmarkType,
    type BookmarkEntry,
    type DiffResultType,
    type FlatBookmarks,
    type LocalBookmarkEntry,
} from '@/entrypoints/shared/types'

/**
 * Stable identity for a node, independent of the browser node id.
 *
 * Ids are per-profile, so two browsers holding the same bookmark agree on
 * nothing but where it sits and what it points at. Keying on that instead lets
 * the same tree read from two machines line up.
 *
 * The key is what a node *is*, so editing the identifying field (a bookmark's
 * url, a folder's title) re-keys the node and reads as a remove plus an add
 * rather than a change. Moving a node re-keys it for the same reason.
 *
 * @param node - Node to key.
 * @param parentPath - Key of the containing folder, or `''` at the tree root.
 * @returns The key, unique within a tree.
 */
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

/**
 * Whether two nodes that share an identity key are equal.
 *
 * Compares only the node's own fields; children are compared separately, as
 * their own entries in the flat map.
 *
 * @param left - One node.
 * @param right - The node found under the same key in the other tree.
 * @returns True when nothing user-visible differs.
 */
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
 * Applies a base-to-remote diff onto the browser's bookmark tree.
 *
 * Fully correct only when the local diff is empty: base and local are identical
 * then, so a key in `removed`/`changed` is guaranteed to resolve locally and a
 * key in `added` is guaranteed not to. The merge path in `background.ts` calls
 * this too, where those guarantees don't hold — a key already created locally
 * is skipped as a no-op, but a remote removal of something edited locally still
 * wins, and neither side is told a conflict occurred.
 *
 * Creates run before removals — a folder rename arrives as a remove plus an add
 * of the same content, and creating first keeps that content present throughout.
 *
 * @param diff - Base-to-remote diff, from {@link diffBase}.
 * @param remoteFlat - Flattened remote tree; supplies the nodes named in `diff.added`.
 * @param localFlat - Flattened local tree; supplies the browser node ids to act on.
 * @param baseFlat - Flattened base tree, used to walk parent links when deciding
 * whether a removal was already covered by an ancestor's.
 * @param localRoot - Local tree root, the only place the anchor folders' node ids
 * can be read from since {@link flatten} omits them.
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
     *
     * @param key - Identity key to resolve, which must be present in `remoteFlat`
     * unless it already resolves through `idFor`.
     * @returns The browser node id, freshly created or already known.
     * @throws If `key` is neither known locally nor present in `remoteFlat`,
     * which would mean the diff and the tree it came from disagree.
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

    /**
     * True when an ancestor is also being removed, so `removeTree` already took
     * this node.
     *
     * @param key - Identity key of the node being considered for removal.
     */
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

/**
 * Diffs a tree against the base snapshot from the last successful sync.
 *
 * Run once per side — base vs. local and base vs. remote — which is what makes
 * the three-way merge in `background.ts` possible: two empty diffs mean nothing
 * to do, one non-empty diff means that side wins outright, and two mean a merge.
 *
 * @param baseMap - Flattened base snapshot, the common ancestor.
 * @param otherMap - Flattened tree being compared against it.
 * @returns What `otherMap` added, changed, and removed relative to `baseMap`.
 */
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

/**
 * Walks a tree depth-first into a key-addressed map, so two trees can be
 * compared by lookup rather than by traversal.
 *
 * @param node - Subtree root to walk. Callers start at an anchor, not the tree
 * root, since the root is synthetic and has no key of its own.
 * @param parentPath - Key of `node`'s parent; `''` at the top of a walk.
 * @param out - Map to accumulate into. Pass an existing map to merge several
 * subtrees into one result, which is how the two anchors end up in one map.
 * @returns `out`, for convenience when starting a fresh walk.
 */
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

/**
 * Whether a diff carries anything to apply.
 *
 * @param drt - Diff to test.
 * @returns True if any of the three maps is non-empty.
 */
export const hasModifications = (drt: DiffResultType): boolean => {
    return drt.added.size > 0 || drt.changed.size > 0 || drt.removed.size > 0
}

/** A diff with all three maps empty, for the "nothing to compare" paths. */
export const emptyDiffResult = (): DiffResultType => {
    return { added: new Map(), removed: new Map(), changed: new Map() }
}

/**
 * Plain-object view of a diff for logging — `Map` contents don't survive
 * `JSON.stringify`.
 *
 * @param diff - Diff to render.
 */
export const diffSummary = (diff: DiffResultType) => ({
    added: Object.fromEntries(diff.added),
    removed: Object.fromEntries(diff.removed),
    changed: Object.fromEntries(diff.changed),
})
