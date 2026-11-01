# Implementation Plan: Instrument editor preview pitch by type

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-22 | **Branch**: `feat/098-instrument-editor-preview-pitch`

## Summary

Extend `ChipInstrumentTypeDef` with `previewMode` / `previewOctave`, fill per-chip schemas, add NES `bundledSampleMeta`, teach the preview engine named-hit and uge_note-patched audition, and update Desktop Instrument Editor + CodeLens.

## Technical context

- **Packages / surfaces**: `packages/engine`, `packages/app-core`, `packages/plugins/chip-sms`, `packages/plugins/chip-spectrum-128`, `apps/desktop`, `docs/`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full (Instrument Editor + CodeLens); engine schema shared
- **Performance / constraints**: N/A (UI defaults only)

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (or migration documented)
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

- `packages/engine/src/chips/types.ts` — schema + plugin meta types
- `packages/engine/src/chips/{gameboy,nes}/instrument-editor.ts` — type values
- `packages/plugins/chip-{sms,spectrum-128}/src/instrument-editor.ts` — type values
- `packages/engine/src/chips/nes/dmcSamples.ts` + `plugin.ts` — `BUNDLED_SAMPLE_META`
- `packages/app-core/src/editor/codelens-preview.ts` — named-hit / patched preview + lenses
- `packages/app-core/src/editor/instrument-editor-schema.ts` — helpers for mode/octave resolution
- `apps/desktop/.../DesktopInstrumentEditor.tsx` — preview UI
- `docs/contributing/creating-plugins.md` — contract docs
- Tests under `packages/engine/tests`, `packages/app-core/tests`, `apps/desktop/tests` as needed

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None.

### Desktop / web UI changes

- Resolve preview mode/octave from schema + draft `note=`
- Melodic: existing MiniKeyboard with resolved octave
- Oneshot: Trigger; DMC meta strip when `@nes/` + meta
- uge_note: Trigger + tracker-note strip (audition-only patch)

### Export changes

None.

### Documentation updates

- `docs/contributing/creating-plugins.md` — `previewMode`, `previewOctave`, `bundledSampleMeta`
- Optional note in `docs/grammar/instrument-note-mapping-guide.md`

## Testing strategy

### Unit tests

- Schema type values per chip
- Octave resolution: `note=` → type → 4
- Meta keys ⊆ bundled sample names
- CodeLens title / mode selection helpers

### Integration tests

- Named-hit preview path constructs song with instrument token (smoke if feasible without audio)

### Manual / QA

- Desktop: switch GB pulse / wave / noise; NES triangle / noise / DMC; confirm UI and sound

## Migration and compatibility

Additive optional schema fields; omitted fields keep prior melodic octave-4 behaviour for unknown plugins.

## Open implementation questions

None.
