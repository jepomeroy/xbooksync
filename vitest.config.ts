import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

/**
 * WxtVitest supplies everything the source needs to import cleanly under test:
 * the `@/` alias, the auto-imports (`browser`, `storage`, `defineBackground`),
 * `import.meta.env.BROWSER`, and a fake `browser` from `@webext-core/fake-browser`.
 *
 * happy-dom rather than node: `gh-utils` uses `atob`/`btoa`/`TextDecoder`, and
 * React component tests would need a DOM if they are ever added.
 */
export default defineConfig({
    test: {
        environment: 'happy-dom',
        mockReset: true,
        restoreMocks: true,
        // Deliberately not `unstubGlobals`: WXT's own setup installs the fake
        // `browser` with `vi.stubGlobal`, and clearing stubs between tests would
        // take it with them. The one global these tests stub is `fetch`, which
        // the adapter suites unstub themselves.
        setupFiles: ['./tests/setup.ts'],
    },
    plugins: [WxtVitest()],
})
