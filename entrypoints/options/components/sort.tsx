import { useState, useEffect } from '#imports'
import { getSortOrder, SortOrder } from '@/entrypoints/shared/types'
import { sortedSetting, sortOrderSetting } from '@/entrypoints/shared/localsettings'
import Toggle from '@/entrypoints/shared/components/toggle'

/**
 * Sorting preferences: an on/off toggle, plus the direction select that only
 * appears while sorting is on.
 *
 * Both settings persist correctly but nothing consumes them yet — the sync path
 * never sorts. See the TODO in `entrypoints/bookmarks/bookmarks.ts`.
 */
export default function Sort() {
    const [sort, setSort] = useState(false)
    const [sortOrder, setSortOrder] = useState(SortOrder.Ascending)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        sortedSetting.getValue().then(data => setSort(data))
        sortOrderSetting.getValue().then(data => setSortOrder(getSortOrder(data)))
    }, [])

    /** Persists the toggle's new position. */
    const handleSortChange = async (state: boolean) => {
        setSort(state)
        await sortedSetting.setValue(state)
    }

    /**
     * Persists the newly selected sort direction.
     *
     * @param e - Change event from the direction `<select>`. Its value is an
     * untyped string, hence {@link getSortOrder} to narrow it back to the enum.
     */
    const handleSortOrderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sot = getSortOrder(e.target.value)
        setSortOrder(sot)
        await sortOrderSetting.setValue(sot)
    }

    /**
     * Renders nothing when sorting is off, hiding a control that would have no
     * effect.
     *
     * @param showSort - Whether sorting is currently on.
     * @returns The direction row, or undefined — which React renders as nothing.
     */
    const showSortOrder = (showSort: boolean) => {
        if (showSort) {
            return (
                <div className='setting'>
                    <label htmlFor='Sort Order'>Sort Order</label>
                    <select id='Sort Order' value={sortOrder} onChange={handleSortOrderChange}>
                        <option value={SortOrder.Ascending}>Ascending (A-Z)</option>
                        <option value={SortOrder.Descending}>Descending (Z-A)</option>
                    </select>
                </div>
            )
        }
    }

    return (
        <div className='setting-group'>
            <Toggle label='Sort Bookmarks' checked={sort} onToggle={handleSortChange} />
            {showSortOrder(sort)}
        </div>
    )
}
