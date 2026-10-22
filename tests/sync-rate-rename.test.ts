/**
 * Carry-over from the pre-rename `local:syncrate` key to `local:syncRate`.
 *
 * `syncRateSetting`'s `init` does the move, and WXT runs it from `getValue`
 * whenever the new key is empty — so seeding the legacy key after the per-test
 * storage reset and then reading is enough; the module needs no re-import.
 */

import { describe, expect, it } from 'vitest'
import { SettingsKeys, syncRateSetting } from '@/entrypoints/shared/localsettings'

const LEGACY_KEY = 'local:syncrate'

describe('syncRateSetting key rename', () => {
    it('carries a value stored under the legacy key over to the new one', async () => {
        await storage.setItem<number>(LEGACY_KEY, 120)

        expect(await syncRateSetting.getValue()).toBe(120)
        expect(await storage.getItem<number>(SettingsKeys.syncRate)).toBe(120)
    })

    it('removes the legacy key once carried over', async () => {
        await storage.setItem<number>(LEGACY_KEY, 120)

        await syncRateSetting.getValue()

        expect(await storage.getItem<number>(LEGACY_KEY)).toBeNull()
    })

    it('falls back to the default when there is no legacy value', async () => {
        expect(await syncRateSetting.getValue()).toBe(900)
    })

    it('leaves a value already under the new key alone', async () => {
        await storage.setItem<number>(SettingsKeys.syncRate, 60)
        await storage.setItem<number>(LEGACY_KEY, 120)

        expect(await syncRateSetting.getValue()).toBe(60)
    })
})
