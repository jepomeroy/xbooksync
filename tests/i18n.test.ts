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
import { formatDuration, t, tParts } from '@/entrypoints/shared/i18n'

const LOCALES_DIR = join(__dirname, '..', 'public', '_locales')

type Catalog = Record<string, { message: string }>

const load = (locale: string): Catalog => JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'messages.json'), 'utf8'))

const placeholders = (message: string) => (message.match(/\$[1-9]/g) ?? []).sort()

const en = load('en')
const locales = readdirSync(LOCALES_DIR).filter(locale => locale !== 'en')

describe('locale catalogs', () => {
    it('has translations', () => {
        expect(locales.length).toBeGreaterThan(0)
    })

    it.each(locales)('%s only uses keys from the English catalog', locale => {
        const unknown = Object.keys(load(locale)).filter(key => !(key in en))
        expect(unknown).toEqual([])
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

    it('uses the browser UI language', () => {
        Object.assign(fakeBrowser.i18n, { getUILanguage: () => 'de' })
        expect(formatDuration([[15, 'minute']])).toBe('15 Minuten')
    })
})
