---
title: "Exporter Buffer Return Cleanup"
status: in-progress
authors: ["kadraman"]
created: 2026-06-28
issue: ""
---

## Summary

Refactor export implementations so UI-facing exporters return downloadable data (`Uint8Array`, `ArrayBuffer`, or `string`) instead of depending on filesystem side effects.

The immediate goal is to make hUGETracker UGE export work from the toolbar/menu bar in web and desktop clients. The broader goal is to standardize the exporter architecture so CLI code writes returned payloads to disk, while UI code downloads or saves the same payload without `fs.writeFileSync` capture shims.

---

## Problem Statement

BeatBax currently has two exporter styles:

1. **Payload-returning exporters** that already work naturally in UI contexts.
   - VGM returns `Uint8Array`.
   - FamiTracker Text returns `string`.

2. **Path-writing exporters** that require an `outputPath` and write to disk.
   - Engine JSON plugin.
   - Engine MIDI plugin.
   - Engine WAV plugin.
   - Engine UGE writer/plugin.

The web/desktop UI already special-cases JSON, MIDI, and WAV with browser-safe implementations in `ExportManager`, so those formats work from the toolbar/menu. UGE is the outlier: `ExportManager` calls the engine `exportUGE(song, outputPath)` and tries to capture `fs.writeFileSync` output via a Vite alias.

That capture strategy is fragile:

- Web UI relies on `fs` being aliased to `apps/web-ui/src/utils/browser-fs.ts`.
- Desktop aliases `fs` to `apps/desktop/src/renderer/src/electron-fs.ts`, not the app-core capture shim.
- When capture fails, the UI reports that UGE export requires the CLI, even though the actual export logic could produce downloadable bytes.

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

Update `packages/app-core/src/export/export-manager.ts`:

- Replace the UGE-specific `fs.writeFileSync` capture flow with a direct payload call.
- Download returned UGE bytes through `downloadBinary(...)`.
- Remove the misleading "requires the CLI" fallback once UGE no longer depends on capture.
- Keep validation and warning plumbing unchanged.

Potential cleanup:

- Remove `packages/app-core/src/io/write-capture.ts` if no other export path uses it.
- Remove or reduce `apps/web-ui/src/utils/browser-fs.ts` if it only exists for UGE export capture.

### Export Changes

#### Phase 1 - UGE Payload Builder

Files:

- `packages/engine/src/export/ugeWriter.ts`
- `packages/engine/src/export/plugins/uge.plugin.ts`
- `packages/app-core/src/export/export-manager.ts`

Tasks:

- Extract the current `UGEWriter` population logic into `buildUGE(song, opts): Uint8Array`.
- Preserve `exportUGE(song, outputPath, opts)` as a wrapper:

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

- Update `ugeExporterPlugin.export(...)`:
  - If `outputPath` is provided, write via `exportUGE(...)` and optionally return the bytes only if useful.
  - If no `outputPath` is provided, return `buildUGE(...)`.

#### Phase 2 - Generic Payload-First Exporter Contract

Files:

- `packages/engine/src/export/types.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/cli/src/cli.ts`

Tasks:

- Document that `ExporterPlugin.export()` may return data and should prefer returning data when no `outputPath` is supplied.
- Keep `outputPath` as an adapter concern for CLI and Node workflows.
- Ensure CLI writes returned `string`, `Uint8Array`, or `ArrayBuffer` payloads to disk.
- Make app-core prefer `exportViaPlugin(...)` for payload-returning formats.

#### Phase 3 - Broader Built-In Exporter Cleanup

Files:

- `packages/engine/src/export/plugins/json.plugin.ts`
- `packages/engine/src/export/plugins/midi.plugin.ts`
- `packages/engine/src/export/plugins/wav.plugin.ts`
- `packages/engine/src/export/jsonExport.ts`
- `packages/engine/src/export/midiExport.ts`
- `packages/engine/src/export/wavWriter.ts`
- `packages/app-core/src/export/export-manager.ts`

Tasks:

- Add or expose payload builders:
  - JSON: `buildJSON(song): string`.
  - MIDI: `buildMIDI(song, opts): Uint8Array`.
  - WAV: already has `writeWAV(samples, opts): Buffer`; expose a browser-safe `Uint8Array` path where needed.
- Update engine plugins to return payloads when `outputPath` is absent.
- Gradually remove duplicate app-core special cases only where the engine API is browser-safe and dependency-safe.

---

## Documentation Updates

- Update UI/export docs to say UGE can be exported from toolbar/menu for Game Boy songs.
- Update CLI/export docs to show CLI remains supported.
- Add developer notes explaining payload builders vs file-writing wrappers.

---

## Testing Strategy

### Unit Tests

- `buildUGE(song)` returns a non-empty `Uint8Array`.
- `buildUGE(song)` output is byte-identical to current `exportUGE(...)` output for fixture songs.
- `ugeExporterPlugin.export(song)` returns `Uint8Array` without `outputPath`.
- `ugeExporterPlugin.export(song, { outputPath })` preserves CLI-compatible behavior.

### Integration Tests

- App-core export manager exports UGE and calls `downloadBinary(...)` with `.uge` bytes.
- Desktop toolbar/menu UGE export succeeds for a Game Boy song.
- Web UI toolbar UGE export succeeds for a Game Boy song.
- Existing CLI `beatbax export uge ...` flow still writes the same file bytes.

Suggested regression fixture:

- `songs/gameboy/a_trainers_journey.bax`
- `songs/sample.bax` if it targets Game Boy.

Suggested commands:

```bash
npm -w @beatbax/engine test -- ugeExport.test.ts
npm -w @beatbax/app-core test -- export-manager
npm run desktop:test
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
- [x] Confirm CLI writes returned payloads for all plugin exporters.
- [x] Add tests for plugin exporters that return `string`, `Uint8Array`, and `ArrayBuffer`.

### Phase 3 - Built-In Exporter Cleanup

- [ ] Add or expose JSON payload builder.
- [ ] Add or expose MIDI payload builder from engine or consolidate app-core builder usage.
- [ ] Confirm WAV has a browser-safe payload builder path.
- [ ] Reduce app-core export special cases where safe.
- [ ] Remove unused write-capture/browser-fs shim code if no longer needed.

---

## Future Enhancements

- Add a common `ExportPayload` type with `{ data, filename?, mimeType? }`.
- Add exporter capability metadata such as `supportsBrowserPayload`.
- Allow desktop main process to save returned payloads through native save dialogs instead of only browser-style downloads.
- Add export preview/metadata reporting before writing files.

---

## Open Questions

1. `ExporterPlugin.export()` should support a structured `ExportPayload` (`{ data, filename?, mimeType? }`) as the preferred future shape, while still accepting raw `string`, `Uint8Array`, or `ArrayBuffer` returns as shorthand/backwards compatibility during migration.
2. Keep app-core special-casing JSON/MIDI/WAV during the UGE fix. Move those formats to engine payload-returning plugins in Phase 3, one format at a time, after UGE proves the contract.3. Should desktop export use browser downloads, native save dialogs, or preserve the current behavior per format?
4. Is `write-capture` still needed after UGE is payload-returning?
- No. Once UGE returns payload bytes directly, remove app-core write-capture and the browser fs capture shim unless another active UI export path still depends on them.

---

## References

- `packages/engine/src/export/ugeWriter.ts`
- `packages/engine/src/export/plugins/uge.plugin.ts`
- `packages/app-core/src/export/export-manager.ts`
- `packages/app-core/src/io/write-capture.ts`
- `apps/web-ui/src/utils/browser-fs.ts`
- `apps/desktop/src/renderer/src/electron-fs.ts`
- `packages/plugins/export-vgm/src/index.ts`
- `packages/plugins/export-famitracker/src/index.ts`

---