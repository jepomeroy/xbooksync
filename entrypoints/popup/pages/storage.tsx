import Storage from '../components/storage'

/** Storage panel: picks the sync target and its target-specific settings. */
export default function StoragePage() {
    return (
        <div className='card'>
            <h3>Storage</h3>
            <Storage />
        </div>
    )
}
