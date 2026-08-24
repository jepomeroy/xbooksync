import { StatusType, SyncNowMessage, type MessageResponse } from './shared/types'
import { setStorageDefault } from './shared/localsettings'

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
    // On message from popup
    browser.runtime.onMessage.addListener(handleMessages)
})

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

/** Seeds default settings on install so the popup never renders against empty storage. */
async function handleSetup(_: Browser.runtime.InstalledDetails) {
    await setStorageDefault()
}
