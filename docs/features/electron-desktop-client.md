---
title: Electron Desktop Client
status: proposed
authors: ["kadraman"]
created: 2026-03-29
issue: "https://github.com/kadraman/beatbax/issues/69"
---

## Summary

Build a native cross-platform desktop application for BeatBax using Electron, reusing the existing `apps/web-ui` codebase as the renderer. The app will live at `apps/desktop/` alongside the web UI and share the same engine library, editor, playback, and panel components — replacing only the browser-specific I/O layer with real file system and native dialog support.

## Problem Statement

The web UI runs in a browser sandboxed environment:

- File exports trigger browser downloads rather than saving to a user-chosen path.
- Opening `.bax` or `.uge` files requires drag-and-drop or URL loading; there is no native Open dialog.
- No file-type associations, recent-files menu, or OS-level integration is possible.
- Long audio render tasks cannot spawn dedicated workers with access to the local file system.
- Distribution requires a running web server; there is no standalone installable app.

A desktop client eliminates all of these friction points while keeping the full feature set of the web UI intact.

## Proposed Solution

### Summary

Use **`electron-vite`** (Vite 5 compatible) to scaffold an `apps/desktop/` package that wraps the existing web UI renderer. The Electron main process handles window lifecycle, native menus, and IPC-backed file I/O. The renderer process is the web UI with a single alias swap: `browser-fs.ts` is replaced by an IPC adapter that calls `dialog.showSaveDialog` / `fs.writeFile` on the main side.

The engine (`@beatbax/engine`) and all editor, playback, panel, and UI components reuse without modification.

### Architecture

```
apps/desktop/
  electron.vite.config.ts       # electron-vite config (main + preload + renderer)
  src/
    main/
      index.ts                  # BrowserWindow creation, app lifecycle
      ipc-handlers.ts           # File open/save IPC handlers (fs, dialog)
      menu.ts                   # Native application menu (mirrors MenuBar component)
    preload/
      index.ts                  # contextBridge: exposes safe electronAPI to renderer
    renderer/
      index.html                # Entry HTML (reuses/symlinks apps/web-ui/index.html)
      src -> ../../web-ui/src   # Symlink or path alias to shared web-ui source
  electron-builder.yml          # Packaging config for Win/Mac/Linux
  package.json
```

The only file that differs from the web UI is the `fs` alias in `electron.vite.config.ts`:

| Build | `fs` alias target |
|---|---|
| Web UI (`apps/web-ui`) | `src/utils/browser-fs.ts` (in-memory capture → download) |
| Desktop (`apps/desktop`) | `src/renderer/electron-fs.ts` (IPC → main process → real fs) |

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

`apps/desktop/src/main/menu.ts` builds the OS-native menu from `Menu.buildFromTemplate`, mirroring the existing `MenuBar` component actions (New, Open, Save, Export, Play/Stop, Help). The custom `MenuBar` DOM component is hidden in desktop mode via a feature flag.

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

## Implementation Plan

### New Package: `apps/desktop/`

1. Scaffold with `electron-vite` (`npx create-electron-vite@latest`).
2. Add `@beatbax/engine` and `@beatbax/cli` as workspace dependencies.
3. Configure `electron.vite.config.ts`:
   - Renderer: inherit web-ui Vite config; swap `fs` alias to `electron-fs.ts`.
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
- `feature-flags.ts` override: set `ELECTRON = true` to hide the DOM `MenuBar`, enable native file dialogs, and show the window title bar path.
- `file-loader.ts` update: add native Open dialog path alongside existing drag-drop and URL loading.

### Web UI Changes

- Add a `isElectron()` utility returning `typeof window !== 'undefined' && !!window.electronAPI`.
- Gate DOM `MenuBar` rendering behind `!isElectron()`.
- Gate browser-download logic in `ExportManager` behind `!isElectron()`.
- No other changes to shared web-ui source.

### CLI Changes

None — the CLI remains a separate package unaffected by this feature.

### Export Changes

No changes to export logic in the engine. The `ExportManager` already calls `fs.writeFileSync`; the alias swap handles the rest.

### Documentation Updates

- Add `apps/desktop/README.md` covering dev setup, build, and packaging.
- Update root `README.md` to mention the desktop app under distribution targets.
- Update `ROADMAP.md` to mark this feature in-progress / complete as work proceeds.

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

## Migration Path

This is an additive new package — no existing packages change their public API. Users who prefer the browser-based web UI are unaffected. The desktop app is an opt-in distribution target.

## Implementation Checklist

- [ ] Scaffold `apps/desktop/` with `electron-vite`
- [ ] Configure renderer to reuse web-ui source via path aliases
- [ ] Implement `electron-fs.ts` IPC adapter
- [ ] Implement main process (`index.ts`, `ipc-handlers.ts`, `menu.ts`)
- [ ] Implement preload `contextBridge`
- [ ] Add `isElectron()` guard to web-ui shared code
- [ ] Gate DOM `MenuBar` and browser-download logic
- [ ] Add native file Open/Save dialogs
- [ ] Register `.bax` and `.uge` file associations
- [ ] Configure `electron-builder.yml` for Win/Mac/Linux
- [ ] Add unit tests for IPC handlers and FS adapter
- [ ] Add Playwright integration tests
- [ ] Manual QA on Windows, macOS, Linux
- [ ] Update root `README.md` and `ROADMAP.md`
- [ ] Optional: add `electron-updater` for auto-update support

## Future Enhancements

- **Auto-update** via `electron-updater` integrated with GitHub Releases.
- **System tray** icon with quick-access play/stop controls.
- **Global keyboard shortcut** to toggle the app window (e.g. `Ctrl+Shift+B`).
- **Crash reporting** via Sentry or a self-hosted endpoint.
- **Offline AI chat** — route the Chat panel to a local LLM (Ollama) when no internet is available.
- **Multi-window** support: open multiple songs simultaneously in separate windows.
- **File watcher** — auto-reload the editor when the `.bax` file is modified externally.

## Open Questions

1. **Code sharing strategy**: symlink `apps/web-ui/src` into `apps/desktop/src/renderer/src`, or extract shared code into a `packages/ui-shared/` workspace package? The symlink approach is simpler for now; the shared package approach is cleaner long-term.
2. **WAV export**: the CLI's WAV export uses `standardized-audio-context` offline rendering → temp file → shell player. In Electron, `OfflineAudioContext` is native — should WAV export be reimplemented without the polyfill for the desktop client?
3. **Code signing**: required for macOS notarisation and Windows SmartScreen bypass. Are certificates available for CI/CD?
4. **Target platform priority**: should the initial release target Windows only (given the primary developer platform), or all three simultaneously?

## References

- [electron-vite documentation](https://electron-vite.org/)
- [electron-builder documentation](https://www.electron.build/)
- [Playwright for Electron](https://playwright.dev/docs/api/class-electronapplication)
- [Electron contextBridge security](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [apps/web-ui/vite.config.ts](../../apps/web-ui/vite.config.ts)
- [apps/web-ui/src/utils/browser-fs.ts](../../apps/web-ui/src/utils/browser-fs.ts)
- [apps/web-ui/src/export/ExportManager.ts](../../apps/web-ui/src/export/ExportManager.ts)

## Additional Notes

The estimated implementation effort is **3–3.5 developer days** for a fully functional desktop build (excluding auto-update and code signing setup). The work is largely configuration and thin adapter code — the audio engine, editor, and all panels transfer unchanged. The bulk of the effort is in the Electron main/preload plumbing and integration testing across platforms.
