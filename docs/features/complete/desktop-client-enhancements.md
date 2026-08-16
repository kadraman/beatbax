---
title: "Desktop Client Enhancements (Phase 5)"
status: complete
authors: ["kadraman"]
created: 2026-06-13
complete: 2026-07-17
related:
  - docs/features/complete/desktop-first-client-split.md
  - docs/features/complete/electron-desktop-client.md
  - docs/features/desktop-dmc-main-process-ipc.md
---

## Summary

Post-MVP enhancements for BeatBax Desktop (`apps/desktop`) after the desktop-first client split shipped in **v0.1.0**.

**Desktop v0.2.0** (2026-08-09) delivered the major Phase 5b outcome: a **native React desktop shell** (Settings, Copilot, Help, Output/Problems, toolbar/transport, channel mixer, song visualizer, pattern grid) with the web-UI compatibility bridge retired, plus distribution hardening already in use on GitHub Releases (macOS signing/notarization, `SHA256SUMS` / optional GPG).

This document continues to track remaining polish: **auto-update**, desktop power features, export/audio polish, and broader cross-platform QA.

---

## Implementation Progress

**Last updated:** 2026-08-09  
**Overall status:** In progress (5b complete in v0.2.0; remaining workstreams open).  
**Latest desktop release:** [`desktop-v0.2.0`](https://github.com/kadraman/beatbax/releases/tag/desktop-v0.2.0)

| Workstream | Status | Notes |
|------------|--------|-------|
| Distribution hardening | 🟨 | macOS signing+notarization shipped; Windows intentionally unsigned; `SHA256SUMS` (+ optional GPG) on releases; auto-update still open |
| Native React UI | ✅ | Phase 5b complete — shipped in desktop **v0.2.0** |
| Desktop power features | 🟨 | File watcher shipped; tray, multi-window still open |
| Export / audio polish | 🟨 | Secure NES DMC remote sample loading shipped (main-process IPC); native WAV path still pending |
| Test / QA expansion | 🟨 | Reusable release checklist in [desktop-release-qa.md](../qa/desktop-release-qa.md); macOS/Linux interactive QA and broader e2e still pending |

---

## Problem Statement

### Resolved in v0.2.0

**Architecture debt (bridge mounts):** v0.1.0 shipped a thin React shell that bridge-mounted most panels from `apps/web-ui`. Phase 5b replaced those panels with native React components and removed `@web-ui` bridge imports for migrated UI. Dual web-ui/desktop panel orchestration for the IDE surface is no longer the primary maintenance model.

### Still open

#### Distribution friction

**macOS** GitHub Release installers are Developer ID signed and notarized via CI (`MACOS_CERTIFICATE` keychain import + `afterSign` → `scripts/notarize.cjs`; `notarize: false` in `electron-builder.yml` is intentional — notarization is not electron-builder’s built-in `notarize: true`). **Windows** installers are intentionally unsigned (Azure Public Trust is unavailable to UK individual developers) — SmartScreen workaround in [desktop-windows-signing-setup.md](../../desktop-windows-signing-setup.md). Prefer user downloads from [itch.io](https://kadraman.itch.io/beatbax), then GitHub Releases. Release assets include `SHA256SUMS` (+ optional GPG). Embedded `.deb` `dpkg-sig` signing runs when that tool is available on the runner (not packaged on Ubuntu 24.04); checksum/GPG remain the primary integrity path. There is no **auto-update** channel; users must manually download new releases.

#### Incomplete test coverage

Automated e2e covers startup load, JSON export, playback, and save-in-place. Native menu actions, non-JSON exports, and interactive macOS/Linux QA are not fully signed off — use the blank checklist in [desktop-release-qa.md](../qa/desktop-release-qa.md) per release.

#### Missing power-user features

No system tray, global hotkey, multi-window editing, or offline CoPilot routing — remaining Phase 5c items. External file watcher for the open `.bax` is implemented.

---

## Proposed Solution

Work is grouped into five workstreams. **5b (native React UI) is complete** as of v0.2.0; remaining items can ship independently.

### 1. Distribution hardening (high priority)

| Enhancement | Description |
|-------------|-------------|
| **Code signing** | macOS Developer ID signing is configured in CI when secrets are present. Windows remains unsigned (document SmartScreen **More info → Run anyway**). Releases publish `SHA256SUMS` (+ optional GPG) |
| **macOS notarization** | Done via custom `afterSign` hook (`scripts/notarize.cjs`) when Apple secrets are set — not `notarize: true` in electron-builder |
| **Auto-update** | Integrate `electron-updater` with GitHub Releases (`desktop-v*` tags); surface update prompts in renderer |
| **Release notes** | Curated `apps/desktop/build/release-notes.body.txt`; polished GitHub Release body after CI; site version in `beatbax.com` `site.ts` |

**Key files:** `apps/desktop/electron-builder.yml`, `.github/workflows/desktop-build.yaml`, `apps/desktop/scripts/notarize.cjs`, new `src/main/updater.ts`.

### 2. Native React UI rewrites — **complete (v0.2.0)**

Replaced bridge-mounted web-ui DOM panels with native React components and removed `@web-ui` coupling for the desktop IDE surface.

| Former bridge mount | React component | Status |
|---------------------|-----------------|--------|
| `@web-ui/ui/toolbar` | `Toolbar.tsx` | ✅ |
| `@web-ui/ui/transport-bar` | `TransportBar.tsx` | ✅ |
| `@web-ui/ui/pattern-grid` | Pattern grid (desktop) | ✅ |
| `@web-ui/panels/song-visualizer` | Song visualizer (desktop) | ✅ |
| `@web-ui/panels/channel-mixer` | Channel mixer (desktop) | ✅ |
| `@web-ui/panels/chat-panel` | `CopilotPanel.tsx` | ✅ |
| `@web-ui/panels/help-panel` | `HelpPanel.tsx` | ✅ |
| `@web-ui/panels/output-panel` | `ProblemsPanel` / `OutputPanel` | ✅ |
| `@web-ui/panels/settings-panel` | `SettingsModal.tsx` | ✅ |

Historical slice plan (5b-1 … 5b-6) is preserved below as an archive of how the migration was executed.

#### Phase 5b target plan (archive)

Phase 5b reduced bridge coupling incrementally. Desktop glue historically lived in `desktop-workspace.ts` with web-ui DOM classes; each slice introduced React-owned panels with compatibility handles, then removed matching `@web-ui` imports.

| Target slice | Goal | Status |
|--------------|------|--------|
| **5b-1 Output/Problems** | React Problems/Output panels | ✅ |
| **5b-2 Help** | React Help panel | ✅ |
| **5b-3 Toolbar/Transport** | React toolbar/transport | ✅ |
| **5b-4 Settings/Copilot** | React settings + Copilot | ✅ |
| **5b-5 Pattern Grid** | React pattern grid | ✅ |
| **5b-6 Visualizer/Mixer** | React visualizer + mixer | ✅ |

#### Keyboard shortcut ownership

Keyboard shortcut metadata should be split by responsibility rather than forced into one shared binding table:

- `@beatbax/app-core` may own product-level command metadata where it is genuinely shared: command id, label, category, and description.
- `apps/desktop` should own desktop keybindings, Electron/global shortcuts, Monaco-focused command registration, and command handlers.
- `apps/web-ui` should own browser-safe web keybindings and omit or mark unsupported any shortcuts hijacked by the browser.

Shared keyboard shortcuts across menus, toolbar, Help, and editor (including macOS labels) shipped as part of the v0.2.0 desktop polish.

Optional shared styling: `packages/ui-tokens/` (extracted).

### 3. Desktop power features (medium priority)

| Enhancement | Description |
|-------------|-------------|
| **System tray** | Minimize-to-tray; quick play/stop from tray menu |
| **Global shortcut** | Toggle app window (e.g. `Ctrl+Shift+B`) via `globalShortcut` in main process |
| **Multi-window** | Open multiple `.bax` files in separate `BrowserWindow` instances; shared or per-window `AppContext` |
| **File watcher** | `fs.watch` on the open document directory; VS Code-style reload when the `.bax` changes externally. See [desktop-external-file-reload.md](./desktop-external-file-reload.md) |
| **Offline CoPilot** | Route Chat panel to local Ollama when no internet; settings toggle |

### 4. Export and audio polish (lower priority)

| Enhancement | Description |
|-------------|-------------|
| **Native WAV export** | Use Electron's native `OfflineAudioContext` instead of `standardized-audio-context` polyfill for desktop WAV renders |
| **Export progress UI** | Long renders (WAV) show progress in Output panel with cancel support |

#### 4a. Desktop DMC remote asset hardening — **shipped**

The Desktop DMC sample pipeline routes remote sample fetches through Electron main-process IPC instead of renderer fetch.

Implemented (desktop **v0.2.0** and related PRs):

- Main-process remote asset policy (`https` only, allowlist enforcement, redirect checks, timeout/size limits; insecure URLs rejected).
- Support for `https://`, `github:`, `local:`, `@nes/` style sample references.
- Desktop settings support for user-configurable remote host allowlist.
- Engine NES DMC desktop bridge support via `window.electronAPI.fetchRemoteAsset`.
- Unit and targeted e2e coverage for allowlist behavior.

Tracking document: [`docs/features/desktop-dmc-main-process-ipc.md`](./desktop-dmc-main-process-ipc.md)

### 5. Test and QA expansion (ongoing)

| Enhancement | Description |
|-------------|-------------|
| **Per-release checklist** | Fill [desktop-release-qa.md](../qa/desktop-release-qa.md) (reusable blank template) before each `desktop-v*` tag |
| **macOS/Linux manual QA** | Interactive sign-off on non-primary platforms |
| **`.bax` double-click** | Verify file association opens app on Windows and macOS |
| **Playwright e2e** | Native menu actions; MIDI/UGE/WAV/Arkos export smoke tests |

---

## Implementation Plan

### Phase 5a — Distribution hardening

1. ~~Configure Apple Developer ID credentials for macOS; wire CI keychain import + notarize hook.~~ **Done** for release builds with secrets.
2. ~~Windows Authenticode.~~ **Deferred** — keep Windows unsigned; document SmartScreen workaround ([desktop-windows-signing-setup.md](../../desktop-windows-signing-setup.md)). Revisit if Azure Public Trust opens to UK individuals or another CI-friendly option fits.
3. Add `electron-updater` to main process; wire `checkForUpdates` on startup and manual Check for Updates menu item.
4. Verify delta updates or full-installer fallback on all three platforms.

**Deliverable:** Signed macOS installers + documented Windows SmartScreen workaround (**done**); in-app update notifications still open.

### Phase 5b — Native React panels — **complete (v0.2.0)**

Historical steps (all done):

1. Create desktop React panel/workspace components and compatibility handles.
2. Migrate Output/Problems → Help → Toolbar/Transport → Settings/Copilot → Pattern Grid → Visualizer/Mixer.
3. Remove `@web-ui` alias imports for migrated modules from desktop glue.
4. Keep Playwright smoke green across slices.

**Deliverable:** Desktop renderer no longer depends on `@web-ui` for IDE panels — **shipped in desktop-v0.2.0**.

### Phase 5c — Power features

1. System tray + global shortcut (main process only).
2. Multi-window architecture spike — decide shared vs per-window state.
3. ~~File watcher with reload prompt.~~ **Done** — hybrid reload + Settings → Editor control ([desktop-external-file-reload.md](./desktop-external-file-reload.md)).
4. Ollama routing in CoPilot (optional BYOK extension).

**Deliverable:** Power-user workflows without leaving the desktop app.

---

## CLI Changes

None.

---

## Export Changes

Possible change in Phase 5d: desktop-specific WAV render path using native Web Audio (no polyfill). Engine export APIs remain unchanged; only the desktop `fs`/audio shim may differ.

Also shipped alongside desktop polish (not Phase 5d): experimental Arkos Tracker 3 exporter, GB/UGE parity improvements, payload-first built-in exports — see the [`desktop-v0.2.0`](https://github.com/kadraman/beatbax/releases/tag/desktop-v0.2.0) release notes.

---

## Documentation Updates

- This document (tracking Phase 5; refreshed for **v0.2.0**).
- `apps/desktop/README.md` — update as features ship.
- `docs/releasing.md` / `docs/qa/desktop-release-qa.md` — desktop tag + reusable QA checklist.
- `beatbax.com` `src/config/site.ts` — bump `latestDesktopVersion` / tag after each desktop release.
- `ROADMAP.md` — link desktop enhancements.

---

## Testing Strategy

### Unit tests

- Updater module (mock `electron-updater`) — when 5a lands.
- File watcher path validation — when 5c lands.
- Desktop React panel components (as maintained).

### Integration tests

- Playwright: native menu export actions (MIDI, UGE, WAV, Arkos).
- Playwright: multi-window open (when implemented).
- Manual: signed macOS installer installs without Gatekeeper block; Windows unsigned — SmartScreen **More info → Run anyway**.

### Manual QA

- Per-release: fill [desktop-release-qa.md](../qa/desktop-release-qa.md) on the primary platform before tagging.
- Full IDE smoke on macOS and Linux (still often deferred to post-release spot checks).
- Auto-update flow (when 5a lands): install previous desktop tag, publish next, verify in-app update.

---

## Migration Path

Phase 5 work remains **additive** for engine, CLI, and web-lite. Desktop users move between releases by downloading new installers from [itch.io](https://kadraman.itch.io/beatbax) or [GitHub Releases](https://github.com/kadraman/beatbax/releases) until auto-update ships.

The web-UI panel bridge migration is **complete** as of v0.2.0; remaining workstreams do not require a further UI big-bang.

---

## Implementation Checklist

### 5a — Distribution

- [x] Obtain Apple Developer ID + notarization credentials
- [x] Configure signing in `electron-builder.yml` and CI secrets (macOS keychain + `afterSign` notarize hook; requires GitHub secrets)
- [x] Enable macOS notarization (custom `scripts/notarize.cjs` hook; skips when secrets absent)
- [x] Document Windows unsigned policy + SmartScreen workaround ([desktop-windows-signing-setup.md](../../desktop-windows-signing-setup.md))
- [x] Publish `SHA256SUMS` on desktop GitHub Releases
- [x] GPG-detach-sign `SHA256SUMS` (+ publish `beatbax-release.asc`) when secrets are set
- [x] Attempt GPG-sign `.deb` with `dpkg-sig` when the tool is available on the runner (skipped on Ubuntu 24.04; checksum/GPG still published)
- [ ] Integrate `electron-updater` with GitHub Releases
- [ ] Add Check for Updates menu item and renderer update prompt
- [ ] Revisit Windows Authenticode if eligibility improves (Azure org / US-Canada individual, Certum OSS cloud + CI, SignPath, etc.)

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
- [x] Ship native React shell in **desktop-v0.2.0**

### 5c — Power features

- [ ] System tray with play/stop
- [ ] Global keyboard shortcut to toggle window
- [ ] Multi-window support
- [x] External file watcher with reload prompt
- [ ] Offline CoPilot via Ollama routing

### 5d — Export / audio

- [x] Secure NES DMC remote sample loading (main-process IPC)
- [ ] Desktop WAV export without `standardized-audio-context` polyfill
- [ ] Long-render progress + cancel UI

### 5e — Test / QA

- [x] Convert [desktop-release-qa.md](../qa/desktop-release-qa.md) into a reusable per-release checklist
- [ ] macOS interactive QA sign-off (per release / spot check)
- [ ] Linux interactive QA sign-off (per release / spot check)
- [ ] `.bax` double-click verification (Windows + macOS)
- [x] Playwright: platform-appropriate menu chrome (native menu on darwin)
- [x] Playwright: reload editor when the open `.bax` is written on disk

---

## Open Questions

1. **Windows code signing:** Deferred. Windows stays unsigned with documented SmartScreen workaround. Revisit Azure/Certum/SignPath if eligibility or CI fit improves — see [desktop-windows-signing-setup.md](../../desktop-windows-signing-setup.md).
2. **Multi-window state model:** Shared `AppContext` singleton vs per-window isolated state?
3. **Auto-update channel:** Stable only, or beta channel for pre-releases?
4. **Ollama integration:** In-scope for BeatBax, or defer to a separate CoPilot enhancement doc?

---

## References

- [desktop-first-client-split.md](./desktop-first-client-split.md) — completed Phases 1–4
- [electron-desktop-client.md](./electron-desktop-client.md) — Electron IPC and packaging reference
- [desktop-release-qa.md](../qa/desktop-release-qa.md) — reusable desktop release QA checklist
- [docs/releasing.md](../../releasing.md) — desktop tag + CI publish runbook
- [apps/desktop/README.md](../../apps/desktop/README.md) — current desktop scope
- [desktop-v0.2.0 GitHub Release](https://github.com/kadraman/beatbax/releases/tag/desktop-v0.2.0)
- [electron-updater documentation](https://www.electron.build/auto-update)
- [electron-builder code signing](https://www.electron.build/code-signing)
- [desktop-windows-signing-setup.md](../../desktop-windows-signing-setup.md) — Windows unsigned policy + SmartScreen workaround

---

## Additional Notes

Estimated remaining effort is dominated by **5a auto-update** and **5c power features**, not further UI bridge removal.

Priority recommendation: resume **5a auto-update**. Windows Authenticode remains deferred; macOS signing is done. Native React panel work (**5b**) is complete and shipped in **desktop-v0.2.0**.
