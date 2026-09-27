import { type Dispatch, type ReactNode, type SetStateAction, createContext, useContext, useState } from 'react'

/** Selection state shared between a {@link TabsProvider}'s titles and contents. */
type TabsContextProps = {
    /** Index of the selected tab, matching the order of the `items` arrays. */
    currentIndex: number
    setCurrentIndex: Dispatch<SetStateAction<number>>
}

type TabsProviderProps = {
    children: ReactNode
}

// No default value, so `useTabsContext` can detect a missing provider.
const TabsContext = createContext<TabsContextProps | undefined>(undefined)

/** Holds the selected tab index for one tab set; starts on the first tab. */
export default function TabsProvider({ children }: TabsProviderProps) {
    const [currentIndex, setCurrentIndex] = useState<number>(0)

    return <TabsContext.Provider value={{ currentIndex, setCurrentIndex }}>{children}</TabsContext.Provider>
}

/**
 * Reads the nearest {@link TabsProvider}'s selection state.
 *
 * @throws If called outside a {@link TabsProvider}.
 */
export function useTabsContext(): TabsContextProps {
    const context = useContext(TabsContext)
    if (context === undefined) {
        throw new Error('useTabsContext must be used within a TabsProvider')
    }
    return context
}
