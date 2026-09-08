/**
 * `checkRemote`, the boundary where a payload from a sync target becomes a tree
 * the merge will act on.
 *
 * Everything downstream trusts what comes out of here, and the remote-only
 * branch of `runSync` turns a removal diff into `browser.bookmarks.removeTree`
 * without asking again. So the cases that matter are the ones where the target
 * hands back something that *looks* like an empty tree.
 */

import { describe, expect, it } from 'vitest'
import { checkRemote } from '@/entrypoints/background'
import { syncLastSyncValueSetting } from '@/entrypoints/shared/localsettings'
import { EmptyRemoteError, type ReadData, type StorageAdapter } from '@/entrypoints/shared/types'
import { bar, bm, flatOf, folder, other, tree } from './helpers'

/** An adapter that hands back one canned read, and records what it was asked for. */
const adapterReturning = (readData: ReadData) => {
    const seen: string[] = []

    const adapter: StorageAdapter = {
        providerId: 'test',
        read: async knownVersion => {
            seen.push(knownVersion)
            return readData
        },
        write: async () => '',
        registerWatchers: () => undefined,
        unregisterWatchers: () => undefined,
    }

    return { adapter, seen }
}

/** The base a profile holds after any successful sync. */
const populatedBase = () => flatOf(tree(bar(folder('Work', bm('Docs', 'https://a.dev'))), other()))

describe('an empty payload', () => {
    it('is accepted as a first run when there is no base', async () => {
        // The documented bootstrap path: a brand new, empty repo. The remote
        // read is honestly empty, the diff is empty, and the local-only branch
        // populates the target on this same pass.
        const { adapter } = adapterReturning({ changed: true, content: '', blobVersion: '' })

        const side = await checkRemote(adapter, new Map())

        expect(side.flat.size).toBe(0)
        expect(side.diff.removed.size).toBe(0)
        expect(side.version).toBe('')
    })

    it('is refused when a base exists, instead of diffing as a total deletion', async () => {
        // Regression guard for the wipe. An empty payload means the target holds
        // no file; a populated base means we recorded a sync of a tree it should
        // have. Adopting the empty tree here flattens to an empty map, which
        // `diffBase` reports as every base node removed — and with an unchanged
        // local side, `runSync` applies that with `removeTree`.
        const { adapter } = adapterReturning({ changed: true, content: '', blobVersion: '' })

        await expect(checkRemote(adapter, populatedBase())).rejects.toBeInstanceOf(EmptyRemoteError)
    })

    it('is refused even when the target reports a version alongside it', async () => {
        const { adapter } = adapterReturning({ changed: true, content: '', blobVersion: 'sha-9' })

        await expect(checkRemote(adapter, populatedBase())).rejects.toBeInstanceOf(EmptyRemoteError)
    })
})

describe('an unchanged read', () => {
    it('yields an empty side with no version, whatever the base holds', async () => {
        // Distinct from the case above: "unchanged" is a positive statement that
        // the target still matches what we last saw, so there is nothing to
        // compare and nothing to record.
        const { adapter, seen } = adapterReturning({ changed: false, content: '', blobVersion: 'sha-1' })
        await syncLastSyncValueSetting.setValue('sha-1')

        const side = await checkRemote(adapter, populatedBase())

        expect(side.diff.removed.size).toBe(0)
        expect(side.version).toBeUndefined()
        // The stored token is what makes the read conditional in the first place.
        expect(seen).toEqual(['sha-1'])
    })
})

describe('a populated payload', () => {
    it('parses, diffs against the base, and carries the version forward', async () => {
        const remote = tree(bar(folder('Work', bm('Docs', 'https://a.dev'), bm('Specs', 'https://b.dev'))), other())
        const { adapter } = adapterReturning({
            changed: true,
            content: JSON.stringify(remote),
            blobVersion: 'sha-2',
        })

        const side = await checkRemote(adapter, populatedBase())

        expect([...side.diff.added.keys()]).toEqual(['bookmarks bar/Work/https://b.dev'])
        expect(side.diff.removed.size).toBe(0)
        expect(side.version).toBe('sha-2')
    })

    it('reports a genuine deletion, which never arrives as an empty payload', async () => {
        // `getContent` always serializes both anchors, so a user clearing every
        // bookmark still produces a JSON object — never ''. That is what lets
        // the empty-payload case above be treated as an anomaly rather than as
        // a legitimate "everything was deleted".
        const { adapter } = adapterReturning({
            changed: true,
            content: JSON.stringify(tree(bar(), other())),
            blobVersion: 'sha-3',
        })

        const side = await checkRemote(adapter, populatedBase())

        expect([...side.diff.removed.keys()]).toEqual(['bookmarks bar/Work', 'bookmarks bar/Work/https://a.dev'])
    })
})

describe('a malformed payload', () => {
    it.each([
        ['a bare array', '[]'],
        ['a string', '"nope"'],
        ['null', 'null'],
        ['an object with no type', '{"children":[]}'],
        ['a tree missing an anchor', JSON.stringify(tree(bar()))],
    ])('is refused: %s', async (_label, content) => {
        const { adapter } = adapterReturning({ changed: true, content, blobVersion: 'sha-4' })

        await expect(checkRemote(adapter, populatedBase())).rejects.toThrow()
    })
})
