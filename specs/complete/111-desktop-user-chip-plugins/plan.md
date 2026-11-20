# Implementation Plan: Desktop install for standalone chip plugins

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-15 | **Branch**: `feat/111-desktop-user-chip-plugins`

## Summary

Add a Desktop-only user chip plugin pipeline: main process acquires packages from a local `.zip`/`.tgz` archive, stores them under `userData/chip-plugins/`, validates naming / peer / import graph, and exposes them to the sandboxed renderer through a privileged protocol plus a host `@beatbax/engine` import map. Settings → Plugins gains Install from package, and enable / disable / remove with full reload (no Desktop Install from npm). Web-lite and CLI discovery stay as today. Docs and the public starter-template README update when the UI ships.

## Technical context

- **Packages / surfaces**: `apps/desktop` (main, preload, renderer Settings), optionally small helpers under `packages/app-core` if shared with tests; docs under `docs/contributing/`; template repo `beatbax-plugin-chip-template` (separate git history)
- **Language**: TypeScript (strict), ESM, Electron custom protocol
- **Testing**: Jest for validators / manifest; Desktop unit or e2e for install IPC stubs
- **Client profile**: desktop-full only
- **Performance / constraints**: Offline folder install must work without network; npm install needs registry reachability from the main process; plugins must share one engine instance

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — install / register only; `.bax` `chip` directive unchanged
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies — engine never imports user plugins; Desktop host loads them after bundled catalogue
- [x] Determinism and compatibility preserved (or migration documented) — songs with unknown chips still fail loudly until the plugin is installed; bundled catalogue unchanged
- [x] Tests planned for new behavior — package-name guard, peer check, import scan, manifest replace / remove, Settings IPC stubs

**Exceptions**: none

## Project structure

Expected implementation touchpoints (not created by the specification-only PR):

| Path | Change |
| ---- | ------ |
| `apps/desktop/src/main/` | Protocol registration before `app.ready`; install / list / enable / remove handlers; npm tarball fetch + unpack; folder copy into `userData/chip-plugins/` |
| `apps/desktop/src/shared/electron-api.ts`, `ipc.ts` | IPC contracts for user chip plugins |
| `apps/desktop/src/preload/index.ts` | Bridge methods |
| `apps/desktop/src/renderer/index.html` | CSP allow privileged plugin scheme for scripts |
| `apps/desktop/src/renderer/src/` | Import map / engine bridge module; startup load of enabled user plugins after `createAppContext`; Settings UI section |
| `apps/desktop/src/renderer/src/components/settings/plugins.tsx` | Install from folder / npm; user-plugin list with enable + Remove |
| `apps/desktop/tests/` | Validator / manifest / IPC tests; optional e2e with fixture plugin |
| `docs/contributing/creating-plugins.md` | Desktop install section |
| External: `beatbax-plugin-chip-template/README.md` | Replace Desktop limitation note with Installing into BeatBax Desktop |

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None. CLI `discoverPlugins` in `packages/cli/src/cli.ts` stays as-is.

### Desktop / web UI changes

**Main process — acquisition**

1. Directory picker for Install from folder; read `package.json`; resolve entry from `exports["."].import` or `main`.
2. For npm: assert allowed name (FR-002); `fetch` registry metadata + tarball; unpack to a temp dir; then same validation as folder.
3. Copy package files into `userData/chip-plugins/<id>/` excluding `node_modules`.
4. Persist / update `chip-plugins-manifest.json` (name, version, chip name after dry validation if needed, enabled, path).
5. IPC: list installed, install-from-folder, install-from-npm, set-enabled, remove.

**Renderer — load**

1. Register `beatbax-plugin:` (or chosen scheme) before ready; handler only serves files under the chip-plugins root (path traversal denied).
2. Add scheme to `script-src` in `apps/desktop/src/renderer/index.html`.
3. Ship a small bridge module that re-exports the host `@beatbax/engine` (and public subpaths plugins need). Install an import map so bare `@beatbax/engine` / subpaths resolve to that bridge. Reject `@beatbax/engine/node`.
4. After `createAppContext()` (which calls `loadPluginsFromStorage()` for bundled chips), ask main for enabled user plugins; dynamic-import each entry URL; `chipRegistry.register(defaultExport)` when valid; log / surface failures without aborting the whole app.
5. Settings section “User plugins”: Install from folder, Install from npm (name ± version), rows with version badge, enable toggle, Remove. Enable / disable / remove → IPC → reload (same pattern as `setPluginEnabled`).

**Validation (shared helper, preferably testable without Electron)**

- Package name pattern.
- Semver peer for `@beatbax/engine` vs host engine version.
- Static scan of entry + relative graph for forbidden bare / Node imports.
- ChipPlugin shape: `name`, `createChannel`.
- Collision rules vs built-ins, `AVAILABLE_PLUGINS` ids, and other user installs.

**Web-lite**

No UI; no userData plugin load. `registry-config.ts` behaviour unchanged for web-lite.

### Export changes

None beyond existing `exporterPlugins` on a chip registering via `ChipRegistry.register`.

### Documentation updates

- `docs/contributing/creating-plugins.md` — Desktop install (folder + npm), trust model, naming, peer dependency, CLI vs Desktop as separate installs.
- External template README — **Installing into BeatBax Desktop** next to the CLI section; remove the outdated “Desktop does not install plugins via npm” note when the UI is available.

## Testing strategy

### Unit tests

- Allowed / rejected package names.
- Peer dependency accept / reject against sample host versions.
- Import scanner: relative OK; `@beatbax/engine` OK; `fs` / `node:fs` / other bare / `@beatbax/engine/node` rejected.
- Manifest replace same package name; remove deletes entry; disable leaves files but not loaded (covered with a load-filter unit).

### Integration tests

- IPC handler tests with temp `userData` dirs: folder install copies without `node_modules`; bad package returns error; remove cleans disk.
- Optional Desktop e2e: stub dialog + fixture minimal plugin → Settings shows chip; reload path smoke.

### Manual / QA

- Install built `beatbax-plugin-chip-template` (BLIP) from folder; New Song + play.
- Install from npm of a published allowed package when available.
- Confirm web-lite Settings (if any) / catalogue unchanged.
- Confirm template README steps match the shipped UI before marking the feature complete.

## Migration and compatibility

- Existing Desktop users: no change until they install a user plugin; bundled SMS / Spectrum toggles unchanged.
- No song format migration.
- Plugins that only work under Node (CLI PCM-only without Web Audio path) may install but fail playback in Desktop if they lack browser-safe backends — document that authors must provide Web Audio / `createPlaybackNodes` for Desktop, as the contributing guide already describes dual rendering.
