/**
 * Minimal React mounting for component tests, on `react-dom/client` and
 * happy-dom rather than a testing library.
 */

import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach } from 'vitest'

// Tells React this is a test environment, so `act` flushes updates without warning.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mounted: { root: Root; container: HTMLElement }[] = []

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount())
        container.remove()
    }
})

/** Mounts `ui` into a fresh container attached to the document. */
export const render = async (ui: ReactNode): Promise<HTMLElement> => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    mounted.push({ root, container })
    await act(async () => root.render(ui))
    return container
}

/** Clicks `el` and lets any resulting state updates and promises settle. */
export const click = async (el: Element | null | undefined): Promise<void> => {
    if (!el) throw new Error('Nothing to click')
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
}

/** The element whose own text content is exactly `text`. */
export const byText = (container: HTMLElement, selector: string, text: string): HTMLElement => {
    const found = [...container.querySelectorAll<HTMLElement>(selector)].find(el => el.textContent?.trim() === text)
    if (!found) throw new Error(`No ${selector} with text ${text}`)
    return found
}
