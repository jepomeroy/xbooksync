/**
 * Periodic sync scheduling via the browser `alarms` API.
 */

import { syncEnableSetting, syncRateSetting } from '../shared/localsettings'
import type { SyncCallback } from '../shared/types'

/** Name of the alarm driving the periodic task. */
export const TickAlarmName = 'sync-tick'

/** Owns the tick alarm's lifecycle and invokes the sync callback when it fires. */
export class Alarm {
    /** @param syncFunc Callback invoked on each tick while syncing is enabled. */
    constructor(private syncFunc: SyncCallback) {}

    /**
     * Runs the periodic task.
     *
     * Delivery of the alarm is what wakes a suspended worker, so this is the only
     * place scheduled work can assume it is running. Alarms are best effort — the
     * browser may delay one past its period — so nothing here should depend on
     * having fired an exact number of times.
     *
     * @param alarm - The alarm that fired. Every alarm in the extension is
     * delivered to every listener, so the name check is what keeps this from
     * running on someone else's schedule.
     */
    public handleTickAlarm = async (alarm: Browser.alarms.Alarm) => {
        if (alarm.name !== TickAlarmName) {
            return
        }

        const enabled = await syncEnableSetting.getValue()

        if (enabled) {
            // call the bookmark sync function
            this.syncFunc()
        }
    }

    /**
     * Tick period, in minutes.
     *
     * 30s is the floor both browsers will honor: Chrome ignores a `periodInMinutes`
     * below 0.5 for a packed extension and logs a warning. Going finer would mean
     * holding the worker awake with a timer, which MV3 is built to prevent —
     * `alarms` is the supported way to get control back after a suspend.
     *
     * @returns {@link syncRateSetting}'s seconds as minutes, clamped up to 0.5
     * when that would land below the floor. The clamp only applies under a
     * minute, so `90` gives 1.5 rather than being rounded anywhere.
     */
    private getTickPeriodInMinutes = async (): Promise<number> => {
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
    public ensureTickAlarm = async () => {
        const existing = await browser.alarms.get(TickAlarmName)
        if (!existing) {
            const tickMinutes = await this.getTickPeriodInMinutes()
            browser.alarms.create(TickAlarmName, { periodInMinutes: tickMinutes })
        }
    }

    /**
     * Rebuilds the tick alarm against the current sync rate.
     *
     * Clearing first is what makes this work at all: {@link ensureTickAlarm} is
     * a no-op while an alarm of that name exists, so without the clear the old
     * period would simply survive. This is the deliberate opposite of the
     * startup path — here restarting the schedule is the point.
     *
     * Neither call is awaited, so the clear and the re-create race in principle.
     * In practice `alarms.clear` is dispatched first and both are cheap, but a
     * caller needing the new period to be live on return would have to await.
     */
    public resetTickAlarm = () => {
        browser.alarms.clear(TickAlarmName)
        this.ensureTickAlarm()
    }
}
