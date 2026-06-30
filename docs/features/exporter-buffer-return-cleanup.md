---
title: "Exporter Buffer Return Cleanup"
status: complete
authors: ["kadraman"]
created: 2026-06-28
issue: ""
---

## Summary

Refactor export implementations so UI-facing exporters return downloadable data (`Uint8Array`, `ArrayBuffer`, or `string`) instead of depending on filesystem side effects.

**Phase 1 (complete):** UGE export works from the toolbar/menu in web and desktop clients via `buildUGE()` and direct payload download — no `fs.writeFileSync` capture shim.

**Phase 2 (complete):** Payload-first `ExporterPlugin` contract, `ExportPayload` type, CLI `writeExportPayload()` adapter, and UGE routed through generic `exportViaPlugin()` in app-core.

**Phase 3 (complete):** JSON, MIDI, and WAV engine payload builders; app-core routes all built-in formats through `exportViaPlugin()`; capture shims removed.

---

## Problem Statement

BeatBax historically had two exporter styles:

1. **Payload-returning exporters** that work naturally in UI contexts.
   - VGM returns `Uint8Array`.
   - FamiTracker Text returns `string`.

2. **Path-writing exporters** that require an `outputPath` and write to disk.
   - Engine JSON plugin.
   - Engine MIDI plugin.
   - Engine WAV plugin.
   - Engine UGE writer/plugin (fixed in Phase 1).

The web/desktop UI special-cases JSON, MIDI, and WAV with browser-safe implementations in `ExportManager`, so those formats work from the toolbar/menu. UGE was the outlier: `ExportManager` called `exportUGE(song, outputPath)` and tried to capture `fs.writeFileSync` output via a Vite alias.

That capture strategy was fragile:

- Web UI relied on `fs` being aliased to `apps/web-ui/src/utils/browser-fs.ts`.
- Desktop aliased `fs` to `apps/desktop/src/renderer/src/electron-fs.ts`, not the app-core capture shim.
- When capture failed, the UI reported that UGE export requires the CLI, even though the export logic could produce downloadable bytes.

**Phase 1 resolved the UGE outlier.** **Phase 2 established the shared payload-first contract.** **Phase 3 moved JSON, MIDI, and WAV onto the same plugin path and removed capture shims.**

---

## Proposed Solution

### Summary

Split binary/text generation from file writing. Exporters should have a pure payload-building path that can be reused by CLI, web, and desktop.

Recommended first slice:

1. Extract UGE binary generation into `buildUGE(song, opts): Uint8Array`.
2. Keep `exportUGE(song, outputPath, opts): Promise<void>` as a CLI-compatible wrapper that calls `buildUGE()` and writes the result.
3. Update the UGE exporter plugin to return `Uint8Array` when called without `outputPath`.
4. Simplify app-core `ExportManager` to download the returned UGE bytes instead of using `write-capture`.

Broader cleanup:

1. Add payload builders or payload-returning plugin behavior for engine JSON, MIDI, and WAV.
2. Prefer one generic `exportViaPlugin()` path in app-core where possible.
3. Keep filesystem writing in CLI/main-process adapters, not in shared exporter logic.

### Example Syntax

No `.bax` language changes.

### Example Usage

CLI stays compatible:

```bash
beatbax export uge songs/gameboy/song.bax song.uge
```

UI behavior changes:

- Toolbar/menu "Export as hUGETracker UGE" downloads or saves `.uge` directly.
- No CLI-only error for valid Game Boy songs.

Programmatic API shape:

```ts
import { buildUGE, exportUGE } from '@beatbax/engine/export';

const bytes = buildUGE(song);
await exportUGE(song, 'song.uge');
```

---

## Implementation Plan

### AST Changes

None.

### Parser Changes

None.

### CLI Changes

Keep CLI behavior stable:

- CLI may continue calling exporter plugins with `outputPath`.
- `exportUGE(song, outputPath, opts)` remains available and writes to disk.
- If the generic CLI exporter path receives a returned payload, it should continue writing that payload to the requested output path.

### Web UI Changes

Completed for UGE in Phase 1; remaining cleanup in Phase 3:

- ~~Replace the UGE-specific `fs.writeFileSync` capture flow with a direct payload call.~~
- ~~Download returned UGE bytes through `downloadBinary(...)`.~~
- ~~Remove the misleading "requires the CLI" fallback once UGE no longer depends on capture.~~
- Keep validation and warning plumbing unchanged.

Potential cleanup (Phase 3):

- Remove `packages/app-core/src/io/write-capture.ts` if no other export path uses it.
- Remove or reduce `apps/web-ui/src/utils/browser-fs.ts` if it only exists for UGE export capture.

### Export Changes

#### Phase 1 - UGE Payload Builder (complete)

Files:

- `packages/engine/src/export/ugeWriter.ts`
- `packages/engine/src/export/plugins/uge.plugin.ts`
- `packages/app-core/src/export/export-manager.ts`

Tasks:

- [x] Extract the current `UGEWriter` population logic into `buildUGE(song, opts): Uint8Array`.
- [x] Preserve `exportUGE(song, outputPath, opts)` as a wrapper:

```ts
export function buildUGE(song: SongModel, opts: UgeOptions = {}): Uint8Array {
  // existing UGEWriter population logic
  return w.toBuffer();
}

export async function exportUGE(song: SongModel, outputPath: string, opts: UgeOptions = {}): Promise<void> {
  const out = buildUGE(song, opts);
  writeFileSync(outputPath, out);
}
```

- [x] Update `ugeExporterPlugin.export(...)`:
  - If `outputPath` is provided, write via `exportUGE(...)` and optionally return the bytes only if useful.
  - If no `outputPath` is provided, return `buildUGE(...)`.

#### Phase 2 - Generic Payload-First Exporter Contract (complete)

Files:

- `packages/engine/src/export/types.ts`
- `packages/engine/src/export/payload.ts`
- `packages/engine/src/export/writeExportPayload.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/app-core/src/plugins/browser-exporter-registry.ts`
- `packages/cli/src/cli.ts`

Tasks:

- [x] Document that `ExporterPlugin.export()` may return data and should prefer returning data when no `outputPath` is supplied.
- [x] Add `ExportPayload` type and `normalizeExporterResult()` / `isExportPayload()` helpers.
- [x] Add `writeExportPayload()` CLI adapter for persisting returned payloads.
- [x] Keep `outputPath` as an adapter concern for CLI and Node workflows.
- [x] Ensure CLI writes returned `string`, `Uint8Array`, or `ArrayBuffer` payloads to disk.
- [x] Route UGE through `exportViaPlugin(...)` in app-core; call plugins without `outputPath`.
- [x] Wire browser exporter registry to the real engine UGE plugin.

#### Phase 3 - Broader Built-In Exporter Cleanup (complete)

Files:

- `packages/engine/src/export/plugins/json.plugin.ts`
- `packages/engine/src/export/plugins/midi.plugin.ts`
- `packages/engine/src/export/plugins/wav.plugin.ts`
- `packages/engine/src/export/jsonExport.ts`
- `packages/engine/src/export/midiExport.ts`
- `packages/engine/src/export/wavWriter.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/app-core/src/plugins/browser-exporter-registry.ts`

Tasks:

- [x] Add or expose payload builders:
  - JSON: `buildJSON(song): string`.
  - MIDI: `buildMIDI(song, opts): Uint8Array`.
  - WAV: `buildWAV(samples, opts): Uint8Array` and `buildWAVFromSong(song, opts): Promise<Uint8Array>`.
- [x] Update engine plugins to return payloads when `outputPath` is absent.
- [x] Route JSON, MIDI, and WAV through `exportViaPlugin()` in app-core.
- [x] Wire browser exporter registry to engine JSON/MIDI/WAV/UGE plugins.
- [x] Remove app-core `midi-builder.ts` duplicate.
- [x] Remove unused `write-capture` shim; simplify `browser-fs.ts` stub.

---

## Documentation Updates

- Update UI/export docs to say UGE can be exported from toolbar/menu for Game Boy songs.
- Update CLI/export docs to show CLI remains supported.
- Add developer notes explaining payload builders vs file-writing wrappers.

---

## Testing Strategy

### Unit Tests

- [x] `buildUGE(song)` returns a non-empty `Uint8Array`.
- [x] `buildUGE(song)` output is byte-identical to current `exportUGE(...)` output for fixture songs.
- [x] `ugeExporterPlugin.export(song)` returns `Uint8Array` without `outputPath`.
- [x] `ugeExporterPlugin.export(song, { outputPath })` preserves CLI-compatible behavior.
- [x] `normalizeExporterResult()` and `writeExportPayload()` cover `string`, `Uint8Array`, and `ArrayBuffer` returns.

### Integration Tests

- [x] App-core export manager exports UGE and calls `downloadBinary(...)` with `.uge` bytes.
- [x] Existing CLI `beatbax export uge ...` flow still writes the same file bytes.
- [ ] Desktop toolbar/menu UGE export succeeds for a Game Boy song (manual).
- [ ] Web UI toolbar UGE export succeeds for a Game Boy song (manual).

Suggested regression fixture:

- `songs/gameboy/a_trainers_journey.bax`
- `songs/sample.bax` if it targets Game Boy.

Suggested commands:

```bash
npm -w @beatbax/engine test -- export-builders.test.ts export-payload.test.ts ugeExport.test.ts jsonExport.effects.test.ts
npm -w @beatbax/app-core test -- export-manager.test.ts download-helper.test.ts
npm -w @beatbax/cli test -- exporter-plugins.integration.test.ts
```

---

## Migration Path

This is additive if `exportUGE(song, outputPath, opts)` remains available.

Consumers using the current CLI/path-writing API do not need to change. New UI and programmatic consumers can call `buildUGE(song, opts)` or invoke the exporter plugin without `outputPath` to receive bytes.

---

## Implementation Checklist

### Phase 1 - UGE UI Fix

- [x] Add `buildUGE(song, opts): Uint8Array`.
- [x] Keep `exportUGE(song, outputPath, opts)` as a wrapper around `buildUGE`.
- [x] Update `ugeExporterPlugin.export()` to return bytes when no `outputPath` is provided.
- [x] Update `ExportManager.exportUGE()` to download returned bytes directly.
- [x] Remove the UGE CLI-only fallback message from the UI path.
- [x] Add tests for UGE byte parity and plugin no-outputPath behavior.

### Phase 2 - Exporter Contract Cleanup

- [x] Document payload-returning exporter behavior in `ExporterPlugin`.
- [x] Add `ExportPayload` type and `normalizeExporterResult()` / `isExportPayload()` helpers.
- [x] Add `writeExportPayload()` CLI adapter.
- [x] Confirm CLI writes returned payloads for all plugin exporters.
- [x] Route UGE through `exportViaPlugin()` in `ExportManager`.
- [x] Wire browser exporter registry to engine UGE plugin.
- [x] Add tests for plugin exporters that return `string`, `Uint8Array`, and `ArrayBuffer`.

### Phase 3 - Built-In Exporter Cleanup

- [x] Add or expose JSON payload builder (`buildJSON`).
- [x] Add or expose MIDI payload builder (`buildMIDI`).
- [x] Add browser-safe WAV payload builders (`buildWAV`, `buildWAVFromSong`).
- [x] Update json/midi/wav plugins to return payloads without `outputPath`.
- [x] Route JSON, MIDI, and WAV through `exportViaPlugin()` in `ExportManager`.
- [x] Wire browser exporter registry to engine built-in plugins.
- [x] Remove app-core `midi-builder.ts` duplicate.
- [x] Remove unused write-capture/browser-fs capture shim code.

---

## Future Enhancements

- Add exporter capability metadata such as `supportsBrowserPayload`.
- Allow desktop main process to save returned payloads through native save dialogs instead of only browser-style downloads.
- Add export preview/metadata reporting before writing files.

---

## Open Questions

1. ~~`ExporterPlugin.export()` should support a structured `ExportPayload` (`{ data, filename?, mimeType? }`) as the preferred future shape, while still accepting raw `string`, `Uint8Array`, or `ArrayBuffer` returns as shorthand/backwards compatibility during migration.~~ **Resolved in Phase 2.**
2. Keep app-core special-casing JSON/MIDI/WAV during the UGE fix. Move those formats to engine payload-returning plugins in Phase 3, one format at a time, after UGE proves the contract.
3. Should desktop export use browser downloads, native save dialogs, or preserve the current behavior per format? **Partially resolved:** desktop uses native save dialogs with format-specific extension filters.
4. Is `write-capture` still needed after UGE is payload-returning? **No for UGE.** Remove app-core `write-capture` and the browser fs capture shim in Phase 3 unless another active UI export path still depends on them.

---

## References

- `packages/engine/src/export/ugeWriter.ts`
- `packages/engine/src/export/plugins/uge.plugin.ts`
- `packages/engine/src/export/types.ts`
- `packages/engine/src/export/payload.ts`
- `packages/engine/src/export/writeExportPayload.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/app-core/src/plugins/browser-exporter-registry.ts`
- `apps/web-ui/src/utils/browser-fs.ts` (minimal fs stub for Vite alias)
- `apps/desktop/src/renderer/src/electron-fs.ts`
- `packages/plugins/export-vgm/src/index.ts`
- `packages/plugins/export-famitracker/src/index.ts`

---