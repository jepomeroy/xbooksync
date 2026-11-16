import { beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import en from '@/public/_locales/en/messages.json'

const catalog = en as Record<string, { message: string }>

/**
 * `fakeBrowser` leaves `i18n` unmocked, so this resolves messages from the
 * English catalog the way the browser would: `$1`…`$9` take the substitutions
 * and `$$` is a literal dollar sign.
 */
const getMessage = (name: string, substitutions?: string | string[]): string => {
    if (name === '@@bidi_dir') return 'ltr'
    const subs = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions]
    const message = catalog[name]?.message ?? ''
    return message.replace(/\$(\$|[1-9])/g, (_, p: string) => (p === '$' ? '$' : (subs[Number(p) - 1] ?? '')))
}

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
    Object.assign(fakeBrowser.i18n, { getMessage, getUILanguage: () => 'en-US' })
})
