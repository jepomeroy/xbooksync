/**
 * The tick alarm, against `fakeBrowser`'s alarms and storage.
 *
 * The period floor and the create-only-if-absent rule are both browser
 * constraints, so a regression in either is silent at runtime.
 */

import { describe, expect, it, vi } from 'vitest'
import { Alarm, TickAlarmName } from '@/entrypoints/bookmarks/alarm'
import { syncEnableSetting, syncRateSetting } from '@/entrypoints/shared/localsettings'

const tick = (name = TickAlarmName) => ({ name }) as Browser.alarms.Alarm

const noop = () => vi.fn().mockResolvedValue(undefined)

describe('handleTickAlarm', () => {
    it('runs the sync', async () => {
        const sync = noop()

        await new Alarm(sync).handleTickAlarm(tick())

        expect(sync).toHaveBeenCalledOnce()
    })

    it('delegates even while syncing is switched off', async () => {
        // The master switch belongs to `SyncService.request`, which is where it
        // is covered; a second check here would only be somewhere for the two to
        // disagree.
        const sync = noop()
        await syncEnableSetting.setValue(false)

        await new Alarm(sync).handleTickAlarm(tick())

        expect(sync).toHaveBeenCalledOnce()
    })

    it('waits for the pass, so the worker is not torn down underneath it', async () => {
        let settled = false
        const sync = vi.fn().mockImplementation(async () => {
            await Promise.resolve()
            settled = true
        })

        await new Alarm(sync).handleTickAlarm(tick())

        expect(settled).toBe(true)
    })

    it('ignores an alarm belonging to something else', async () => {
        const sync = noop()

        await new Alarm(sync).handleTickAlarm(tick('some-other-alarm'))

        expect(sync).not.toHaveBeenCalled()
    })
})

describe('ensureTickAlarm', () => {
    it('creates the alarm when none exists', async () => {
        await new Alarm(vi.fn()).ensureTickAlarm()

        await expect(browser.alarms.get(TickAlarmName)).resolves.toBeDefined()
    })

    it('leaves an existing alarm alone', async () => {
        // `alarms.create` replaces by name and restarts the schedule, so
        // re-creating on every worker wake would push the next fire out forever.
        const alarm = new Alarm(vi.fn())
        await alarm.ensureTickAlarm()

        const create = vi.spyOn(browser.alarms, 'create')
        await alarm.ensureTickAlarm()

        expect(create).not.toHaveBeenCalled()
    })

    it.each([
        [20, 0.5],
        [30, 0.5],
        [90, 1.5],
        [900, 15],
    ])('converts a %is sync rate to %s minutes', async (seconds, minutes) => {
        // 30s is the floor Chrome honors for a packed extension; anything
        // shorter is silently ignored, so the conversion clamps instead.
        await syncRateSetting.setValue(seconds)
        const create = vi.spyOn(browser.alarms, 'create')

        await new Alarm(vi.fn()).ensureTickAlarm()

        expect(create).toHaveBeenCalledWith(TickAlarmName, { periodInMinutes: minutes })
    })
})
