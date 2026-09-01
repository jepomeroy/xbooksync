import { StatusType, SyncNowMessage, type MessageResponse } from './shared/types'
import {
    registerSettingsWatcher,
    setDefaultSettings,
    SettingsKeys,
    syncBaseBookmarks,
    syncLastSyncDateSetting,
    syncLastSyncValueSetting,
    unregisterSettingsWatcher,
} from './shared/localsettings'
import { Alarm, TickAlarmName } from './bookmarks/alarm'
import { Bookmarks } from './bookmarks/bookmarks'
import { Storage } from './bookmarks/storage'

/**
 * Background service worker.
 *
 * Listeners are registered synchronously at the top level: MV3 tears the worker
 * down when idle and replays events into a fresh one, so anything registered
 * inside an async callback would miss events after the first suspend.
 */
const storage = Storage.instance

/**
 * Reads the current browser bookmark tree and, if the configured target has
 * changed since the last sync, writes the local tree back and records the
 * resulting version and timestamp.
 */
const syncFunc = async () => {
    const adapter = storage.getStorageAdapter()

    // Snapshot the browser's current bookmark tree.
    const local: Bookmarks = new Bookmarks()
    local.fromBrowswer(await browser.bookmarks.getTree())
    // console.log(local)

    const now = new Date().toISOString()

    console.log(`[xbooksync] tick at ${now}`)

    const lastChange = await syncLastSyncValueSetting.getValue()
    const readData = await adapter.read(lastChange)

    if (readData.changed) {
        // TODO: do comparison here
        console.log(local.getContent())

        const currVersion = await adapter.write(local.getContent(), readData.blobVersion)

        // Update the Sync Value and Date
        await syncLastSyncValueSetting.setValue(currVersion)
        await syncLastSyncDateSetting.setValue(now)

        // Set the new base bookmarks for the next three-way comparison
        await syncBaseBookmarks.setValue(local.getBookmarks())
    }
}

const alarm = new Alarm(syncFunc)

export default defineBackground(() => {
    // On first install
    browser.runtime.onInstalled.addListener(handleSetup)

    // On browser start
    browser.runtime.onStartup.addListener(handleStartup)

    // On message from popup
    browser.runtime.onMessage.addListener(handleMessages)

    // On every scheduled tick
    browser.alarms.onAlarm.addListener(alarm.handleTickAlarm)

    // Cleanup any settings watcher
    browser.runtime.onSuspend.addListener(() => {
        unregisterSettingsWatcher(TickAlarmName)
        storage.cleanup()
    })

    // Not just on install: a worker revived by any event re-runs this, which is
    // what repairs the alarm if it was ever lost (browser update, profile move).
    void alarm.ensureTickAlarm()

    // listen for changes to the sync rate
    void registerSettingsWatcher<number>(TickAlarmName, SettingsKeys.syncRate, (_newVal, _oldVal) => {
        alarm.resetTickAlarm()
    })
})

/**
 * Routes messages from the popup.
 *
 * @returns `true` to keep the message channel open for an asynchronous
 * `sendResponse`. Once syncing lands here the reply will come from a promise,
 * so the channel has to stay open even though the current path answers
 * synchronously.
 */
const handleMessages = (
    message: string,
    _: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
) => {
    // Default to Error so an unrecognized message reports failure rather than a
    // silent success.
    const response: MessageResponse = {
        status: StatusType.Error,
    }

    if (message === SyncNowMessage) {
        // call the bookmark sync function
        syncFunc()
        response.status = StatusType.Success
    }

    sendResponse(response)

    return true
}

/**
 * Restores the tick alarm at the start of each browser session.
 *
 * Alarms are session scoped — Firefox creates them for the current session
 * only, and Chrome clears them on restart unless `persistAcrossSessions` was
 * set — so last session's alarm is already gone by the time this runs.
 *
 * Registering the listener is the load-bearing part, more than the body:
 * profile startup fires `onStartup` but invokes no other worker events, so
 * without it nothing would start the worker to re-create the alarm and ticks
 * would stay dead until the popup happened to send a message.
 */
const handleStartup = async () => {
    await alarm.ensureTickAlarm()
}

/** Seeds default settings on install so the popup never renders against empty storage. */
const handleSetup = async (_: Browser.runtime.InstalledDetails) => {
    await setDefaultSettings()
}
