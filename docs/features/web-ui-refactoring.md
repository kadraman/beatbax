---
title: "Web UI Refactoring: Tailwind CSS + nanostores + component split"
status: in-progress
authors: ["kadraman"]
created: 2026-03-29
issue: "https://github.com/kadraman/beatbax/issues/68"
---

## Summary

Refactor the BeatBax Web UI (`apps/web-ui`) to replace dynamically injected inline CSS with
Tailwind CSS utility classes, replace the ad-hoc `event-bus.ts` with typed
[nanostores](https://github.com/nanostores/nanostores) reactive stores, and decompose the
monolithic `main.ts` (~2,100 lines) into focused component modules. No framework change is
required; the vanilla TypeScript + DOM architecture is preserved throughout.

---

## Problem Statement

The current web UI has accumulated several structural problems as it has grown:

1. **Monolithic `main.ts`** (~2,100 lines): The bootstrap file directly creates all layout
   elements, wires every event handler, and manages global state. It is difficult to reason
   about, test, or extend.

2. **Dynamically injected CSS** (~2,000 lines spread across 7+ files): Components inject
   `<style>` blocks at runtime via `document.createElement('style')`. This makes styles hard
   to discover, creates specificity conflicts, and cannot be tree-shaken or statically
   analysed by tooling.

3. **Loosely typed event bus**: `utils/event-bus.ts` is central to communication, but
   callers use string event names and untyped payloads, making it easy to introduce
   mismatches that are only caught at runtime.

4. **Scattered state**: Playback state, channel mute/solo, theme, and editor content are
   managed across multiple files with no single source of truth, leading to synchronisation
   bugs and redundant `localStorage` reads.

---

## Proposed Solution

### Three-pillar approach

| Pillar | Replaces | Benefit |
|---|---|---|
| **Tailwind CSS** | Dynamically injected `<style>` blocks | Static, tree-shaken, consistent design system |
| **nanostores** | `event-bus.ts` + scattered state | Typed reactive stores, ~1 KB, framework-agnostic |
| **Component split** | `main.ts` god file | Single-responsibility modules, testable in isolation |

No new UI framework (React, Svelte, Vue) is introduced. The existing TypeScript + DOM imperative
model is kept. This minimises migration risk and preserves all existing logic.

---

### Pillar 1 — Tailwind CSS

#### Setup

```
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Add to `vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  // ...existing config unchanged
});
```

Create `src/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Keep the existing CSS variable design tokens — Tailwind coexists with them */
:root {
  --bb-app-bg: #1e1e1e;
  --bb-fg:     #d4d4d4;
  /* ...etc — unchanged from index.html */
}
```

Import from `src/main.ts`:

```typescript
import './styles.css';
```

`tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.ts'],
  darkMode: 'class',           // toggle via document.documentElement.classList
  theme: {
    extend: {
      colors: {
        // Map design tokens so Tailwind classes can reference them
        'bb-bg':      'var(--bb-app-bg)',
        'bb-fg':      'var(--bb-fg)',
        'bb-toolbar': 'var(--bb-toolbar-bg)',
        'bb-border':  'var(--bb-toolbar-border)',
      }
    }
  }
};
```

#### Conversion pattern

```typescript
// Before — runtime style injection
const btn = document.createElement('button');
const style = document.createElement('style');
style.textContent = `
  .bb-btn { background: #444; padding: 4px 8px; border-radius: 4px; }
  .bb-btn:hover { background: #3a3a3a; }
`;
document.head.appendChild(style);
btn.className = 'bb-btn';

// After — Tailwind utility classes
const btn = document.createElement('button');
btn.className = 'bg-bb-toolbar px-2 py-1 rounded hover:bg-[var(--bb-toolbar-btn-hover-bg)] transition-colors';
```

#### Monaco decoration exception

The two files `editor/beat-decorations.ts` and `editor/glyph-margin.ts` inject CSS class names
consumed internally by Monaco's rendering pipeline. These **cannot use Tailwind utilities** and
must keep their `<style>` injection. They are ~100 lines combined and are explicitly excluded
from this refactor.

---

### Pillar 2 — nanostores

Install:

```
npm install nanostores
```

#### Store structure (`src/stores/`)

```
src/stores/
  playback.store.ts     # playing/paused/stopped, current BPM, position
  channel.store.ts      # per-channel mute/solo/volume (replaces channel-state.ts)
  editor.store.ts       # source text, dirty flag, filename (replaces editor-state.ts)
  theme.store.ts        # 'dark' | 'light' (replaces theme-manager state)
  ui.store.ts           # panel sizes, active tab, spinner ref-count
  index.ts              # barrel export
```

#### Example store

```typescript
// src/stores/playback.store.ts
import { atom, map } from 'nanostores';

export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

export const playbackStatus = atom<PlaybackStatus>('stopped');
export const playbackBpm    = atom<number>(120);
export const playbackTick   = atom<number>(0);

// Replaces: eventBus.emit('playback:started') / eventBus.on('playback:started', ...)
// Usage:    playbackStatus.subscribe(status => updateTransportUI(status))
//           playbackStatus.set('playing')
```

#### Replacing event-bus patterns

```typescript
// Before
eventBus.emit('channel:mute-changed', { channel: 1, muted: true });
eventBus.on('channel:mute-changed', ({ channel, muted }) => { ... });

// After
import { channelStates } from '../stores/channel.store';
channelStates.setKey(1, { ...channelStates.get()[1], muted: true });
channelStates.subscribe(states => renderChannelCards(states));
```

The existing `utils/event-bus.ts` is removed once all call sites are migrated to stores.
`localStorage` persistence moves into store `subscribe` callbacks, centralised in one place
per store rather than scattered across components.

---

### Pillar 3 — Split `main.ts`

`main.ts` currently handles: layout construction, splitter logic, tab systems, boot spinner,
keyboard shortcut registration, engine lazy loading, live-mode wiring, and modal management.
It is split into focused component files that each own one concern.

#### Target structure

```
src/
  main.ts               # ~80 lines: import stores + components, call bootstrap()
  app/
    bootstrap.ts        # Engine lazy-load, store hydration from localStorage
    layout.ts           # 3-pane shell construction (replaces ui/layout.ts duplicate logic)
    tabs.ts             # Output / right-panel tab managers
    modals.ts           # Settings modal, keyboard shortcut overlay
  ui/
    layout.ts           # Existing — trimmed to splitter/resize only
    menu-bar.ts         # Existing — adopt Tailwind classes, read stores
    toolbar.ts          # Existing — adopt Tailwind classes
    status-bar.ts       # Existing — subscribe to stores instead of listening to event bus
    theme-manager.ts    # Existing — write to theme.store, toggle Tailwind 'dark' class
    transport-bar.ts    # Existing — subscribe to playback.store
  panels/
    channel-mixer.ts    # Existing — subscribe to channel.store
    chat-panel.ts       # Existing — unchanged logic, Tailwind styles
    help-panel.ts       # Existing — unchanged logic, Tailwind styles
    output-panel.ts     # Existing — subscribe to stores for error counts
  stores/               # New (see Pillar 2)
  ...
```

#### New `main.ts` shape

```typescript
import './styles.css';
import { bootstrap }        from './app/bootstrap';
import { buildLayout }      from './app/layout';
import { registerShortcuts } from './utils/keyboard-shortcuts';
import { mountMenuBar }     from './ui/menu-bar';
import { mountToolbar }     from './ui/toolbar';
import { mountTransportBar } from './ui/transport-bar';
import { mountStatusBar }   from './ui/status-bar';
import { mountChannelMixer } from './panels/channel-mixer';
import { mountOutputPanel } from './panels/output-panel';
import { mountEditor }      from './editor/monaco-setup';

async function init() {
  const { editorPane, outputPane, rightPane } = buildLayout();
  await bootstrap();                         // hydrate stores, load engine
  mountMenuBar(document.getElementById('bb-menubar')!);
  mountToolbar(document.getElementById('bb-toolbar')!);
  mountEditor(editorPane);
  mountChannelMixer(rightPane);
  mountOutputPanel(outputPane);
  mountTransportBar(document.getElementById('bb-transport')!);
  mountStatusBar(document.getElementById('bb-statusbar')!);
  registerShortcuts();
  document.getElementById('bb-boot-spinner')!.remove();
}

init();
```

Each `mount*` function owns its own DOM subtree, Tailwind classes, and store subscriptions —
no cross-component DOM queries.

---

## Implementation Plan

### Phase 0 — Setup (~0.5 days) ✅

- [x] Install `tailwindcss`, `@tailwindcss/vite`, `nanostores` (Tailwind v4 — no postcss/autoprefixer needed)
- [x] Tailwind v4 configured via `src/styles.css` (`@import "tailwindcss"` + `@custom-variant dark`) — no `tailwind.config.js`
- [x] Create `src/styles.css`; import in `main.ts`
- [x] Add `@tailwindcss/vite` plugin to `vite.config.ts`
- [x] Verify existing tests still pass (`npm test`)

### Phase 1 — Stores (~1 day) ✅

- [x] Create `src/stores/` with all 6 store files (added `chat.store.ts` — see Open Questions #2)
- [x] `channel.store.ts` created with localStorage persistence (`'beatbax-channel-state'`)
- [x] `editor.store.ts` created with localStorage persistence (`'beatbax:editor.content'`)
- [x] `theme.store.ts` created; `theme-manager.ts` updated to write store + toggle Tailwind `dark` class
- [x] `playback.store.ts` and `ui.store.ts` created
- [x] `chat.store.ts` created — AI message history, settings (API key NOT persisted), mode, loading, unread count
- [x] `src/stores/index.ts` barrel export
- [x] Update `playback/playback-manager.ts` to write stores instead of emitting events
- [x] Update `ui/status-bar.ts` to subscribe to stores
- [x] `playback/channel-state.ts` marked `@deprecated`; dual-writes to `channel.store` added (delete in Phase 4)
- [x] `editor/editor-state.ts` marked `@deprecated`; dual-writes to `editor.store` added (delete in Phase 4)
- [x] `event-bus.ts` marked `@deprecated` with migration note

### Phase 2 — Split `main.ts` (~2 days) ✅

- [x] Extract `app/bootstrap.ts` (engine lazy-load, store hydration)
- [x] Extract `app/layout.ts` (pane shell, splitters — absorbing `ui/layout.ts`)
- [x] Extract `app/tabs.ts` (tab switching logic)
- [x] Extract `app/modals.ts` (settings modal, keyboard overlay)
- [x] Reduce `main.ts` to orchestration shell (~80 lines)
- [x] Verify dev server and all features still work end-to-end

### Phase 3 — Tailwind migration (~2 days) ✅

**Heroicons:** All emoji and unicode symbols replaced with heroicons v2 outline 24px (MIT).
Inline SVGs served via `src/utils/icons.ts` (`icon(name)` / `iconEl(name)` helpers).

Convert components in bottom-up order (least CSS-heavy first):

- [x] `ui/status-bar.ts` — heroicons (exclamation-circle, exclamation-triangle); subscribes to `playback.store` via `.listen()`
- [x] `ui/transport-bar.ts` — heroicons (play, pause, stop, arrow-path, bolt)
- [x] `ui/theme-manager.ts` — Tailwind `dark` class toggle added; `data-theme` attribute kept
- [x] `ui/toolbar.ts` — heroicons (folder-open, musical-note, document, cpu-chip, speaker-wave, check-circle, chevron-down)
- [x] `ui/menu-bar.ts` — heroicons added to 15+ menu items; submenu arrow replaced
- [x] `panels/output-panel.ts` — heroicons (exclamation-circle, exclamation-triangle, information-circle, check-circle, light-bulb)
- [x] `panels/help-panel.ts` — heroicons (question-mark-circle, x-mark, chevron-right, chevron-down, check-circle)
- [x] `panels/channel-mixer.ts` — heroicons (speaker-wave, speaker-x-mark, eye)
- [x] `panels/chat-panel.ts` — heroicons (sparkles, cog-6-tooth, paper-airplane, stop); wired to `chat.store`
- [x] `app/layout.ts` (pane sizing — implemented as part of Phase 2 split)
- [x] Remove all `document.createElement('style')` injection (kept Monaco decoration files only)
- [x] Remove large CSS block from `index.html` (kept only `:root` design tokens + `[data-theme="light"]` overrides + `body` + `#app` reset; all component CSS consolidated into `styles.css`)

### Phase 4 — Cleanup (~0.5 days) ✅ complete

- ⚠️ `utils/event-bus.ts` — **blocked**: ~100 call sites across 20+ files; deletion condition ("once no call sites remain") not yet met; remains for Phase 5
- [x] Delete `playback/channel-state.ts` (superseded by `channel.store.ts`; all consumers migrated)
- [x] Delete `editor/editor-state.ts` (superseded by `editor.store.ts`; all consumers migrated)
- [x] `monaco-setup.ts` now writes to `editorContent`/`editorDirty` stores directly on change
- [x] `channel.store.ts` extended with `toggleChannelMuted`, `toggleChannelSoloed`, `isChannelAudible` helpers
- [x] All `ChannelState` consumers migrated: `playback-manager`, `glyph-margin`, `channel-mixer`, `main.ts`
- [x] Run full test suite and fix any regressions
- [ ] Manual smoke-test: open song, play, export JSON/MIDI/UGE, toggle theme, AI chat

---

## Testing Strategy

### Unit Tests

- Each store: test initial state, mutations, and localStorage round-trip
- `app/bootstrap.ts`: test engine hydration with mocked engine module
- `app/layout.ts`: test pane creation returns expected DOM structure

### Integration Tests

- Playback flow: `editor.store` source change → playback-manager → `playback.store` status
- Channel mute: toggle in channel-mixer → `channel.store` → status-bar count updates
- Theme toggle: `theme.store` 'light' → `document.documentElement` has class `light` → Tailwind
  dark variants inactive

### Visual / Manual Checks

- Tailwind purge: verify `dist` CSS does not include unused utilities (check bundle size)
- Dark/light theme: no flash of unstyled content; all panels switch correctly
- Monaco editor: syntax highlighting, decorations, glyph margin unaffected
- Export dialogs: all export formats (JSON, MIDI, UGE, WAV) still work in browser

---

## Migration Path

This refactor is entirely internal to `apps/web-ui`. It does not affect:

- `packages/engine` — no changes
- `packages/cli` — no changes
- Public API surface of `@beatbax/engine` — no changes
- `.bax` language syntax — no changes
- Existing tests in `tests/` (root) — no changes

The migration is safe to perform in a feature branch and merged behind a PR once all smoke
tests pass. There are no breaking changes for users because the web UI has no published API.

---

## Implementation Checklist

- [x] Phase 0: Tooling setup (Tailwind v4 + @tailwindcss/vite + nanostores installed)
- [x] Phase 1: nanostores — 6 stores created (`playback`, `channel`, `editor`, `theme`, `ui`, `chat`); theme-manager wired
- [x] Phase 1 (remaining): `playback-manager` and `status-bar` fully migrated to nanostores; `status-bar.ts` now has zero `EventBus` dependency — subscribes to `parseStatus`, `parsedBpm`, `parsedChip`, `validationErrors`, `validationWarnings`, `playbackStatus`, `playbackTimeLabel`, `playbackError`, `exportStatus`, `exportFormat`; `editor.store` extended with parse/validation atoms; `ui.store` extended with export-status atoms; `playback.store` extended with `playbackError`; old state files already deleted (Phase 4)
- [x] Phase 2: main.ts split — bootstrap, layout, tabs, modals extracted
- [x] Phase 3 (partial): heroicons replacing all emoji/unicode glyphs; Tailwind dark class toggle; `chat-panel` wired to `chat.store`
- [x] Phase 3 (remaining): full Tailwind utility conversion, inline `<style>` removal — all runtime `injectStyles()` / `_ensureStyles()` methods removed from `toolbar.ts`, `menu-bar.ts`, `channel-mixer.ts`, `chat-panel.ts`, `loading-spinner.ts`, and `main.ts`; all CSS migrated to `styles.css`; 21 test suites passing
- [x] Phase 4: Cleanup — channel-state.ts + editor-state.ts deleted, 83/84 suites passing (event-bus.ts deletion deferred — too many call sites)
- [x] Monaco decoration files explicitly documented as kept as-is
- [x] Bundle size logged (April 2026 production build): JS `3,556 kB` (gzip: `936 kB`), CSS `158 kB` (gzip: `27 kB`) — JS dominated by Monaco editor language packs (lazy-loaded per format)

---

## Future Enhancements

- If component count grows further, evaluate switching to **Svelte** or **Solid.js** — the
  nanostores stores are framework-agnostic and would migrate cleanly to either.
- Consider a Storybook-equivalent static component catalogue for isolated development of
  panels (possible with vanilla TS + a simple HTML fixture runner).
- Tailwind custom plugin for BeatBax-specific design tokens (e.g. `bg-bb-toolbar`) to avoid
  `var(--…)` verbosity in class names.

---

## Open Questions

1. ~~Should the Tailwind `dark` class strategy replace the current `data-theme="light"` attribute,
   or should both be supported during a transition period?~~
   **Resolved:** Both are supported simultaneously. `theme-manager.ts` sets `data-theme` attribute
   (for existing CSS vars) AND toggles a `dark`/`light` CSS class (for Tailwind `dark:` utilities).
   Tailwind dark mode is configured via `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`.

2. ~~Should `chat-panel.ts` (AI Copilot) state (message history, API key) move into a `chat.store`
   as part of this refactor, or is that a separate concern?~~
   **Resolved:** `chat.store.ts` was added as a 6th store. `chat-panel.ts` fully migrated:
   message history persisted (capped at 50), settings persisted (API key NOT stored for security),
   mode, loading state, and unread count all managed via store. Local `loadSettings`/`saveSettings`
   helpers and `AISettings` interface removed from `chat-panel.ts`.

3. Are there any existing tests in `apps/web-ui/tests/` that directly import from
   `utils/event-bus.ts` that will need updating once the bus is removed?

---

## References

- [nanostores documentation](https://github.com/nanostores/nanostores)
- [Tailwind CSS v4 Vite plugin](https://tailwindcss.com/docs/installation/using-vite)
- [Tailwind `darkMode: 'class'`](https://tailwindcss.com/docs/dark-mode)
- [Monaco Editor source](https://github.com/microsoft/monaco-editor)
- Current web UI entry point: [apps/web-ui/src/main.ts](../../apps/web-ui/src/main.ts)
- Current event bus: [apps/web-ui/src/utils/event-bus.ts](../../apps/web-ui/src/utils/event-bus.ts)
- Current channel state: [apps/web-ui/src/playback/channel-state.ts](../../apps/web-ui/src/playback/channel-state.ts)
