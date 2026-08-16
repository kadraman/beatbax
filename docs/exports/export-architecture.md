# Export Architecture

## Overview

BeatBax exporters follow a **payload-first** contract: shared logic builds downloadable data; host-specific adapters persist or download it.

| Layer | Responsibility |
|-------|----------------|
| **Engine payload builders** | Pure functions that return `string`, `Uint8Array`, or `ArrayBuffer` |
| **`ExporterPlugin`** | Calls builders when `outputPath` is omitted; writes to disk when `outputPath` is set (CLI/Node) |
| **`ExportManager` (app-core)** | Parses, merges `import` kits, validates, resolves, calls plugins without `outputPath`, downloads/saves returned payloads |
| **CLI** | Calls plugins with `outputPath`, or uses `writeExportPayload()` for returned data |

Built-in formats (JSON, MIDI, UGE, WAV) and third-party plugins (VGM, FamiTracker text, etc.) all use the same plugin path in the UI.

## Payload builders (engine)

| Format | Builder | CLI wrapper |
|--------|---------|-------------|
| JSON | `buildJSON(song, opts?)` → `string` | `exportJSON(song, outputPath, opts?)` |
| MIDI | `buildMIDI(song, options?, opts?)` → `Uint8Array` | `exportMIDI(song, outputPath, options?, opts?)` |
| UGE | `buildUGE(song, opts?)` → `Uint8Array` | `exportUGE(song, outputPath, opts?)` |
| WAV | `buildWAV(samples, opts)` / `buildWAVFromSong(song, opts)` → `Uint8Array` | `exportWAVFromSong(song, outputPath, opts)` |

Programmatic example:

```ts
import { buildJSON, buildMIDI, buildUGE, buildWAVFromSong } from '@beatbax/engine/export';

const json = buildJSON(song);
const midi = buildMIDI(song);
const uge = buildUGE(song);
const wav = await buildWAVFromSong(song, { sampleRate: 44100 });
```

## ExporterPlugin contract

```ts
// UI / browser — omit outputPath, consume returned payload
const bytes = await plugin.export(song, { onWarn });

// CLI / Node — provide outputPath, plugin may write directly or return payload
await plugin.export(song, { outputPath: 'song.uge' });
```

Return types: `ExportPayload`, `string`, `Uint8Array`, `ArrayBuffer`, or `void` (only when the plugin already wrote to `outputPath`).

Helpers:

- `normalizeExporterResult()` — normalizes plugin returns for download/save
- `writeExportPayload(path, data)` — CLI adapter for persisting payloads

## UI export flow (desktop)

1. User chooses format from toolbar/menu.
2. `ExportManager.export()` parses the editor buffer.
3. If the AST has `import` lines, `await resolveImports(..., buildImportResolverOptions())` so kit `inst` / `effect` / `subpat` names exist before validation ([#171](https://github.com/kadraman/beatbax/issues/171), [`desktop-export-imported-instruments.md`](../features/complete/desktop-export-imported-instruments.md)).
4. `validateForExport()` then `resolveSong()` on the **merged** AST (`imports` cleared). Desktop/web use the browser engine bundle, so `resolveSong` must not see leftover `import` lines (`resolveImportsSync` throws).
5. `exportViaPlugin()` loads the format from `exporterRegistry` (built-in engine plugins + optional plugins such as VGM).
6. Plugin returns payload bytes/text without `outputPath`.
7. `downloadBinary()` / `downloadText()` triggers browser download (web) or native save dialog (desktop).
8. `export:success` fires after the save/download completes; Output panel is shown.

WAV exports pass `sampleRate` from user audio settings. PCM export warnings are collected before the plugin runs.

Web-lite does not expose an Export menu (`capabilities.export === false`). The same `ExportManager` is the shared implementation.

## CLI export flow

1. `beatbax export <format> song.bax output.ext`
2. CLI resolves song and calls the registered `ExporterPlugin` with `outputPath`.
3. Plugin writes via engine wrapper, or returns a payload that `writeExportPayload()` persists.

List registered formats:

```bash
beatbax list-exporters
beatbax list-exporters --chip gameboy
```

## Browser bundling notes

- UI exporters do **not** use `fs.writeFileSync` capture shims.
- `apps/web-ui/src/utils/browser-fs.ts` is a minimal Vite `fs` alias stub for any legacy engine imports; it throws if `writeFileSync` is called.
- Desktop renderer uses `electron-fs.ts` for real file operations in main-process adapters.

## Related docs

- [UGE export guide](./uge-export-guide.md)
- [WAV export guide](./wav-export-guide.md)
- [Exporter plugin system](../features/complete/exporter_plugin_system.md)
- [Exporter buffer return cleanup](../features/complete/exporter-buffer-return-cleanup.md) — implementation history
- [Desktop export with imported instruments](../features/complete/desktop-export-imported-instruments.md) — `ExportManager` import merge ([#171](https://github.com/kadraman/beatbax/issues/171))
- [Instrument imports](../features/complete/instrument-imports.md)
