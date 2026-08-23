import { StatusType, SyncNowMessage, type MessageResponse } from './shared/types'
import { setStorageDefault } from './shared/localsettings'

export default defineBackground(() => {
    // On first install
    browser.runtime.onInstalled.addListener(handleSetup)
    // On message from popup
    browser.runtime.onMessage.addListener(handleMessages)
})

function handleMessages(
    message: string,
    _: Browser.runtime.MessageSender,
    sendResponse: (response?: MessageResponse) => void,
) {
    const response: MessageResponse = {
        status: StatusType.Error,
    }

    if (message === SyncNowMessage) {
        response.status = StatusType.Success
    }

    sendResponse(response)

    return true
}

async function handleSetup(_: Browser.runtime.InstalledDetails) {
    await setStorageDefault()
}
