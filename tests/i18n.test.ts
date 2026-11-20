/**
 * The locale catalogs and the helpers in `entrypoints/shared/i18n.ts`.
 *
 * The catalog checks guard against drift: a renamed key or a translation that
 * drops a `$1` would otherwise only show up as a broken label at runtime.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { applyDocumentLocale, formatDuration, t, tParts } from '@/entrypoints/shared/i18n'
import wxtConfig from '../wxt.config'

const LOCALES_DIR = join(__dirname, '..', 'public', '_locales')

type Catalog = Record<string, { message: string }>

const load = (locale: string): Catalog => JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'))

/**
 * Makes the fake browser serve `locale`'s catalog (English for missing keys)
 * while reporting `browserLanguage` as its UI language, the way a browser
 * whose language has no catalog falls back to `default_locale`.
 */
const serveCatalog = (locale: string, browserLanguage: string) => {
    const catalog = { ...load('en'), ...load(locale) }
    Object.assign(fakeBrowser.i18n, {
        getUILanguage: () => browserLanguage,
        getMessage: (name: string) => catalog[name]?.message ?? '',
    })
}

/** Wraps a `getMessage` so `@@bidi_dir` answers `dir`, as for the browser's own language. */
const wrapBidi =
    (inner: (name: string, subs?: string | string[]) => string, dir: string) =>
    (name: string, subs?: string | string[]) => (name === '@@bidi_dir' ? dir : inner(name, subs))

const placeholders = (message: string) => (message.match(/\$[1-9]/g) ?? []).sort()

const en = load('en')
const locales = readdirSync(LOCALES_DIR).filter(locale => locale !== 'en')

/** The `__MSG_key__` references in the manifest's top-level string fields. */
const manifestKeys = Object.values(wxtConfig.manifest as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string')
    .flatMap(value => [...value.matchAll(/__MSG_(\w+)__/g)].map(match => match[1]!))

describe('locale catalogs', () => {
    it('has translations', () => {
        expect(locales.length).toBeGreaterThan(0)
    })

    it.each(locales)('%s only uses keys from the English catalog', locale => {
        const unknown = Object.keys(load(locale)).filter(key => !(key in en))
        expect(unknown).toEqual([])
    })

    it.each([...locales, 'en'])('%s names its own locale and a valid text direction', locale => {
        const catalog = load(locale)
        expect(catalog.localeTag?.message).toBe(locale.replace('_', '-'))
        expect(['ltr', 'rtl']).toContain(catalog.textDirection?.message)
    })

    it('localizes the manifest', () => {
        expect(manifestKeys).toContain('extName')
    })

    it.each([...locales, 'en'])('%s defines every message the manifest uses', locale => {
        // Unlike UI strings, these get no English fallback from the Chrome Web
        // Store: it rejects the upload with PKG_MANIFEST_MISSING_NAME for any
        // locale without its own `extName`.
        const catalog = load(locale)
        const missing = manifestKeys.filter(key => !catalog[key]?.message)
        expect(missing).toEqual([])
    })

    it.each(locales)('%s keeps the English placeholders', locale => {
        const catalog = load(locale)
        for (const [key, { message }] of Object.entries(catalog)) {
            expect(placeholders(message), `${locale}.${key}`).toEqual(placeholders(en[key]!.message))
        }
    })
})

describe('t', () => {
    it('substitutes placeholders', () => {
        expect(t('lastSynced', 'today')).toBe('Last synced: today')
    })

    it('falls back to the key when the lookup is empty', () => {
        Object.assign(fakeBrowser.i18n, { getMessage: () => '' })
        expect(t('toolsRun')).toBe('toolsRun')
    })
})

describe('tParts', () => {
    it('interleaves values where the message puts them', () => {
        const code = { node: 'code' }
        const link = { node: 'link' }
        expect(tParts('ghEnterCode', code, link)).toEqual(['Enter code ', code, ' at ', link])
    })

    it('follows a translation that reorders the placeholders', () => {
        Object.assign(fakeBrowser.i18n, {
            getMessage: (_: string, subs: string[]) => `${subs[1]} でコード ${subs[0]} を入力`,
        })
        expect(tParts('ghEnterCode', 'A', 'B')).toEqual(['B', ' でコード ', 'A', ' を入力'])
    })
})

describe('formatDuration', () => {
    it('pluralizes and joins units for the UI locale', () => {
        expect(formatDuration([])).toBe('0 seconds')
        expect(formatDuration([[1, 'minute']])).toBe('1 minute')
        expect(
            formatDuration([
                [1, 'day'],
                [2, 'hour'],
                [30, 'second'],
            ]),
        ).toBe('1 day, 2 hours, and 30 seconds')
    })

    it('uses the language of the served catalog', () => {
        serveCatalog('de', 'de-DE')
        expect(formatDuration([[15, 'minute']])).toBe('15 Minuten')
    })

    it('stays in English when the browser language has no catalog', () => {
        // Swedish browser, no `sv` catalog: the strings fall back to English,
        // so the units must too, or the summary reads "Every 15 minuter".
        serveCatalog('en', 'sv-SE')
        expect(formatDuration([[15, 'minute']])).toBe('15 minutes')
    })
})

describe('applyDocumentLocale', () => {
    it('lays out a right-to-left translation right to left', () => {
        serveCatalog('ar', 'ar')
        applyDocumentLocale()
        expect(document.documentElement.lang).toBe('ar')
        expect(document.documentElement.dir).toBe('rtl')
    })

    it('keeps the English fallback left to right for an RTL browser language', () => {
        // Hebrew browser, no `he` catalog: `@@bidi_dir` would say rtl, but the
        // text on screen is English.
        serveCatalog('en', 'he-IL')
        Object.assign(fakeBrowser.i18n, {
            getMessage: wrapBidi(fakeBrowser.i18n.getMessage, 'rtl'),
        })
        applyDocumentLocale()
        expect(document.documentElement.lang).toBe('en')
        expect(document.documentElement.dir).toBe('ltr')
    })
})
