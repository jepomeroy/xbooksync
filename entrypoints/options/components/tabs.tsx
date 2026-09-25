import React from 'react'

import TabsProvider, { useTabsContext } from './tab-context'

type TabTitlesProps = {
    items: {
        id: string
        title: string
    }[]
}

type TabContentProps = {
    items: {
        id: string
        content: React.ReactNode
    }[]
}

type TabsProps = {
    children: React.ReactNode
}

const TabTitles = ({ items }: TabTitlesProps) => {
    const { currentIndex, setCurrentIndex } = useTabsContext()
    return (
        <div role='tablist' className='tablist'>
            {items.map(({ id, title }, index) => (
                <div
                    key={id}
                    id={`tab-control-${id}`}
                    className={`${currentIndex === index ? 'tabitem selected' : 'tabitem'}`}
                    role='tab'
                    aria-controls={`tab-content-${id}`}
                    aria-selected={currentIndex === index}
                    onClick={() => {
                        setCurrentIndex(index)
                    }}
                >
                    {title}
                </div>
            ))}
        </div>
    )
}

const TabContents = ({ items }: TabContentProps) => {
    const { currentIndex } = useTabsContext()
    const item = items[currentIndex]

    if (!item) return null
    const { id, content } = item

    return (
        <div key={id} id={`tab-content-${id}`} role='tabpanel' aria-labelledby={`tab-control-${id}`}>
            {content}
        </div>
    )
}

const Tabs = Object.assign(({ children }: TabsProps) => <TabsProvider>{children}</TabsProvider>, {
    Titles: TabTitles,
    Contents: TabContents,
})

export default Tabs
