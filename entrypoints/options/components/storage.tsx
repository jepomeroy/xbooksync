import { useState, useEffect, useRef } from '#imports'

import FileSettings from './file'
import Unimplemented from './unimplemented'
import { storageSetting, storageFilePathSetting } from '../../shared/localsettings'
import { getStorageType, StorageType } from '@/entrypoints/shared/types'

/** Milliseconds of idle typing before the file path is persisted. */
const FILE_PATH_SAVE_DELAY = 400

/**
 * Storage-target picker plus the settings for whichever target is selected.
 *
 * Every target other than {@link StorageType.File} renders {@link Unimplemented}
 * until its adapter exists.
 */
export default function Storage() {
    const [selectedOption, setSelectedOption] = useState(StorageType.File)
    const [filePath, setFilePath] = useState('')

    // Refs rather than state: the debounce bookkeeping must survive re-renders
    // without causing one, and the pagehide handler below has to read the
    // latest pending value, not the one captured when it was registered.
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingFilePathRef = useRef<string | null>(null)

    // Write out any edit still sitting in the debounce window. The popup is
    // destroyed as soon as it loses focus, so we also run this on pagehide.
    const flushFilePath = () => {
        if (saveTimerRef.current !== null) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = null
        }
        if (pendingFilePathRef.current === null) {
            return
        }
        const file = pendingFilePathRef.current
        pendingFilePathRef.current = null
        storageFilePathSetting.setValue(file)
    }

    // Hydrate from extension storage on mount; until these resolve the inputs
    // show the useState defaults above.
    useEffect(() => {
        storageSetting.getValue().then(data => setSelectedOption(data))
        storageFilePathSetting.getValue().then(data => setFilePath(data))
    }, [])

    useEffect(() => {
        window.addEventListener('pagehide', flushFilePath)
        return () => {
            window.removeEventListener('pagehide', flushFilePath)
            flushFilePath()
        }
        // Registered once, deliberately: flushFilePath reads only refs, so the
        // closure captured here never goes stale.
    }, [])

    const handleStorageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const st = getStorageType(e.target.value)
        setSelectedOption(st)
        await storageSetting.setValue(st)
    }

    /** Updates the input immediately, but defers the write until typing settles. */
    const handleFileChange = (file: string) => {
        setFilePath(file)
        pendingFilePathRef.current = file
        if (saveTimerRef.current !== null) {
            clearTimeout(saveTimerRef.current)
        }
        saveTimerRef.current = setTimeout(flushFilePath, FILE_PATH_SAVE_DELAY)
    }

    /** Target-specific settings for the current selection. */
    const renderLocationSettings = () => {
        switch (selectedOption) {
            case StorageType.File:
                return <FileSettings value={filePath} onChange={handleFileChange} />
            default:
                return <Unimplemented />
        }
    }

    return (
        <div className='setting-group'>
            <div className='setting'>
                <label htmlFor='location'>Storage Type</label>
                <select
                    id='location'
                    value={selectedOption}
                    onChange={handleStorageChange}
                    style={{ width: '100%', padding: '6px', borderRadius: '4px' }}
                >
                    <option value={StorageType.File}>Local File</option>
                    <option value={StorageType.GitHubRepo}>GitHub Repo</option>
                    <option value={StorageType.GitHubGist}>GitHub Gist</option>
                    <option value={StorageType.GitlabRepo}>Gitlab Repo</option>
                    <option value={StorageType.S3}>S3 Bucket</option>
                </select>
            </div>
            <div className='setting'>{renderLocationSettings()}</div>
        </div>
    )
}
