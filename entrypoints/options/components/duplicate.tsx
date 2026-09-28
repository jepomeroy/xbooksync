import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FaBookmark, FaTrashCan } from 'react-icons/fa6'

export type DupicateProps = {
    /** Groups of bookmarks sharing a URL; each group holds two or more entries. */
    bookmarkSets: LocalBookmarkEntry[][]
    /** Resolves a bookmark id to its folder path, shown so the user can tell copies apart. */
    buildPath: (id: string) => string
    /** Removes one bookmark; `setIndex` names the group it belongs to in `bookmarkSets`. */
    deleteBookmark: (setIndex: number, id: string) => void
}

/**
 * Card listing duplicate-bookmark results from the Tools tab.
 *
 * Each group is headed by the shared URL, followed by one row per copy showing
 * where it lives and a trash icon to delete that copy.
 *
 * @param props - See {@link DupicateProps}.
 */
export default function Duplicates({
    bookmarkSets: bookmarks,
    buildPath,
    deleteBookmark: deleteBookmark,
}: DupicateProps) {
    return (
        <>
            <div className='card'>
                <h3>Duplicate Bookmarks</h3>
                {bookmarks.map((bookmarkSet: LocalBookmarkEntry[], index: number) => {
                    return (
                        <div className='bookmark-set' key={index}>
                            <div className='bookmark-url'>
                                <a href={bookmarkSet[0]?.url}>{bookmarkSet[0]?.url}</a>
                            </div>
                            {bookmarkSet.map(f => {
                                return (
                                    <div className='bookmark' key={f.id}>
                                        <div className='bookmark-name'>
                                            <FaBookmark />
                                            {buildPath(f.id)}
                                        </div>
                                        <div onClick={() => deleteBookmark(index, f.id)}>
                                            <FaTrashCan />
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
}
