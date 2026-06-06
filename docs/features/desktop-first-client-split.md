---
title: "Desktop-First Client Split (app-core + web-lite + React Desktop)"
status: proposed
authors: ["kadraman"]
created: 2026-06-06
issue: "https://github.com/kadraman/beatbax/issues/136"
related:
  - docs/features/electron-desktop-client.md
---

## Summary

Restructure BeatBax's client applications so the **Electron desktop app is the primary, full-featured IDE**, while the **browser web UI becomes a simplified "web-lite" experience** for trying BeatBax without installation. Shared application logic moves into a new `@beatbax/app-core` workspace package; the desktop renderer is built with **React** (not a symlink of the vanilla web-ui DOM).

This feature supersedes the original "additive Electron wrapper around web-ui" approach documented in [electron-desktop-client.md](./electron-desktop-client.md). Electron-specific plumbing (IPC, native menus, packaging) remains as specified there; the renderer architecture and web-ui scope change significantly.

---

## Problem Statement

### Browser limitations

The current web UI at `apps/web-ui` is the only client. It runs in a browser sandbox:

- File exports trigger downloads rather than saving to a user-chosen path.
- No native Open/Save dialogs, file-type associations, or recent-files menu.
- Long audio render tasks cannot access the local file system directly.
- Distribution requires a hosted web server; there is no standalone installable app.

### Full IDE in the browser is the wrong default

The web UI has grown into a full IDE (~2,060-line `main.ts`, Monaco with code lens / glyph margin / command palette, channel mixer, pattern grid, export pipeline, BeatBax CoPilot, settings, and more). Many of these features are awkward or impossible to deliver well in a browser, and maintaining a single monolithic client for both browser and desktop creates friction:

- Browser users get complexity they do not need for a "try it" experience.
- A desktop build that simply reuses the entire vanilla web-ui DOM defers a maintainable UI architecture and makes React adoption harder later.
- Business logic, state, and UI chrome are tightly coupled in `apps/web-ui`, blocking independent evolution of each client.

### Goal

| Client | Role | Profile |
|--------|------|---------|
| **Desktop** (`apps/desktop`) | Default download; full IDE | `desktop-full` |
| **Web** (`apps/web-ui`) | Try in browser; limited editing/playback | `web-lite` |

---

## Architecture Decision

**Decision (2026-06-06):** Extract shared logic into `packages/app-core`, simplify web-ui to web-lite, and build the desktop renderer with **React + electron-vite** consuming app-core. Do **not** symlink `apps/web-ui/src` into the Electron renderer.

| Factor | Original plan ([electron-desktop-client.md](./electron-desktop-client.md)) | Revised plan (this document) |
|--------|-----------------------------------------------------------------------------|------------------------------|
| Code sharing | Symlink or alias web-ui source into desktop renderer | `@beatbax/app-core` package |
| Desktop UI framework | Vanilla TS + DOM (same as web-ui) | React |
| Web UI scope | Unchanged full IDE | Simplified web-lite |
| Desktop positioning | Opt-in additive distribution | **Primary client** |
| Estimated effort | 3–3.5 days | ~12–18 days |

Rationale:

1. **app-core-first** avoids maintaining two full UIs long-term; business logic lives in one place.
2. **React on desktop** enables a modern component model for the full IDE without rewriting web-lite.
3. **web-lite** gives browser users a focused edit/play/visualizer experience and drives desktop downloads.

---

## Proposed Solution

### Target architecture

```
packages/
  engine/          @beatbax/engine        (unchanged)
  app-core/        @beatbax/app-core      (NEW — shared logic)

apps/
  web-ui/          @beatbax/web-ui        web-lite profile, vanilla TS shell
  desktop/         @beatbax/desktop       desktop-full profile, Electron + React
```

```mermaid
flowchart TB
  subgraph packages [packages]
    ENGINE["@beatbax/engine"]
    CORE["@beatbax/app-core"]
    ENGINE --> CORE
  end

  subgraph apps [apps]
    WEB["apps/web-ui\nweb-lite\nvanilla TS"]
    DESK["apps/desktop\nElectron + React\ndesktop-full"]
  end

  CORE --> WEB
  CORE --> DESK

  subgraph io [I/O adapters per app]
    BFS["browser-fs.ts"]
    EFS["electron-fs.ts IPC"]
  end

  WEB --> BFS
  DESK --> EFS
```

### Client profiles and capabilities

Each app sets its profile at build time via Vite `define`:

```typescript
// apps/web-ui/vite.config.ts
define: { __CLIENT_PROFILE__: '"web-lite"' }

// apps/desktop electron.vite.config.ts (renderer)
define: { __CLIENT_PROFILE__: '"desktop-full"' }
```

`packages/app-core/src/client-profile.ts`:

```typescript
export type ClientProfile = 'web-lite' | 'desktop-full';

export interface ClientCapabilities {
  export: boolean;
  copilot: boolean;
  channelMixer: boolean;
  patternGrid: boolean;
  advancedEditor: boolean;   // code lens, glyph margin, command palette
  midiStepEntry: boolean;
  helpPanel: boolean;
  problemsPanel: boolean;
  outputPanel: boolean;
  settingsPanel: boolean;
  nativeMenu: boolean;
}
```

### Feature matrix

| Capability | web-lite | desktop-full |
|------------|----------|--------------|
| Editing | Basic Monaco (syntax, diagnostics, completions, folding) | Full IDE (code lens, glyph margin, command palette, MIDI step entry) |
| Playback | Play/pause/stop, BPM, volume, loop | Full transport + pattern grid sync |
| Panels | Visualizer + Problems (validation) | Visualizer, Mixer, Help, Copilot, Problems, Output |
| Export | **None** | All formats via native save dialog |
| CoPilot | **No** | Yes |
| File open | Hidden input + `?song=` URL | Native Open dialog + drag-drop + associations |
| File save | localStorage auto-save only | Native Save/Save As |
| Menu | Simplified toolbar | Native OS menu (no DOM MenuBar) |

---

## Implementation Plan

### Phase 1: Create `@beatbax/app-core`

**New package:** `packages/app-core/`

1. Scaffold workspace package with `package.json`, `tsconfig.json`, Jest config.
2. Add `client-profile.ts` and `getCapabilities()` API.
3. Move framework-agnostic modules from `apps/web-ui/src/`:

   | Module | Source path |
   |--------|-------------|
   | Stores | `stores/` |
   | Playback | `playback/` |
   | Editor | `editor/` (core + advanced, gated by profile) |
   | Export | `export/` |
   | Import | `import/` |
   | Plugins | `plugins/` |
   | Utils | `event-bus`, `feature-flags`, `local-storage` |
   | Types | `types/` |

4. Add I/O abstraction at `src/io/fs-adapter.ts`:

   ```typescript
   export interface FileIOAdapter {
     openFile(): Promise<{ name: string; content: string } | null>;
     saveFile(name: string, data: Uint8Array): Promise<string | null>;
   }
   ```

5. Extract bootstrap orchestration from `main.ts` into `src/app/create-app-context.ts` — returns typed `AppContext` (event bus, stores, playback, export manager, parse pipeline).
6. Refactor `apps/web-ui` to import from `@beatbax/app-core` with **no user-visible behavior change** (refactor-only milestone).

**Deliverable:** `@beatbax/app-core` builds and tests independently; web-ui behavior unchanged.

---

### Phase 2: Simplify Web UI (web-lite)

1. Set `__CLIENT_PROFILE__ = "web-lite"` in `apps/web-ui/vite.config.ts`.
2. Slim layout in `app/layout.ts` and `app/tabs.ts`:
   - Remove: MenuBar, Help/Copilot right tabs, Output bottom tab, pattern grid host, channel mixer hosts.
   - Keep: simplified toolbar (Open, theme), transport bar, editor, Visualizer (fixed/collapsible right pane), Problems pane, status bar.
   - Add: "Get the Desktop App" link in header → GitHub Releases.
3. Gate features via `getCapabilities()` — no export UI, no CoPilot, no advanced editor bootstrap, no MIDI step entry, minimal settings (theme + word wrap).
4. File I/O: open via hidden input + URL loading; save via localStorage auto-save only; no export.

**Deliverable:** Deployed web app is a lightweight try/edit/play experience.

---

### Phase 3: Build Electron Desktop (React)

Follow [electron-desktop-client.md](./electron-desktop-client.md) for main process, preload, IPC, and packaging. **Renderer differs:** React instead of web-ui symlink.

```
apps/desktop/
  electron.vite.config.ts
  electron-builder.yml
  package.json
  src/
    main/           index.ts, ipc-handlers.ts, menu.ts
    preload/        index.ts (contextBridge → window.electronAPI)
    renderer/
      main.tsx
      App.tsx
      electron-fs.ts
      components/     AppLayout, Toolbar, TransportBar, EditorPane, panels
      hooks/          useAppContext, usePlayback, useEditor
      styles/
```

**React component map** (initial):

| Current vanilla module | Desktop React component |
|------------------------|-------------------------|
| `app/layout.ts` + `ui/layout.ts` | `AppLayout.tsx` |
| `ui/menu-bar.ts` | Hidden; native menu in main process |
| `ui/toolbar.ts` | `Toolbar.tsx` |
| `ui/transport-bar.ts` | `TransportBar.tsx` |
| `ui/pattern-grid.ts` | `PatternGrid.tsx` |
| Monaco setup | `EditorPane.tsx` via `@monaco-editor/react` |
| `panels/song-visualizer.ts` | `VisualizerPanel.tsx` (bridge mount first, React rewrite later) |
| `panels/channel-mixer.ts` | `ChannelMixerPanel.tsx` (bridge first) |
| `panels/chat-panel.ts` | `CopilotPanel.tsx` |
| `panels/help-panel.ts` | `HelpPanel.tsx` |
| `panels/output-panel.ts` | `ProblemsPanel.tsx`, `OutputPanel.tsx` |
| `panels/settings-panel.ts` | `SettingsModal.tsx` |

**Bridge pattern:** Complex canvas panels (Visualizer, Mixer) mount existing app-core panel classes via `useEffect` + ref in Phase 3; native React rewrites scheduled as post-MVP follow-up.

**Preload API** (extends original doc):

```typescript
interface ElectronAPI {
  openFile(options): Promise<{ path: string; data: Uint8Array } | null>;
  saveFile(options, data: Uint8Array): Promise<string | null>;
  getRecentFiles(): Promise<string[]>;
  addRecentFile(path: string): void;
  getVersion(): string;
  onMenuAction(callback: (action: string) => void): void;
}
```

**Deliverable:** Installable desktop app with full feature parity to today's web-ui.

---

### Phase 4: Distribution and positioning

1. Update root `README.md` — desktop download first; web as "Try in browser (limited)".
2. Add `apps/desktop/README.md` (dev, build, dist).
3. Add `.github/workflows/desktop-build.yaml` — build engine → app-core → desktop; Playwright Electron smoke tests; upload installers.
4. Root `package.json` scripts: `desktop:dev`, `desktop:build`, `desktop:dist`.
5. GitHub Releases: desktop installers as primary artifact.
6. Existing `beatbax-build.yaml` continues deploying web-lite to app.beatbax.com.

---

### Phase 5: Post-MVP polish

- Rewrite Visualizer and Channel Mixer as native React components.
- Shared Tailwind design tokens (`packages/ui-tokens/` optional).
- `electron-updater` auto-update (see electron-desktop-client future enhancements).

---

## CLI Changes

None — `@beatbax/cli` is unaffected.

---

## Export Changes

No engine export logic changes. `ExportManager` in app-core continues calling `fs.writeFileSync`; each app provides the appropriate Vite alias shim (`browser-fs.ts` or `electron-fs.ts`). Export UI is desktop-only.

---

## Documentation Updates

- This document (master plan).
- [electron-desktop-client.md](./electron-desktop-client.md) — revised to reference this doc; Electron-specific sections retained.
- Root `README.md` — desktop-first positioning.
- `apps/desktop/README.md` — new.
- `apps/web-ui/README.md` — note web-lite scope.
- `packages/app-core/README.md` — new.
- `ROADMAP.md` — update client distribution targets.

---

## Testing Strategy

### Unit tests (`packages/app-core`)

- Client profile / capability gating.
- Stores, parse pipeline, export manager.
- File I/O adapter mocks.

### Unit tests (`apps/desktop`)

- IPC handlers (path traversal validation).
- `electron-fs.ts` adapter.
- Native menu template structure.

### Integration tests

- **web-ui:** web-lite layout renders without export/copilot; capabilities gate correctly.
- **desktop:** Playwright for Electron — open `.bax`, play, export JSON, native menu actions.

### Manual QA

- Desktop: full IDE on Windows (primary), then macOS/Linux.
- Web-lite: Chrome, Firefox, Safari smoke test.
- Verify `.bax` double-click opens desktop on Windows/macOS.

---

## Migration Path

This is a **breaking change in product positioning**, not in engine or CLI APIs:

1. **Phase 1** is internal refactor only — deployed web-ui unchanged until Phase 2.
2. **Phase 2** deploys web-lite — existing web users lose export, CoPilot, mixer, pattern grid, and advanced editor features in browser. Messaging should direct users to desktop download.
3. **Phase 3** ships desktop as the recommended client with full feature set.
4. No `@beatbax/engine` public API changes.

---

## Implementation Checklist

### Phase 1 — app-core

- [ ] Scaffold `packages/app-core/` workspace package
- [ ] Implement `client-profile.ts` and `getCapabilities()`
- [ ] Implement `FileIOAdapter` interface
- [ ] Move stores, playback, editor, export, import, plugins, utils, types from web-ui
- [ ] Extract `createAppContext()` from `main.ts`
- [ ] Refactor web-ui to consume app-core (no behavior change)
- [ ] Move applicable unit tests to app-core

### Phase 2 — web-lite

- [ ] Set `__CLIENT_PROFILE__ = "web-lite"` in web-ui Vite config
- [ ] Slim layout (Visualizer + Problems only; no MenuBar/mixer/grid/copilot)
- [ ] Remove export UI and CoPilot entirely
- [ ] Disable advanced editor features (code lens, glyph margin, command palette)
- [ ] Add "Get Desktop App" CTA in header
- [ ] Update web-ui tests for web-lite gating

### Phase 3 — desktop

- [ ] Scaffold `apps/desktop/` with electron-vite + React
- [ ] Implement main process (`index.ts`, `ipc-handlers.ts`, `menu.ts`)
- [ ] Implement preload `contextBridge`
- [ ] Implement `electron-fs.ts` IPC adapter
- [ ] Build React shell (AppLayout, Toolbar, TransportBar, EditorPane)
- [ ] Wire panel bridges / React components to app-core
- [ ] Register `.bax` and `.uge` file associations
- [ ] Configure `electron-builder.yml`
- [ ] Add desktop unit and Playwright integration tests

### Phase 4 — distribution

- [ ] Add desktop CI workflow
- [ ] Add root `desktop:*` npm scripts
- [ ] Update README, ROADMAP, package READMEs
- [ ] Manual QA on Windows (primary platform)
- [ ] Publish first desktop release on GitHub Releases

---

## Future Enhancements

See [electron-desktop-client.md — Future Enhancements](./electron-desktop-client.md#future-enhancements):

- Auto-update via `electron-updater`
- System tray with play/stop
- Global keyboard shortcut
- Crash reporting
- Offline AI chat (Ollama routing)
- Multi-window support
- External file watcher

Additional (from this feature):

- Native React Visualizer and Channel Mixer (remove bridge mounts)
- Shared `packages/ui-tokens/` for Tailwind consistency

---

## Open Questions

1. **Code signing:** Required for macOS notarisation and Windows SmartScreen. Are certificates available for CI/CD?
2. **Target platform priority:** Windows first for initial release, or all three simultaneously?
3. **WAV export in Electron:** Reimplement without `standardized-audio-context` polyfill using native `OfflineAudioContext`?
4. **Web-lite save UX:** Is localStorage auto-save sufficient, or should web-lite offer explicit in-browser download of edited `.bax` (without full export menu)?

---

## References

- [electron-desktop-client.md](./electron-desktop-client.md) — Electron IPC, main process, packaging (renderer approach revised by this doc)
- [web-ui-refactoring.md](./complete/web-ui-refactoring.md) — prior decision to stay vanilla TS in web-ui
- [monorepo-refactoring.md](./complete/monorepo-refactoring.md) — workspace structure
- [ai-chatbot-assistant.md](./complete/ai-chatbot-assistant.md) — CoPilot (desktop-only after this change)
- [apps/web-ui/vite.config.ts](../../apps/web-ui/vite.config.ts)
- [apps/web-ui/src/main.ts](../../apps/web-ui/src/main.ts)
- [electron-vite documentation](https://electron-vite.org/)
- [electron-builder documentation](https://www.electron.build/)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electronapplication)

---

## Additional Notes

Estimated effort: **~12–18 developer days** (Phase 1: 4–6d, Phase 2: 2–3d, Phase 3: 5–7d, Phase 4: 1–2d). The original electron-desktop-client estimate of 3–3.5 days assumed reusing the vanilla web-ui renderer unchanged; app-core extraction, React desktop shell, and web-lite split add significant but necessary scope.

Tracking issue draft: [.github/ISSUES/desktop-first-client-split.md](../../.github/ISSUES/desktop-first-client-split.md)
