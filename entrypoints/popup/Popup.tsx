import appLogo from '@/assets/xbooksync.svg'
import { FaGear } from 'react-icons/fa6'
import { FaSync } from 'react-icons/fa'

import './Popup.css'
import Toggle from '../shared/components/toogle'
import {
    registerSettingsWatcher,
    SettingsKeys,
    syncEnableSetting,
    syncLastSyncSetting,
    unregisterSettingsWatcher,
} from '../shared/localsettings'
import { getLastSynced } from '../shared/syncutils'
import { type MessageResponse, SyncNowMessage, StatusType } from '../shared/types'

/**
 * Popup shell: header, the active panel, and the bottom nav that switches
 * between panels.
 */
const PopupComponent = 'popup-component'
function Popup() {
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [lastSynced, setLastSynced] = useState<null | Date>(null)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        syncEnableSetting.getValue().then(data => setSyncEnabled(data))
        syncLastSyncSetting.getValue().then(data => setLastSynced(new Date(Date.parse(data))))
    }, [])

    // Registered once so the watcher handle stored under PopupComponent isn't
    // overwritten on re-render, which would leak the previous subscription.
    useEffect(() => {
        registerSettingsWatcher<boolean>(PopupComponent, SettingsKeys.syncEnabled, newVal => {
            // `newVal` is null if the key is cleared; fall back to the setting's default.
            setSyncEnabled(newVal ?? true)
        })

        return () => unregisterSettingsWatcher(PopupComponent)
    }, [])

    const handleSyncChange = async (state: boolean) => {
        setSyncEnabled(state)
        await syncEnableSetting.setValue(state)
    }

    const openOptions = () => {
        browser.runtime.openOptionsPage()
    }

    /** Asks the background worker to sync immediately, unless syncing is off. */
    const syncNow = async () => {
        if ((await syncEnableSetting.getValue()) == true) {
            const result = await browser.runtime.sendMessage<string, MessageResponse>(SyncNowMessage)

            if (result.status === StatusType.Success) {
                console.log('I would sync')
            } else {
                console.log('No sync necessary')
            }
        } else {
            console.log('Sync is disabled')
        }
    }

    return (
        <div className='container'>
            <div className='header'>
                <div>
                    <a href='https://github.com/jepomeroy/xbooksync' target='_blank'>
                        <img src={appLogo} className='logo' alt='App logo' />
                    </a>
                </div>
                <div>
                    <h1>XBookSync</h1>
                </div>
            </div>
            <div className='setting'>
                <Toggle label='Enable Syncing' checked={syncEnabled} onToggle={handleSyncChange} />
                <div className='last-synced'>
                    <p>Last synced: {getLastSynced(lastSynced)}</p>
                </div>
            </div>
            <div className='button-group'>
                <button onClick={syncNow} aria-label='Sync now' title='Sync now'>
                    <FaSync />
                </button>
                <button onClick={openOptions} aria-label='Settings' title='Settings'>
                    <FaGear />
                </button>
            </div>
        </div>
    )
}

export default Popup
