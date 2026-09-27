import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FaBookmark, FaTrashCan } from 'react-icons/fa6'

export type DupicateProps = {
    bookmarkSets: LocalBookmarkEntry[][]
    buildPath: (id: string) => string
    deleteBookmark: (setIndex: number, id: string) => void
}

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
                            <div>
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
