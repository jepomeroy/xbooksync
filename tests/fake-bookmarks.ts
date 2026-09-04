/**
 * In-memory stand-in for `browser.bookmarks`.
 *
 * `@webext-core/fake-browser` implements `alarms`, `storage`, `runtime`, `tabs`,
 * `windows`, `notifications`, `action` and `webNavigation` — but not
 * `bookmarks`, which is the one namespace the sync loop mutates.
 *
 * This is a real tree rather than a set of `vi.fn()` spies on purpose:
 * `applyRemote`'s correctness is about the *effect* of a sequence of operations
 * (creates before removals, ancestor suppression, recursive parent creation),
 * so tests assert on the resulting tree. Asserting on call arguments would pin
 * the transcript instead, and would break on any harmless reordering.
 */

import { fakeBrowser } from 'wxt/testing/fake-browser'

export type FakeNode = {
    id: string
    parentId?: string
    index?: number
    title: string
    url?: string
    children?: FakeNode[]
}

/** Nested view used for assertions, with the ids and indexes dropped. */
export type TreeShape = {
    title: string
    url?: string
    children?: TreeShape[]
}

/** What a test hands {@link FakeBookmarks.seed} to arrange a starting tree. */
export type SeedNode = {
    title: string
    url?: string
    children?: SeedNode[]
}

export class FakeBookmarks {
    private byId = new Map<string, FakeNode>()
    private seq = 100
    readonly root: FakeNode

    /**
     * @param barTitle - Toolbar folder title. Defaults to Chrome's, matching
     * `import.meta.env.BROWSER` under test; pass Firefox's to exercise
     * `classifyRoot` against the other browser's naming.
     */
    constructor(barTitle = 'Bookmarks bar', otherTitle = 'Other bookmarks') {
        this.root = { id: '0', title: '', children: [] }
        this.byId.set('0', this.root)
        this.anchor('1', barTitle)
        this.anchor('2', otherTitle)
    }

    private anchor(id: string, title: string) {
        const node: FakeNode = { id, parentId: '0', index: this.root.children!.length, title, children: [] }
        this.root.children!.push(node)
        this.byId.set(id, node)
    }

    /** Renumbers a folder's children so `index` stays contiguous after a mutation, as the real API does. */
    private reindex(parent: FakeNode) {
        parent.children?.forEach((child, i) => (child.index = i))
    }

    private require(id: string): FakeNode {
        const node = this.byId.get(id)
        if (!node) throw new Error(`Can't find bookmark for id: ${id}`)
        return node
    }

    /** Every id at or below `node`, so a subtree removal can clear them all. */
    private idsUnder(node: FakeNode): string[] {
        return [node.id, ...(node.children ?? []).flatMap(child => this.idsUnder(child))]
    }

    private detach(node: FakeNode) {
        const parent = node.parentId ? this.byId.get(node.parentId) : undefined
        if (!parent?.children) return
        parent.children = parent.children.filter(child => child.id !== node.id)
        this.reindex(parent)
    }

    /** Arranges a starting tree under an existing node, bypassing the API. */
    seed(parentId: string, nodes: SeedNode[]): void {
        for (const spec of nodes) {
            const created = this.create({ parentId, title: spec.title, url: spec.url })
            if (spec.children) this.seed(created.id, spec.children)
        }
    }

    /** Id of the node reachable by walking `titles` down from the root. */
    idAt(...titles: string[]): string {
        let node = this.root
        for (const title of titles) {
            const next = node.children?.find(child => child.title === title)
            if (!next) throw new Error(`No node titled ${title} under ${node.title || '<root>'}`)
            node = next
        }
        return node.id
    }

    /** Assertion view of one anchor's contents, addressed by its title. */
    shapeOf(anchorTitle: string): TreeShape[] {
        const anchor = this.root.children?.find(child => child.title === anchorTitle)
        if (!anchor) throw new Error(`No anchor titled ${anchorTitle}`)
        return (anchor.children ?? []).map(child => this.toShape(child))
    }

    private toShape(node: FakeNode): TreeShape {
        return {
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
            ...(node.children ? { children: node.children.map(child => this.toShape(child)) } : {}),
        }
    }

    private create = (changes: { parentId?: string; title?: string; url?: string }): FakeNode => {
        const parent = this.require(changes.parentId ?? '1')
        const node: FakeNode = {
            id: String(this.seq++),
            parentId: parent.id,
            title: changes.title ?? '',
            // A node with no url is a folder, which is how the real API decides
            // too — and what `getBookmarkType` reads back out.
            ...(changes.url ? { url: changes.url } : { children: [] }),
        }

        parent.children ??= []
        parent.children.push(node)
        this.reindex(parent)
        this.byId.set(node.id, node)

        return node
    }

    /** The `browser.bookmarks` surface this fake implements. */
    readonly api = {
        getTree: async (): Promise<FakeNode[]> => [structuredClone(this.root)],

        get: async (id: string): Promise<FakeNode[]> => [structuredClone(this.require(id))],

        create: async (changes: { parentId?: string; title?: string; url?: string }): Promise<FakeNode> =>
            structuredClone(this.create(changes)),

        update: async (id: string, changes: { title?: string; url?: string }): Promise<FakeNode> => {
            const node = this.require(id)
            if (changes.title !== undefined) node.title = changes.title
            if (changes.url !== undefined) node.url = changes.url
            return structuredClone(node)
        },

        remove: async (id: string): Promise<void> => {
            const node = this.require(id)
            // Both browsers refuse this; `applyRemote` avoids it by switching on
            // node type, and a regression there should fail loudly here.
            if (node.children && node.children.length > 0) {
                throw new Error(`Can't remove non-empty folder (use recursive to force removal): ${id}`)
            }
            this.detach(node)
            this.byId.delete(id)
        },

        removeTree: async (id: string): Promise<void> => {
            const node = this.require(id)
            this.detach(node)
            for (const descendant of this.idsUnder(node)) this.byId.delete(descendant)
        },
    }
}

/**
 * Installs a fresh fake onto the shared `browser` object.
 *
 * `wxt/browser` resolves to the same `fakeBrowser` singleton the tests import,
 * so assigning the namespace here is what every module under test sees.
 */
export const installFakeBookmarks = (barTitle?: string, otherTitle?: string): FakeBookmarks => {
    const fake = new FakeBookmarks(barTitle, otherTitle)
    Object.assign(fakeBrowser, { bookmarks: fake.api })
    return fake
}
