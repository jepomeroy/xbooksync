import appLogo from '@/assets/xbooksync.svg'
import { FaGear } from 'react-icons/fa6'
import { FaSync } from 'react-icons/fa'

import './Popup.css'
import Toggle from '@/entrypoints/shared/components/toggle'
import {
    registerSettingsWatcher,
    SettingsKeys,
    syncEnableSetting,
    syncLastErrorSetting,
    syncLastSyncDateSetting,
    unregisterSettingsWatcher,
} from '../shared/localsettings'
import { getLastSynced, parseLastSynced, syncErrorMessage } from '@/entrypoints/shared/syncutils'
import {
    type MessageResponse,
    type SyncErrorType,
    SyncErrorKind,
    SyncNowMessage,
    Status,
} from '@/entrypoints/shared/types'

/**
 * Watcher key prefix used to identify this component's settings subscriptions.
 *
 * Suffixed per key: the registry holds one watcher per name, so registering two
 * under the same name would drop the first handle and leak that subscription.
 */
const PopupComponent = 'popup-component'

/** Popup shell: header, the sync toggle with last-synced time, and buttons to sync now or open the options page. */
function Popup() {
    const [syncEnabled, setSyncEnabled] = useState(true)
    // null until the stored timestamp resolves, and stays null if it is the
    // epoch fallback, which keeps the label blank rather than showing 1969.
    const [lastSynced, setLastSynced] = useState<null | Date>(null)
    // null when the last sync succeeded, or before the stored value resolves.
    const [syncError, setSyncError] = useState<SyncErrorType | null>(null)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        syncEnableSetting.getValue().then(data => setSyncEnabled(data))
        syncLastSyncDateSetting.getValue().then(date => setLastSynced(parseLastSynced(date)))
        syncLastErrorSetting.getValue().then(setSyncError)
    }, [])

    // Registered once so the watcher handles stored under these names aren't
    // overwritten on re-render, which would leak the previous subscriptions.
    useEffect(() => {
        registerSettingsWatcher<boolean>(`${PopupComponent}-sync-enabled`, SettingsKeys.syncEnabled, newVal => {
            // `newVal` is null if the key is cleared; fall back to the setting's default.
            setSyncEnabled(newVal ?? true)
        })

        // The background worker stamps this key at the end of a sync that
        // changed something, so the label follows syncs the popup didn't start.
        registerSettingsWatcher<string>(`${PopupComponent}-last-sync`, SettingsKeys.lastSyncDate, newVal => {
            setLastSynced(parseLastSynced(newVal))
        })

        // Follows the same failure/success state the extension badge is set
        // from, so the popup and the badge never disagree.
        registerSettingsWatcher<SyncErrorType>(`${PopupComponent}-last-error`, SettingsKeys.syncLastError, newVal => {
            setSyncError(newVal)
        })

        return () => {
            unregisterSettingsWatcher(`${PopupComponent}-sync-enabled`)
            unregisterSettingsWatcher(`${PopupComponent}-last-sync`)
            unregisterSettingsWatcher(`${PopupComponent}-last-error`)
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

    /** Opens the extension's options page. */
    const openOptions = () => {
        browser.runtime.openOptionsPage()
    }

    /**
     * Asks the background worker to sync immediately, unless syncing is off.
     *
     * Re-reads the setting rather than trusting `syncEnabled` state, so a toggle
     * flipped in another window is honored. The worker checks it again anyway.
     *
     * The status only reports whether the worker accepted the message — it does
     * not await the sync, so neither branch says anything about the outcome.
     * TODO: surface the real result in the popup instead of the console; that
     * needs `handleMessages` to reply from the sync promise.
     */
    const syncNow = async () => {
        if ((await syncEnableSetting.getValue()) == true) {
            const result = await browser.runtime.sendMessage<string, MessageResponse>(SyncNowMessage)

            if (result.status === Status.Success) {
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
                {syncError && (
                    <p
                        className={
                            syncError.kind === SyncErrorKind.AuthRequired
                                ? 'sync-error sync-error-action'
                                : 'sync-error'
                        }
                        onClick={syncError.kind === SyncErrorKind.AuthRequired ? openOptions : undefined}
                    >
                        {syncErrorMessage(syncError.kind)}
                    </p>
                )}
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
