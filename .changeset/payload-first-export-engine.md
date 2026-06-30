---
"@beatbax/engine": minor
---

Payload-first export architecture for built-in formats (JSON, MIDI, UGE, WAV).

- Add payload builders: `buildUGE`, `buildJSON`, `buildMIDI`, `buildWAV`, and `buildWAVFromSong` for in-memory export without filesystem side effects.
- Add `ExportPayload` type plus `normalizeExporterResult()`, `isExportPayload()`, and `writeExportPayload()` helpers for CLI and UI adapters.
- Document payload-first `ExporterPlugin` behavior: return `string`, `Uint8Array`, `ArrayBuffer`, or `ExportPayload` when `outputPath` is omitted; keep path-writing wrappers (`exportJSON`, `exportMIDI`, `exportUGE`, `exportWAVFromSong`) for Node/CLI workflows.
- Update built-in `json`, `midi`, `uge`, and `wav` exporter plugins to return downloadable payloads when called without `outputPath`.
- Refactor `exportJSON`, `exportMIDI`, and `exportUGE` file writers to use dynamic `fs` imports where appropriate; `exportWAVFromSong` delegates rendering to `buildWAVFromSong`.
- Export new symbols from `@beatbax/engine/export` and `plugin-api.ts`.
- Add regression tests in `export-payload.test.ts`, `export-builders.test.ts`, and extended `ugeExport.test.ts`.
