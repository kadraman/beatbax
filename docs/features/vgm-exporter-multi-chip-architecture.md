---
title: "VGM Exporter — Multi-Chip Backend Architecture"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-05
issue: "https://github.com/kadraman/beatbax/issues/105"
---

## Summary

Refactor `@beatbax/plugin-exporter-vgm` from a hardcoded SMS-only exporter into a dispatcher that routes to chip-specific VGM backends. The public exporter `id` stays `"vgm"` and the engine API is unchanged. The SMS backend remains byte-for-byte identical. New chips (AY-3-8910, YM2413, etc.) can be added as additional backends without touching the engine or the exporter's external contract.

---

## Problem Statement

The current VGM exporter (`@beatbax/plugin-exporter-vgm`) works correctly for SMS/Game Gear songs but has SMS-specific logic distributed across `index.ts`, `ismToVgm.ts`, and `vgmWriter.ts`. The chip check is a hardcoded string comparison against `chip=sms`.

Adding AY-3-8910 support would require:
- Duplicating the validate/export/GD3 flow inside `index.ts`
- Adding AY-specific header fields to `vgmWriter.ts` without a clear extension boundary
- Growing `index.ts` into an untestable monolith

This is a stability risk. Each new chip makes the next chip harder to add and increases the chance of regressing SMS output.

---

## Proposed Solution

### Summary

Introduce an internal `VgmBackend` interface inside `@beatbax/plugin-exporter-vgm`. The entry point (`index.ts`) becomes a dispatcher: it resolves the correct backend from a registry keyed by chip alias, then delegates validation, translation, GD3 generation, and header parameter construction to that backend.

The SMS backend is extracted from the existing `ismToVgm.ts` and `index.ts` logic into a self-contained module. Its output must remain byte-for-byte identical to today's output.

New backends (AY-3-8910, YM2413, etc.) are added as additional modules registered in the same backend map without altering the dispatcher or the SMS backend.

### Backend Interface

```typescript
// packages/plugins/export-vgm/src/backends/types.ts

export interface VgmBackend {
  /** Chip aliases this backend handles (lowercase, no spaces). */
  readonly chipAliases: readonly string[];

  /** Validate the song ISM for this chip. Returns error strings or []. */
  validate(song: SongLike): string[];

  /** Translate the ISM to a VGM data byte stream. */
  translate(song: SongLike): VgmTranslateResult;

  /** Build GD3 metadata fields for this chip. */
  buildGd3Fields(song: SongLike, translateResult: VgmTranslateResult): Gd3Fields;

  /** Return VGM header clock and rate params for this chip. */
  headerParams(song: SongLike, translateResult: VgmTranslateResult): VgmHeaderParams;
}

export interface VgmTranslateResult {
  dataBytes: Uint8Array;
  totalSamples: number;
  hasRetrig: boolean;
  clock: number;
  isGameGear?: boolean;
}
```

### Dispatcher Flow

```
exportVgm(song):
  chip = normalise(song.chip)
  backend = backendRegistry.get(chip)       // → Sn76489VgmBackend | Ay38910VgmBackend | ...
  if !backend → throw "No VGM backend for chip=X. Available: [sms, ...]"

  errors = backend.validate(song)
  if errors.length > 0 → throw

  result = backend.translate(song)
  gd3    = backend.buildGd3Fields(song, result)
  params = backend.headerParams(song, result)

  return assembleVgm(params, result.dataBytes, buildGd3(gd3), result.totalSamples)
```

The `validate()` method on the `ExporterPlugin` object uses the same backend resolution path as `export()`, eliminating the risk of validate/export divergence.

### Chip Support Matrix

| Chip | Backend status | VGM chip clock field |
|------|---------------|----------------------|
| SMS / Game Gear (SN76489) | ✅ Implemented | `SN76489_CLOCK` at `0x0C` |
| AY-3-8910 / YM2149 | 🔲 Planned (scaffold only in v1) | `AY8910_CLOCK` at `0xA0` |
| YM2413 (OPLL) | 🔲 Planned | `YM2413_CLOCK` at `0x10` |
| YM2612 (Genesis) | 🔲 Future | `YM2612_CLOCK` at `0x2C` |

**Scope for this feature:** implement the backend dispatch architecture and extract the SN76489 backend. AY scaffold can be included as a disabled/unsupported stub or deferred to a follow-up PR.

### Package Structure After Refactor

```
packages/plugins/export-vgm/src/
├── index.ts                  # Dispatcher: ExporterPlugin entry point
├── backendRegistry.ts        # Backend registration and chip alias resolution
├── vgmWriter.ts              # VGM binary builder (header + data + GD3 assembly)
├── gd3.ts                    # GD3 tag encoder (UTF-16LE)
├── constants.ts              # Expanded: all chip header offsets + clock constants
├── version.ts                # Package version string
└── backends/
    ├── types.ts              # VgmBackend interface + VgmTranslateResult type
  ├── sn76489.ts            # Canonical SN76489 backend (SMS/Game Gear aliases)
  ├── sn76489State.ts       # Canonical SN76489 shadow state tracker
  ├── ay38910.ts            # Canonical AY-3-8910 / YM2149 backend module
  ├── sms.ts                # Compatibility shim re-exporting from sn76489.ts
  ├── psgState.ts           # Compatibility shim re-exporting from sn76489State.ts
  └── ay.ts                 # Compatibility shim re-exporting from ay38910.ts
```

The `ismToVgm.ts` file is retired; its logic now lives in `backends/sn76489.ts`.

### VGM Header Generalisation

`vgmWriter.ts` currently accepts only `sn76489Clock` and `rate` in `VgmHeaderParams`. The params type is extended to cover near-term chips:

```typescript
export interface VgmHeaderParams {
  sn76489Clock?:  number;   // 0x0C — SN76489 (SMS/GG/Genesis)
  ym2413Clock?:   number;   // 0x10 — YM2413 (OPLL/MSX/PC-88)
  ay8910Clock?:   number;   // 0xA0 — AY-3-8910 / YM2149
  rate:           number;   // 0x24 — Frame rate hint (60 NTSC / 50 PAL)
}
```

Fields not provided default to `0`. The SMS backend sets only `sn76489Clock`, so existing SMS byte output is unchanged.

### Unsupported Chip Diagnostics

When no backend is registered for the requested chip, the error message must name the available backends:

```
VGM export failed: no VGM backend registered for chip="ay".
Available backends: sms, gamegear.
```

This satisfies the spec requirement of failing loudly on unsupported chips.

### Scope Exclusions

- **Mixed-chip songs** (two different chips in one song) remain out of scope. The dispatcher validates that `song.chip` maps to exactly one backend.
- **No engine `ExporterPlugin` API changes.** The dispatcher implements the existing interface unchanged.
- **No changes to the exporter `id`.** It remains `"vgm"` throughout.

---

## Implementation Plan

### Phase 1 — Introduce backend interface and backend directory

- Create `packages/plugins/export-vgm/src/backends/types.ts` with the `VgmBackend` interface and `VgmTranslateResult` type.
- Create `packages/plugins/export-vgm/src/backendRegistry.ts` with chip alias normalisation and backend lookup.

### Phase 2 — Extract SN76489 backend

- Create `packages/plugins/export-vgm/src/backends/sn76489.ts` implementing `VgmBackend`.
- Move all SN76489-specific logic from `index.ts` and `ismToVgm.ts` into `sn76489.ts`.
- Delete or archive `ismToVgm.ts`.
- Add `backends/sn76489State.ts` (with compatibility re-export in `backends/psgState.ts` where needed).

### Phase 3 — Generalise VGM header params

- Extend `VgmHeaderParams` in `vgmWriter.ts` to include `ym2413Clock` and `ay8910Clock` optional fields.
- Update `constants.ts` with header offset constants for AY (`0xA0`) and YM2413 (`0x10`).
- Add near-term chip clock constants: `AY8910_CLOCK_NTSC`, `AY8910_CLOCK_PAL`, `YM2413_CLOCK`.
- Confirm via tests that SMS byte output is unchanged.

### Phase 4 — Refactor dispatcher in `index.ts`

- Replace the current hardcoded `isSupportedChip()` + `validateForVgm()` + `exportVgm()` with a backend-dispatch flow.
- The `ExporterPlugin.validate()` and `ExporterPlugin.export()` methods both call `resolveBackend()` from the registry.
- The `supportedChips` array on the plugin object is derived dynamically from registered backends.

### Phase 5 — AY backend stub (optional in this PR)

- Create `packages/plugins/export-vgm/src/backends/ay.ts` that registers `['ay', 'ym2149', 'ay38910', 'amstrad-cpc', 'atari-st', 'msx', 'zx-spectrum-128', 'oric-1', 'colour-genie', 'apple-ii-mockingboard', 'intellivision', 'vectrex']` aliases and returns a `validate()` error of `"AY-3-8910 VGM backend is not yet implemented"`.
- This ensures the dispatcher produces a meaningful error (not "no backend registered") when a user tries `beatbax export vgm` on an AY song prematurely.

### Phase 6 — Plugin wiring compatibility check

- Confirm `packages/plugins/chip-sms/src/index.ts` `resolveExporterPlugins()` flow is unchanged.
- Confirm `apps/web-ui/src/plugins/exporter-registry-config.ts` still resolves the single `vgm` exporter correctly.
- Confirm menu bar and toolbar references do not need changes (they reference the exporter by `id`, not by chip).

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `backends/sms.test.ts` | SMS backend: validate, translate, GD3, headerParams |
| `vgmWriter.test.ts` | Confirm SMS header byte output is byte-identical before/after header params extension |
| `backendRegistry.test.ts` | Chip alias normalisation, backend lookup, missing chip error message format |

### Integration Tests (`vgm-exporter.test.ts`)

- Update existing SMS tests to assert the same byte output as before the refactor (determinism gate).
- Add: unsupported chip (e.g., `chip="gameboy"`) → throws with "Available backends: sms" message.
- Add: `validate()` and `export()` resolve the same backend for the same chip input.
- Add: `supportedChips` on the ExporterPlugin object matches registered backend aliases.

### Regression Gate

Before merging, compare SHA-256 hash of `beatbax export vgm songs/sms/battle_field.bax` output before and after. Must be byte-identical.

---

## Migration Path

No user-facing changes. The exporter `id` (`"vgm"`), CLI usage, and Web UI menu entries are all unchanged. The refactor is internal to `@beatbax/plugin-exporter-vgm`.

---

## Implementation Checklist

- [ ] Create `src/backends/types.ts` (VgmBackend interface, VgmTranslateResult)
- [ ] Create `src/backendRegistry.ts` (alias normalisation, lookup, error message)
- [ ] Create `src/backends/sms.ts` (extract SMS logic from index.ts + ismToVgm.ts)
- [ ] Move `psgState.ts` into `src/backends/` or keep at root (decide based on test imports)
- [ ] Delete `src/ismToVgm.ts` (logic moved to `src/backends/sms.ts`)
- [ ] Extend `VgmHeaderParams` in `vgmWriter.ts` with optional `ay8910Clock`, `ym2413Clock`
- [ ] Add AY and YM2413 clock constants to `constants.ts`
- [ ] Refactor `index.ts` to dispatcher pattern
- [ ] Add AY stub backend (`src/backends/ay.ts`) — returns unsupported error
- [ ] Update `vgm-exporter.test.ts` for backend dispatch, alias resolution, unsupported-chip error
- [ ] Add `backendRegistry.test.ts`
- [ ] Update `vgmWriter.test.ts` to assert SMS byte output unchanged
- [ ] Run determinism gate: hash SMS VGM output before and after, confirm match
- [ ] Confirm chip-sms `resolveExporterPlugins()` flow unchanged
- [ ] Confirm web-ui exporter registry config unchanged
- [ ] Confirm CLI `beatbax export vgm` and `beatbax list-exporters` work on SMS fixtures

---

## Future Enhancements

- **AY-3-8910 backend:** Full implementation in a follow-up PR once the architecture lands. Enables VGM export for ZX Spectrum, Atari ST, Amstrad CPC, and MSX songs.
- **YM2413 backend:** Planned after AY. Adds OPLL FM VGM export for MSX-Music and PC-88 compositions.
- **YM2612 backend:** Genesis FM+PSG dual-chip VGM. Requires interleaved register write ordering between SN76489 and YM2612 clocks in a single data stream.
- **Per-chip backend packages:** If the number of backends grows large, Option B (separate optional backend packages discovered at load time) may become worthwhile. Not recommended until at least three chip backends are implemented.

---

## Resolved Decisions

| Decision | Resolution |
|----------|-----------|
| Single `vgm` exporter id vs per-chip ids | Single `id: "vgm"` with internal chip dispatch. Keeps registration stable. |
| Engine API changes | None. Existing `ExporterPlugin` interface used as-is. |
| Backend packaging | Option A: internal backends in one package. Simpler; revisit when ≥4 backends exist. |
| AY rollout | Option A: architecture refactor first; AY in follow-up PR. Lower risk, cleaner review. |
| Header breadth | Option A: add only fields required by near-term chips (AY, YM2413) now. |
| Mixed-chip songs | Out of scope for this iteration. One chip per song enforced at dispatch. |
| Unsupported chip behaviour | Fail loudly. No fallback. Error names available backends. |

---

## References

- Current VGM exporter: `packages/plugins/export-vgm/src/index.ts`
- ISM-to-VGM translator: `packages/plugins/export-vgm/src/ismToVgm.ts`
- VGM binary builder: `packages/plugins/export-vgm/src/vgmWriter.ts`
- Constants: `packages/plugins/export-vgm/src/constants.ts`
- VGM exporter integration tests: `packages/plugins/export-vgm/tests/vgm-exporter.test.ts`
- VGM header tests: `packages/plugins/export-vgm/tests/vgmWriter.test.ts`
- SMS chip plugin: `packages/plugins/chip-sms/src/index.ts`
- Exporter registry: `packages/engine/src/export/registry.ts`
- Web UI exporter config: `apps/web-ui/src/plugins/exporter-registry-config.ts`
- VGM specification: https://vgmrips.net/wiki/VGM_Specification
- ZX Spectrum 128 hardware guide: `docs/chips/zx-spectrum-128/hardware_guide.md`
- Existing VGM exporter feature doc: `docs/features/vgm-exporter-plugin.md`
