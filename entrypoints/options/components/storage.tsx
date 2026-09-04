import { useState, useEffect } from '#imports'

import { storageSetting } from '@/entrypoints/shared/localsettings'
import { getStorageBackend, StorageBackend } from '@/entrypoints/shared/types'
import GitHubSettings from './gh-storage'
import Unimplemented from './unimplemented'

/**
 * Storage-target picker plus the settings for whichever target is selected.
 *
 * Only {@link StorageBackend.GitHubRepo} has settings today; every other target,
 * Gist included, renders {@link Unimplemented}. The picker still offers all four
 * so the roadmap is visible — but note nothing stops the user selecting one and
 * persisting it, which leaves the background worker on its previous adapter.
 */
export default function Storage() {
    const [selectedOption, setSelectedOption] = useState(StorageBackend.GitHubRepo)

    // Hydrate from extension storage on mount; until these resolve the inputs
    // show the useState defaults above.
    useEffect(() => {
        storageSetting.getValue().then(data => setSelectedOption(data))
    }, [])

    /**
     * Persists the newly selected storage type.
     *
     * @param e - Change event from the `<select>`. Its value is an untyped
     * string, hence {@link getStorageBackend} to narrow it back to the enum.
     */
    const handleStorageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const st = getStorageBackend(e.target.value)
        setSelectedOption(st)
        await storageSetting.setValue(st)
    }

    /** Target-specific settings for the current selection. */
    const renderLocationSettings = () => {
        switch (selectedOption) {
            case StorageBackend.GitHubRepo:
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
                    <option value={StorageBackend.GitHubRepo}>GitHub Repo</option>
                    <option value={StorageBackend.GitHubGist}>GitHub Gist</option>
                    <option value={StorageBackend.GitLabRepo}>GitLab Repo</option>
                    <option value={StorageBackend.S3}>S3 Bucket</option>
                </select>
            </div>
            <div className='storage-setting'>{renderLocationSettings()}</div>
        </div>
    )
}
