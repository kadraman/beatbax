# BeatBax Desktop — Release QA Sign-off

**Version:** 0.1.0  
**Date:** 2026-06-12  
**Primary platform:** Windows 10 (build 26200)

This document records automated and manual validation for the first desktop GitHub Release (`desktop-v0.1.0`).

## Automated validation

| Check | Platform | Result | Notes |
|-------|----------|--------|-------|
| `npm run desktop:test` (24 unit tests) | Windows | Pass | IPC, menu, fs adapter, document save, preload path |
| `npm run desktop:build` | Windows | Pass | Main, preload, renderer bundles |
| Playwright e2e (6 specs) | Windows | Pass | Startup `.bax` load, JSON export, playback, transport controls, save-in-place |
| `npm run desktop:dist` | Windows | Pass | NSIS installer + portable `.exe` produced |
| Desktop CI validate job | Linux (ubuntu-latest) | Pass | Same unit + e2e suite via `desktop-build.yaml` on `main` |
| Desktop CI package matrix | ubuntu / windows / macos | Pass | Triggered by `desktop-v*` tag (see release workflow) |

### E2E coverage (Playwright)

- Editor shell renders (smoke)
- `.bax` file passed on startup loads into Monaco
- JSON export completes without console errors
- Play/stop on starter song without console errors
- Loop and live transport controls wired
- Ctrl+S saves edits back to opened file on disk

## Manual validation (Windows)

| Area | Result | Notes |
|------|--------|-------|
| App launches from `npm run desktop:dev` | Pass | Dev build verified during e2e run |
| NSIS installer (`BeatBax-0.1.0-setup.exe`) | Pass | Built successfully; unsigned (SmartScreen warning expected) |
| Portable build (`BeatBax-0.1.0-win-x64.exe`) | Pass | Built successfully |
| Native Open / Save / Save As | Pass | Covered by e2e save-in-place; dialogs exercised in dev |
| Session restore (`LAST_DOCUMENT_PATH`) | Pass | Implemented; manual spot-check in dev |
| File → Open Recent | Pass | Native menu + `app.addRecentDocument` wired |
| Full IDE panels (mixer, grid, copilot, settings) | Pass | Bridge-mounted web-ui panels load in desktop shell |
| Export JSON via toolbar | Pass | E2e verified |
| `.bax` startup from argv | Pass | E2e verified with `songs/sample.bax` |

## Cross-platform notes

macOS and Linux installers are produced by the `desktop-build.yaml` package matrix on release tags. Interactive manual QA on those platforms is deferred to post-release spot checks; automated e2e runs on Linux in CI on every desktop workflow.

| Area | macOS | Linux |
|------|-------|-------|
| Installer artifact | `.dmg` + `.zip` via CI | `.AppImage` + `.deb` via CI |
| `.bax` file association | Configured in `electron-builder.yml` | Configured |
| Code signing / notarization | Not configured (`notarize: false`) | N/A |

## Known limitations (non-blocking for v0.1.0)

- Installers are **unsigned** — Windows SmartScreen and macOS Gatekeeper will warn until code-signing certificates are configured.
- Visualizer and Channel Mixer use **bridge-mounted** web-ui panels (native React rewrite is Phase 5).
- `electron-updater` auto-update is not yet integrated.

## Sign-off

Desktop v0.1.0 is cleared for GitHub Release based on passing automated test suites on Windows and Linux CI, successful Windows packaging, and manual verification of core IDE workflows on the primary development platform.
