// Scheduling

import { syncRateSetting } from '../shared/localsettings'
import { BookmarkParser } from './bookmarks'

/** Name of the alarm driving the periodic task. */
export const TickAlarmName = 'sync-tick'

/**
 * Runs the periodic task.
 *
 * Delivery of the alarm is what wakes a suspended worker, so this is the only
 * place scheduled work can assume it is running. Alarms are best effort — the
 * browser may delay one past its period — so nothing here should depend on
 * having fired an exact number of times.
 */
export async function handleTickAlarm(alarm: Browser.alarms.Alarm) {
    if (alarm.name !== TickAlarmName) {
        return
    }

    const tree = await browser.bookmarks.getTree()

    const parser: BookmarkParser = new BookmarkParser(tree)
    console.log(parser)

    // TODO: run the scheduled sync here, gated on syncEnableSetting/syncRateSetting.
    console.log(`[xbooksync] tick at ${new Date().toISOString()}`)
}

/**
 * Tick period, in minutes.
 *
 * 30s is the floor both browsers will honor: Chrome ignores a `periodInMinutes`
 * below 0.5 for a packed extension and logs a warning. Going finer would mean
 * holding the worker awake with a timer, which MV3 is built to prevent —
 * `alarms` is the supported way to get control back after a suspend.
 */
export async function getTickPeriodInMinutes(): Promise<number> {
    const num = await syncRateSetting.getValue()

    // get the number of minutes
    const minutes = Math.floor(num / 60)

    // get the number of seconds as fraction of a minute
    const fractional_second = (num % 60) / 60
    const seconds = minutes > 0 ? fractional_second : Math.max(fractional_second, 0.5)

    return minutes + seconds
}

/**
 * Creates the tick alarm if it does not already exist.
 *
 * The existence check matters: `alarms.create` replaces an alarm of the same
 * name and restarts its schedule, so re-creating it on every worker startup
 * would keep pushing the next fire out and it could never arrive.
 */
export async function ensureTickAlarm() {
    const existing = await browser.alarms.get(TickAlarmName)
    if (!existing) {
        const tickMinutes = await getTickPeriodInMinutes()
        browser.alarms.create(TickAlarmName, { periodInMinutes: tickMinutes })
    }
}

/**
 * Reset the tick alarm if the sync rate changes.
 *
 * The existence check matters: `alarms.create` replaces an alarm of the same
 * name and restarts its schedule, so re-creating it on every worker startup
 * would keep pushing the next fire out and it could never arrive.
 */
export async function resetTickAlarm() {
    browser.alarms.clear(TickAlarmName)
    ensureTickAlarm()
}
