import { useState, useEffect } from '#imports'

import Unimplemented from './unimplemented'
import { storageSetting } from '../../shared/localsettings'
import { getStorageType, StorageType } from '@/entrypoints/shared/types'
import GitHubSettings from './gh-storage'

/**
 * Storage-target picker plus the settings for whichever target is selected.
 *
 * Every target other than {@link StorageType.File} renders {@link Unimplemented}
 * until its adapter exists.
 */
export default function Storage() {
    const [selectedOption, setSelectedOption] = useState(StorageType.GitHubRepo)

    // Hydrate from extension storage on mount; until these resolve the inputs
    // show the useState defaults above.
    useEffect(() => {
        storageSetting.getValue().then(data => setSelectedOption(data))
    }, [])

    const handleStorageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const st = getStorageType(e.target.value)
        setSelectedOption(st)
        await storageSetting.setValue(st)
    }

    /** Target-specific settings for the current selection. */
    const renderLocationSettings = () => {
        switch (selectedOption) {
            case StorageType.GitHubGist:
            case StorageType.GitHubRepo:
                return <GitHubSettings />
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
                    <option value={StorageType.GitHubRepo}>GitHub Repo</option>
                    <option value={StorageType.GitHubGist}>GitHub Gist</option>
                    <option value={StorageType.GitlabRepo}>Gitlab Repo</option>
                    <option value={StorageType.S3}>S3 Bucket</option>
                </select>
            </div>
            <div className='storage-setting'>{renderLocationSettings()}</div>
        </div>
    )
}
