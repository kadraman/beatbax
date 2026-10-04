# Implementation Plan: Desktop developer tools opt-in and diagnostics log

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-02 | **Branch**: `feat/091-desktop-devtools-and-diagnostics`

## Summary

Replace the accidental production behaviour from `optimizer.watchWindowShortcuts` with a BeatBax-owned developer tools policy enforced in the main process, add a small rotating diagnostics log written by the main process (renderer entries arrive over IPC), and fix the startup error screen. Desktop only; no engine, AST, or language changes.

## Technical context

- **Packages / surfaces**: `apps/desktop` (main, preload, shared, renderer). No changes to `packages/engine`; `packages/app-core` is only subscribed to (event bus), not changed.
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest (`apps/desktop/tests`, Electron mocked via `tests/__mocks__/electron.ts`), Playwright e2e (`apps/desktop/tests/e2e`)
- **Client profile**: desktop-full only
- **Constraints**: logging must never block or crash playback; the log is bounded in size; no new network access.

## Constitution Check

- [x] No invented syntax or undocumented language behavior (desktop UI and diagnostics only)
- [x] AST / ISM / scheduler / expansion impact identified: N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies (no engine or plugin changes)
- [x] Determinism and compatibility preserved: development builds keep auto-open and F12; packaged defaults stay "developer tools unavailable"; no song or export behaviour changes
- [x] Tests planned for new behavior (unit, e2e, manual packaged QA)

**Exceptions**: none.

## Project structure

New:

- `apps/desktop/src/main/devtools-policy.ts`: persisted setting, launch flag, `isDevToolsAllowed()`, shortcut decision, window enforcement
- `apps/desktop/src/main/diagnostics-log.ts`: log writer (rotation, redaction, rate limiting)
- `apps/desktop/src/renderer/src/lib/diagnostics-log.ts`: forwards renderer events to the main-process log
- `apps/desktop/tests/devtools-policy.test.ts`, `apps/desktop/tests/diagnostics-log.test.ts`
- `docs/ui/desktop-troubleshooting.md`

Changed:

- `apps/desktop/src/main/index.ts`: policy wiring instead of `optimizer.watchWindowShortcuts` in packaged builds; `app.setAppLogsPath()`; process-level error hooks
- `apps/desktop/src/main/ipc-handlers.ts`: new IPC handlers; `WINDOW_TOGGLE_DEVTOOLS` checks the policy; existing `console.error`/`console.warn` sites also log
- `apps/desktop/src/main/menu.ts`: macOS View item only when allowed; Help → Open Logs Folder; remove the hidden Windows/Linux devtools accelerator (handled by the policy)
- `apps/desktop/src/shared/ipc.ts`, `shared/electron-api.ts`, `preload/index.ts`: new channels and API methods
- `apps/desktop/src/renderer/src/components/shell/menu-bar.ts`, `lib/desktop-menu-bar.ts`: View → Toggle Developer Tools (conditional), Help → Open Logs Folder
- `apps/desktop/src/renderer/src/components/settings/advanced.tsx`: toggle, warning, launch-flag note; Reset all settings also disables developer tools
- `apps/desktop/src/renderer/src/components/ErrorBoundary.tsx`: buttons and accurate text
- `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`: route `installGlobalErrorHandlers` entries to the log
- `docs/qa/desktop-release-qa.md`, `docs/api/logger.md` (cross-link)

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None. (`--devtools` is a Desktop launch flag, not a BeatBax CLI option.)

### Desktop / web UI changes

**Developer tools policy (main process)**

- Setting file `userData/desktop-diagnostics.json`: `{ "version": 1, "devToolsEnabled": boolean }`, read and written like `desktop-remote-assets.json` (`readDesktopRemoteAssetAllowlist` pattern). Missing, corrupt, or wrong version means `false`.
- Launch flag: `app.commandLine.hasSwitch('devtools')`. `queueStartupSongPaths()` already ignores arguments that are not `.bax`/`.uge` paths.
- State: `getDevToolsState(): { allowed: boolean; source: 'development' | 'setting' | 'launch-flag' | 'off' }`. `development` when `!app.isPackaged`, unless `BEATBAX_E2E_PACKAGED_DEVTOOLS_POLICY=1` (lets e2e exercise packaged behaviour, following the existing `BEATBAX_E2E_AI_KEY_STORE` pattern).
- Shortcuts: keep `optimizer.watchWindowShortcuts` in development builds only. In packaged builds attach a BeatBax `before-input-event` handler built on a pure function `decideShortcut(input, allowed)` that returns `'toggle-devtools' | 'block' | 'pass'`:
  - Ctrl/Cmd+R: `block` (unchanged behaviour).
  - Ctrl+Shift+I (Windows/Linux) or Alt+Cmd+I (macOS): `toggle-devtools` when allowed, otherwise `block`.
- Enforcement: on `webContents` `devtools-opened`, close developer tools immediately if not allowed (covers any path that bypasses the menu or IPC).
- Turning the setting off: close developer tools if open, rebuild the native menu (`installAppMenu`), and broadcast the new state.
- IPC (all `ipcMain.handle` unless noted):
  - `desktop:get-devtools-state` → `{ allowed, source, saved }`
  - `desktop:set-devtools-enabled` (`boolean`) → new state; rejects non-boolean input
  - `desktop:devtools-state-changed` (main → renderer event)
  - existing `desktop:window-toggle-devtools`: ignored when not allowed

**Menus**

- Custom title bar (`menu-bar.ts` `viewItems()`): append a separator and **Toggle Developer Tools** (shortcut label Ctrl+Shift+I) only when `allowed`; `desktop-menu-bar.ts` subscribes to `devtools-state-changed` and rebuilds.
- Help menus (custom and macOS native): **Open Logs Folder**.
- macOS native View menu (`buildMacViewMenu`): include the existing item only when allowed. `buildBasicViewMenu` drops its item; the policy handler owns the shortcut.

**Settings → Advanced → Diagnostics**

- `ToggleRow` "Enable developer tools", reading `getDevToolsState()`.
- Turning on: `window.confirm` (the section's existing confirmation pattern) with text along the lines of: "Developer tools give full access to BeatBax's internals, including your saved AI API key. Never paste code into the console unless you wrote it or fully understand it. Enable developer tools?"
- When `source === 'launch-flag'`, show a note: "Enabled for this session by the --devtools launch flag." When `source === 'development'`, show "Always available in development builds." and disable the toggle.
- **Reset all settings...** additionally calls `setDevToolsEnabled(false)` before reloading.

**Diagnostics log (main process)**

- Location: call `app.setAppLogsPath()` at startup (macOS `~/Library/Logs/BeatBax`, Windows and Linux inside `userData`), file `beatbax.log`. E2E may override with `BEATBAX_E2E_LOGS_DIR`.
- Format: one entry per line, `2026-10-02T19:14:03.123Z [warn] [playback] message`; stack traces follow on indented lines.
- Rotation: when `beatbax.log` would exceed 1 MiB, rename it to `beatbax.old.log` (replacing any previous one) and start a new file.
- Writes are queued and serialized with `fs.promises.appendFile`; any I/O error switches the logger to console-only for the rest of the session (FR-016).
- Redaction before writing: replace the stored AI API key value (if any), `Authorization`/`Bearer …` values, and `sk-`-style key patterns with `[redacted]`.
- Startup line: `BeatBax <version> (Electron <version>, <platform> <release> <arch>)`.
- Main-process sources: `process.on('uncaughtException')`, `process.on('unhandledRejection')`, `render-process-gone`, `child-process-gone`, plus explicit `logDiagnostics(...)` calls next to the existing `console.error`/`console.warn` sites in `index.ts` and `ipc-handlers.ts` (no console monkey-patching).

**Renderer → log**

- Channel `desktop:diagnostics-log` (`ipcRenderer.send`, fire-and-forget) with `{ level: 'warn' | 'error'; source: string; message: string; stack?: string }`.
- Main validates shape, truncates `message` and `stack` to 4 KiB each, and allows at most 100 renderer entries per minute per window; excess entries are counted and written as one "N renderer log entries dropped" line when the window reopens.
- Renderer forwarder (`lib/diagnostics-log.ts`) subscribes to app-core events: `playback:error`, `export:error`, and `output:message` with `type` `warning` or `error` (this includes the new DMC sample-load warnings from 019). It does **not** forward `parse:error` or validation results (they contain song text and fire while typing; FR-012).
- `installGlobalErrorHandlers` (uncaught errors, unhandled rejections) and `ErrorBoundary.componentDidCatch` also forward, with stack traces.

**Open logs folder**

- `desktop:open-logs-folder` → `shell.openPath(app.getPath('logs'))`; creates the folder first if missing.

**Startup error screen (`ErrorBoundary.tsx`)**

- Show the message, an **Open logs folder** button, and **Open developer tools** only when allowed (state fetched on mount; the preload bridge is independent of React).
- When not allowed: "To inspect this further, restart BeatBax with the --devtools launch flag." Replace the current "Use View → Toggle Developer Tools" line.
- Keep the separate "Electron preload failed to load" message in `App.tsx` as is (the bridge is unavailable in that case, so buttons cannot work).

### Export changes

None.

### Documentation updates

- New `docs/ui/desktop-troubleshooting.md`: log locations per OS, Help → Open Logs Folder, what is and is not logged, enabling developer tools (setting and `--devtools`), the pasting-code warning, and `--remote-debugging-port` as a last resort for maintainers.
- `docs/qa/desktop-release-qa.md`: packaged-build checks for this feature.
- `docs/api/logger.md`: note that the Desktop log file records warnings/errors independently of `window.beatbaxDebug` levels.

## Testing strategy

### Unit tests

- `devtools-policy.test.ts`:
  - settings file read/write; missing, corrupt, or wrong-version files mean off
  - `getDevToolsState` source precedence: development > launch flag > setting > off
  - `decideShortcut` for every combination of platform, key, and allowed
  - the toggle IPC handler ignores requests while disabled
  - turning off closes open developer tools and broadcasts state
- `diagnostics-log.test.ts` (temporary directory):
  - line format and startup line
  - rotation at the size limit, keeping one old file
  - redaction of a stored key, a bearer header, and an `sk-` pattern
  - per-entry truncation; rate limiting with a dropped-count line
  - I/O failure falls back silently
- `menu.test.ts`: the macOS View item is present only when allowed; Help → Open Logs Folder exists on all platforms.

### Integration tests

Playwright with `BEATBAX_E2E_PACKAGED_DEVTOOLS_POLICY=1` and `BEATBAX_E2E_LOGS_DIR`:

1. By default, `electronAPI.toggleDevTools()` and Ctrl+Shift+I do not open developer tools, and the View menu has no Toggle Developer Tools item.
2. Enabling in Settings → Advanced (accepting the confirm) shows the menu item, and toggling opens developer tools; disabling closes them.
3. Launching with `--devtools` reports `source: 'launch-flag'` and leaves the saved setting off.
4. A DMC song with a blocked host writes the Output warning to the log file; an invented renderer error appears with a stack trace; the log contains no song source text.
5. Help → Open Logs Folder calls `shell.openPath` with the logs directory (stubbed in the main process).

### Manual / QA

Packaged build on Windows (and macOS when available):

- default off
- enable and disable without restarting
- `--devtools`
- Help → Open Logs Folder opens the right folder
- forced error on the startup error screen shows working buttons

## Migration and compatibility

- Existing installs have no `desktop-diagnostics.json`, so developer tools stay unavailable, matching today's effective behaviour on Windows and Linux. On macOS the native View menu item disappears until the setting is enabled; this is intentional and noted in release notes.
- The log file is new; nothing to migrate.

## Open implementation questions

1. Use the `electron-log` package instead of the in-house writer? The plan prefers in-house (about 100 lines, no new dependency, redaction under our control). Revisit if requirements grow to include multiple transports.
2. Should the macOS native View menu item be shown but disabled (rather than hidden) when developer tools are off? The spec currently says hidden.
