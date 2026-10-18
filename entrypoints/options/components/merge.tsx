import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FaFolder, FaCodeMerge } from 'react-icons/fa6'

export type MergeProps = {
    /** Sets of folders sharing a full path, each with two or more folders. */
    folders: LocalBookmarkEntry[][]
    /** Resolves a folder id to its full path, since titles alone can collide. */
    buildPath: (id: string) => string
    /** Merges the `merge` folders into `id` and removes them from the browser. */
    mergeFolders: (id: string, merge: string[]) => void
}

/**
 * Ids of every folder in a set except the first, which is the merge target.
 *
 * @param folders - One set of duplicate folders.
 */
const getRemainingFolderIds = (folders: LocalBookmarkEntry[]): string[] => {
    return folders.slice(1).map((f: LocalBookmarkEntry) => f.id)
}

/**
 * Card listing duplicate-folder results from the Tools tab: one block per set
 * with a merge action and the full path of each folder. Merging collapses the
 * set into its first folder.
 *
 * @param props - See {@link MergeProps}.
 */
export default function Merge({ folders, buildPath, mergeFolders }: MergeProps) {
    if (folders.length) {
        return (
            <>
                <div className='card'>
                    <h3>Merge Folders</h3>
                    {folders.map((bookmarkSet: LocalBookmarkEntry[], index: number) => {
                        return (
                            <div className='bookmark-set' key={index}>
                                <div
                                    className='merge-folder'
                                    onClick={() =>
                                        mergeFolders(bookmarkSet[0]?.id ?? '', getRemainingFolderIds(bookmarkSet))
                                    }
                                >
                                    <FaCodeMerge />
                                    <span>Merge {bookmarkSet[0]?.title} Folders</span>
                                </div>
                                {bookmarkSet.map(f => {
                                    return (
                                        <div className='bookmark' key={f.id}>
                                            <div className='bookmark-name'>
                                                <FaFolder />
                                                {buildPath(f.id)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </>
        )
    } else {
        return <div className='empty-folders'>No duplicate folders found.</div>
    }
}
