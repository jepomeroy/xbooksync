import { useState, useEffect } from '#imports'
import { syncEnableSetting, syncLastSyncSetting, syncRateSetting } from '@/entrypoints/shared/localsettings'
import Toggle from './toogle'

// type SyncRateProps = {
//     syncRate: string
//     onChange: (value: number) => void
// }

export default function Sync() {
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [syncRate, setSyncRate] = useState(900)
    const [lastSynced, setLastSynced] = useState<null | Date>(null)

    useEffect(() => {
        syncEnableSetting.getValue().then(data => setSyncEnabled(data))
        syncRateSetting.getValue().then(data => setSyncRate(data))
        syncLastSyncSetting.getValue().then(data => setLastSynced(new Date(Date.parse(data))))
    }, [])

    const getLastSynced = (): string => {
        if (lastSynced) {
            // Friday, Aug 22, 2026 @ 03:45:30 PM
            return `${lastSynced.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            })} @ ${lastSynced.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
            })}`
        } else {
            return ''
        }
    }

    const handleSyncChange = async (state: boolean) => {
        setSyncEnabled(state)
        await syncEnableSetting.setValue(state)
    }

    const handleSyncRateChange = async (rate: string) => {
        const val = +rate

        setSyncRate(val)
        await syncRateSetting.setValue(val)
    }

    return (
        <div className='setting-group'>
            <Toggle label='Enable Syncing' initial={syncEnabled} onToggle={handleSyncChange} />
            <div className='setting'>
                <label htmlFor='sync-rate'>Sync Rate:</label>
                <input
                    id='sync-rate'
                    type='number'
                    value={syncRate}
                    onChange={e => handleSyncRateChange(e.target.value)}
                    placeholder='File path'
                />
            </div>
            <div className='last-synced'>
                <p>Last synced: {getLastSynced()}</p>
            </div>
        </div>
    )
}
