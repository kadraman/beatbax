---
title: Exporter Buffer Return Cleanup
status: complete
authors:
  - kadraman
created: 2026-06-28T00:00:00.000Z
completed: 2026-06-30T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/152
---

## Summary

Refactor export implementations so UI-facing exporters return downloadable data (`Uint8Array`, `ArrayBuffer`, or `string`) instead of depending on filesystem side effects.

**Phase 1 (complete):** UGE export works from the desktop toolbar/menu via `buildUGE()` and direct payload download — no `fs.writeFileSync` capture shim.

**Phase 2 (complete):** Payload-first `ExporterPlugin` contract, `ExportPayload` type, CLI `writeExportPayload()` adapter, and UGE routed through generic `exportViaPlugin()` in app-core.

**Phase 3 (complete):** JSON, MIDI, and WAV engine payload builders; all built-in formats routed through `exportViaPlugin()`; capture shims removed.

See [Export architecture](../exports/export-architecture.md) for the current developer guide.

---

## Problem Statement (historical)

BeatBax previously had two exporter styles:

1. **Payload-returning exporters** (VGM, FamiTracker text) that worked naturally in UI contexts.
2. **Path-writing exporters** (engine JSON, MIDI, WAV, UGE) that required `outputPath` and `fs.writeFileSync`.

The web/desktop UI special-cased JSON, MIDI, and WAV in `ExportManager`. UGE called `exportUGE(song, outputPath)` and tried to capture `fs.writeFileSync` via a Vite alias — fragile and desktop-incompatible. When capture failed, the UI reported that UGE export requires the CLI.

**Resolved:** All built-in formats now use engine payload builders and the shared `exportViaPlugin()` path. `write-capture` was removed; `browser-fs.ts` is a minimal stub only.

---

## Proposed Solution

Split binary/text generation from file writing. Exporters expose pure payload builders reused by CLI, desktop, and programmatic callers.

### Example Usage

CLI (unchanged):

```bash
beatbax export uge songs/gameboy/song.bax song.uge
beatbax export json songs/gameboy/song.bax song.json
beatbax export midi songs/gameboy/song.bax song.mid
beatbax export wav songs/gameboy/song.bax song.wav
```

Desktop UI:

- Toolbar/menu export downloads or saves files directly for JSON, MIDI, WAV, UGE, VGM, and other registered formats.
- No CLI-only fallback for valid Game Boy UGE export.

Programmatic API:

```ts
import { buildJSON, buildMIDI, buildUGE, buildWAVFromSong } from '@beatbax/engine/export';

const json = buildJSON(song);
const midi = buildMIDI(song);
const uge = buildUGE(song);
const wav = await buildWAVFromSong(song, { sampleRate: 44100 });
```

---

## Implementation Plan

### AST / Parser Changes

None.

### CLI Changes

- CLI continues calling exporter plugins with `outputPath`.
- `exportUGE`, `exportJSON`, `exportMIDI`, `exportWAVFromSong` remain as file-writing wrappers.
- `writeExportPayload()` persists returned payloads when plugins return data instead of writing.

### Web / Desktop UI Changes

- All built-in exports go through `ExportManager.exportViaPlugin()`.
- Plugins are called **without** `outputPath`; returned payloads are downloaded or saved via native dialog.
- Validation, warnings, and PCM export warnings unchanged.
- `write-capture.ts` removed; `browser-fs.ts` simplified to a throw-on-write stub for the Vite `fs` alias.

### Export Changes

#### Phase 1 - UGE Payload Builder ✅

- `buildUGE(song, opts): Uint8Array`
- `exportUGE(song, outputPath, opts)` wrapper
- `ugeExporterPlugin` returns bytes without `outputPath`
- UGE routed through `exportViaPlugin()`

#### Phase 2 - Generic Payload-First Exporter Contract ✅

- `ExportPayload`, `normalizeExporterResult()`, `isExportPayload()`
- `writeExportPayload()` CLI adapter
- Documented `ExporterPlugin` payload-first behavior

#### Phase 3 - Built-In Exporter Cleanup ✅

- `buildJSON`, `buildMIDI`, `buildWAV`, `buildWAVFromSong`
- json/midi/wav plugins return payloads without `outputPath`
- Browser exporter registry wires all built-in engine plugins
- Removed `midi-builder.ts` duplicate from app-core

---

## Documentation Updates

- [x] [Export architecture](../exports/export-architecture.md) — payload builders vs file-writing wrappers
- [x] [Workspace release notes](../releases/payload-first-export-workspace.md) — app-core, desktop, web-ui
- [x] [UGE export guide](../exports/uge-export-guide.md) — desktop toolbar/menu export
- [x] [WAV export guide](../exports/wav-export-guide.md) — desktop export
- [x] [CLI README](../../packages/cli/README.md) — export formats and builders
- [x] [app-core README](../../packages/app-core/README.md) — export manager / plugin path
- [x] [Browser-safe imports](../contributing/browser-safe-imports.md) — updated `browser-fs` note
- [x] [Exporter plugin system](./complete/exporter_plugin_system.md) — payload-first addendum

---

## Testing Strategy

### Unit / integration (automated)

- [x] `buildUGE`, `buildJSON`, `buildMIDI`, `buildWAV` / `buildWAVFromSong`
- [x] Built-in plugins return payloads without `outputPath`
- [x] `normalizeExporterResult()` and `writeExportPayload()`
- [x] App-core `ExportManager` UGE path via `exportViaPlugin()`
- [x] CLI `beatbax export uge/json/midi/wav` integration tests
- [x] Full `npm run test` suite

### Manual verification

- [x] Desktop toolbar/menu export (JSON, MIDI, WAV, UGE, VGM) — correct extensions, save dialog, Output panel
- [x] Export success timing (after save dialog completes; cancel does not report success)

> **Note:** `apps/web-ui` builds as **web-lite** (`export: false`). UI export is verified on **desktop-full**. Web-lite users export via CLI.

Suggested regression fixtures: `songs/gameboy/a_trainers_journey.bax`, `songs/sms/green_zone.bax` (VGM).

```bash
npm -w @beatbax/engine test -- export-builders.test.ts export-payload.test.ts ugeExport.test.ts jsonExport.effects.test.ts
npm -w @beatbax/app-core test -- export-manager.test.ts download-helper.test.ts
npm -w @beatbax/cli test -- exporter-plugins.integration.test.ts
npm run test
```

---

## Migration Path

Additive for CLI consumers. `exportUGE(song, outputPath, opts)` and sibling wrappers remain available.

UI JSON export now uses the engine ISM wrapper (`{ version, exportedAt, song }`) for parity with CLI — not raw `JSON.stringify(resolved)`.

---

## Implementation Checklist

### Phase 1 - UGE UI Fix

- [x] Add `buildUGE(song, opts): Uint8Array`
- [x] Keep `exportUGE(song, outputPath, opts)` as a wrapper around `buildUGE`
- [x] Update `ugeExporterPlugin.export()` to return bytes when no `outputPath` is provided
- [x] Route UGE through `exportViaPlugin()` in `ExportManager`
- [x] Remove the UGE CLI-only fallback message from the UI path
- [x] Add tests for UGE byte parity and plugin no-outputPath behavior

### Phase 2 - Exporter Contract Cleanup

- [x] Document payload-returning exporter behavior in `ExporterPlugin`
- [x] Add `ExportPayload` type and `normalizeExporterResult()` / `isExportPayload()` helpers
- [x] Add `writeExportPayload()` CLI adapter
- [x] Confirm CLI writes returned payloads for all plugin exporters
- [x] Wire browser exporter registry to engine UGE plugin
- [x] Add tests for plugin exporters that return `string`, `Uint8Array`, and `ArrayBuffer`

### Phase 3 - Built-In Exporter Cleanup

- [x] Add or expose JSON payload builder (`buildJSON`)
- [x] Add or expose MIDI payload builder (`buildMIDI`)
- [x] Add browser-safe WAV payload builders (`buildWAV`, `buildWAVFromSong`)
- [x] Update json/midi/wav plugins to return payloads without `outputPath`
- [x] Route JSON, MIDI, and WAV through `exportViaPlugin()` in `ExportManager`
- [x] Wire browser exporter registry to engine built-in plugins
- [x] Remove app-core `midi-builder.ts` duplicate
- [x] Remove unused write-capture/browser-fs capture shim code

---

## Future Enhancements

- Exporter capability metadata such as `supportsBrowserPayload`
- Export preview/metadata reporting before writing files

---

## Open Questions (resolved)

1. **ExportPayload shape** — Implemented in Phase 2 (`types.ts`, `payload.ts`).
2. **JSON/MIDI/WAV special-casing** — Removed in Phase 3; all use `exportViaPlugin()`.
3. **Desktop save behavior** — Native save dialogs with format-specific extension filters.
4. **write-capture** — Removed; no active UI export path depends on it.

---

## References

- `packages/engine/src/export/jsonExport.ts`
- `packages/engine/src/export/midiExport.ts`
- `packages/engine/src/export/ugeWriter.ts`
- `packages/engine/src/export/wavWriter.ts`
- `packages/engine/src/export/types.ts`
- `packages/engine/src/export/payload.ts`
- `packages/engine/src/export/writeExportPayload.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/app-core/src/plugins/browser-exporter-registry.ts`
- `apps/web-ui/src/utils/browser-fs.ts`
- `apps/desktop/src/renderer/src/electron-fs.ts`

