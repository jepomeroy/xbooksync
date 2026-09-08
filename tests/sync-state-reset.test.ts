/**
 * Retargeting: what has to be forgotten when syncing is pointed somewhere else.
 *
 * The base snapshot and the version token describe one specific target. Carried
 * across to another, the sync loop reads "in the base but not on the target" as
 * a deletion and removes those bookmarks from the browser — so these are the
 * tests standing between a repo switch and silent data loss.
 *
 * The ordering assertions are the point. Both credential keys are watched, and
 * writing one is what makes `Storage` rebuild its adapter, so the stale state
 * has to be gone *before* the write lands rather than merely soon after.
 */

import { describe, expect, it } from 'vitest'
import {
    disconnectGitHub,
    GitHubSettingsKeys,
    ghAuthToken,
    ghRepo,
    registerSettingsWatcher,
    resetSyncState,
    selectSyncRepo,
    syncBaseBookmarks,
    syncLastSyncValueSetting,
    unregisterSettingsWatcher,
} from '@/entrypoints/shared/localsettings'
import { bar, bm, other, tree } from './helpers'

/** State a profile holds after syncing happily with one repo. */
const seedSyncedWith = async (repo: string, version: string) => {
    await ghRepo.setValue(repo)
    await ghAuthToken.setValue('token')
    await syncLastSyncValueSetting.setValue(version)
    await syncBaseBookmarks.setValue(tree(bar(bm('OnlyInA', 'https://a.dev')), other()))
}

/** Lets queued storage-change callbacks run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

/**
 * Captures the sync state as seen from a watcher on `key` — that is, at the
 * moment `Storage` would be rebuilding its adapter.
 *
 * @returns A getter for what was observed, or null if the watcher never fired.
 */
const captureStateWhenKeyChanges = (name: string, key: StorageItemKey) => {
    let observed: { version: string; base: unknown } | null = null

    registerSettingsWatcher(name, key, async () => {
        observed = {
            version: await syncLastSyncValueSetting.getValue(),
            base: await syncBaseBookmarks.getValue(),
        }
    })

    return () => observed
}

describe('resetSyncState', () => {
    it('clears the base and the version token', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await resetSyncState()

        expect(await syncLastSyncValueSetting.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })

    it('leaves the credentials alone — it forgets what was synced, not where', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await resetSyncState()

        expect(await ghRepo.getValue()).toBe('owner/repo-a')
        expect(await ghAuthToken.getValue()).toBe('token')
    })
})

describe('selectSyncRepo', () => {
    it('stores the new repo', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await selectSyncRepo('owner/repo-b')

        expect(await ghRepo.getValue()).toBe('owner/repo-b')
    })

    it('drops the previous repo base and version', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await selectSyncRepo('owner/repo-b')

        // Carrying 'sha-from-repo-a' into repo B makes an empty repo B answer
        // 404-with-a-known-version, which is RemoteFileMissingError on every
        // tick forever; carrying the base makes a populated repo B delete every
        // local bookmark it doesn't already have.
        expect(await syncLastSyncValueSetting.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })

    it('has already cleared them by the time the repo key changes', async () => {
        // The ordering guard. `Storage` rebuilds its adapter off this key, so a
        // watcher firing here sees exactly what the new adapter would be paired
        // with. Moving the ghRepo write ahead of the reset fails this.
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')
        const observed = captureStateWhenKeyChanges('probe-repo', GitHubSettingsKeys.ghRepo)

        await selectSyncRepo('owner/repo-b')
        await settle()
        unregisterSettingsWatcher('probe-repo')

        expect(observed()).toEqual({ version: '', base: null })
    })

    it('clears state when the repo is deselected, too', async () => {
        // The `<select>`'s blank placeholder routes here with ''.
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await selectSyncRepo('')

        expect(await ghRepo.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })
})

describe('disconnectGitHub', () => {
    it('clears the credentials and the sync state together', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await disconnectGitHub()

        expect(await ghAuthToken.getValue()).toBe('')
        expect(await ghRepo.getValue()).toBe('')
        expect(await syncLastSyncValueSetting.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })

    it('has already cleared the state by the time the token key changes', async () => {
        // Same ordering guard, via the other watched key: removing the token
        // rebuilds the adapter just as a repo change does.
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')
        const observed = captureStateWhenKeyChanges('probe-token', GitHubSettingsKeys.ghAuthToken)

        await disconnectGitHub()
        await settle()
        unregisterSettingsWatcher('probe-token')

        expect(observed()).toEqual({ version: '', base: null })
    })

    it('leaves a reconnect looking like a first run rather than a deletion', async () => {
        await seedSyncedWith('owner/repo-a', 'sha-from-repo-a')

        await disconnectGitHub()

        // An empty version reads as "never read this target", and a null base
        // makes both sides of the next diff pure additions — so reconnecting
        // merges the two trees instead of letting either delete the other.
        expect(await syncLastSyncValueSetting.getValue()).toBe('')
        expect(await syncBaseBookmarks.getValue()).toBeNull()
    })
})
