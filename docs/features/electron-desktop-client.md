---
title: Electron Desktop Client
status: proposed
authors: ["kadraman"]
created: 2026-03-29
updated: 2026-06-06
issue: "https://github.com/kadraman/beatbax/issues/69"
supersedes: "renderer symlink approach — see Architecture Revision below"
related:
  - docs/features/desktop-first-client-split.md
---

## Summary

Build a native cross-platform desktop application for BeatBax using Electron at `apps/desktop/`. The Electron **main process, preload IPC layer, native menus, and packaging** described in this document remain the plan. The **renderer approach has been revised**: instead of reusing the vanilla `apps/web-ui` DOM via symlink, the desktop app will use a **React renderer** consuming shared logic from `@beatbax/app-core`, while the web UI is simplified to a **web-lite** profile.

**Master plan:** [desktop-first-client-split.md](./desktop-first-client-split.md)

This document retains Electron-specific technical details (IPC API, main process, electron-builder, file associations). Cross-cutting architecture (app-core extraction, web-lite scope, React component map, distribution positioning) lives in the master plan.

---

## Architecture Revision (2026-06-06)

The original proposal assumed the desktop renderer would symlink or alias `apps/web-ui/src` unchanged, with only an `fs` alias swap. That approach is **superseded** by [desktop-first-client-split.md](./desktop-first-client-split.md):

| Aspect | Original (this doc, 2026-03-29) | Revised (2026-06-06) |
|--------|----------------------------------|----------------------|
| Renderer | Vanilla web-ui source reused | **React** shell in `apps/desktop/src/renderer/` |
| Code sharing | Symlink web-ui → desktop renderer | **`@beatbax/app-core`** workspace package |
| Web UI | Unchanged full IDE | **web-lite** — simplified edit/play, Visualizer only, no export/CoPilot |
| Positioning | Opt-in additive distribution | **Desktop is the default client** |
| Effort | ~3–3.5 days | ~12–18 days (see master plan) |

**Unchanged from this doc:** electron-vite scaffold, main/preload processes, `electronAPI` IPC surface, `electron-fs.ts` adapter pattern, native OS menu, electron-builder targets, file associations, testing strategy for Electron plumbing.

**Tracking:** Issue draft at [.github/ISSUES/desktop-first-client-split.md](../../.github/ISSUES/desktop-first-client-split.md)

---

## Problem Statement

The web UI runs in a browser sandboxed environment:

- File exports trigger browser downloads rather than saving to a user-chosen path.
- Opening `.bax` or `.uge` files requires drag-and-drop or URL loading; there is no native Open dialog.
- No file-type associations, recent-files menu, or OS-level integration is possible.
- Long audio render tasks cannot spawn dedicated workers with access to the local file system.
- Distribution requires a running web server; there is no standalone installable app.

A desktop client eliminates these friction points. With the revised plan, the **full IDE feature set moves to desktop**; the browser client becomes a lightweight try/edit/play experience (see master plan feature matrix).

---

## Proposed Solution

### Summary

Use **`electron-vite`** (Vite 5 compatible) to scaffold an `apps/desktop/` package. The Electron main process handles window lifecycle, native menus, and IPC-backed file I/O. The renderer process is a **React application** (`main.tsx`, `App.tsx`, components/) that imports `@beatbax/app-core` with the `desktop-full` client profile. The `fs` Vite alias points to `electron-fs.ts`, which calls the main process via IPC.

The engine (`@beatbax/engine`) and shared application logic (`@beatbax/app-core`) are consumed by both clients; UI chrome differs per app.

### Architecture

```
apps/desktop/
  electron.vite.config.ts       # electron-vite config (main + preload + renderer)
  electron-builder.yml          # Packaging config for Win/Mac/Linux
  package.json
  src/
    main/
      index.ts                  # BrowserWindow creation, app lifecycle
      ipc-handlers.ts           # File open/save IPC handlers (fs, dialog)
      menu.ts                   # Native application menu (mirrors MenuBar actions)
    preload/
      index.ts                  # contextBridge: exposes safe electronAPI to renderer
    renderer/
      main.tsx                  # React entry
      App.tsx                   # Root layout
      electron-fs.ts            # IPC-backed fs shim (replaces browser-fs.ts)
      components/               # React UI (Toolbar, EditorPane, panels, …)
      hooks/                    # useAppContext, usePlayback, useEditor
      styles/                   # Tailwind (shared design tokens with web-ui)

packages/app-core/              # NEW — shared logic (see master plan)
  src/
    client-profile.ts           # web-lite vs desktop-full capabilities
    stores/, playback/, editor/, export/, import/, …
```

The `fs` alias differs per app:

| Build | `fs` alias target | Client profile |
|-------|-------------------|----------------|
| Web UI (`apps/web-ui`) | `src/utils/browser-fs.ts` (in-memory capture → download) | `web-lite` |
| Desktop (`apps/desktop`) | `src/renderer/electron-fs.ts` (IPC → main process → real fs) | `desktop-full` |

### IPC File API (`electronAPI`)

Exposed via `contextBridge` in the preload script:

```typescript
interface ElectronAPI {
  // File open
  openFile(options: OpenDialogOptions): Promise<{ path: string; data: Uint8Array } | null>;
  // File save
  saveFile(options: SaveDialogOptions, data: Uint8Array): Promise<string | null>;
  // Recent files
  getRecentFiles(): Promise<string[]>;
  addRecentFile(path: string): void;
  // App version
  getVersion(): string;
  // Native menu → renderer actions (added in revised plan)
  onMenuAction(callback: (action: string) => void): void;
}
```

### Electron FS Adapter (`electron-fs.ts`)

Replaces `browser-fs.ts` in the renderer — same interface, different backend:

```typescript
// Instead of capturing bytes in memory and triggering a download,
// call the main process via IPC to write to a real file path.
export function writeFileSync(path: string, data: Uint8Array): void {
  // Queues an async IPC write; synchronous illusion maintained for engine compat.
  window.electronAPI.saveFile({ defaultPath: path }, data);
}
```

### Native Menu

`apps/desktop/src/main/menu.ts` builds the OS-native menu from `Menu.buildFromTemplate`, mirroring the existing `MenuBar` component actions (New, Open, Save, Export, Play/Stop, Help). The desktop React app has **no DOM MenuBar** — all file/edit/view actions come from the native menu via `onMenuAction` IPC.

### Example Usage

```bash
# Development
cd apps/desktop
npm run dev          # electron-vite dev server with HMR

# Production build
npm run build        # compiles main + preload + renderer
npm run dist         # runs electron-builder → produces installers
```

Installers produced:
- **Windows**: NSIS `.exe` installer + portable `.zip`
- **macOS**: `.dmg` with drag-to-Applications
- **Linux**: `.AppImage` + `.deb`

---

## Implementation Plan

> Phases 1–2 (app-core, web-lite) and React renderer component map are in [desktop-first-client-split.md](./desktop-first-client-split.md). This section covers **Electron-specific work** (Phase 3 subset).

### New Package: `apps/desktop/`

1. Scaffold with `electron-vite` (`npx create-electron-vite@latest`) — use React template for renderer.
2. Add `@beatbax/app-core`, `@beatbax/engine`, and plugin packages as workspace dependencies.
3. Configure `electron.vite.config.ts`:
   - Renderer: React + Vite; `define: { __CLIENT_PROFILE__: '"desktop-full"' }`.
   - Swap `fs` alias to `electron-fs.ts`.
   - Add `optimizeDeps.exclude: ['@beatbax/engine']` (same as web-ui).
   - Set `conditions: ['browser', 'module', 'import', 'default']` for engine resolution.
4. Add `electron-builder.yml` for cross-platform packaging.

### Main Process (`src/main/`)

- `index.ts`: Create `BrowserWindow` (1280×800 default, frame, webPreferences with `contextIsolation: true`, `nodeIntegration: false`). Handle `app.on('open-file')` for macOS file association. Register as default handler for `.bax` and `.uge` file extensions.
- `ipc-handlers.ts`: Register handlers for `dialog:openFile`, `dialog:saveFile`, `fs:writeFile`, `app:getRecentFiles`, `app:addRecentFile` using `ipcMain.handle`.
- `menu.ts`: Build native `Menu` from template; emit IPC events to renderer for actions (play, stop, export, open, new).

### Preload (`src/preload/`)

- `index.ts`: Expose `window.electronAPI` via `contextBridge.exposeInMainWorld`, forwarding all IPC calls with input validation. Never expose raw `ipcRenderer` to renderer.

### Renderer (`src/renderer/`)

- `electron-fs.ts`: IPC-backed write adapter (replaces `browser-fs.ts`).
- React app wired to `@beatbax/app-core` `createAppContext()` with `desktop-full` profile.
- Native Open/Save via `window.electronAPI` (not browser hidden input).
- Complex panels (Visualizer, Mixer): bridge-mount app-core panel classes initially; native React rewrites post-MVP (see master plan Phase 5).

### Web UI Changes

Handled in [desktop-first-client-split.md — Phase 2](./desktop-first-client-split.md#phase-2-simplify-web-ui-web-lite):

- Web-ui becomes **web-lite** — not an Electron renderer peer.
- No `isElectron()` guards needed in web-ui (desktop is a separate React app).
- Export, CoPilot, mixer, pattern grid, and advanced editor removed from web-lite build.

### CLI Changes

None — the CLI remains a separate package unaffected by this feature.

### Export Changes

No changes to export logic in the engine. `ExportManager` in app-core calls `fs.writeFileSync`; the desktop `fs` alias handles native writes. Export UI is **desktop-only**.

### Documentation Updates

- [desktop-first-client-split.md](./desktop-first-client-split.md) — master plan (this revision).
- This document — Electron plumbing reference.
- Add `apps/desktop/README.md` covering dev setup, build, and packaging.
- Update root `README.md` — desktop as primary download; web as try-in-browser.
- Update `ROADMAP.md` as work proceeds.

---

## Testing Strategy

### Unit Tests

- `ipc-handlers.test.ts`: mock `dialog` and `fs` modules; verify handlers return correct shapes and validate input paths (no path traversal).
- `electron-fs.test.ts`: verify `writeFileSync` calls `window.electronAPI.saveFile` with the correct `Uint8Array`.
- `menu.test.ts`: verify `buildFromTemplate` is called with the correct number of top-level menu items per platform.

### Integration Tests

- Use **Playwright for Electron** (`@playwright/test` + `electron` launch) to:
  - Open the app and verify the editor loads.
  - Trigger `File > Open` and confirm a `.bax` file is loaded into the editor.
  - Trigger `File > Export > JSON` and confirm a file is written to a temp directory.
  - Play a short song and confirm no audio errors are thrown (monitor `console.error`).

### Manual QA

- Load, edit, and play `songs/sample.bax` end-to-end on all three platforms.
- Export JSON, MIDI, UGE, and WAV and verify outputs open correctly in target tools.
- Verify `.bax` double-click opens the app on Windows and macOS.

Additional tests for app-core and web-lite: see [desktop-first-client-split.md — Testing Strategy](./desktop-first-client-split.md#testing-strategy).

---

## Migration Path

Revised from "additive opt-in" to **desktop-first product split**:

1. **Phase 1** (app-core): Internal refactor; deployed web-ui unchanged.
2. **Phase 2** (web-lite): Browser users get simplified experience; messaging directs to desktop download.
3. **Phase 3** (desktop): Full IDE ships as installable app — primary client.
4. Engine and CLI public APIs unchanged.

See [desktop-first-client-split.md — Migration Path](./desktop-first-client-split.md#migration-path).

---

## Implementation Checklist

### Electron plumbing (this document)

- [ ] Scaffold `apps/desktop/` with electron-vite (React renderer)
- [ ] Implement `electron-fs.ts` IPC adapter
- [ ] Implement main process (`index.ts`, `ipc-handlers.ts`, `menu.ts`)
- [ ] Implement preload `contextBridge` (including `onMenuAction`)
- [ ] Add native file Open/Save dialogs
- [ ] Register `.bax` and `.uge` file associations
- [ ] Configure `electron-builder.yml` for Win/Mac/Linux
- [ ] Add unit tests for IPC handlers and FS adapter
- [ ] Add Playwright integration tests
- [ ] Manual QA on Windows, macOS, Linux
- [ ] Optional: add `electron-updater` for auto-update support

### Full initiative (master plan)

See [desktop-first-client-split.md — Implementation Checklist](./desktop-first-client-split.md#implementation-checklist) for app-core extraction, web-lite simplification, React shell, CI, and distribution tasks.

---

## Future Enhancements

- **Auto-update** via `electron-updater` integrated with GitHub Releases.
- **System tray** icon with quick-access play/stop controls.
- **Global keyboard shortcut** to toggle the app window (e.g. `Ctrl+Shift+B`).
- **Crash reporting** via Sentry or a self-hosted endpoint.
- **Offline AI chat** — route the Chat panel to a local LLM (Ollama) when no internet is available.
- **Multi-window** support: open multiple songs simultaneously in separate windows.
- **File watcher** — auto-reload the editor when the `.bax` file is modified externally.
- **Native React panels** — replace bridge-mounted Visualizer/Mixer (master plan Phase 5).

---

## Open Questions

1. ~~**Code sharing strategy**~~: **Resolved** — use `packages/app-core/` (see [desktop-first-client-split.md](./desktop-first-client-split.md)).
2. **WAV export**: the CLI's WAV export uses `standardized-audio-context` offline rendering → temp file → shell player. In Electron, `OfflineAudioContext` is native — should WAV export be reimplemented without the polyfill for the desktop client?
3. **Code signing**: required for macOS notarisation and Windows SmartScreen bypass. Are certificates available for CI/CD?
4. **Target platform priority**: should the initial release target Windows only (given the primary developer platform), or all three simultaneously?

---

## References

- **[desktop-first-client-split.md](./desktop-first-client-split.md)** — master plan (app-core, web-lite, React desktop, distribution)
- [.github/ISSUES/desktop-first-client-split.md](../../.github/ISSUES/desktop-first-client-split.md) — GitHub issue draft
- [electron-vite documentation](https://electron-vite.org/)
- [electron-builder documentation](https://www.electron.build/)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electronapplication)
- [Electron contextBridge security](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [apps/web-ui/vite.config.ts](../../apps/web-ui/vite.config.ts)
- [apps/web-ui/src/utils/browser-fs.ts](../../apps/web-ui/src/utils/browser-fs.ts)
- [apps/web-ui/src/export/ExportManager.ts](../../apps/web-ui/src/export/ExportManager.ts)

---

## Additional Notes

The original estimate of **3–3.5 developer days** applied to reusing the vanilla web-ui renderer unchanged. With the revised architecture (app-core extraction, web-lite split, React desktop shell), total effort is **~12–18 developer days** — see [desktop-first-client-split.md — Additional Notes](./desktop-first-client-split.md#additional-notes).

Electron-specific plumbing (main/preload/IPC/packaging) remains largely as originally scoped; the additional effort is in app-core extraction and the React renderer.
