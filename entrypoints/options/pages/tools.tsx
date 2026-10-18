import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import Toggle from '@/entrypoints/shared/components/toggle'
import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { findDuplicateBookmarks, findDuplicateFolders, findEmptyFolders, mergeDuplicateFolders } from '../tools/tools'
import Empty from '../components/empty'
import Duplicates from '../components/duplicate'
import Merge from '../components/merge'

/**
 * Tools tab: toggles for which cleanup scans to run, a Run button, and a result
 * card for each scan that found something.
 *
 * Results are a snapshot from the last run. Deleting from a card removes the
 * item from the browser and from the card, but edits made elsewhere don't
 * show up until the next run.
 */
export default function Tools() {
    // Held in state so the tree loaded by runTools survives the re-render its results trigger.
    const [local] = useState(() => new Bookmarks<LocalBookmarkEntry>())
    const [emptyEnabled, setEmptyEnabled] = useState(false)
    const [duplicateEnabled, setDuplicateEnabled] = useState(true)
    const [mergeFolders, setMergeFolders] = useState(false)
    const [hasRun, setHasRun] = useState(false)

    // tool results state
    const [emptyFolders, setEmptyFolders] = useState<LocalBookmarkEntry[]>([])
    const [duplicateBookmarks, setDuplicateBookmarks] = useState<LocalBookmarkEntry[][]>([])
    const [duplicateFolders, setDuplicateFolder] = useState<LocalBookmarkEntry[][]>([])

    const handleEmptyChange = (state: boolean) => {
        setHasRun(false)
        setEmptyEnabled(state)
    }

    const handleDupChange = (state: boolean) => {
        setHasRun(false)
        setDuplicateEnabled(state)
    }

    const handleMergeFolders = (state: boolean) => {
        setHasRun(false)
        setMergeFolders(state)
    }

    const buildPath = (id: string): string => local.buildPath(id)

    const runTools = async () => {
        if (emptyEnabled || duplicateEnabled || mergeFolders) {
            // Reload from the browser's current bookmark tree so each run sees fresh data.
            const [root] = await browser.bookmarks.getTree()
            if (root) {
                local.fromBrowser(root)
            }

            setHasRun(true)
        }

        if (emptyEnabled) {
            const empty = await findEmptyFolders(local)
            setEmptyFolders(empty)
        }

        if (duplicateEnabled) {
            const dups = await findDuplicateBookmarks(local)
            setDuplicateBookmarks(dups)
        }

        if (mergeFolders) {
            const merge = await findDuplicateFolders(local, buildPath)
            setDuplicateFolder(merge)
        }
    }

    const deleteDuplicates = async (setIndex: number, id: string) => {
        await browser.bookmarks.remove(id)

        const remaining = duplicateBookmarks.map((bookmarks, index) => {
            if (index !== setIndex) return bookmarks
            return bookmarks.filter(bookmark => bookmark.id !== id)
        })

        // A set down to one bookmark is no longer a duplicate, so drop it.
        setDuplicateBookmarks(remaining.filter(bookmarks => bookmarks.length > 1))
    }

    const deleteFolder = async (id: string) => {
        await browser.bookmarks.removeTree(id)

        const remainingFolders = emptyFolders.filter(folder => folder.id !== id)
        setEmptyFolders(remainingFolders)
    }

    /**
     * Collapses one set of duplicate folders into `id`, then rescans for
     * duplicate folders.
     *
     * Rescans instead of filtering the old results because merging can remove
     * folders listed in other sets (nested duplicates).
     *
     * @param id - Folder the others are merged into.
     * @param merge - Folders merged into `id` and removed.
     */
    const mergeAllFolders = async (id: string, merge: string[]) => {
        await mergeDuplicateFolders(id, merge)

        const [root] = await browser.bookmarks.getTree()
        if (root) {
            local.fromBrowser(root)
        }

        setDuplicateFolder(await findDuplicateFolders(local, buildPath))
    }

    const getDuplicateBookmarks = () => {
        if (duplicateEnabled) {
            return (
                <Duplicates bookmarkSets={duplicateBookmarks} buildPath={buildPath} deleteBookmark={deleteDuplicates} />
            )
        }
    }

    const getEmptyFolders = () => {
        if (emptyEnabled) {
            return <Empty folders={emptyFolders} buildPath={buildPath} deleteFolder={deleteFolder} />
        }
    }

    const getMergeFolders = () => {
        if (mergeFolders) {
            return <Merge folders={duplicateFolders} buildPath={buildPath} mergeFolders={mergeAllFolders} />
        }
    }

    return (
        <>
            <div className='card'>
                <h3>Search For</h3>
                <div className='setting-group'>
                    <Toggle label='Empty Folders' checked={emptyEnabled} onToggle={handleEmptyChange} />
                </div>
                <div className='setting-group'>
                    <Toggle label='Duplicate Bookmarks' checked={duplicateEnabled} onToggle={handleDupChange} />
                </div>

                <div className='setting-group'>
                    <Toggle label='Merge Duplicate Folders' checked={mergeFolders} onToggle={handleMergeFolders} />
                </div>

                <button onClick={runTools}>Run</button>
            </div>
            {hasRun && getEmptyFolders()}
            {hasRun && getDuplicateBookmarks()}
            {hasRun && getMergeFolders()}
        </>
    )
}
