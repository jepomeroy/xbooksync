import Sort from '../components/sort'
import Sync from '../components/sync'

/** Settings panel: sorting and sync-schedule preferences. */
export default function SettingsPage() {
    return (
        <div className='card'>
            <h3>Settings</h3>
            <Sort />
            <Sync />
        </div>
    )
}
