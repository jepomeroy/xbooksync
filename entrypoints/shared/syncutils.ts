/**
 * Formats the last sync time for display, or returns an empty string while
 * the stored value is still loading.
 */
export const getLastSynced = (lastSynced: Date | null): string => {
    if (lastSynced) {
        // Friday, Aug 22, 2026 @ 03:45:30 PM
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
