import { useState, useEffect } from '#imports'
import { getSortOrderType, SortOrderType } from '@/entrypoints/utils/constants'
import { sortedType, sortOrderType } from '@/entrypoints/utils/types'
import Toggle from './toogle'

export default function Sort() {
    const [sort, setSort] = useState(false)
    const [sortOrder, setSortOrder] = useState(SortOrderType.Ascending)

    useEffect(() => {
        sortedType.getValue().then(data => setSort(data))
        sortOrderType.getValue().then(data => setSortOrder(getSortOrderType(data)))
    }, [])

    const handleSortChange = async () => {
        const next = !sort
        setSort(next)
        await sortedType.setValue(next)
    }

    const handleSortOrderChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sot = getSortOrderType(e.target.value)
        setSortOrder(sot)
        await sortOrderType.setValue(sot)
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
