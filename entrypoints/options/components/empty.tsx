import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FaFolder, FaTrashCan } from 'react-icons/fa6'

export type EmptyProps = {
    /** Folders with no children. */
    folders: LocalBookmarkEntry[]
    /** Resolves a folder id to its full path, since titles alone can collide. */
    buildPath: (id: string) => string
    /** Removes the folder from the browser. */
    deleteFolder: (id: string) => void
}

/**
 * Card listing empty-folder results from the Tools tab: one row per folder
 * with its title, full path, and a trash icon to delete it.
 *
 * @param props - See {@link EmptyProps}.
 */
export default function Empty({ folders, buildPath, deleteFolder }: EmptyProps) {
    return (
        <>
            <div className='card'>
                <h3>Empty Folders</h3>
                <div className='empty-folders'>
                    {folders.map(f => {
                        return (
                            <div className='folder' key={f.id}>
                                <div className='folder-name'>
                                    <FaFolder />
                                    {f.title}
                                </div>
                                <div>{buildPath(f.id)}</div>
                                <div onClick={() => deleteFolder(f.id)}>
                                    <FaTrashCan />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </>
    )
}
