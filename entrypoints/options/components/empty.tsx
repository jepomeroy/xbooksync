import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { FaFolder, FaTrashCan } from 'react-icons/fa6'

export type EmptyProps = {
    folders: LocalBookmarkEntry[]
    buildPath: (id: string) => string
    deleteFolder: (id: string) => void
}

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
