import { useState, useEffect, useRef } from '#imports'

import FileSettings from './file'
import Unimplemented from './unimplemented'
import { storageType, storageFilePathType } from '../../utils/types'
import { getStorageType, StorageType } from '@/entrypoints/utils/constants'

const FILE_PATH_SAVE_DELAY = 400

export default function Storage() {
    const [selectedOption, setSelectedOption] = useState(StorageType.File)
    const [filePath, setFilePath] = useState('')

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
        storageFilePathType.setValue(file)
    }

    useEffect(() => {
        storageType.getValue().then(data => setSelectedOption(data))
        storageFilePathType.getValue().then(data => setFilePath(data))
    }, [])

    useEffect(() => {
        window.addEventListener('pagehide', flushFilePath)
        return () => {
            window.removeEventListener('pagehide', flushFilePath)
            flushFilePath()
        }
    }, [])

    const handleStorageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        console.log(e.target.value)
        const st = getStorageType(e.target.value)
        setSelectedOption(st)
        await storageType.setValue(st)
    }

    const handleFileChange = (file: string) => {
        setFilePath(file)
        pendingFilePathRef.current = file
        if (saveTimerRef.current !== null) {
            clearTimeout(saveTimerRef.current)
        }
        saveTimerRef.current = setTimeout(flushFilePath, FILE_PATH_SAVE_DELAY)
    }

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
                <label htmlFor='location'>Location:</label>
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
