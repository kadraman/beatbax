# BeatBax Desktop — Release QA Checklist

Reusable checklist for every `desktop-v*` GitHub Release. Keep this file blank in git; fill results locally or paste a completed copy into the release PR / issue when signing off.

**Result values:** `Pass` | `Fail` | `Skip` | `_` (not run)

## How to use

1. Fill **Release under test**.
2. Run **Automated validation** on the primary platform and confirm CI green on `main`.
3. Complete **Manual validation** and **Installer / integrity** spot-checks.
4. Note any deferred macOS/Linux interactive checks.
5. Complete **Sign-off** before tagging (or immediately after a successful package dry-run).

Canonical release steps: [docs/releasing.md](../releasing.md).

## Release under test

| Field | Value |
|-------|-------|
| Version | _(e.g. 0.2.0)_ |
| Tag | _(e.g. desktop-v0.2.0)_ |
| Date | |
| Tester | |
| Primary platform | _(e.g. Windows 10/11)_ |

## Automated validation

| Check | Platform | Result | Notes |
|-------|----------|--------|-------|
| `npm run desktop:test` | Primary | | |
| `npm run desktop:build` | Primary | | |
| Playwright e2e (`npm run desktop:test` / CI e2e) | Primary | | |
| `npm run desktop:dist` (optional local package) | Primary | | |
| Desktop CI validate job | Linux (ubuntu-latest) | | Via `desktop-build.yaml` on `main` |
| Desktop CI package matrix | ubuntu / windows / macos | | After `desktop-v*` tag (or manual workflow run) |

### E2E coverage reference (Playwright)

Confirm these remain covered (or note gaps):

- Editor shell renders (smoke)
- `.bax` file passed on startup loads into Monaco
- JSON export completes without console errors
- Play/stop on starter song without console errors
- Loop and live transport controls wired
- Save (e.g. Ctrl/Cmd+S) writes edits back to the opened file
- Open `.bax` reloads in the editor when another process writes the file (clean buffer)

## Manual validation (primary platform)

| Area | Result | Notes |
|------|--------|-------|
| App launches from `npm run desktop:dev` | | |
| Installed / packaged app launches | | NSIS, portable, `.dmg`, AppImage, or `.deb` as applicable |
| Native Open / Save / Save As | | |
| Session restore (`LAST_DOCUMENT_PATH`) | | |
| File → Open Recent | | |
| IDE panels: Settings, Copilot, Help, Output/Problems | | Native React desktop shell |
| IDE panels: channel mixer, song visualizer, pattern grid | | |
| Autosave toggle / debounce and save-state feedback | | |
| External `.bax` reload (edit in another editor, BeatBax picks it up) | | Settings → Editor: When the open file changes on disk |
| Toolbar / transport click and hover reliability | | Unmute, clear solo, performance mode, visualizer |
| Shared keyboard shortcuts (menus, toolbar, Help, editor) | | Include macOS label check when on macOS |
| Copilot smoke (panel, Settings AI, Ask prompt) | | See [copilot-test-scenarios.md](../copilot-test-scenarios.md) |
| New Song Wizard (chip cards, metadata, audible preview) | | |
| Export smoke: JSON and WAV | | |
| Export smoke: UGE and/or Arkos (`.aks`/`.aki`) when relevant | | Skip if out of scope for this cut |
| Example songs path | | macOS: `~/Documents/BeatBax/Examples`; Win/Linux: File → Examples / `resources/songs` |
| `.bax` startup from argv / file association | | |
| Theme sync / Settings toolbar shortcut | | |

## Installer / integrity spot-checks

Artifact names use `BeatBax-<version>-…` from `@beatbax/desktop` `package.json`.

| Check | Result | Notes |
|-------|--------|-------|
| Windows: `BeatBax-<ver>-setup.exe` (NSIS) | | SmartScreen warning expected if unsigned |
| Windows: `BeatBax-<ver>-win-x64.exe` (portable) | | |
| macOS: `BeatBax-<ver>.dmg` and `BeatBax-<ver>-mac-arm64.zip` | | Expect Developer ID + notarized on GitHub Release CI when secrets present |
| Linux: `BeatBax-<ver>.AppImage` and `BeatBax-<ver>-linux-amd64.deb` | | |
| `SHA256SUMS` present on GitHub Release | | Always expected from current CI |
| Optional GPG: `SHA256SUMS.asc`, `beatbax-release.asc` | | When GPG secrets configured |
| Bundled `README.txt` / `RELEASE-NOTES.txt` look correct for this version | | Generated at package time |

Verify downloads: [desktop-release-checksums.md](../desktop-release-checksums.md). Windows SmartScreen: [desktop-windows-signing-setup.md](../desktop-windows-signing-setup.md).

## Cross-platform notes (reference)

macOS and Linux installers come from the `desktop-build.yaml` package matrix on release tags. Interactive QA on non-primary platforms may be deferred to post-release spot checks; automated e2e runs on Linux in CI.

| Area | macOS | Linux |
|------|-------|-------|
| Installer artifact | `.dmg` + `.zip` via CI | `.AppImage` + `.deb` via CI |
| System menu | Native menu via `menu.ts` (no in-window duplicate) | Custom title-bar menu |
| Dock name/icon in dev | `app.setName('BeatBax')` + `dock.setIcon` | N/A |
| Code signing / notarization | Release CI with secrets: Developer ID + notarized. Local without secrets: unsigned | No OS Gatekeeper. `SHA256SUMS` always; with GPG: signed `.deb`, `SHA256SUMS.asc`, `beatbax-release.asc` |
| Example songs (File → Open) | Packaged apps copy to `~/Documents/BeatBax/Examples` on first launch | `resources/songs` next to the app |
| `.bax` file association icon | `file-bax.icns` via electron-builder | Configured |

## Standing known limitations

Update only when product policy changes:

- **Windows** installers are intentionally unsigned. SmartScreen may warn — **More info → Run anyway**. Prefer [itch.io](https://kadraman.itch.io/beatbax) or [GitHub Releases](https://github.com/kadraman/beatbax/releases). See [desktop-windows-signing-setup.md](../desktop-windows-signing-setup.md).
- **macOS** GitHub Release `.dmg`/`.zip` are Developer ID signed and notarized when CI secrets are present.
- **Linux** has no OS-level installer gate; verify with `SHA256SUMS` (and GPG when published).
- **Auto-update** (`electron-updater`) is not integrated — users re-download for each release.
- Release packaging and tagging: [docs/releasing.md](../releasing.md).

## Sign-off

| Field | Value |
|-------|-------|
| Cleared for tag | `desktop-v______` |
| Signed off by | |
| Date | |
| Deferred checks | _(e.g. macOS/Linux interactive QA)_ |
| Blockers | _(none / list)_ |

Desktop `v______` is cleared for GitHub Release when automated suites pass, packaging succeeds for required platforms, and primary-platform manual checks above are Pass or explicitly Skip with rationale.
