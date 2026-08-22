import Sort from '../components/sort'
import Sync from '../components/sync'

export default function SettingsPage() {
    return (
        <div className='card'>
            <h3>Settings</h3>
            <Sort />
            <Sync />
        </div>
    )
}
