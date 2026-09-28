/**
 * The Tools tab end to end against the fake bookmark tree: toggles, Run, and
 * deleting from the result cards.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import Tools from '@/entrypoints/options/pages/tools'
import { FakeBookmarks, installFakeBookmarks } from './fake-bookmarks'
import { byText, click, render } from './render'

const CHROME_BAR = 'Bookmarks bar'

let fake: FakeBookmarks

beforeEach(() => {
    fake = installFakeBookmarks()
    fake.seed(fake.idAt(CHROME_BAR), [
        { title: 'First', url: 'https://a.dev' },
        { title: 'Work', children: [{ title: 'Second', url: 'https://a.dev' }] },
        { title: 'Old', children: [] },
    ])
})

const toggle = (container: HTMLElement, label: string) =>
    container.querySelector(`[role=switch][aria-label="${label}"]`)
const run = (container: HTMLElement) => click(byText(container, 'button', 'Run'))
const card = (container: HTMLElement, heading: string) =>
    [...container.querySelectorAll('.card')].find(el => el.querySelector('h3')?.textContent === heading)

describe('Tools page', () => {
    it('starts with duplicates on, empty folders off, and no results', async () => {
        const container = await render(<Tools />)

        expect(toggle(container, 'Duplicate Bookmarks')?.getAttribute('aria-checked')).toBe('true')
        expect(toggle(container, 'Empty Folders')?.getAttribute('aria-checked')).toBe('false')
        expect(card(container, 'Duplicate Bookmarks')).toBeUndefined()
        expect(card(container, 'Empty Folders')).toBeUndefined()
    })

    it('runs only the enabled scans', async () => {
        const container = await render(<Tools />)

        await run(container)

        expect(card(container, 'Duplicate Bookmarks')).toBeDefined()
        expect(card(container, 'Empty Folders')).toBeUndefined()
    })

    it('shows both cards when both scans are enabled', async () => {
        const container = await render(<Tools />)

        await click(toggle(container, 'Empty Folders'))
        await run(container)

        const empty = card(container, 'Empty Folders')
        expect(empty?.querySelector('.folder-name')?.textContent).toBe('Old')
        expect(empty?.querySelector('.folder')?.children[1]?.textContent).toBe(`${CHROME_BAR}/Old`)

        const dups = card(container, 'Duplicate Bookmarks')
        expect([...(dups?.querySelectorAll('.bookmark-name') ?? [])].map(el => el.textContent)).toEqual([
            `${CHROME_BAR}/First`,
            `${CHROME_BAR}/Work/Second`,
        ])
    })

    it('shows no cards when nothing is found', async () => {
        installFakeBookmarks()
        const container = await render(<Tools />)

        await click(toggle(container, 'Empty Folders'))
        await run(container)

        expect(container.querySelectorAll('.card')).toHaveLength(1)
    })

    it('deletes a duplicate from the browser and drops the set once one copy is left', async () => {
        const container = await render(<Tools />)
        await run(container)

        const rows = card(container, 'Duplicate Bookmarks')?.querySelectorAll('.bookmark')
        await click(rows?.[1]?.lastElementChild)

        expect(fake.shapeOf(CHROME_BAR)).toEqual([
            { title: 'First', url: 'https://a.dev' },
            { title: 'Work', children: [] },
            { title: 'Old', children: [] },
        ])
        expect(card(container, 'Duplicate Bookmarks')).toBeUndefined()
    })

    it('keeps a set that still has two copies after a delete', async () => {
        fake.seed(fake.idAt(CHROME_BAR), [{ title: 'Third', url: 'https://a.dev' }])
        const container = await render(<Tools />)
        await run(container)

        await click(card(container, 'Duplicate Bookmarks')?.querySelector('.bookmark')?.lastElementChild)

        const names = [...(card(container, 'Duplicate Bookmarks')?.querySelectorAll('.bookmark-name') ?? [])]
        expect(names.map(el => el.textContent)).toEqual([`${CHROME_BAR}/Work/Second`, `${CHROME_BAR}/Third`])
    })

    it('deletes an empty folder from the browser and the card', async () => {
        const container = await render(<Tools />)
        await click(toggle(container, 'Empty Folders'))
        await click(toggle(container, 'Duplicate Bookmarks'))
        await run(container)

        await click(card(container, 'Empty Folders')?.querySelector('.folder')?.lastElementChild)

        expect(fake.shapeOf(CHROME_BAR).map(node => node.title)).toEqual(['First', 'Work'])
        expect(card(container, 'Empty Folders')).toBeUndefined()
    })

    it('picks up browser changes on the next run', async () => {
        const container = await render(<Tools />)
        await run(container)
        await browser.bookmarks.remove(fake.idAt(CHROME_BAR, 'First'))

        await run(container)

        expect(card(container, 'Duplicate Bookmarks')).toBeUndefined()
    })
})
