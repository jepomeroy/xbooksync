/**
 * The options page `Tabs` compound component and its context.
 */

import { describe, expect, it, vi } from 'vitest'
import Tabs from '@/entrypoints/options/components/tabs'
import { useTabsContext } from '@/entrypoints/options/components/tab-context'
import { byText, click, render } from './render'

const titles = [
    { id: 'one', title: 'One' },
    { id: 'two', title: 'Two' },
]
const contents = [
    { id: 'one', content: <p>first panel</p> },
    { id: 'two', content: <p>second panel</p> },
]

const renderTabs = () =>
    render(
        <Tabs>
            <Tabs.Titles items={titles} />
            <Tabs.Contents items={contents} />
        </Tabs>,
    )

describe('Tabs', () => {
    it('selects the first tab on mount', async () => {
        const container = await renderTabs()

        expect(byText(container, '[role=tab]', 'One').getAttribute('aria-selected')).toBe('true')
        expect(byText(container, '[role=tab]', 'Two').getAttribute('aria-selected')).toBe('false')
        expect(container.querySelector('[role=tabpanel]')?.textContent).toBe('first panel')
    })

    it('switches the panel and selection when another tab is clicked', async () => {
        const container = await renderTabs()

        await click(byText(container, '[role=tab]', 'Two'))

        const two = byText(container, '[role=tab]', 'Two')
        expect(two.getAttribute('aria-selected')).toBe('true')
        expect(two.className).toBe('tabitem selected')
        expect(byText(container, '[role=tab]', 'One').className).toBe('tabitem')
        expect(container.querySelectorAll('[role=tabpanel]')).toHaveLength(1)
        expect(container.querySelector('[role=tabpanel]')?.textContent).toBe('second panel')
    })

    it('links each tab to its panel by id', async () => {
        const container = await renderTabs()

        const tab = byText(container, '[role=tab]', 'One')
        const panel = container.querySelector('[role=tabpanel]')
        expect(tab.id).toBe('tab-control-one')
        expect(tab.getAttribute('aria-controls')).toBe('tab-content-one')
        expect(panel?.id).toBe('tab-content-one')
        expect(panel?.getAttribute('aria-labelledby')).toBe('tab-control-one')
    })

    it('renders no panel when there are no contents', async () => {
        const container = await render(
            <Tabs>
                <Tabs.Titles items={titles} />
                <Tabs.Contents items={[]} />
            </Tabs>,
        )

        expect(container.querySelector('[role=tabpanel]')).toBeNull()
    })

    it('keeps separate selection for separate tab sets', async () => {
        const container = await render(
            <>
                <div id='a'>
                    <Tabs>
                        <Tabs.Titles items={titles} />
                        <Tabs.Contents items={contents} />
                    </Tabs>
                </div>
                <div id='b'>
                    <Tabs>
                        <Tabs.Titles items={titles} />
                        <Tabs.Contents items={contents} />
                    </Tabs>
                </div>
            </>,
        )

        await click(byText(container.querySelector('#a')!, '[role=tab]', 'Two'))

        expect(container.querySelector('#a [role=tabpanel]')?.textContent).toBe('second panel')
        expect(container.querySelector('#b [role=tabpanel]')?.textContent).toBe('first panel')
    })
})

describe('useTabsContext', () => {
    it('throws outside a TabsProvider', async () => {
        const Orphan = () => {
            useTabsContext()
            return null
        }
        // React logs the uncaught render error before rethrowing it.
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await expect(render(<Orphan />)).rejects.toThrow('useTabsContext must be used within a TabsProvider')
    })
})
