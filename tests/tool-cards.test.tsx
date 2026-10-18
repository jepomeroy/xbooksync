/**
 * The Tools tab result cards, `Duplicates`, `Empty` and `Merge`, rendered from props.
 */

import { describe, expect, it, vi } from 'vitest'
import Duplicates from '@/entrypoints/options/components/duplicate'
import Empty from '@/entrypoints/options/components/empty'
import Merge from '@/entrypoints/options/components/merge'
import { BookmarkType, type LocalBookmarkEntry } from '@/entrypoints/shared/types'
import { click, render } from './render'

const bookmark = (id: string, url: string): LocalBookmarkEntry => ({ id, type: BookmarkType.bookmark, title: id, url })
const emptyFolder = (id: string, title: string): LocalBookmarkEntry => ({
    id,
    type: BookmarkType.folder,
    title,
    children: [],
})

const buildPath = (id: string) => `path/to/${id}`

/** The trash-icon wrapper in a result row — the row's last child. */
const trashIn = (row: Element | undefined) => row?.lastElementChild

describe('Duplicates', () => {
    const sets = [
        [bookmark('a1', 'https://a.dev'), bookmark('a2', 'https://a.dev')],
        [bookmark('b1', 'https://b.dev'), bookmark('b2', 'https://b.dev'), bookmark('b3', 'https://b.dev')],
    ]

    it('heads each set with its shared url as a link', async () => {
        const container = await render(<Duplicates bookmarkSets={sets} buildPath={buildPath} deleteBookmark={vi.fn()} />)

        const links = [...container.querySelectorAll('.bookmark-set a')]
        expect(links.map(link => link.getAttribute('href'))).toEqual(['https://a.dev', 'https://b.dev'])
        expect(links.map(link => link.textContent)).toEqual(['https://a.dev', 'https://b.dev'])
    })

    it('lists every copy by its path', async () => {
        const container = await render(<Duplicates bookmarkSets={sets} buildPath={buildPath} deleteBookmark={vi.fn()} />)

        const names = [...container.querySelectorAll('.bookmark-name')].map(el => el.textContent)
        expect(names).toEqual(['path/to/a1', 'path/to/a2', 'path/to/b1', 'path/to/b2', 'path/to/b3'])
    })

    it('deletes with the set index and bookmark id of the clicked row', async () => {
        const deleteBookmark = vi.fn()
        const container = await render(
            <Duplicates bookmarkSets={sets} buildPath={buildPath} deleteBookmark={deleteBookmark} />,
        )

        const rows = container.querySelectorAll('.bookmark-set')[1]?.querySelectorAll('.bookmark')
        await click(trashIn(rows?.[2]))

        expect(deleteBookmark).toHaveBeenCalledExactlyOnceWith(1, 'b3')
    })
})

describe('Empty', () => {
    const folders = [emptyFolder('f1', 'Old'), emptyFolder('f2', 'Stale')]

    it('lists each folder with its title and path', async () => {
        const container = await render(<Empty folders={folders} buildPath={buildPath} deleteFolder={vi.fn()} />)

        const rows = [...container.querySelectorAll('.folder')]
        expect(rows.map(row => row.querySelector('.folder-name')?.textContent)).toEqual(['Old', 'Stale'])
        expect(rows.map(row => row.children[1]?.textContent)).toEqual(['path/to/f1', 'path/to/f2'])
    })

    it('deletes the clicked folder by id', async () => {
        const deleteFolder = vi.fn()
        const container = await render(<Empty folders={folders} buildPath={buildPath} deleteFolder={deleteFolder} />)

        await click(trashIn(container.querySelectorAll('.folder')[1]))

        expect(deleteFolder).toHaveBeenCalledExactlyOnceWith('f2')
    })
})

describe('Merge', () => {
    const sets = [
        [emptyFolder('d1', 'Dev'), emptyFolder('d2', 'Dev')],
        [emptyFolder('t1', 'Tools'), emptyFolder('t2', 'Tools'), emptyFolder('t3', 'Tools')],
    ]

    it('heads each set with a merge action named for the folder', async () => {
        const container = await render(<Merge folders={sets} buildPath={buildPath} mergeFolders={vi.fn()} />)

        const actions = [...container.querySelectorAll('.merge-folder')].map(el => el.textContent)
        expect(actions).toEqual(['Merge Dev Folders', 'Merge Tools Folders'])
    })

    it('lists every folder by its path', async () => {
        const container = await render(<Merge folders={sets} buildPath={buildPath} mergeFolders={vi.fn()} />)

        const names = [...container.querySelectorAll('.bookmark-name')].map(el => el.textContent)
        expect(names).toEqual(['path/to/d1', 'path/to/d2', 'path/to/t1', 'path/to/t2', 'path/to/t3'])
    })

    it('merges the rest of the clicked set into its first folder', async () => {
        const mergeFolders = vi.fn()
        const container = await render(<Merge folders={sets} buildPath={buildPath} mergeFolders={mergeFolders} />)

        await click(container.querySelectorAll('.merge-folder')[1])

        expect(mergeFolders).toHaveBeenCalledExactlyOnceWith('t1', ['t2', 't3'])
    })

    it('says so when there are no duplicate folders', async () => {
        const container = await render(<Merge folders={[]} buildPath={buildPath} mergeFolders={vi.fn()} />)

        expect(container.querySelector('.card')).toBeNull()
        expect(container.textContent).toBe('No duplicate folders found.')
    })
})
