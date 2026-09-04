/**
 * Parses a stored {@link syncLastSyncDateSetting} value into a Date, mapping
 * "never synced" onto null so {@link getLastSynced} renders it blank.
 *
 * Three inputs mean the same thing and all collapse to null: the setting's own
 * epoch fallback, which is what a profile that has never completed a sync reads
 * back; a null from a cleared key, as a watcher reports; and an unparseable
 * string. Without this the epoch renders as a real sync in 1969 — the local
 * date, since the stored value is UTC midnight.
 *
 * @param iso - ISO timestamp from storage, or null.
 * @returns The parsed date, or null if it represents no sync yet.
 */
export const parseLastSynced = (iso: string | null): Date | null => {
    if (!iso) {
        return null
    }

    const parsed = new Date(iso)
    const time = parsed.getTime()

    // NaN for an unparseable string; 0 is the epoch fallback.
    return Number.isNaN(time) || time === 0 ? null : parsed
}

/**
 * Formats the last sync time for display, or returns an empty string while
 * the stored value is still loading.
 *
 * Shared by the popup and the options page so both render the timestamp
 * identically. Locale and 12-hour clock are hardcoded to `en-US` rather than
 * following the browser's.
 *
 * @param lastSynced - Output of {@link parseLastSynced}, or null before the
 * stored value resolves. Null renders blank rather than a date.
 * @returns e.g. `Fri, Aug 22, 2026 @ 03:45:30 PM`, or `''`.
 */
export const getLastSynced = (lastSynced: Date | null): string => {
    if (lastSynced) {
        // Fri, Aug 22, 2026 @ 03:45:30 PM
        return `${lastSynced.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })} @ ${lastSynced.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        })}`
    } else {
        return ''
    }
}
