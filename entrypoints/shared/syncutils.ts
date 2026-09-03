/**
 * Formats the last sync time for display, or returns an empty string while
 * the stored value is still loading.
 *
 * Shared by the popup and the options page so both render the timestamp
 * identically. Locale and 12-hour clock are hardcoded to `en-US` rather than
 * following the browser's.
 *
 * @param lastSynced - Parsed {@link syncLastSyncDateSetting}, or null before it
 * resolves. Null renders blank rather than the epoch, which is the stored
 * default and would read as a real sync in 1970.
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
