import { beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

/**
 * `fakeBrowser` is a singleton shared by every module in a test file, so its
 * storage and alarms carry over between tests unless they are cleared here.
 *
 * The bookmarks namespace is installed per-suite by `installFakeBookmarks`
 * rather than globally: most suites never touch it, and the ones that do want
 * to choose the anchor titles.
 */
beforeEach(() => {
    fakeBrowser.reset()
})
