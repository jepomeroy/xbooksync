import { StatusType, SyncNowMessage, type MessageResponse } from './shared/types'
import { registerSyncRateWatcher, setDefaultSettings, unregisterSyncRateWatcher } from './shared/localsettings'
import { ensureTickAlarm, resetTickAlarm, TickAlarmName } from './bookmarks/alarm'

/**
 * Background service worker.
 *
 * Listeners are registered synchronously at the top level: MV3 tears the worker
 * down when idle and replays events into a fresh one, so anything registered
 * inside an async callback would miss events after the first suspend.
 */
export default defineBackground(() => {
    // On first install
    browser.runtime.onInstalled.addListener(handleSetup)
    // On browser start
    browser.runtime.onStartup.addListener(handleStartup)
    // On message from popup
    browser.runtime.onMessage.addListener(handleMessages)
    // On every scheduled tick
    browser.alarms.onAlarm.addListener(handleTickAlarm)

    // Not just on install: a worker revived by any event re-runs this, which is
    // what repairs the alarm if it was ever lost (browser update, profile move).
    void ensureTickAlarm()

    // listen for changes to the sync rate
    void registerSyncRateWatcher(TickAlarmName, (_newVal, _oldVal) => {
        resetTickAlarm()
    })

    // Cleanup any settings watcher
    browser.runtime.onSuspend.addListener(() => {
        unregisterSyncRateWatcher(TickAlarmName)
    })
})

/**
 * Runs the periodic task.
 *
 * Delivery of the alarm is what wakes a suspended worker, so this is the only
 * place scheduled work can assume it is running. Alarms are best effort — the
 * browser may delay one past its period — so nothing here should depend on
 * having fired an exact number of times.
 */
function handleTickAlarm(alarm: Browser.alarms.Alarm) {
    if (alarm.name !== TickAlarmName) {
        return
    }

    // TODO: run the scheduled sync here, gated on syncEnableSetting/syncRateSetting.
    console.log(`[xbooksync] tick at ${new Date().toISOString()}`)
}

/**
 * Routes messages from the popup.
 *
 * @returns `true` to keep the message channel open for an asynchronous
 * `sendResponse`. Once syncing lands here the reply will come from a promise,
 * so the channel has to stay open even though the current path answers
 * synchronously.
 */
function handleMessages(
    message: string,
    _: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
) {
    // Default to Error so an unrecognized message reports failure rather than a
    // silent success.
    const response: MessageResponse = {
        status: StatusType.Error,
    }

    if (message === SyncNowMessage) {
        // TODO: kick off the sync here; success currently only means the
        // message was understood.
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
async function handleStartup() {
    await ensureTickAlarm()
}

/** Seeds default settings on install so the popup never renders against empty storage. */
async function handleSetup(_: Browser.runtime.InstalledDetails) {
    await setDefaultSettings()
}
