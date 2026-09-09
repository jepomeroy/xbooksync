import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
    autoIcons: {
        baseIconPath: 'assets/icon.svg',
        developmentIndicator: false,
    },
    manifest: {
        // storage: persisted settings; bookmarks: read/write the bookmark tree;
        // alarms: schedule periodic syncs; notifications: alert the user when a
        // sync fails and the icon isn't pinned to the toolbar, where the badge
        // alone is easy to miss.
        //
        // No `identity`: the GitHub App device flow in `gh-app-auth.ts` is plain
        // `fetch` against github.com, so nothing here calls `browser.identity`.
        permissions: ['storage', 'bookmarks', 'alarms', 'notifications'],
        browser_specific_settings: {
            gecko: {
                id: 'developers@xbooksync.org',
                data_collection_permissions: {
                    required: ['bookmarksInfo'],
                    optional: [],
                },
            },
        },
        // Sync targets and their APIs.
        // add 'https://gitlab.com/*' later
        host_permissions: ['https://github.com/*', 'https://api.github.com/*'],
    },
})
