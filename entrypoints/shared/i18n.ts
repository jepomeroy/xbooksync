/**
 * UI localization on the browser's own `i18n` API.
 *
 * Catalogs live in `public/_locales/<locale>/messages.json`, which WXT copies
 * to the build root where both Chrome and Firefox look for them. English is the
 * `default_locale`, so any key missing from a translation falls back to it.
 *
 * `browser.i18n` has no plural rules, so anything with a count in it is built
 * from `Intl` (see {@link formatDuration}) rather than from the catalogs.
 */

import type en from '@/public/_locales/en/messages.json'

/** Every key in the English catalog, so a typo in a key fails to compile. */
export type MessageKey = keyof typeof en

/**
 * Looks up a localized string.
 *
 * @param key - Message name from `messages.json`.
 * @param substitutions - Values for `$1`…`$9` in the message, in order.
 * @returns The translated text, or the key itself if the lookup came back
 * empty — visible enough to spot, and never a blank label.
 */
export const t = (key: MessageKey, ...substitutions: (string | number)[]): string =>
    browser.i18n.getMessage(key, substitutions.map(String)) || key

/**
 * BCP 47 tag of the catalog actually being served, for `Intl` formatting and
 * the page's `lang`.
 *
 * Not `getUILanguage()`: when the browser's language has no catalog, the text
 * falls back to English, and formatting dates or units in the browser's
 * language would mix two languages in one sentence. Each catalog names its own
 * locale in `localeTag`, so this always matches the strings on screen.
 */
export const uiLocale = (): string => t('localeTag')

/**
 * Splits a message around its placeholders so non-string values (links,
 * buttons) can be dropped in where the translation puts them, whatever the
 * word order.
 *
 * @param key - Message name whose placeholders are `$1`, `$2`, ….
 * @param values - Values for those placeholders, in order.
 * @returns Literal text and values interleaved in display order.
 */
export const tParts = <T>(key: MessageKey, ...values: T[]): (string | T)[] => {
    // Private-use characters can't appear in a translation, so they're safe markers.
    const markers = values.map((_, i) => `${i}`)
    return t(key, ...markers)
        .split(/(\d+)/)
        .filter(part => part !== '')
        .map(part => {
            const match = /^(\d+)$/.exec(part)
            return match ? (values[Number(match[1])] as T) : part
        })
}

/** `Intl` unit names for the parts of {@link formatDuration}. */
type DurationUnit = 'day' | 'hour' | 'minute' | 'second'

/**
 * Renders a list of unit amounts as one phrase, e.g. `1 hour and 30 minutes`,
 * with the locale's plural forms and list conjunction.
 *
 * @param parts - Non-zero amounts in display order; empty renders `0 seconds`.
 */
export const formatDuration = (parts: [number, DurationUnit][]): string => {
    const locale = uiLocale()
    const unit = (n: number, u: DurationUnit) =>
        new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long' }).format(n)

    if (parts.length === 0) return unit(0, 'second')

    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts.map(([n, u]) => unit(n, u)))
}

/**
 * Points the document at the served catalog's language and text direction, so
 * right-to-left translations lay out correctly. Called once per page at startup.
 *
 * The direction comes from the catalog's `textDirection`, not `@@bidi_dir`:
 * the latter follows the browser's language, so an RTL browser language with
 * no catalog would lay the English fallback out right to left.
 */
export const applyDocumentLocale = (): void => {
    document.documentElement.lang = uiLocale()
    document.documentElement.dir = t('textDirection') === 'rtl' ? 'rtl' : 'ltr'
}
