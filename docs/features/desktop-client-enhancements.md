---
title: "Desktop Client Enhancements (Phase 5)"
status: proposed
authors: ["kadraman"]
created: 2026-06-13
updated: 2026-06-13
related:
  - docs/features/complete/desktop-first-client-split.md
  - docs/features/complete/electron-desktop-client.md
---

## Summary

Post-MVP enhancements for BeatBax Desktop (`apps/desktop`) after the desktop-first client split shipped in v0.1.0. The full IDE is installable and feature-complete via bridge-mounted web-ui panels; this document tracks polish, distribution hardening, native React UI rewrites, and power-user features that were deferred from Phases 3–4.

---

## Implementation Progress

**Last updated:** 2026-06-13
**Overall status:** Not started.

| Workstream | Status | Notes |
|------------|--------|-------|
| Distribution hardening | ⬜ | Code signing, notarization, auto-update |
| Native React UI | ⬜ | Replace `@web-ui` bridge mounts |
| Desktop power features | ⬜ | Tray, multi-window, file watcher |
| Export / audio polish | ⬜ | Native WAV path in Electron |
| Test / QA expansion | ⬜ | macOS/Linux manual sign-off, broader e2e |

---

## Problem Statement

Desktop v0.1.0 delivers the full BeatBax IDE, but several gaps remain:

### Architecture debt

Phase 3 shipped a **thin React shell** (`App.tsx`, `DesktopWorkspaceShell`, `EditorPane`, `DesktopTitleBar`) that bridge-mounts most panels from `apps/web-ui` via Vite `@web-ui` aliases (`desktop-workspace.ts`). This works but creates **dual orchestration** — panel wiring changes may need updates in both web-ui and desktop.

### Distribution friction

Installers are **unsigned** (`notarize: false` in `electron-builder.yml`). Windows SmartScreen and macOS Gatekeeper warn users on first install. There is no **auto-update** channel; users must manually download new releases.

### Incomplete test coverage

Automated e2e covers startup load, JSON export, playback, and save-in-place. Native menu actions, non-JSON exports, and interactive macOS/Linux QA are not fully signed off in [desktop-release-qa.md](../qa/desktop-release-qa.md).

### Missing power-user features

No system tray, global hotkey, multi-window editing, external file watcher, or offline CoPilot routing — all listed as future enhancements in the original Electron plan.

---

## Proposed Solution

Work is grouped into five workstreams, roughly ordered by impact. Individual items can ship independently.

### 1. Distribution hardening (high priority)

| Enhancement | Description |
|-------------|-------------|
| **Code signing** | Windows Authenticode + macOS Developer ID signing in CI |
| **macOS notarization** | Enable `notarize: true` in `electron-builder.yml` with Apple credentials in GitHub secrets |
| **Auto-update** | Integrate `electron-updater` with GitHub Releases (`desktop-v*` tags); surface update prompts in renderer |
| **Release notes** | Curated release body template; link installers prominently in root README |

**Key files:** `apps/desktop/electron-builder.yml`, `.github/workflows/desktop-build.yaml`, new `src/main/updater.ts`.

### 2. Native React UI rewrites (medium priority)

Replace bridge-mounted web-ui DOM panels with native React components, reducing `@web-ui` coupling.

| Current bridge mount | Target React component | Complexity |
|----------------------|------------------------|------------|
| `@web-ui/ui/toolbar` | `Toolbar.tsx` | Medium |
| `@web-ui/ui/transport-bar` | `TransportBar.tsx` | Medium |
| `@web-ui/ui/pattern-grid` | `PatternGrid.tsx` | High |
| `@web-ui/panels/song-visualizer` | `VisualizerPanel.tsx` | High (canvas) |
| `@web-ui/panels/channel-mixer` | `ChannelMixerPanel.tsx` | High (canvas) |
| `@web-ui/panels/chat-panel` | `CopilotPanel.tsx` | Medium |
| `@web-ui/panels/help-panel` | `HelpPanel.tsx` | Low |
| `@web-ui/panels/output-panel` | `ProblemsPanel.tsx`, `OutputPanel.tsx` | Low |
| `@web-ui/panels/settings-panel` | `SettingsModal.tsx` | Medium |

**Suggested order:** Help/Output → Toolbar/Transport → Settings/Copilot → Pattern Grid → Visualizer/Mixer (canvas-heavy).

Optional: extract shared Tailwind tokens into `packages/ui-tokens/` for consistent styling between web-lite and desktop.

### 3. Desktop power features (medium priority)

| Enhancement | Description |
|-------------|-------------|
| **System tray** | Minimize-to-tray; quick play/stop from tray menu |
| **Global shortcut** | Toggle app window (e.g. `Ctrl+Shift+B`) via `globalShortcut` in main process |
| **Multi-window** | Open multiple `.bax` files in separate `BrowserWindow` instances; shared or per-window `AppContext` |
| **File watcher** | `fs.watch` on open document path; prompt to reload when changed externally |
| **Offline CoPilot** | Route Chat panel to local Ollama when no internet; settings toggle |

### 4. Export and audio polish (lower priority)

| Enhancement | Description |
|-------------|-------------|
| **Native WAV export** | Use Electron's native `OfflineAudioContext` instead of `standardized-audio-context` polyfill for desktop WAV renders |
| **Export progress UI** | Long renders (WAV) show progress in Output panel with cancel support |

### 5. Test and QA expansion (ongoing)

| Enhancement | Description |
|-------------|-------------|
| **macOS/Linux manual QA** | Interactive sign-off per [desktop-release-qa.md](../qa/desktop-release-qa.md) |
| **`.bax` double-click** | Verify file association opens app on Windows and macOS |
| **Playwright e2e** | Native menu actions; MIDI/UGE/WAV export smoke tests |
| **Reduce dual orchestration** | As panels move to React, delete corresponding bridge code in `desktop-workspace.ts` |

---

## Implementation Plan

### Phase 5a — Distribution hardening

1. Obtain code-signing certificates (Windows + Apple).
2. Add signing secrets to GitHub Actions; configure `electron-builder` signing fields.
3. Enable macOS notarization in CI.
4. Add `electron-updater` to main process; wire `checkForUpdates` on startup and manual Check for Updates menu item.
5. Verify delta updates or full-installer fallback on all three platforms.

**Deliverable:** Signed, notarized installers with in-app update notifications.

### Phase 5b — Native React panels (incremental)

1. Create `apps/desktop/src/renderer/src/components/` structure per component map above.
2. Migrate one panel at a time; keep bridge fallback until parity verified.
3. Add component-level tests where practical (React Testing Library or Playwright).
4. Remove `@web-ui` alias imports for migrated panels from `desktop-workspace.ts`.

**Deliverable:** Desktop renderer no longer depends on `@web-ui` for migrated panels.

### Phase 5c — Power features

1. System tray + global shortcut (main process only).
2. Multi-window architecture spike — decide shared vs per-window state.
3. File watcher with reload prompt.
4. Ollama routing in CoPilot (optional BYOK extension).

**Deliverable:** Power-user workflows without leaving the desktop app.

---

## CLI Changes

None.

---

## Export Changes

Possible change in Phase 5d: desktop-specific WAV render path using native Web Audio (no polyfill). Engine export APIs remain unchanged; only the desktop `fs`/audio shim may differ.

---

## Documentation Updates

- This document (tracking Phase 5).
- `apps/desktop/README.md` — update as features ship.
- `ROADMAP.md` — link desktop enhancements.
- Move resolved open questions out of parent docs (done in parent doc update 2026-06-13).

---

## Testing Strategy

### Unit tests

- Updater module (mock `electron-updater`).
- File watcher path validation.
- New React panel components (as migrated).

### Integration tests

- Playwright: native menu export actions (MIDI, UGE, WAV).
- Playwright: multi-window open (when implemented).
- Manual: signed installer install on Windows/macOS without SmartScreen/Gatekeeper block.

### Manual QA

- Full IDE smoke on macOS and Linux (deferred from v0.1.0 QA sign-off).
- Auto-update flow: install v0.1.0, publish v0.1.1, verify in-app update.

---

## Migration Path

All Phase 5 work is **additive** — no breaking changes to engine, CLI, or web-lite. Users on v0.1.0 can update via new installers or (once 5a ships) in-app auto-update.

Bridge-mounted panels continue to work until each React rewrite lands; no big-bang migration required.

---

## Implementation Checklist

### 5a — Distribution

- [ ] Obtain Windows code-signing certificate
- [ ] Obtain Apple Developer ID + notarization credentials
- [ ] Configure signing in `electron-builder.yml` and CI secrets
- [ ] Enable macOS notarization (`notarize: true`)
- [ ] Integrate `electron-updater` with GitHub Releases
- [ ] Add Check for Updates menu item and renderer update prompt

### 5b — Native React UI

- [ ] Migrate Help + Output panels
- [ ] Migrate Toolbar + TransportBar
- [ ] Migrate Settings modal + CoPilot panel
- [ ] Migrate Pattern Grid
- [ ] Migrate Song Visualizer (canvas)
- [ ] Migrate Channel Mixer (canvas)
- [ ] Optional: `packages/ui-tokens/` shared design tokens
- [ ] Remove `@web-ui` bridge imports for migrated panels

### 5c — Power features

- [ ] System tray with play/stop
- [ ] Global keyboard shortcut to toggle window
- [ ] Multi-window support
- [ ] External file watcher with reload prompt
- [ ] Offline CoPilot via Ollama routing

### 5d — Export / audio

- [ ] Desktop WAV export without `standardized-audio-context` polyfill
- [ ] Long-render progress + cancel UI

### 5e — Test / QA

- [ ] macOS interactive QA sign-off
- [ ] Linux interactive QA sign-off
- [ ] `.bax` double-click verification (Windows + macOS)
- [ ] Playwright: native menu + multi-format export tests

---

## Open Questions

1. **Code signing budget:** Are paid certificates available for CI? Self-signed is not sufficient for public distribution.
2. **Multi-window state model:** Shared `AppContext` singleton vs per-window isolated state?
3. **UI tokens package:** Worth extracting now, or wait until more panels are React-native?
4. **Auto-update channel:** Stable only, or beta channel for pre-releases?
5. **Ollama integration:** In-scope for BeatBax, or defer to a separate CoPilot enhancement doc?

---

## References

- [desktop-first-client-split.md](./complete/desktop-first-client-split.md) — completed Phases 1–4
- [electron-desktop-client.md](./complete/electron-desktop-client.md) — Electron IPC and packaging reference
- [desktop-release-qa.md](../qa/desktop-release-qa.md) — v0.1.0 QA sign-off
- [apps/desktop/README.md](../../apps/desktop/README.md) — current desktop scope
- [apps/desktop/src/renderer/src/lib/desktop-workspace.ts](../../apps/desktop/src/renderer/src/lib/desktop-workspace.ts) — bridge orchestration
- [electron-updater documentation](https://www.electron.build/auto-update)
- [electron-builder code signing](https://www.electron.build/code-signing)

---

## Additional Notes

Estimated effort (rough): **~15–25 developer days** depending on code-signing setup friction and how many panels are rewritten before declaring bridge removal complete.

Priority recommendation for the next sprint: **5a (signing + auto-update)** — highest user-facing impact for a publicly distributed desktop app.
