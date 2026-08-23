import { useState, useEffect } from '#imports'
import { getSortOrderType, SortOrderType } from '@/entrypoints/shared/types'
import { sortedSetting, sortOrderSetting } from '@/entrypoints/shared/localsettings'
import Toggle from './toogle'

export default function Sort() {
    const [sort, setSort] = useState(false)
    const [sortOrder, setSortOrder] = useState(SortOrderType.Ascending)

    useEffect(() => {
        sortedSetting.getValue().then(data => setSort(data))
        sortOrderSetting.getValue().then(data => setSortOrder(getSortOrderType(data)))
    }, [])

    const handleSortChange = async () => {
        const next = !sort
        setSort(next)
        await sortedSetting.setValue(next)
    }

    const handleSortOrderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sot = getSortOrderType(e.target.value)
        setSortOrder(sot)
        await sortOrderSetting.setValue(sot)
        console.log(sortOrder)
    }

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
            <Toggle label='Sort Bookmarks' initial={sort} onToggle={handleSortChange} />
            {showSortOrder(sort)}
        </div>
    )
}
