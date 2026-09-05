import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
    autoIcons: {
        baseIconPath: 'icon.svg',
    },
    manifest: {
        // storage: persisted settings; bookmarks: read/write the bookmark tree;
        // alarms: schedule periodic syncs; identity: GitHub device-flow auth;
        // notifications: alert the user when a sync fails and the icon isn't
        // pinned to the toolbar, where the badge alone is easy to miss.
        permissions: ['storage', 'bookmarks', 'alarms', 'identity', 'notifications'],
        browser_specific_settings: {
            gecko: {
                id: 'my-extension-dev@example.com',
            },
        },
        // Sync targets and their APIs.
        host_permissions: ['https://gitlab.com/*', 'https://github.com/*', 'https://api.github.com/*'],
    },
})
