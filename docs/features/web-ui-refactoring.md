---
title: "Web UI Refactoring: Tailwind CSS + nanostores + component split"
status: proposed
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

### Phase 0 — Setup (~0.5 days)

- [ ] Install `tailwindcss`, `postcss`, `autoprefixer`, `nanostores`
- [ ] Create `tailwind.config.js` with content paths and token extensions
- [ ] Create `src/styles.css`; import in `main.ts`; verify `vite dev` still runs
- [ ] Add `@tailwindcss/vite` plugin to `vite.config.ts`
- [ ] Verify existing tests still pass (`npm test`)

### Phase 1 — Stores (~1 day)

- [ ] Create `src/stores/` with all 5 store files
- [ ] Migrate `playback/channel-state.ts` → `channel.store.ts` (localStorage persistence included)
- [ ] Migrate `editor/editor-state.ts` → `editor.store.ts`
- [ ] Migrate `ui/theme-manager.ts` state → `theme.store.ts`
- [ ] Add `playback.store.ts` and `ui.store.ts`
- [ ] Update `playback/playback-manager.ts` to write stores instead of emitting events
- [ ] Update `ui/status-bar.ts` to subscribe to stores
- [ ] Keep `event-bus.ts` alive during transition; mark deprecated

### Phase 2 — Split `main.ts` (~2 days)

- [ ] Extract `app/bootstrap.ts` (engine lazy-load, store hydration)
- [ ] Extract `app/layout.ts` (pane shell, splitters — absorbing `ui/layout.ts`)
- [ ] Extract `app/tabs.ts` (tab switching logic)
- [ ] Extract `app/modals.ts` (settings modal, keyboard overlay)
- [ ] Reduce `main.ts` to orchestration shell (~80 lines)
- [ ] Verify dev server and all features still work end-to-end

### Phase 3 — Tailwind migration (~2 days)

Convert components in bottom-up order (least CSS-heavy first):

- [ ] `ui/status-bar.ts`
- [ ] `ui/transport-bar.ts`
- [ ] `ui/theme-manager.ts` (switch to Tailwind `dark` class toggle)
- [ ] `ui/toolbar.ts`
- [ ] `ui/menu-bar.ts`
- [ ] `panels/output-panel.ts`
- [ ] `panels/help-panel.ts`
- [ ] `panels/channel-mixer.ts`
- [ ] `panels/chat-panel.ts`
- [ ] `app/layout.ts` (pane sizing)
- [ ] Remove all `document.createElement('style')` injection (keep Monaco decoration files)
- [ ] Remove large CSS block from `index.html` (only keep CSS token `:root` vars and `body` reset)

### Phase 4 — Cleanup (~0.5 days)

- [ ] Delete `utils/event-bus.ts` once no call sites remain
- [ ] Delete `playback/channel-state.ts` (superseded by `channel.store.ts`)
- [ ] Delete `editor/editor-state.ts` (superseded by `editor.store.ts`)
- [ ] Run full test suite and fix any regressions
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

- [ ] Phase 0: Tooling setup
- [ ] Phase 1: nanostores — all 5 stores, migrate channel-state + editor-state
- [ ] Phase 2: main.ts split — bootstrap, layout, tabs, modals extracted
- [ ] Phase 3: Tailwind — all components converted, inline styles removed
- [ ] Phase 4: Cleanup — dead files deleted, full test pass
- [ ] Monaco decoration files explicitly documented as kept as-is
- [ ] Bundle size comparison logged (before/after CSS bytes)

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

1. Should the Tailwind `dark` class strategy replace the current `data-theme="light"` attribute,
   or should both be supported during a transition period?
2. Should `chat-panel.ts` (AI Copilot) state (message history, API key) move into a `chat.store`
   as part of this refactor, or is that a separate concern?
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
