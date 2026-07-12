---
title: "Desktop Client Enhancements (Phase 5)"
status: proposed
authors: ["kadraman"]
created: 2026-06-13
updated: 2026-06-27
related:
  - docs/features/complete/desktop-first-client-split.md
  - docs/features/complete/electron-desktop-client.md
---

## Summary

Post-MVP enhancements for BeatBax Desktop (`apps/desktop`) after the desktop-first client split shipped in v0.1.0. The full IDE is installable and feature-complete via bridge-mounted web-ui panels; this document tracks polish, distribution hardening, native React UI rewrites, and power-user features that were deferred from Phases 3–4.

---

## Implementation Progress

**Last updated:** 2026-06-27
**Overall status:** In progress.

| Workstream | Status | Notes |
|------------|--------|-------|
| Distribution hardening | ⬜ | Code signing, notarization, auto-update |
| Native React UI | ✅ | Phase 5b native React migrations and desktop bridge cleanup complete |
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
| **Code signing** | Windows Authenticode via Azure Artifact Signing + macOS Developer ID signing in CI |
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
| `@web-ui/ui/pattern-grid` | `DesktopPatternGrid.tsx` | High |
| `@web-ui/panels/song-visualizer` | `DesktopSongVisualizer.tsx` | High (canvas) |
| `@web-ui/panels/channel-mixer` | `DesktopChannelMixer.tsx` | High |
| `@web-ui/panels/chat-panel` | `CopilotPanel.tsx` | Medium |
| `@web-ui/panels/help-panel` | `HelpPanel.tsx` | Low |
| `@web-ui/panels/output-panel` | `ProblemsPanel.tsx`, `OutputPanel.tsx` | Low |
| `@web-ui/panels/settings-panel` | `SettingsModal.tsx` | Medium |

**Suggested order while waiting for signing certificates:** Output/Problems → Help → Toolbar/Transport → Settings/Copilot → Pattern Grid → Visualizer/Mixer (canvas-heavy).

#### Phase 5b target plan

Phase 5b should reduce bridge coupling incrementally without replacing the whole desktop shell at once. The current React desktop shell still delegates most UI assembly to `desktop-workspace.ts`, which constructs web-ui DOM classes and returns handles consumed by menu actions, shortcuts, playback setup, export handling, and editor diagnostics. The safest path is to introduce React-owned panel components with small compatibility handles, then remove the matching `@web-ui` imports one bridge at a time.

| Target slice | Goal | Bridge compatibility needed | Risk |
|--------------|------|-----------------------------|------|
| **5b-1 Output/Problems** | Replace `@web-ui/panels/output-panel` with React `ProblemsPanel` and `OutputPanel` bodies | Preserve `addMessage()`, `dismissQuickFixMenu()`, and Problems tab navigation hooks used by export/editor setup | Low |
| **5b-2 Help** | Replace embedded Help and shortcuts Help usage with React `HelpPanel` | Preserve `refresh()`, shortcuts listing, snippet insertion, and replace-editor callbacks | Low-medium |
| **5b-3 Toolbar/Transport** | Replace top toolbar and transport bar with React controls | Provide stable command/handle API for menu actions, shortcuts, `TransportControls`, BPM/loop/live state, volume knob, and playback LEDs | Medium-high |
| **5b-4 Settings/Copilot** | Replace settings modal and CoPilot panel | Preserve settings refresh, feature flag toggles, editor replacement, diagnostics context, and AI change highlight flows | Medium |
| **5b-5 Pattern Grid** | Replace pattern grid rendering and navigation | Preserve parse/playback position updates, mute/solo/channel state, and pattern-to-editor navigation | High |
| **5b-6 Visualizer/Mixer** | Replace canvas-heavy visualizer and mixer | Preserve analyser/playback subscriptions, `channelStates`, responsive canvas lifecycle, fullscreen/body classes, and cleanup | High |

**5b-1 acceptance criteria:**

- `desktop-workspace.ts` no longer imports `@web-ui/panels/output-panel`.
- Desktop Problems and Output tabs preserve current event-bus behavior for parse errors, validation errors/warnings, playback logs, and export logs.
- Export handling and editor diagnostics still call a typed desktop panel handle instead of a web-ui class.
- Quick-fix menu dismissal still works when leaving the Problems tab.
- Desktop Playwright smoke for startup, playback, JSON export, and save-in-place remains green.

**5b implementation rules:**

- Keep existing `bb-*` CSS classes initially to avoid visual churn and defer `@web-ui/styles.css` removal until enough components are React-native.
- Prefer typed compatibility handles over DOM button references for new React components. Existing DOM refs can stay temporarily where a slice has not migrated yet.
- Unsubscribe event-bus and store subscriptions on React unmount; do not rely on DOM class disposal patterns.
- Keep `channelStates` as the single source for Pattern Grid, Visualizer, and Mixer until those pieces migrate together or get a shared React-facing adapter.
- Do not extract `packages/ui-tokens/` until at least Output/Problems, Help, and Toolbar have migrated and the repeated styling needs are clear.

#### Keyboard shortcut ownership

Keyboard shortcut metadata should be split by responsibility rather than forced into one shared binding table:

- `@beatbax/app-core` may own product-level command metadata where it is genuinely shared: command id, label, category, and description.
- `apps/desktop` should own desktop keybindings, Electron/global shortcuts, Monaco-focused command registration, and command handlers.
- `apps/web-ui` should own browser-safe web keybindings and omit or mark unsupported any shortcuts hijacked by the browser.

This matters because some desktop shortcuts cannot be implemented reliably in a normal browser tab. Examples include common file/window shortcuts such as `Ctrl+N`, `Ctrl+O`, `Ctrl+W`, and other combinations reserved by the browser or OS. Treat the command concept as shared when useful, but keep concrete key combos and availability client-specific.

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

1. Configure Azure Artifact Signing for Windows Authenticode signing and Apple Developer ID credentials for macOS.
2. Add signing secrets to GitHub Actions; configure `electron-builder` signing fields, including Azure signing options for Windows.
3. Enable macOS notarization in CI.
4. Add `electron-updater` to main process; wire `checkForUpdates` on startup and manual Check for Updates menu item.
5. Verify delta updates or full-installer fallback on all three platforms.

**Deliverable:** Signed, notarized installers with in-app update notifications.

### Phase 5b — Native React panels (incremental)

1. Create `apps/desktop/src/renderer/src/components/panels/` and `apps/desktop/src/renderer/src/components/workspace/` for React-native panel bodies and compatibility handles.
2. Implement **5b-1 Output/Problems** first:
   - Add React `ProblemsPanel` and `OutputPanel` components.
   - Expose a typed panel handle for `addMessage()`, `dismissQuickFixMenu()`, and any diagnostics/export hooks still needed by desktop glue.
   - Replace `@web-ui/panels/output-panel` usage in `desktop-workspace.ts`, `desktop-editor-setup.ts`, and `export-handler.ts`.
3. Implement **5b-2 Help**:
   - Add React `HelpPanel` for the right pane and shortcuts modal.
   - Preserve shortcuts listing, search, snippet insertion, and replace-editor callbacks.
   - Remove `@web-ui/panels/help-panel` from migrated desktop paths.
4. Implement **5b-3 Toolbar/Transport** only after the panel handle pattern is stable:
   - Replace DOM button refs with an explicit desktop command/transport handle.
   - Update menu actions, keyboard shortcuts, `TransportControls`, and full-IDE playback wiring to use that handle.
5. Defer Visualizer and Mixer until lower-risk slices have shipped and bridge cleanup has proven safe.
6. Add targeted desktop tests with each slice, preferring Playwright for user-visible behavior and small unit tests for handle logic.
7. Remove `@web-ui` alias imports for migrated modules from `desktop-workspace.ts` and related desktop glue as each slice lands.

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
- New React panel components and compatibility handles (as migrated).

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

- [ ] Configure Azure Artifact Signing account/certificate profile for Windows Authenticode signing
- [ ] Obtain Apple Developer ID + notarization credentials
- [x] Configure signing in `electron-builder.yml` and CI secrets (GB Studio-style keychain + `afterSign` notarize hook; requires GitHub secrets)
- [x] Enable macOS notarization (custom `scripts/notarize.cjs` hook; skips when secrets absent)
- [ ] Integrate `electron-updater` with GitHub Releases
- [ ] Add Check for Updates menu item and renderer update prompt

### 5b — Native React UI

- [x] 5b-1: Migrate Output + Problems panels
- [x] 5b-2: Migrate Help panel and shortcuts Help usage
- [x] 5b-3: Migrate Toolbar + TransportBar
- [x] 5b-4: Migrate Settings modal + CoPilot panel
- [x] 5b-5: Migrate Pattern Grid
- [x] 5b-6: Migrate Song Visualizer (canvas)
- [x] 5b-6: Migrate Channel Mixer
- [x] Optional: `packages/ui-tokens/` shared design tokens
- [x] Remove `@web-ui` bridge imports for migrated panels

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
- [x] Playwright: platform-appropriate menu chrome (native menu on darwin)

---

## Open Questions

1. **Code signing setup:** Is Azure Artifact Signing available for Windows CI, and are Apple Developer ID credentials available for macOS notarization? Self-signed certificates are not sufficient for public distribution.
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

Priority recommendation while code-signing certificates are pending: start **5b-1 (Output/Problems React panels)**. Resume **5a (signing + auto-update)** as soon as Windows and Apple credentials are available.
