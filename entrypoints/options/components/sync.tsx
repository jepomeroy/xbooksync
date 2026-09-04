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
import { getLastSynced, parseLastSynced } from '@/entrypoints/shared/syncutils'

/**
 * Sync preferences: the master enable toggle, the interval between automatic
 * syncs, and a read-only view of when the last sync happened.
 */

/**
 * Watcher key prefix used to identify this component's settings subscriptions.
 *
 * Suffixed per key: the registry holds one watcher per name, so registering two
 * under the same name would drop the first handle and leak that subscription.
 */
const SyncComponent = 'sync-component'
export default function Sync() {
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [syncRate, setSyncRate] = useState(900)
    // null until the stored timestamp resolves, and stays null if it is the
    // epoch fallback, which keeps the label blank rather than showing 1969.
    const [lastSynced, setLastSynced] = useState<null | Date>(null)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        syncEnableSetting.getValue().then(data => setSyncEnabled(data))
        syncRateSetting.getValue().then(data => setSyncRate(data))
        syncLastSyncDateSetting.getValue().then(date => setLastSynced(parseLastSynced(date)))
    }, [])

    // Registered once so the watcher handles stored under these names aren't overwritten on
    // re-render, which would leak the previous subscriptions.
    useEffect(() => {
        registerSettingsWatcher<boolean>(`${SyncComponent}-sync-enabled`, SettingsKeys.syncEnabled, newVal => {
            // `newVal` is null if the key is cleared; fall back to the setting's default.
            setSyncEnabled(newVal ?? true)
        })

        // The background worker stamps this key at the end of a sync that
        // changed something, so the label follows syncs started elsewhere.
        registerSettingsWatcher<string>(`${SyncComponent}-last-sync`, SettingsKeys.lastSyncDate, newVal => {
            setLastSynced(parseLastSynced(newVal))
        })

        return () => {
            unregisterSettingsWatcher(`${SyncComponent}-sync-enabled`)
            unregisterSettingsWatcher(`${SyncComponent}-last-sync`)
        }
    }, [])

    /**
     * Persists the toggle's new position.
     *
     * Sets local state as well as writing the setting: the watcher above would
     * eventually deliver the same value, but not soon enough to avoid a visible
     * lag on the switch.
     *
     * @param state - Requested position.
     */
    const handleSyncChange = async (state: boolean) => {
        setSyncEnabled(state)
        await syncEnableSetting.setValue(state)
    }

    /**
     * Persists the new sync interval, in seconds.
     *
     * Written on every keystroke, and the background worker rebuilds its alarm
     * on each write — so typing "900" resets the schedule three times on the way
     * there. Values under 30s are accepted here and floored by the alarm.
     *
     * @param rate - Raw input value. A cleared field arrives as `''` and is
     * stored as `0`, which the alarm then floors to 30s.
     */
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
