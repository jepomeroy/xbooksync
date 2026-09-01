import { useState, useEffect } from '#imports'
import { getSortOrderType, SortOrderType } from '@/entrypoints/shared/types'
import { sortedSetting, sortOrderSetting } from '@/entrypoints/shared/localsettings'
import Toggle from '../../shared/components/toogle'

/**
 * Sorting preferences: an on/off toggle, plus the direction select that only
 * appears while sorting is on.
 */
export default function Sort() {
    const [sort, setSort] = useState(false)
    const [sortOrder, setSortOrder] = useState(SortOrderType.Ascending)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        sortedSetting.getValue().then(data => setSort(data))
        sortOrderSetting.getValue().then(data => setSortOrder(getSortOrderType(data)))
    }, [])

    /** Persists the toggle's new position. */
    const handleSortChange = async (state: boolean) => {
        setSort(state)
        await sortedSetting.setValue(state)
    }

    /** Persists the newly selected sort direction. */
    const handleSortOrderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sot = getSortOrderType(e.target.value)
        setSortOrder(sot)
        await sortOrderSetting.setValue(sot)
    }

    /** Renders nothing when sorting is off, hiding a control that would have no effect. */
    const showSortOrder = (showSort: boolean) => {
        if (showSort) {
            return (
                <div className='setting'>
                    <label htmlFor='Sort Order'>Sort Order</label>
                    <select id='Sort Order' value={sortOrder} onChange={handleSortOrderChange}>
                        <option value={SortOrderType.Ascending}>Ascending (A-Z)</option>
                        <option value={SortOrderType.Descending}>Descending (Z-A)</option>
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
