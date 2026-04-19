---
title: "Exporter Plugin System"
status: complete
authors: ["kadraman"]
created: 2026-04015
issue: "https://github.com/kadraman/beatbax/issues/89"
---

## Summary

## Problem Statement

BeatBax currently has four export formats (JSON, MIDI, UGE, WAV) hard-coded in the engine and CLI. There is no plugin interface for exporters, which creates several compounding problems as the chip plugin ecosystem grows:

1. The CLI `export` command uses a hard-coded `.choices(['json', 'midi', 'uge', 'wav'])` list — third-party export formats contributed by chip plugins are completely invisible to it.
2. There is no declared relationship between a chip plugin and the native tracker formats it should produce (e.g. `@beatbax/plugin-chip-nes` has no way to advertise or ship a FamiTracker `.ftm` or NSF exporter).
3. The `ugeWriter.ts` exporter is tightly coupled to Game Boy internals (`GBChannel`, `parseEnvelope`, `parseSweep`) but lives in the chip-agnostic `export/` directory — there is no separation between chip-specific and chip-agnostic exporters.
4. The existing `ChipPlugin.exportToNative?(song, format): Uint8Array` stub is insufficient: it conflates a single chip with potentially many export formats, carries no file-extension or MIME metadata, and is not integrated into the CLI dispatch or any registry.
5. Adding support for future native tracker formats (NES → NSF, SID → PSID, Genesis → VGM, PC-Engine → HES) would require modifying both `cli.ts` and `engine/src/export/index.ts` for every new format — there is no extensibility path.

## Proposed Solution

Introduce a first-class **exporter plugin system** parallel to the existing chip plugin system (`ChipPlugin` / `ChipRegistry`).

**Core additions to `packages/engine`:**

- New `ExporterPlugin` interface (`export/types.ts`) with fields: `id`, `label`, `version`, `extension`, `mimeType`, `supportedChips`, `export()`, and optional `validate()` and `uiContributions`.
- New `ExporterRegistry` class + `exporterRegistry` singleton (`export/registry.ts`), mirroring `ChipRegistry`, with `register()`, `get()`, `has()`, `list(chipName?)`, and `all()`.
- The four built-in exporters (JSON, MIDI, UGE, WAV) are each wrapped as `ExporterPlugin` objects (`export/plugins/*.plugin.ts`) and auto-registered at engine startup via `export/index.ts`.
- `ChipPlugin` gains an optional `exporterPlugins?: ExporterPlugin[]` field. When a chip plugin is registered with `ChipRegistry`, any declared exporter plugins are automatically forwarded to `exporterRegistry`.
- `ExporterPlugin`, `ExportOptions`, `ExporterRegistry`, and `exporterRegistry` are added to `plugin-api.ts` so third-party authors import everything from `@beatbax/engine`.

**CLI changes (`packages/cli`):**

- The `export` command's hard-coded `choices([...])` is replaced with a dynamic lookup against `exporterRegistry`. Unknown formats produce a helpful error listing all registered formats.
- A new `list-exporters [--chip <name>] [--json]` command is added, mirroring `list-chips`.
- CLI auto-discovery is extended to scan for `@beatbax/plugin-exporter-*` and `beatbax-plugin-exporter-*` packages in `node_modules`, mirroring the existing `@beatbax/plugin-chip-*` discovery.

**Backward compatibility:**

- All raw export functions (`exportJSON`, `exportMIDI`, `exportUGE`, `exportWAV`, `exportWAVFromSong`) remain exported unchanged — no existing call sites break.
- The CLI continues to accept `json`, `midi`, `uge`, `wav` as format arguments — names are identical, now backed by the registry.
- `ChipPlugin.exportToNative()` is marked `@deprecated` in JSDoc but not removed; new exporters use `ExporterPlugin` instead.

**Example — NES chip plugin shipping its own exporters:**

```typescript
// @beatbax/plugin-chip-nes
const nesPlugin: ChipPlugin = {
  name: 'nes',
  exporterPlugins: [ftmExporterPlugin, fmsExporterPlugin],
  // ...
};
```

Installing `@beatbax/plugin-chip-nes` would automatically make `beatbax export famitracker` and `beatbax export famistudio` available — no second install required.

**Example — standalone community exporter:**

```bash
npm install @beatbax/plugin-exporter-nsf
beatbax export nsf song.bax song.nsf
```

The full interface design, `ExporterRegistry` implementation, CLI diff, file change table, testing strategy, and implementation checklist are documented in `docs/features/exporter-plugin-system.md`.


## Alternatives considered

1. **Extend `ChipPlugin.exportToNative()` instead of creating a new interface.** This was rejected because a single chip may need to produce multiple distinct formats (NES → NSF, NES → FamiTracker `.ftm`, NES → FamiStudio `.fms`), a single method with an opaque `format?` string parameter cannot carry file-extension, MIME type, or per-format `validate()` logic, and chip-agnostic exporters (MIDI, WAV, JSON) should not be duplicated across every chip plugin.

2. **Hard-code each new format as it is added.** Rejected because it requires modifying two core files (`cli.ts` and `export/index.ts`) for every new format, cannot accommodate community-contributed formats, and makes the CLI aware of chip internals that belong in chip plugins.

3. **Make exporter plugins part of standalone `@beatbax/plugin-exporter-*` packages only (no bundling in chip plugins).** Rejected because it creates installation friction for the common case where a chip and its native tracker format are permanently coupled (e.g. UGE is only ever useful alongside the Game Boy chip). The `exporterPlugins` field on `ChipPlugin` solves this; standalone packages remain available for large or multi-chip exporters.

## Implementation Status (2026-04-19)

All spec items are implemented. 9 of 10 items are fully complete; item 9 is structurally complete with a stub export body pending real format encoding.

| # | Item | Status |
|---|------|--------|
| 1 | `ExporterPlugin` interface in `export/types.ts` | ✅ Complete |
| 2 | `ExporterRegistry` + `exporterRegistry` singleton | ✅ Complete |
| 3 | Built-in exporters (JSON, MIDI, UGE, WAV) auto-registered | ✅ Complete |
| 4 | `ChipPlugin.exporterPlugins` forwarded to `exporterRegistry` | ✅ Complete |
| 5 | Public API exports from `plugin-api.ts` | ✅ Complete |
| 6 | CLI `export` uses dynamic registry (no hard-coded choices) | ✅ Complete |
| 7 | CLI `list-exporters [--chip] [--json]` command | ✅ Complete |
| 8 | CLI auto-discovery for `@beatbax/plugin-exporter-*` | ✅ Complete |
| 9 | `@beatbax/plugin-exporter-famitracker` real `.ftm`/`.txt` output | ⚠️ Stub — tracked in `docs/features/famitracker-export.md` |
| 10 | `@beatbax/plugin-chip-nes` declares `exporterPlugins` | ✅ Complete |

