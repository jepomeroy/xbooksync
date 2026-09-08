/**
 * The no-op adapter, which an unconfigured profile sits on indefinitely —
 * `StorageBackend.None` is the install-time default and has no adapter of its
 * own.
 *
 * The asymmetry between read and write is the whole point of this suite: a read
 * that reports "unchanged" is telling the truth about a target that does not
 * exist, but a write that reports success is not, and the sync loop answers a
 * successful write by recording a new base snapshot.
 */

import { describe, expect, it } from 'vitest'
import { NilStorageAdapter } from '@/entrypoints/bookmarks/nil-adapter'
import { NotConfiguredError } from '@/entrypoints/shared/types'

describe('read', () => {
    it('reports nothing to sync, so the caller leaves its stored state alone', async () => {
        await expect(new NilStorageAdapter().read('')).resolves.toEqual({
            changed: false,
            content: '',
            blobVersion: '',
        })
    })
})

describe('write', () => {
    it('refuses the write rather than reporting a success that never happened', async () => {
        // Regression guard. Returning '' here used to read as "stored, at
        // version ''", which made the sync loop stamp a base snapshot of the
        // whole local tree for a write that reached no target. That base is
        // what a later read of a real, empty repo then diffed against —
        // producing a removal of every bookmark, which was applied for real.
        await expect(new NilStorageAdapter().write('{}')).rejects.toBeInstanceOf(NotConfiguredError)
    })

    it('refuses regardless of the version it is handed', async () => {
        await expect(new NilStorageAdapter().write('{}', 'sha-1')).rejects.toBeInstanceOf(NotConfiguredError)
    })
})

describe('watchers', () => {
    it('registers and unregisters without a target to watch', () => {
        const adapter = new NilStorageAdapter()

        // `Storage` swaps adapters unconditionally, so both have to be safe to
        // call on an adapter that never subscribed to anything.
        expect(() => adapter.registerWatchers(() => undefined)).not.toThrow()
        expect(() => adapter.unregisterWatchers()).not.toThrow()
    })
})
