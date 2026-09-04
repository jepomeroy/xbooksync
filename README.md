# XBookSync

A browser extension that keeps your bookmarks in sync across Chrome and Firefox by
writing them to a storage target you control — starting with a GitHub repository —
instead of a vendor account.

> **Status: early development.** The sync engine works end to end against a **GitHub
> repo**: it reads the browser's bookmark tree, three-way merges it against the target,
> and writes the result back on a schedule. The other targets in the picker (Gist, GitLab
> repo, S3) render a "not implemented yet" panel. Sorting is stored but not yet applied,
> and sync results are not yet surfaced in the UI.

## Why

Chrome sync and Firefox Sync each keep bookmarks inside their own account silo, and
neither talks to the other. XBookSync treats the bookmark tree as a plain document that
gets serialized to a target of your choosing, so the same bookmarks can be shared
between browsers, versioned in Git, or backed up like any other file.

## Features

| Capability          | Notes                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Storage targets** | GitHub repo (working) · GitHub Gist · GitLab repo · S3 (all planned)                         |
| **Three-way merge** | Local and remote edits are diffed against the last-synced base, so both sides survive a pass |
| **Scheduled sync**  | Configurable interval via the `alarms` API, with the last sync time surfaced in the popup    |
| **Manual sync**     | Sync-now button in the popup                                                                 |
| **GitHub App auth** | OAuth device flow — no client secret, no redirect URI                                        |
| **Sorting**         | Stored preference; not yet applied on the sync path                                          |
| **Cross-browser**   | Built with [WXT](https://wxt.dev), targeting Chrome MV3 and Firefox MV2 from one source tree |

## Requirements

- [Bun](https://bun.sh) (the repo ships a `bun.lock`; npm or pnpm work too if you'd
  rather regenerate the lockfile)
- Chrome/Chromium or Firefox for development
- A GitHub account, to authorize the XBookSync GitHub App and install it on the
  repository you want to sync to

## Getting started

```sh
bun install        # runs `wxt prepare` via postinstall, generating .wxt/
bun run dev        # launches Chrome with the extension loaded and HMR enabled
bun run dev:firefox
```

`wxt dev` opens a temporary browser profile with the extension already installed, so
there's no manual "load unpacked" step during development.

### Connecting a repository

1. Open the extension's options page.
2. Under **Storage Type**, leave _GitHub Repo_ selected and click **Login**. This starts
   the device flow: a code to paste on github.com.
3. Authorizing yields a token but grants it no repository access — that comes from a
   separate step. Follow the install link to install the app on the account that owns
   your target repo.
4. Pick the repo from the dropdown. Sync begins on the next tick.

### Building

```sh
bun run build          # -> .output/chrome-mv3/
bun run build:firefox  # -> .output/firefox-mv2/
bun run zip            # packaged artifact for the Chrome Web Store
bun run zip:firefox    # packaged artifact for addons.mozilla.org
```

To load a production build by hand: `chrome://extensions` → enable _Developer mode_ →
_Load unpacked_ → pick `.output/chrome-mv3/`. On Firefox, use `about:debugging` →
_This Firefox_ → _Load Temporary Add-on_ and pick the `manifest.json` inside
`.output/firefox-mv2/`.

### Checks

```sh
bun run compile   # tsc --noEmit
bun run lint      # eslint .
bun run test      # vitest run
```

CI runs all four (compile, lint, test, both builds) on pull requests and on `main`.

## Project layout

```
entrypoints/
  background.ts            # MV3 service worker: the sync loop, alarms, message handling
  bookmarks/
    bookmarks.ts           # the Bookmarks tree: read from / write to browser.bookmarks
    sync.ts                # flatten, diffBase, applyRemote — the merge primitives
    storage.ts             # Storage singleton; owns the active adapter
    alarm.ts               # tick alarm lifecycle
    gh-repo.ts             # StorageAdapter for a GitHub repo (the working target)
    gh-gist.ts             # StorageAdapter for a Gist (signatures only, throws)
    gh-app-auth.ts         # GitHub App device flow
    gh-utils.ts            # shared REST helpers: base64, pagination, repo discovery
    nil-adapter.ts         # no-op adapter used before the real one resolves
  shared/
    types.ts               # enums, the StorageAdapter contract, message types
    localsettings.ts       # typed wrappers around WXT's extension-local storage
    syncutils.ts           # last-synced parsing / formatting
    components/toggle.tsx  # the switch used by the popup and options page
  popup/
    Popup.tsx              # sync toggle, last-synced time, sync-now, options link
  options/
    Option.tsx             # settings shell
    components/            # storage, sort, sync, GitHub, and placeholder panels
tests/                     # vitest suites, with a fake browser.bookmarks
assets/                    # bundled assets (app logo)
public/icon/               # extension icons, generated by @wxt-dev/auto-icons
wxt.config.ts              # WXT config: permissions and host permissions
```

WXT auto-imports common APIs (`browser`, `storage`, `defineBackground`, the React
hooks), which is why you'll see them used without an explicit import. The generated
declarations live in `.wxt/` and are refreshed by `wxt prepare`.

### Permissions

Declared in `wxt.config.ts`:

| Permission  | Why                                      |
| ----------- | ---------------------------------------- |
| `storage`   | Persisted settings and the base snapshot |
| `bookmarks` | Read and write the bookmark tree         |
| `alarms`    | Schedule periodic syncs                  |
| `identity`  | GitHub device-flow auth                  |

Plus host permissions for `github.com`, `api.github.com`, and `gitlab.com`.

## How a sync works

Bookmark node ids are per-profile, so two browsers holding the same bookmark agree on
nothing but where it sits and what it points at. `flatten` therefore discards ids and
keys each node on its identity — position plus url or title.

Each tick compares three trees: the browser's current tree, the target's, and the
**base** — a snapshot of what both agreed on at the end of the last sync. Diffing each
side against the base is what separates "the other browser added this" from "this was
deleted here":

| Local | Remote | Outcome                                                            |
| ----- | ------ | ------------------------------------------------------------------ |
| —     | —      | Nothing written, and nothing recorded — the base stays put         |
| ✓     | —      | Push local, conditional on the revision just read                  |
| —     | ✓      | Apply the remote tree wholesale                                    |
| ✓     | ✓      | Apply the remote diff into the local tree, re-read, push the merge |

Every branch that writes ends by recording the new version token, the timestamp, and a
fresh base. Writes are conditional on the revision they were based on, so a concurrent
write from another browser is rejected rather than silently overwritten. An adapter that
throws aborts the pass with the version and base untouched, so the next tick retries
from the same state.

> The both-changed branch resolves conflicts in the remote's favour: a node edited
> locally and removed remotely is removed, and a node edited on both sides takes the
> remote title.

## Settings

All settings live in extension-local storage and are defined once in
`entrypoints/shared/localsettings.ts`. Defaults are seeded on install, guarded by an
`initialized` flag so an extension update never resets settings you have since changed.

| Key                      | Type             | Default       | Meaning                                        |
| ------------------------ | ---------------- | ------------- | ---------------------------------------------- |
| `local:storage`          | `StorageBackend` | `GitHub Repo` | Which storage target to sync with              |
| `local:sortBookmarks`    | `boolean`        | `false`       | Sort bookmarks before writing them out [^1]    |
| `local:sortOrder`        | `SortOrder`      | `Ascending`   | Sort direction, when sorting is on [^1]        |
| `local:syncEnabled`      | `boolean`        | `true`        | Master switch for syncing                      |
| `local:syncrate`         | `number`         | `900`         | Seconds between automatic syncs                |
| `local:lastSyncDateTime` | `string`         | Unix epoch    | ISO timestamp of the last successful sync      |
| `local:lastSyncValue`    | `string`         | `''`          | Opaque revision token the target last reported |
| `local:baseBookmarks`    | `object \| null` | `null`        | Base snapshot the next diff compares against   |

GitHub credentials are keyed separately, since they are per-target rather than global:

| Key                 | Type     | Default | Meaning                                      |
| ------------------- | -------- | ------- | -------------------------------------------- |
| `local:ghAuthToken` | `string` | `''`    | User-to-server token; empty means signed out |
| `local:ghRepo`      | `string` | `''`    | Target repo as `owner/name`                  |
| `local:ghGist`      | `string` | `''`    | Gist id, for the unimplemented Gist backend  |

[^1]: Stored and editable in the options page, but not yet read by the sync path.

Under `import.meta.env.DEV` only, `setDefaultSettings` also seeds the GitHub keys from
`debugGitHubSettings`, so an unpacked build can sync without going through the device
flow first. A release build never writes them. **Never commit a token in that block** —
it would be bundled into every artifact `bun run zip` produces.

## Adding a storage target

Each target implements `StorageAdapter` from `entrypoints/shared/types.ts`:

```ts
type StorageAdapter = {
    readonly providerId: string
    read(knownVersion: string): Promise<ReadData>
    write(content: string, previousBlobVersion?: string): Promise<string>
    registerWatchers(callback: SyncCallback): void
    unregisterWatchers(): void
}
```

Version tokens are deliberately opaque strings — an ETag, commit SHA, MD5, or content
hash, whatever the target has. An adapter only ever compares tokens it issued itself.
`read` takes the last known version so a target that supports conditional reads can
answer "unchanged" without transferring the body; `write` takes the version the write is
based on so a concurrent update is rejected. `registerWatchers` exists because an
adapter's credentials and location are themselves settings: changing them rebuilds the
adapter.

To add a target: implement the interface in its own file under `entrypoints/bookmarks/`,
add a variant to `StorageBackend`, add a case to `getStorageBackend`, add a case to the
switch in `Storage.handleStorageChange`, and add an `<option>` plus a settings panel in
`entrypoints/options/components/storage.tsx`.

## Code style

Prettier (4-space indent, no semicolons, single quotes, 120 columns) and ESLint with
`typescript-eslint` and `eslint-plugin-react-hooks`. Unused identifiers prefixed with `_`
are allowed, which is how the not-yet-implemented adapter methods stay lint clean.

## Help & issues

- [Setup and usage](https://github.com/jepomeroy/xbooksync/blob/main/README.md)
- [Bug reports and feature requests](https://github.com/jepomeroy/xbooksync/issues)
