import { useState, useEffect } from '#imports'
import {
    registerSettingsWatcher,
    SettingsKeys,
    syncEnableSetting,
    syncLastSyncDateSetting,
    syncRateSetting,
    unregisterSettingsWatcher,
} from '@/entrypoints/shared/localsettings'
import Toggle from '@/entrypoints/shared/components/toogle'
import { getLastSynced } from '@/entrypoints/shared/syncutils'

/**
 * Sync preferences: the master enable toggle, the interval between automatic
 * syncs, and a read-only view of when the last sync happened.
 */

const SyncComponent = 'sync-component'
export default function Sync() {
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [syncRate, setSyncRate] = useState(900)
    // null until the stored timestamp resolves, which keeps the label blank
    // rather than briefly showing the epoch.
    const [lastSynced, setLastSynced] = useState<null | Date>(null)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        syncEnableSetting.getValue().then(data => setSyncEnabled(data))
        syncRateSetting.getValue().then(data => setSyncRate(data))
        syncLastSyncDateSetting.getValue().then(date => setLastSynced(new Date(date)))
    }, [])

    // Registered once so the watcher handle stored under SyncComponent isn't overwritten on
    // re-render, which would leak the previous subscription.
    useEffect(() => {
        registerSettingsWatcher<boolean>(SyncComponent, SettingsKeys.syncEnabled, newVal => {
            // `newVal` is null if the key is cleared; fall back to the setting's default.
            setSyncEnabled(newVal ?? true)
        })

        return () => unregisterSettingsWatcher(SyncComponent)
    }, [])

    /** Persists the toggle's new position. */
    const handleSyncChange = async (state: boolean) => {
        setSyncEnabled(state)
        await syncEnableSetting.setValue(state)
    }

    const handleSyncRateChange = async (rate: string) => {
        // `<input type="number">` still hands back a string; the setting is a number.
        const val = +rate

        setSyncRate(val)
        await syncRateSetting.setValue(val)
    }

    return (
        <div className='setting-group'>
            <Toggle label='Enable Syncing' checked={syncEnabled} onToggle={handleSyncChange} />
            <div className='setting'>
                <div>
                    <label htmlFor='sync-rate'>Sync Rate</label>
                </div>
                <div>
                    <input
                        id='sync-rate'
                        type='number'
                        value={syncRate}
                        onChange={e => handleSyncRateChange(e.target.value)}
                        placeholder='File path'
                    />
                </div>
            </div>
            <div className='last-synced'>
                <p>Last synced: {getLastSynced(lastSynced)}</p>
            </div>
        </div>
    )
}
