---
title: "Settings Panel (Web UI)"
status: complete
authors: ["GitHub Copilot", "kadraman"]
created: 2026-04-05
completed: 2026-04-05
issue: "https://github.com/kadraman/beatbax/issues/78"
---

## Overview

BeatBax accumulates optional capabilities (feature flags), UI preferences, and provider settings that are currently scattered across individual `localStorage` keys with no unified surface for the user to discover or control them. This document specifies a **Settings panel** — a modal dialog accessible from the menu bar and via keyboard shortcut — that gives users one place to view and change every persistent preference.

---

## Goals

- One discoverable entry point for all user-configurable preferences.
- Enable or disable gated features (AI Copilot, per-channel analyser, future plugins) without requiring a URL parameter or manual `localStorage` inspection.
- Collect and expose UI preferences that are currently hard-coded or silently persisted (toolbar mode, theme, auto-save, log level, …).
- Integrate with the existing `feature-flags.ts` / `local-storage.ts` / nanostores infrastructure — no new persistence mechanism.
- Changes take effect immediately (live-apply) without a page reload wherever practical.
- Keyboard accessible, ARIA compliant, and consistent with the existing modal pattern (`buildShortcutsModal`).

## Non-goals

- Managing project files, songs, or export presets.
- Per-song settings (those live in the `.bax` source).
- Backend / server configuration (BeatBax is a client-only app).
- A native OS preferences window (this is web only).

---

## Entry points

| Entry point | Action |
|---|---|
| **Menu bar** | `View → Settings…` (or a ⚙ gear icon in the menu bar) |
| **Keyboard shortcut** | `Ctrl+,` (standard VS Code / browser app convention) |
| **AI Copilot panel** | Clicking the existing ⚙ gear in the Copilot panel header opens Settings pre-scrolled to the *AI Copilot* section |
| **Toolbar overflow menu** | "Settings" item at the bottom of the `…` overflow menu |

---

## Layout

The Settings panel is a **modal dialog** (same pattern as `buildShortcutsModal`) with:

- A fixed header: title "Settings" + close button (✕) + `Ctrl+,` label
- A **left sidebar** with section navigation (icon + label)
- A **right content area** that scrolls independently per section
- A footer with "Reset to defaults" (for the active section) and "Close" buttons

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙  Settings                                          ✕     │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  □ General   │  ── Appearance ────────────────────────────  │
│  □ Editor    │                                              │
│  □ Playback  │  Theme          ○ Dark  ○ Light  ○ System   │
│  □ Features  │  Toolbar style  ○ Icons + labels  ○ Icons   │
│  □ AI        │  Compact mixer  □ Enable compact mode       │
│  □ Advanced  │                                              │
│              │  ── Panels ────────────────────────────────  │
│              │                                              │
│              │  □ Show toolbar                             │
│              │  □ Show transport bar                       │
│              │  □ Show pattern grid                        │
│              │  □ Show channel mixer                       │
│              │                                             │
├──────────────┴──────────────────────────────────────────────┤
│  Reset section to defaults                          Close   │
└─────────────────────────────────────────────────────────────┘
```

On narrow screens (< 600 px) the sidebar collapses into a horizontal tab strip above the content area.

---

## Sections and settings

### General

| Setting | Type | Default | Storage key |
|---|---|---|---|
| Theme | Radio: `dark` \| `light` \| `system` | `system` | `beatbax:ui.theme` |
| Toolbar style | Radio: `icons+labels` \| `icons only` | `icons+labels` | `beatbax:ui.toolbarStyle` |
| Show toolbar | Toggle | `true` | `beatbax:panel.toolbar` |
| Show transport bar | Toggle | `true` | `beatbax:panel.transport-bar` |
| Show pattern grid | Toggle | `false` | `beatbax:panel.pattern-grid` |
| Show channel mixer | Toggle | `true` | `beatbax:panel.channel-mixer` |
| Compact channel mixer | Toggle | `true` | `beatbax:ui.channelCompact` (existing `bb-channel-compact`) |

### Editor

| Setting | Type | Default | Storage key |
|---|---|---|---|
| Auto-save | Toggle | `true` | `beatbax:editor.autoSave` |
| Word wrap | Toggle | `false` | `beatbax:editor.wordWrap` |
| Show CodeLens previews | Toggle | `true` | `beatbax:editor.codelens` |
| Show beat decorations | Toggle | `true` | `beatbax:editor.beatDecorations` |
| Default BPM | Number input (60–300) | `128` | `beatbax:editor.bpm` |
| Font size | Number input (10–24) | `14` | `beatbax:editor.fontSize` |

### Playback

| Setting | Type | Default | Storage key |
|---|---|---|---|
| Audio backend | Radio: `auto` \| `browser` \| `node-webaudio` | `auto` | `beatbax:audio.backend` |
| Sample rate | Select: 44100 \| 48000 \| 96000 | `44100` | `beatbax:audio.sampleRate` |
| Default loop | Toggle | `false` | `beatbax:playback.loop` |
| Buffer size (offline render) | Select: 1024 \| 2048 \| 4096 \| 8192 | `4096` | `beatbax:audio.bufferFrames` |

### Features (gated / opt-in)

This section is the primary surface for enabling optional capabilities. Each entry shows:
- A toggle (on/off)
- A short description
- A badge: `Beta` / `Experimental` / `Stable`
- A link to the relevant docs page

| Feature | Description | Default | Flag key | Badge |
|---|---|---|---|---|
| **AI Copilot** | Built-in AI assistant (requires your own API key). | `off` | `beatbax:feature.aiAssistant` | Beta |
| **Per-channel waveforms** | Real-time waveform display in the channel mixer (uses WebAudio AnalyserNode — adds CPU overhead). | `off` | `beatbax:feature.perChannelAnalyser` | Experimental |
| **DAW channel mixer** | Horizontal channel strip with VU meters docked at the bottom of the editor. | `off` | `beatbax:feature.dawMixer` | Planned |
| **Pattern grid** | Visual step-sequencer grid overlay for patterns. | `off` | `beatbax:feature.patternGrid` | Planned |
| **Hot reload** | Automatically re-parse and continue playback when the editor content changes. | `off` | `beatbax:feature.hotReload` | Experimental |

When a feature is disabled its UI entry point (menu item, tab, panel) is hidden. Enabling takes effect immediately without a page reload.

### AI Copilot

Only visible (and navigable from sidebar) when the **AI Copilot** feature flag is enabled. Contains the existing provider configuration UI currently inside the Copilot panel, lifted here so it is easier to find:

| Setting | Type | Description |
|---|---|---|
| Provider preset | Select | OpenAI / Groq / Ollama / LM Studio / Custom |
| API endpoint | URL input | Base URL for the OpenAI-compatible API |
| API key | Password input | Stored in `localStorage` — shown redacted; "Clear" button available |
| Model | Text input | Model name to pass in requests |
| Interaction mode | Radio | Edit mode / Ask mode |
| Max context chars | Number | Max song characters sent per request (default 3000) |

Note that the API key is stored in `localStorage` in plain text and **persisted across sessions** so you do not need to re-enter it on every page load. A persistent warning in this section reminds the user not to enter a high-spend production key. A "Clear key" button wipes the stored value immediately. The key is validated to contain only printable ASCII characters before being sent in an `Authorization` header.

### Advanced

| Setting | Type | Default | Storage key |
|---|---|---|---|
| Log level | Select: `error` \| `warn` \| `info` \| `debug` | `warn` | `beatbax:debug.logLevel` |
| Show debug overlay | Toggle | `false` | `beatbax:debug.overlay` |
| Expose `window.__beatbax_player` | Toggle | `true` | `beatbax:debug.exposePlayer` |
| Reset all settings | Button | — | Clears all `beatbax:*` keys |

"Reset all settings" shows a confirmation prompt before acting.

---

## Interaction design

### Live apply

Settings that affect pure CSS or nanostore state apply immediately as the control changes — no "Apply" button needed:
- Theme, toolbar style, panel visibility, compact mixer, font size, word wrap, CodeLens, beat decorations.

Settings that require re-initialising an audio node or component (e.g. enabling the per-channel analyser) apply on the next `play` action rather than during active playback, to avoid audio glitches. A note ("Takes effect on next play") is shown inline beside these controls.

### Feature flag lifecycle

```
User toggles "AI Copilot" ON in Settings
  → setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true)
  → eventBus.emit('feature-flag:changed', { flag, enabled: true })
  → App bootstrap subscribed to event: unhides AI tab, mounts Copilot panel
  → Settings panel section "AI Copilot" becomes visible in sidebar
```

An `eventBus` event `'feature-flag:changed'` (payload `{ flag: string, enabled: boolean }`) is emitted after every flag write so subscribers can react without polling.

### Reset to defaults

"Reset section to defaults" clears only the storage keys belonging to the active section, then re-reads defaults. Each section defines its own `resetDefaults()` function. A `resetAll()` clears all `beatbax:*` keys and reloads the page.

---

## Implementation plan

### New files

| File | Responsibility |
|---|---|
| `apps/web-ui/src/panels/settings-panel.ts` | Modal build + section routing logic |
| `apps/web-ui/src/panels/settings-sections/*.ts` | One file per section (General, Editor, Playback, Features, AI, Advanced) |
| `apps/web-ui/src/stores/settings.store.ts` | Nanostores for each setting; reads defaults from `local-storage.ts` |

### Changes to existing files

| File | Change |
|---|---|
| `apps/web-ui/src/utils/local-storage.ts` | Add new `StorageKey` entries (toolbarStyle, editor.*, audio.*, debug.*, feature.perChannelAnalyser, feature.dawMixer, …) |
| `apps/web-ui/src/utils/feature-flags.ts` | Add new `FeatureFlag` constants; add `URL_PARAM_MAP` entries; emit `feature-flag:changed` on set |
| `apps/web-ui/src/app/modals.ts` | Add `buildSettingsModal()` alongside `buildShortcutsModal()` |
| `apps/web-ui/src/app/bootstrap.ts` | Wire `Ctrl+,`, `View → Settings` menu item, and toolbar overflow item to open settings |
| `apps/web-ui/src/panels/channel-mixer.ts` | Read `bb-channel-compact` from `settings.store` instead of direct `localStorage` |

### Keyboard shortcut

Register `Ctrl+,` (Windows/Linux) / `Cmd+,` (macOS) in the existing key-binding table. On macOS detect via `navigator.platform`.

---

## Accessibility

- Modal uses `role="dialog"` and `aria-modal="true"` (consistent with `buildShortcutsModal`).
- Focus is trapped inside the modal while open; `Escape` closes it.
- Sidebar navigation uses `role="tablist"` / `role="tab"` / `role="tabpanel"` semantics.
- All toggles are `<input type="checkbox">` or `<button role="switch" aria-checked>`.
- Radio groups use `<fieldset>` + `<legend>`.
- Sufficient colour contrast for both light and dark themes.

---

## Testing

- Unit: each section's `resetDefaults()` clears correct keys; `setFeatureEnabled` emits correct event.
- Integration: opening Settings with `Ctrl+,` focuses the modal; closing with `Escape` returns focus to editor.
- Feature flag e2e: toggle AI Copilot ON → AI tab appears; toggle OFF → AI tab hidden.
- Snapshot: rendered HTML of each section matches approved fixture (prevents unintended regressions).

---

## Developer checklist

- [x] Add new `StorageKey` entries to `local-storage.ts`
- [x] Add new `FeatureFlag` constants and `feature-flag:changed` event to `feature-flags.ts`
- [x] Create `settings.store.ts` with nanostores for each setting
- [x] Build `settings-panel.ts` modal skeleton (header, sidebar, content area, footer)
- [x] Implement each section module (`settings-sections/general.ts`, editor.ts, playback.ts, features.ts, ai.ts, advanced.ts)
- [x] Wire entry points: `Ctrl+,`, menu bar item, toolbar overflow, Copilot ⚙ shortcut
- [x] Migrate Copilot provider config UI from panel header into Settings → AI section
- [x] Subscribe app bootstrap to `feature-flag:changed` to show/hide gated UI
- [x] Write unit and integration tests (`apps/web-ui/tests/settings-panel.test.ts`)
- [x] Document new `StorageKey` values and `FeatureFlag` constants in `docs/api/`

---

## Related

- [`docs/features/per-channel-analyser.md`](per-channel-analyser.md) — `feature.perChannelAnalyser` flag
- [`docs/features/daw-channel-mixer.md`](daw-channel-mixer.md) — `feature.dawMixer` flag
- [`docs/features/complete/ai-chatbot-assistant.md`](complete/ai-chatbot-assistant.md) — AI Copilot feature
- [`docs/features/hot-reload.md`](hot-reload.md) — `feature.hotReload` flag
- `apps/web-ui/src/utils/feature-flags.ts` — existing flag infrastructure
- `apps/web-ui/src/utils/local-storage.ts` — existing storage key registry
- `apps/web-ui/src/app/modals.ts` — existing modal pattern to follow
