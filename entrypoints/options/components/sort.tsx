import { useState, useEffect } from '#imports'
import { getSortFolders, getSortOrder, SortFolders, SortOrder } from '@/entrypoints/shared/types'
import { sortedSetting, sortFoldersSetting, sortOrderSetting } from '@/entrypoints/shared/localsettings'
import Toggle from '@/entrypoints/shared/components/toggle'

/**
 * Sorting preferences: an on/off toggle, plus the direction and folder-grouping
 * selects that only appear while sorting is on.
 *
 * Read by `sortIfEnabled` at the end of each sync pass, so a change here takes
 * effect on the next tick, manual sync, or bookmark edit.
 */
export default function Sort() {
    const [sort, setSort] = useState(false)
    const [sortOrder, setSortOrder] = useState(SortOrder.Ascending)
    const [sortFolders, setSortFolders] = useState(SortFolders.FoldersFirst)

    // Hydrate from extension storage on mount.
    useEffect(() => {
        sortedSetting.getValue().then(data => setSort(data))
        sortOrderSetting.getValue().then(data => setSortOrder(getSortOrder(data)))
        sortFoldersSetting.getValue().then(data => setSortFolders(getSortFolders(data)))
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
        const so = getSortOrder(e.target.value)
        setSortOrder(so)
        await sortOrderSetting.setValue(so)
    }

    /**
     * Persists the newly selected folder grouping.
     *
     * @param e - Change event from the grouping `<select>`. Its value is an
     * untyped string, hence {@link getSortFolders} to narrow it back to the enum.
     */
    const handleSortFoldersChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sf: SortFolders = getSortFolders(e.target.value)
        setSortFolders(sf)
        await sortFoldersSetting.setValue(sf)
    }

    /**
     * Renders nothing when sorting is off, hiding a control that would have no
     * effect.
     *
     * @param showSort - Whether sorting is currently on.
     * @returns The direction and grouping rows, or undefined — which React renders as nothing.
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
                    <label htmlFor='Sort Folders'>Sort Folders</label>
                    <select id='Sort Folders' value={sortFolders} onChange={handleSortFoldersChange}>
                        <option value={SortFolders.FoldersFirst}>Sort Folders First</option>
                        <option value={SortFolders.BookmarksAndFolders}>Sort Bookmarks and Folders Together</option>
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
