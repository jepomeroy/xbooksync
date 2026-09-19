# Store listing

The description published on the Chrome Web Store and on addons.mozilla.org. Both stores
carry the same text; edit it here first, then paste it into each dashboard so the two
never drift.

The setup steps are deliberately short — the full walkthrough lives in
[github-setup.md](github-setup.md), which the listing links to by absolute URL since
store descriptions can't resolve relative paths.

```text
XBookSync keeps your bookmarks in sync across Chrome and Firefox by writing them
to a storage target you control — a GitHub repository — instead of a browser
vendor's sync account.

Chrome sync and Firefox Sync each keep bookmarks locked inside their own account,
and neither talks to the other. XBookSync treats your bookmark tree as a plain
document that gets serialized to a destination of your choosing, so the same
bookmarks can be shared between browsers, versioned in Git, and backed up like
any other file you own.

WHAT IT DOES

• Syncs your full bookmark tree to a GitHub repository you pick
• Three-way merge — local and remote changes are both diffed against the last
  synced snapshot, so edits made in either browser survive a sync pass instead
  of one side clobbering the other
• Scheduled background sync at an interval you set, plus a "Sync now" button
• Conditional writes — a sync based on stale data is rejected rather than
  silently overwriting a change another browser just made
• Clear failure signals: a toolbar badge on a failed sync, and an optional
  desktop notification on Chrome
• Sign in with the XBookSync GitHub App using GitHub's device flow — you paste
  a code on github.com; the extension never asks for your password, and access
  is scoped to only the repositories you choose to install it on
• One codebase for Chrome (Manifest V3) and Firefox

GETTING STARTED

Setup takes about ten minutes, most of it on github.com. The full walkthrough —
creating the repository, installing the app, changing which repositories the
extension can see, and troubleshooting — is here:

https://github.com/jepomeroy/xbooksync/blob/main/docs/github-setup.md

The short version:

1. Export your bookmarks first, in every browser you plan to connect (see BACK
   UP FIRST below).
2. Turn off bookmark syncing in Chrome Sync and Firefox Sync (see IMPORTANT
   below).
3. Create a private GitHub repository to hold your bookmarks.
4. Install the XBookSync GitHub App on the account that owns it, and grant it
   access to that one repository. This is what decides which repositories the
   extension can see:
   https://github.com/apps/xbooksync/installations/new
5. Open the extension's options page, leave "GitHub Repo" selected as the
   storage type, and click Login. You'll be given a code to enter on github.com.
6. Choose your repository from the dropdown. Syncing begins on the next tick.

On your other browser, repeat steps 1, 2, 5 and 6 only — the app is already
installed — and point it at the same repository.

BACK UP FIRST

XBookSync writes to your real bookmarks: a sync pass creates, moves and deletes
them, and where two browsers disagree, the repository wins. Take an export
before you connect anything, in each browser, and keep it somewhere outside the
browser:

• Chrome: chrome://bookmarks → the ⋮ menu inside the manager → Export bookmarks
• Firefox: Ctrl+Shift+O → Import and Backup → Backup… (and/or Export Bookmarks
  to HTML…)

Firefox's Backup file restores your bookmarks exactly, through the same menu. An
HTML file imports as a separate folder alongside what you already have, rather
than replacing it. Switch syncing off in the extension's popup before restoring
either one.

IMPORTANT: TURN OFF YOUR BROWSER'S BOOKMARK SYNC

XBookSync replaces Chrome Sync and Firefox Sync for bookmarks. It cannot run
alongside them. On every browser where XBookSync is installed, switch off
bookmark syncing:

• Chrome: chrome://settings/syncSetup → Manage what you sync → turn off Bookmarks
• Firefox: Settings → Sync → uncheck Bookmarks

Your other synced data (passwords, history, tabs) is unaffected. If both syncs
run on the same bookmarks, each delivers bookmarks the other has already
delivered. Neither can tell the other's copy apart from a new bookmark, so
duplicates multiply with every sync. If you already see duplicates, turn the
browser's bookmark sync off first, then delete the extra copies in one browser.
XBookSync will carry the cleanup to the others.
```
