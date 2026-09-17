/**
 * Sync scheduling, against `fakeBrowser`'s storage and Vitest's fake timers.
 *
 * Everything here is timing behaviour that never surfaces as a failed sync —
 * an echo that slips through costs a wasted round-trip, a dropped trailing pass
 * costs a bookmark that sits unsynced until the next tick — so a regression in
 * any of it is silent at runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncService } from '@/entrypoints/bookmarks/sync-service'
import { syncEnableSetting } from '@/entrypoints/shared/localsettings'
import { BookmarkEvent } from '@/entrypoints/shared/types'

/** Mirrors `SyncService.DEBOUNCE_MS`, which is private. */
const DEBOUNCE_MS = 3_000
/** Mirrors `SyncService.ECHO_TTL_MS` / `FAILURE_COOLDOWN_MS`, both private. */
const MINUTE_MS = 60_000

/** Lets the storage reads inside `request` settle without advancing the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0)

/** A pass whose completion the test controls. */
const deferred = () => {
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
    })

    // Attached up front: a rejection handled only later in the test would
    // otherwise surface as an unhandled rejection first.
    promise.catch(() => {})

    return { promise, resolve, reject }
}

const ok = () => vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

/** Silences the log a deliberately throwing dependency writes. */
const muteConsole = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('debounce', () => {
    it('collapses a burst of bookmark events into one pass', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        void service.onBookmarkEvent(BookmarkEvent.created, '2')
        void service.onBookmarkEvent(BookmarkEvent.changed, '3')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('pushes the deadline out on each new event', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(2_000)
        void service.onBookmarkEvent(BookmarkEvent.created, '2')
        await vi.advanceTimersByTimeAsync(2_000)

        expect(runSync).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1_000)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('settles its callers only once the pass itself finishes', async () => {
        const pass = deferred()
        const service = new SyncService(vi.fn().mockReturnValue(pass.promise))

        let settled = false
        const waiting = service.onBookmarkEvent(BookmarkEvent.created, '1').then(() => {
            settled = true
        })
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(settled).toBe(false)

        pass.resolve()
        await waiting

        expect(settled).toBe(true)
    })

    it('settles a caller whose own timer was superseded', async () => {
        const service = new SyncService(ok())

        const first = service.onBookmarkEvent(BookmarkEvent.created, '1')
        void service.onBookmarkEvent(BookmarkEvent.created, '2')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        await expect(first).resolves.toBeUndefined()
    })

    it('opens a fresh window for an event arriving during the pass', async () => {
        const pass = deferred()
        const runSync = vi.fn().mockReturnValueOnce(pass.promise).mockResolvedValue(undefined)
        const service = new SyncService(runSync)

        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
        void service.onBookmarkEvent(BookmarkEvent.created, '2')
        pass.resolve()
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledTimes(2)
    })
})

describe('request', () => {
    it('runs immediately, without waiting out a debounce window', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        await service.request('manual')

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('does nothing while syncing is switched off', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)
        await syncEnableSetting.setValue(false)

        await service.request('alarm')
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).not.toHaveBeenCalled()
    })

    it('joins a running pass rather than starting a second', async () => {
        const pass = deferred()
        const runSync = vi.fn().mockReturnValueOnce(pass.promise).mockResolvedValue(undefined)
        const service = new SyncService(runSync)

        const running = service.request('alarm')
        await flush()
        void service.request('manual')
        await flush()

        expect(runSync).toHaveBeenCalledOnce()

        pass.resolve()
        await running

        // The joined trigger arrived after the running pass read the local tree,
        // so it gets a pass of its own once that one is done.
        expect(runSync).toHaveBeenCalledTimes(2)
    })

    it('joins, rather than races, a trigger delivered in the same tick', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        // Identity, not call count: the second trigger can only be handed the
        // first one's pass if the join decision is reached with nothing awaited
        // ahead of it. Read the master switch before that check and both would
        // suspend there, find no pass in flight, and start one each.
        const first = service.request('startup')
        const second = service.request('alarm')

        expect(second).toBe(first)

        await first
    })

    it('does not re-run when nothing arrived during the pass', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        await service.request('alarm')

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('reports success with a null error', async () => {
        const report = ok()
        const service = new SyncService(ok(), report)

        await service.request('alarm')

        expect(report).toHaveBeenCalledExactlyOnceWith(null)
    })
})

describe('echo suppression', () => {
    /** What `onCreated` carries for a node the apply pass just made. */
    const node = { parentId: '1', title: 'Docs', url: 'https://a.dev' }

    /**
     * The same node as the pass records it — before the create call, so without
     * an id, which is the whole reason creates are matched on content.
     */
    const created = { event: BookmarkEvent.created, ...node } as const

    it('ignores a create it caused itself, whose id it never knew', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.created, '42', node)
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).not.toHaveBeenCalled()
    })

    it('ignores an update it caused itself', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite({ event: BookmarkEvent.changed, id: '42' })
        void service.onBookmarkEvent(BookmarkEvent.changed, '42')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).not.toHaveBeenCalled()
    })

    it('consumes the record, so a later event on the same node gets through', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.created, '42', node)
        void service.onBookmarkEvent(BookmarkEvent.created, '43', node)
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('matches twins one for one, since a create key is not unique', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.created, '42', node)
        void service.onBookmarkEvent(BookmarkEvent.created, '43', node)
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).not.toHaveBeenCalled()
    })

    it('lets the user’s own create through, since its content is not ours', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.created, '42', { ...node, url: 'https://elsewhere.dev' })
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('is keyed by event, so our create does not swallow the user’s rename', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.changed, '42')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('never suppresses a move, which the apply pass cannot generate', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        void service.onBookmarkEvent(BookmarkEvent.moved, '42')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('expires a record whose echo never arrived', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.markSelfWrite(created)
        await vi.advanceTimersByTimeAsync(MINUTE_MS + 1)
        void service.onBookmarkEvent(BookmarkEvent.created, '42', node)
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })
})

describe('imports', () => {
    it('ignores the per-node burst while an import is running', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.onImportBegan()
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        void service.onBookmarkEvent(BookmarkEvent.created, '2')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).not.toHaveBeenCalled()
    })

    it('syncs the imported tree as one change when the import ends', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.onImportBegan()
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        void service.onImportEnded()
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('recovers if the import is never reported as ended', async () => {
        const runSync = ok()
        const service = new SyncService(runSync)

        service.onImportBegan()
        await vi.advanceTimersByTimeAsync(5 * MINUTE_MS + 1)
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })
})

describe('failure handling', () => {
    it('hands the error to the reporter instead of rejecting', async () => {
        const error = new Error('conflict')
        const report = ok()
        const service = new SyncService(vi.fn().mockRejectedValue(error), report)

        await expect(service.request('alarm')).resolves.toBeUndefined()
        expect(report).toHaveBeenCalledExactlyOnceWith(error)
    })

    it('keeps a throwing reporter out of the pass loop', async () => {
        muteConsole()
        const report = vi.fn().mockRejectedValue(new Error('notifications revoked'))
        const service = new SyncService(vi.fn().mockRejectedValue(new Error('conflict')), report)

        await expect(service.request('alarm')).resolves.toBeUndefined()
        expect(report).toHaveBeenCalledOnce()
    })

    it('still runs the trailing pass when the reporter throws', async () => {
        muteConsole()
        const pass = deferred()
        const runSync = vi.fn().mockReturnValueOnce(pass.promise).mockResolvedValue(undefined)
        const report = vi.fn().mockRejectedValue(new Error('notifications revoked'))
        const service = new SyncService(runSync, report)

        const running = service.request('alarm')
        await flush()
        void service.request('manual')
        await flush()

        pass.resolve()
        await expect(running).resolves.toBeUndefined()

        expect(runSync).toHaveBeenCalledTimes(2)
    })

    it('does not re-run a failed pass, however dirty it is', async () => {
        const pass = deferred()
        const runSync = vi.fn().mockReturnValueOnce(pass.promise).mockResolvedValue(undefined)
        const service = new SyncService(runSync)

        const running = service.request('alarm')
        await flush()
        void service.request('manual')
        await flush()

        pass.reject(new Error('conflict'))
        await running

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('stops bookmark activity from retrying during the cooldown', async () => {
        const runSync = vi.fn().mockRejectedValue(new Error('conflict'))
        const service = new SyncService(runSync)

        await service.request('alarm')
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledOnce()
    })

    it('still lets the alarm and the popup retry', async () => {
        const runSync = vi.fn().mockRejectedValue(new Error('conflict'))
        const service = new SyncService(runSync)

        await service.request('alarm')
        await service.request('alarm')
        await service.request('manual')

        expect(runSync).toHaveBeenCalledTimes(3)
    })

    it('lets bookmark activity through once the cooldown expires', async () => {
        const runSync = vi.fn().mockRejectedValue(new Error('conflict'))
        const service = new SyncService(runSync)

        await service.request('alarm')
        await vi.advanceTimersByTimeAsync(MINUTE_MS + 1)
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledTimes(2)
    })

    it('clears the cooldown after a pass succeeds', async () => {
        const runSync = vi.fn().mockRejectedValueOnce(new Error('conflict')).mockResolvedValue(undefined)
        const service = new SyncService(runSync)

        await service.request('alarm')
        await service.request('alarm')
        void service.onBookmarkEvent(BookmarkEvent.created, '1')
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

        expect(runSync).toHaveBeenCalledTimes(3)
    })
})
