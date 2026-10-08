/**
 * Re-orders the browser's bookmarks in place, according to the sort settings.
 *
 * Runs at the end of a sync pass, after `applyRemote`, so it only touches what
 * survived the merge. Order is not part of the diff (keys are path + url/title),
 * so moving nodes here never reads as a change on the next pass.
 */

import {
    BookmarkEvent,
    SortFolders,
    SortOrder,
    type LocalBookmarkEntry,
    type SelfWrite,
} from '@/entrypoints/shared/types'
import { sortedSetting, sortFoldersSetting, sortOrderSetting } from '@/entrypoints/shared/localsettings'
import { Bookmarks } from './bookmarks'

type Node = Browser.bookmarks.BookmarkTreeNode
type Compare = (a: Node, b: Node) => number

// Firefox only, and missing from the shared `BookmarkTreeNode` type, hence the cast.
const isSeparator = (node: Node): boolean => (node as { type?: string }).type === 'separator'
const isFolder = (node: Node): boolean => node.url === undefined && !isSeparator(node)

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/**
 * Builds the comparator from the settings.
 *
 * Folders-first applies in both directions — descending reverses the titles,
 * not the folder/bookmark grouping. Untitled nodes sort by url.
 */
const makeCompare = (order: SortOrder, folders: SortFolders): Compare => {
    const dir = order === SortOrder.Descending ? -1 : 1

    return (a, b) => {
        if (folders === SortFolders.FoldersFirst && isFolder(a) !== isFolder(b)) {
            return isFolder(a) ? -1 : 1
        }
        return dir * collator.compare(a.title || a.url || '', b.title || b.url || '')
    }
}

/**
 * The order a folder's children should end up in.
 *
 * Separators stay where they are and each run between them is sorted on its
 * own, so a user's sections survive. `Array.prototype.sort` is stable, so
 * equal titles keep their current relative order and don't churn every pass.
 */
const targetOrder = (children: Node[], compare: Compare): Node[] => {
    const result: Node[] = []
    let run: Node[] = []

    for (const child of children) {
        if (isSeparator(child)) {
            result.push(...run.sort(compare), child)
            run = []
        } else {
            run.push(child)
        }
    }
    result.push(...run.sort(compare))

    return result
}

/**
 * Sorts one folder's children, then recurses into its subfolders.
 *
 * Fills positions front to back, so every move is to a *lower* index than the
 * node currently has. That sidesteps Chrome's off-by-one when moving a node to
 * a higher index within the same parent, and means an already-sorted folder
 * costs no moves and fires no events.
 */
const sortFolder = async (folder: Node, compare: Compare, onSelfWrite?: (write: SelfWrite) => void) => {
    const children = folder.children ?? []
    const target = targetOrder(children, compare)
    const current = children.map(c => c.id)

    for (const [i, { id }] of target.entries()) {
        const from = current.indexOf(id)
        if (from === i) continue

        onSelfWrite?.({ event: BookmarkEvent.moved, id })
        await browser.bookmarks.move(id, { parentId: folder.id, index: i })

        current.splice(from, 1)
        current.splice(i, 0, id)
    }

    for (const child of children) {
        if (isFolder(child)) await sortFolder(child, compare, onSelfWrite)
    }
}

/**
 * Sorts the two synced anchor folders, if sorting is enabled.
 *
 * Anything else under the root — Firefox's menu and mobile folders — is left
 * alone, matching what sync itself covers. The anchors themselves can't be
 * moved; only their contents are sorted.
 *
 * @param onSelfWrite - Records each move before it's made, so the `onMoved`
 * echo doesn't trigger another pass.
 */
export const sortIfEnabled = async (onSelfWrite?: (write: SelfWrite) => void): Promise<void> => {
    if (!(await sortedSetting.getValue())) return

    const compare = makeCompare(await sortOrderSetting.getValue(), await sortFoldersSetting.getValue())

    const [root] = await browser.bookmarks.getTree()
    if (!root) return

    // Reuse the anchor detection rather than duplicating classifyRoot.
    const local = new Bookmarks<LocalBookmarkEntry>()
    local.fromBrowser(root)
    // Annotated: `LocalBookmarkEntry` is an intersection, so `children` widens to
    // `BookmarkEntry[]` and drops the id (same as in `applyRemote`).
    const anchors: LocalBookmarkEntry[] = local.getBookmarks()?.children ?? []
    const anchorIds = new Set(anchors.map(a => a.id))

    for (const node of root.children ?? []) {
        if (anchorIds.has(node.id)) await sortFolder(node, compare, onSelfWrite)
    }
}
