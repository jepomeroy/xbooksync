# Setting up GitHub as a sync target

XBookSync stores your bookmarks as a single `bookmarks.json` file in a repository you
own. This guide walks the whole path: creating the GitHub account, creating a private
repo for the bookmarks, installing the XBookSync GitHub App, granting that app access to
the repo, and picking the repo in the extension.

Budget about ten minutes. Most of it happens on github.com; only the last two steps are
in the extension.

**Contents**

- [How access works](#how-access-works)
- [1. Create a GitHub account](#1-create-a-github-account)
- [2. Create a private repository](#2-create-a-private-repository)
- [3. Install the XBookSync GitHub App](#3-install-the-xbooksync-github-app)
- [4. Approve the repository](#4-approve-the-repository)
- [5. Sign in from the extension](#5-sign-in-from-the-extension)
- [6. Select the repo in the extension](#6-select-the-repo-in-the-extension)
- [Changing which repos are approved later](#changing-which-repos-are-approved-later)
- [Connecting a second browser](#connecting-a-second-browser)
- [Disconnecting](#disconnecting)
- [Troubleshooting](#troubleshooting)
- [Appendix: using your own GitHub App](#appendix-using-your-own-github-app)

## How access works

Two separate things have to be true before the extension can see a repository, and
having one without the other is a normal intermediate state rather than a failure:

| Thing                   | Where it happens                      | What it gives you                                    |
| ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| **An app installation** | github.com, on your account           | Which repositories the extension is allowed to reach |
| **A user token**        | The extension's **Login With GitHub** | Proof of who you are                                 |

The token comes from the OAuth _device flow_ — you paste a short code on github.com, and
no password or personal access token is ever typed into the extension. On its own that
token reaches nothing. The repo dropdown in the options page is built from the
repositories the **installation** grants, which is why a login with no installation
behind it lands on an empty list.

That grant list is what this guide calls the _approved repos_. You choose it when you
install the app, and can change it at any time from your GitHub settings. Doing the
install first, as ordered below, means the login in step 5 comes back connected in one
pass.

## 1. Create a GitHub account

Skip to [step 2](#2-create-a-private-repository) if you already have one.

1. Go to [github.com/signup](https://github.com/signup) and follow the prompts for an
   email address, password, and username.
2. Verify the email address GitHub sends you. An unverified account cannot create repos.
3. The **Free** plan is enough — it includes unlimited private repositories.

Turning on two-factor authentication (**Settings → Password and authentication**) is
worth doing here. It does not change anything about how XBookSync connects; the device
flow simply picks up whatever 2FA you have configured.

## 2. Create a private repository

The bookmark file is small and boring, but it is a complete map of everything you have
ever bookmarked. Make the repo **private**.

1. Go to [github.com/new](https://github.com/new).
2. **Repository name** — anything you like; `bookmarks` or `xbooksync-data` are obvious
   picks. The extension never assumes a name.
3. **Visibility** — choose **Private**.
4. **Initialize this repository with** — tick **Add a README file**. This gives the repo a
   default branch, which is the branch XBookSync commits to. (An empty repo also works,
   but then the first sync is what creates the branch, and the repo looks broken on
   github.com until it runs.)
5. Click **Create repository**.

Leave the repo otherwise untouched. XBookSync writes `bookmarks.json` at the repo root on
its first successful sync, one commit per sync that changes something, with a message
like `XBookSync: chrome browser updated bookmarks`.

A repo can hold other files alongside the bookmarks, and a dedicated repo is not
required — but a repo you also push code to will interleave your bookmark commits with
your work, so a separate one is usually tidier.

## 3. Install the XBookSync GitHub App

Installing is what attaches the app to your account and hands it a set of repositories.

1. Open
   [github.com/apps/xbooksync/installations/new](https://github.com/apps/xbooksync/installations/new).
   (The extension links to this same page if you reach step 5 without having installed
   anything.)
2. Pick the account to install on — your personal account if the repo from step 2 is
   yours, or the organization that owns it. An org may require an owner to approve the
   request; until they do, the repo will not appear in the extension.

Then choose what it can reach, which is step 4.

## 4. Approve the repository

This is the screen that decides what shows up in the extension's repo dropdown.

1. Choose **Only select repositories**. Avoid **All repositories** — the app would then
   get read _and write_ access to every repo on the account, present and future, when it
   needs exactly one.
2. In the **Select repositories** dropdown, pick the repo you created in step 2.
3. Click **Install**. GitHub may ask you to confirm with your password or 2FA.

The app requests these permissions, and GitHub lists them on the same screen:

| Permission   | Level          | Why                                                        |
| ------------ | -------------- | ---------------------------------------------------------- |
| **Contents** | Read and write | Read and commit `bookmarks.json` in the approved repos     |
| **Metadata** | Read-only      | Mandatory for every GitHub App; lists the repos it can see |

The grant is scoped to the repositories you selected. Repos you did not select stay
invisible to the app — it cannot enumerate them, read them, or write to them.

## 5. Sign in from the extension

1. Open the extension's options page. In Chrome: right-click the XBookSync toolbar icon →
   **Options**, or `chrome://extensions` → XBookSync → **Extension options**. In Firefox:
   `about:addons` → XBookSync → **Preferences**.
2. Under **Storage Type**, leave **GitHub Repo** selected.
3. Click **Login With GitHub**.
4. The extension shows a code — `ABCD-1234` — and opens
   [github.com/login/device](https://github.com/login/device) in a new tab. Type or paste
   the code there and click **Continue**.
5. Review the authorization screen and click **Authorize**.

The code expires after about fifteen minutes. If it does, or if you close the tab before
finishing, click **Login With GitHub** again for a fresh one.

Back in the options page the status line should read **"Connected to GitHub."** with a
repo dropdown underneath. If it instead says **"Connected, but the app isn't installed on
any account yet"**, the token works but no installation backs it — either steps 3 and 4
were skipped, or the app was installed on a different account than the one you just
authorized with. Click **Install on GitHub** to go back to step 3; the page rechecks on
its own when you return to it, and **I've installed it** forces the recheck.

## 6. Select the repo in the extension

1. The **GitHub Repo** dropdown lists every approved repo as `owner/name`.
2. Select the repo you created.
3. That's it. Syncing starts on the next tick — by default every 15 minutes — or
   immediately if you open the popup and click **Sync now**.

The popup shows the last successful sync time. After the first pass, refresh the repo on
github.com and you should see `bookmarks.json` and its commit.

## Changing which repos are approved later

The dropdown only ever lists repos the installation grants, so adding a repo to that
grant is how you make it selectable. Nothing needs to change in the extension.

1. Go to
   [github.com/settings/installations](https://github.com/settings/installations)
   (**Settings → Applications → Installed GitHub Apps**). For an organization, it is
   **Settings → GitHub Apps** under that org.
2. Click **Configure** next to **XBookSync**.
3. Under **Repository access**, add or remove repositories, then click **Save**.
4. Back in the extension's options page, the list refreshes when the page regains focus.
   A full reload of the options page always picks up the change.

Removing the currently selected repo from the grant does not clear the selection — the
next sync fails with a permissions error instead. Pick a different repo in the dropdown
after narrowing the grant.

## Connecting a second browser

The point of a shared repo is that two browsers sync through it, so repeat steps 5 and 6
in the other browser:

- **Step 5 (login)** has to be done again — the token is stored per browser profile and
  is never shared.
- **Steps 3 and 4 (install and approve)** do not. The app is already installed on your
  account, so the second browser's login lands on **"Connected to GitHub."** directly.
- **Step 6 (select the repo)** — pick the same repo. Both browsers must point at the same
  `owner/name` or they are simply syncing to different files.

The first sync in the second browser merges its local bookmarks with what the repo
already holds rather than replacing either side; see
[How a sync works](../README.md#how-a-sync-works) for what happens when both sides
changed.

## Disconnecting

**Revoke Token** in the options page is local only. It clears the stored token, the repo
selection, and the sync state in that browser. The authorization and the app installation
both remain on GitHub, so logging back in needs no re-authorization — convenient on your
own machine, not enough on someone else's.

To sever it properly on GitHub's side:

- **Uninstall the app** — [github.com/settings/installations](https://github.com/settings/installations)
  → **Configure** next to XBookSync → **Uninstall**. This revokes repository access for
  every browser at once.
- **Revoke the authorization** — [github.com/settings/applications](https://github.com/settings/applications)
  → **Authorized GitHub Apps** → XBookSync → **Revoke**. This invalidates the tokens
  themselves.

Neither touches the repo or its history. Delete the repository separately if you want the
bookmark data gone.

## Troubleshooting

**The repo dropdown is empty, or stuck on "Loading repos…".**
The token reaches no repositories. Either the app isn't installed (the install prompt
appears in that case) or the installation grants zero repos. Check
[step 4](#4-approve-the-repository).

**"Connected, but the app isn't installed on any account yet" even though I installed it.**
Most often the app was installed on a different account than the one that authorized in
step 5 — a personal account versus an org. Check which account the installation landed on
at [github.com/settings/installations](https://github.com/settings/installations). On an
org, also check whether an owner still has to approve the install request.

**The repo I want isn't in the dropdown.**
It isn't in the installation's repository access list. Add it per
[Changing which repos are approved later](#changing-which-repos-are-approved-later), then
reload the options page.

**Syncs fail with an authorization error.**
The token expired or was revoked. Click **Revoke Token**, then **Login With GitHub** to
run the device flow again. The app installation and your repo selection survive this.

**Syncs fail after I deleted `bookmarks.json`.**
Deliberate: the extension refuses to treat a file that vanished as "every bookmark was
deleted" and sync that back into the browser. Restore the file — `git revert` of the
deleting commit is the safest route — or, if you meant to start over, revoke the token
and reconnect, which clears the stored sync state along with it.

**The device code expired.**
Click **Login With GitHub** again. Codes last about fifteen minutes and there is no way
to extend one.

## Appendix: using your own GitHub App

The published **XBookSync** app is what the release builds authenticate against, and
nothing below is needed to use the extension normally. It matters if you are working on a
fork, or would rather not depend on an app you don't control.

Create the app at
[github.com/settings/apps/new](https://github.com/settings/apps/new) with:

- **GitHub App name** — anything unique; its URL slug is what you need below.
- **Homepage URL** — any valid URL; your fork's repo is fine.
- **Callback URL** — leave empty. The device flow doesn't use one.
- **Enable Device Flow** — **tick this.** Nothing works without it; authorization fails
  outright rather than degrading.
- **Webhook → Active** — untick. The extension polls; it has nothing to receive a webhook
  on.
- **Repository permissions → Contents** — **Read and write**. Metadata read-only is added
  automatically. Leave every other permission at _No access_.
- **Where can this GitHub App be installed?** — _Any account_ if others will use your
  fork, _Only on this account_ otherwise.

Then point the extension at it, in
[`entrypoints/bookmarks/gh-app-auth.ts`](../entrypoints/bookmarks/gh-app-auth.ts):

```ts
const CLIENT_ID = 'Iv23li...' // App settings → "Client ID"
const APP_SLUG = 'your-app' // the github.com/apps/<slug> segment
```

`CLIENT_ID` drives the device flow; `APP_SLUG` builds the install link the options page
opens. Both are public identifiers — a client ID is not a secret, and the device flow
needs no client secret, which is exactly why it is used here. Do not generate or ship a
private key: the extension never acts as the app itself, only as you.

Rebuild (`bun run build`), reload the extension, and work through steps 3 to 6 against
your own app.
