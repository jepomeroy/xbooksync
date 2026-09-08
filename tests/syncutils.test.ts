/**
 * Display helpers for the last-sync timestamp.
 *
 * The epoch case is the one worth pinning: it is the setting's own fallback, so
 * every profile that has never completed a sync reads it back, and rendering it
 * would claim a sync in 1969.
 */

import { describe, expect, it } from 'vitest'
import { getLastSynced, parseLastSynced } from '@/entrypoints/shared/syncutils'

describe('parseLastSynced', () => {
    it('parses a real timestamp', () => {
        const parsed = parseLastSynced('2026-08-22T15:45:30.000Z')

        expect(parsed).toBeInstanceOf(Date)
        expect(parsed?.toISOString()).toBe('2026-08-22T15:45:30.000Z')
    })

    it('maps the epoch fallback onto null', () => {
        expect(parseLastSynced(new Date(0).toISOString())).toBeNull()
    })

    it('maps a cleared key onto null', () => {
        expect(parseLastSynced(null)).toBeNull()
        expect(parseLastSynced('')).toBeNull()
    })

    it('maps an unparseable value onto null', () => {
        expect(parseLastSynced('not a date')).toBeNull()
    })
})

describe('getLastSynced', () => {
    it('renders blank for a value parseLastSynced rejected', () => {
        expect(getLastSynced(parseLastSynced(new Date(0).toISOString()))).toBe('')
        expect(getLastSynced(null)).toBe('')
    })

    it('formats a real timestamp', () => {
        // Built from local parts so the assertion does not depend on the
        // runner's timezone.
        const formatted = getLastSynced(new Date(2026, 7, 22, 15, 45, 30))

        expect(formatted).toBe('Sat, Aug 22, 2026 @ 03:45:30 PM')
    })
})
