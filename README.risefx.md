# RISEFX fork of `zulip/zulip-desktop`

RISEFX's build of the Zulip desktop client. The fork exists for two reasons:

1. To let `riselink:` URLs open directly in their associated RISE application,
   instead of being bounced through an interstitial page.
2. To produce installers, which upstream builds only for its own signed releases.

For upstream's own documentation, see [`README.md`](README.md).

## Branches

| Branch        | Purpose                                                    |
| ------------- | ---------------------------------------------------------- |
| `main-risefx` | **The fork.** Upstream `main` + the three commits below.    |
| `main`        | Mirror of upstream `main`. Not used for releases.           |

`main-risefx` tracks upstream **`main`**, not a release tag. Its current base is
`228ac2b` (`workflows: Enable CodeQL scanning.`), which is 5 commits past
upstream's `v5.12.4` release commit. See [Known issues](#known-issues).

## Tags

Format: `v<version>-risefx`, e.g. `v5.12.4-risefx`, where `<version>` is
`package.json`'s `version` field.

Pushing any tag matching `v*` to a commit that contains
`.github/workflows/build.yml` — in practice, any commit on `main-risefx` — builds
seven installers and publishes a GitHub Release with them attached.

Note there is no numeric patch revision in this scheme, unlike the server fork's
`-risefx<P>`. Re-releasing at the same upstream version requires inventing a tag.

## What this fork changes

Three commits on top of upstream `main`.

### 1. Configurable link protocols — `c8a53a6`

A **cherry-pick of an unmerged upstream pull request** (`Fixes #1284`, by Jonas
Sorgenfrei), not RISEFX-authored code.

- [`app/common/config-schemata.ts`](app/common/config-schemata.ts) — adds the
  `whitelistedProtocols: string[]` config key.
- [`app/common/config-util.ts`](app/common/config-util.ts) — adds
  `getConfigItemWithoutSettingDefault()`, which reads a key without persisting the
  default back into `settings.json`, so future default changes still reach
  already-installed clients.
- [`app/common/link-util.ts`](app/common/link-util.ts) — `openBrowser()` now checks
  the configured list instead of a hardcoded `["http:", "https:", "mailto:"]`.
- [`docs/howto/customize-link-protocols.md`](docs/howto/customize-link-protocols.md) — user documentation.

Default list: `http:`, `https:`, `mailto:`, `tel:`, `sip:`. Anything else is
opened indirectly, via a generated local HTML file in the default browser.

### Making `riselink:` work

**This is the whole point of the fork, and it does not work out of the box.**
`riselink:` is *not* in the default list, so a fresh install still bounces
`riselink:` URLs through the interstitial page. Each client must have
`whitelistedProtocols` set in `settings.json`:

```jsonc
{
  "whitelistedProtocols": [
    "http:",
    "https:",
    "mailto:",
    "tel:",
    "sip:",
    "riselink:"
  ]
}
```

- The path is `<userData>/config/settings.json` (`app/common/config-util.ts:109`),
  and `userData` is `<appData>/Zulip` since `package.json` sets
  `productName: "Zulip"`. So:
  `%APPDATA%\Zulip\config\settings.json` on Windows,
  `~/.config/Zulip/config/settings.json` on Linux,
  `~/Library/Application Support/Zulip/config/settings.json` on macOS.
- **Every protocol needs its trailing colon** (`"riselink:"`, not `"riselink"`).
  The check compares against `URL.protocol`, which includes it.
- **The list is read once at module load.** `link-util.ts` evaluates
  `whitelistedProtocols` as a module-level `const`, so editing `settings.json`
  requires restarting the app.
- Setting the key **replaces** the defaults rather than extending them. Re-list
  every protocol you want to keep.

This pairs with the server-side `riselink` entry in `html_safelisted_schemes` —
see [`RISEFX/zulip`](https://github.com/RISEFX/zulip). The server makes the link
render; this makes it open. Both are required.

### 2. Installer build workflow — `e468766`

Adds [`.github/workflows/build.yml`](.github/workflows/build.yml).

### 3. arm64, deb, rpm, and tag releases — `20a7c99`

Extends the matrix and adds the release job.

## How the build works

[`.github/workflows/build.yml`](.github/workflows/build.yml) runs on `v*` tags and
on `workflow_dispatch`. Seven matrix jobs:

| Job                    | Runner            | Output      |
| ---------------------- | ----------------- | ----------- |
| `windows-x64-msi`      | `windows-latest`  | `.msi`      |
| `windows-arm64-msi`    | `windows-latest`  | `.msi`      |
| `linux-x86_64-appimage`| `ubuntu-latest`   | `.AppImage` |
| `linux-x86_64-deb`     | `ubuntu-latest`   | `.deb`      |
| `linux-x86_64-rpm`     | `ubuntu-latest`   | `.rpm`      |
| `macos-x64-dmg`        | `macos-15-intel`  | `.dmg`      |
| `macos-arm64-dmg`      | `macos-latest`    | `.dmg`      |

One `.deb` covers Debian and Ubuntu; one `.rpm` covers the RHEL family including
AlmaLinux 9/10. The Windows arm64 app ships inside an x64 MSI wrapper —
electron-builder's WiX has no arm64 installer support — which installs correctly
on Windows on ARM.

Before building, the workflow rewrites `package.json` in place to strip two things
the fork cannot use:

- `build.win.azureSignOptions` — upstream's Azure Trusted Signing credentials.
- `build.deb.fpm` — upstream's hook installing the **official Zulip apt
  repository**. Left in place, `apt upgrade` on a user's machine would silently
  replace this fork's build with upstream's.

`CSC_IDENTITY_AUTO_DISCOVERY: "false"` stops electron-builder searching the macOS
keychain for a signing identity.

**All installers are unsigned.** Windows SmartScreen and macOS Gatekeeper will
warn on first run, and macOS users need to right-click → Open or clear the
quarantine attribute. Plan the rollout accordingly.

On a tag, the `release` job downloads every artifact and runs
`gh release create "$GITHUB_REF_NAME" --generate-notes installers/*`.

Note that installer *filenames* come from `package.json`'s `version`, not from the
tag: tag `v5.12.4-risefx` produces `Zulip-5.12.4.msi`, with no `-risefx` marker.

## Updating to a new upstream release

### One-time setup

This clone has only `origin` (`RISEFX/zulip-desktop`). Add upstream:

```bash
cd ~/workspace/repos/risefx/zulip-desktop
git remote add upstream https://github.com/zulip/zulip-desktop.git
git fetch upstream --tags
```

### 1. Refresh the mirror

```bash
git fetch upstream --tags
git switch main
git merge --ff-only upstream/main
git push origin main
```

### 2. Rebase the fork

Current practice rebases onto upstream `main`:

```bash
git switch main-risefx
git rebase upstream/main
```

To rebase onto a specific upstream release instead — which is what the
`v<version>-risefx` tag name implies, and is recommended:

```bash
OLD_BASE=$(git merge-base main-risefx upstream/main)
git switch main-risefx
git rebase --onto v5.13.0 "$OLD_BASE"
```

### 3. Verify the rebase

```bash
# Expect exactly 4 commits: the three below, plus this README.
git log --oneline upstream/main..main-risefx
```

**Watch for the cherry-pick disappearing.** `c8a53a6` is an unmerged upstream PR.
If upstream merges it, `git rebase` will usually drop it as already-applied — that
is the desired outcome, but confirm the functionality survived rather than assuming:

```bash
git grep -n whitelistedProtocols -- app/common/
```

If it is gone from both the branch *and* upstream, the rebase silently dropped a
feature. Reinstate it before tagging.

### 4. Check the version and tag

`package.json`'s `version` drives installer filenames, so confirm it matches the
upstream release you rebased onto:

```bash
grep -m1 '"version"' package.json
```

```bash
git tag v5.13.0-risefx
git push origin main-risefx
git push origin v5.13.0-risefx
```

### 5. Watch the build

```bash
gh run watch --repo RISEFX/zulip-desktop
```

On success, seven installers are attached to a new GitHub Release. Download one
and confirm `settings.json`'s `whitelistedProtocols` still governs `riselink:`
before rolling out.

## Known issues

These are recorded, not fixed.

- **Tags do not correspond to upstream releases.** `v5.12.4-risefx` was cut from
  upstream `main` 5 commits *past* the `v5.12.4` release commit, while
  `package.json` still reads `5.12.4`. The installers claim to be 5.12.4 but are
  not built from `v5.12.4`. Rebasing onto release tags (step 2 above) fixes this.
- **No patch revision in the tag scheme.** The server fork uses `-risefx<P>`;
  here, re-releasing at the same upstream version has no obvious tag.
- **`riselink:` requires per-client configuration.** There is no packaged default
  and no deployment mechanism for `settings.json` in this repo. Absent one, the
  fork's headline feature is off for every user until someone edits a JSON file on
  their machine. Consider changing the default list in `link-util.ts`, which would
  make the fork self-contained.
- **Installers are unsigned**, as described above.
