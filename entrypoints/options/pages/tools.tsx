import { Bookmarks } from '@/entrypoints/bookmarks/bookmarks'
import Toggle from '@/entrypoints/shared/components/toggle'
import type { LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { findDuplicateBookmarks, findEmptyFolders } from '../tools/tools'

export default function Tools() {
    const [emptyEnabled, setEmptyEnabled] = useState(false)
    const [duplicateEnabled, setDuplicateEnabled] = useState(true)

    const handleEmptyChange = (state: boolean) => {
        setEmptyEnabled(state)
    }

    const handleDupChange = (state: boolean) => {
        setDuplicateEnabled(state)
    }

    const runTools = async () => {
        const local: Bookmarks<LocalBookmarkEntry> = new Bookmarks<LocalBookmarkEntry>()

        if (emptyEnabled || duplicateEnabled) {
            // browser's current bookmark tree.
            const [root] = await browser.bookmarks.getTree()
            if (root) {
                local.fromBrowser(root)
            }
        }

        if (emptyEnabled) {
            const empty = await findEmptyFolders(local)
            console.log(empty)
        }

        if (duplicateEnabled) {
            const dups = await findDuplicateBookmarks(local)
            console.log(dups)
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

                <button onClick={runTools}>Run</button>
            </div>
        </>
    )
}
