# Implementation Plan: MIDI import — chords as arpeggios

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-08 | **Branch**: `feat/095-midi-import-chord-arp`

## Summary

Add `arp` as a reduction policy in `reduce.ts`. It runs at the same point as the 089 `mono` policies (after bar-range selection and pitch adjustment, before lane placement): same-tick groups collapse to one note that carries an arp offset list, then the `earliest` rule resolves remaining overlaps. The offset list travels on the note (`QuantizedNote.arpOffsets`) through packing and reuse; the emitter turns it into a named effect preset and a `<preset>` suffix on the token.

## Technical context

- **Packages / surfaces**: `packages/engine/src/import/midi/*`, `packages/cli` (flag), docs
- **Language**: TypeScript (strict), ESM; browser-safe engine
- **Testing**: Jest; engine importer tests in `packages/engine/tests/import/midi/`; CLI tests in `packages/cli/tests/import-midi.test.ts`
- **Constraints**: byte-identical output when `arp` is unused (FR-003)

## Constitution Check

- [x] No invented syntax or undocumented language behavior: output uses `effect name = arp:…` and `Note<name>:N` from spec 025
- [x] AST / ISM / scheduler / expansion impact: none; only generated `.bax` text changes
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (sorted presets, fixed root/offset rules, default unchanged)
- [x] Tests planned for new behavior

## Project structure

| Path | Change |
| ---- | ------ |
| `packages/engine/src/import/midi/types.ts` | `MonoPolicy` + `'arp'`; `ChordPolicy = 'flatten' \| 'arp'`; `MidiImportConfig.chords`; `MidiConvertOptions.chords`; `QuantizedNote.arpOffsets?`; `PackedHit.arpOffsets?`; `ConversionSummary.notesArpeggiated`; `MappingStats.arpFallback` / `arpTruncated` |
| `packages/engine/src/import/midi/config.ts` | Parse `mono: "arp"` (melodic only) and `chords`; `resolveConvertOptions({ chords })` |
| `packages/engine/src/import/midi/reduce.ts` | `reduceArp(notes, gridTicks)`; `reduceStreams` applies `chords` default to streams without `mono` |
| `packages/engine/src/import/midi/pack.ts`, `reuse.ts` | Carry `arpOffsets` from note to hit to token (`C4<arp_3_7>:4`) |
| `packages/engine/src/import/midi/emit.ts` | Collect presets from tokens; write sorted `effect` lines after instruments; collision check (FR-022) |
| `packages/engine/src/import/midi/arrangement.ts`, `index.ts` | Aggregated `arp_fallback` / `arp_offsets_truncated`; summary count; `--annotate` text |
| `packages/cli/src/import-midi.ts` | `--chords <flatten\|arp>` |
| `packages/engine/tests/import/midi/midi-chord-arp.test.ts` (new) + fixture `f15-chords.mid` / `.import.json` | Scenarios from spec |
| `docs/features/midi-importer.md` | Chord policy section |

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### Importer changes

- **`reduceArp`.** Sort by the existing `byStartThenEarliestRule`; group by `startTick`; dedupe pitches; if span > 12, keep the `earliest` pick and count `arpFallback`; else root = lowest, offsets = ascending distances, keep the two smallest (count `arpTruncated` when more), duration = longest in group. Then run the existing `earliest` overlap resolution on the reduced list. Notes merged into a chord add to `notesArpeggiated`, not to `dropped`.
- **Default policy.** In `reduceStreams`, a melodic stream with no `mono` and `options.chords === 'arp'` uses `reduceArp`. With `chords: 'flatten'` and no `mono`, streams pass through to the packer unchanged, so the 006 `chord_flatten` path and its output stay as they are.
- **Token.** The note token gets `<arp_…>` appended (before `formatToken` in `reuse.ts` adds `:duration`) when `arpOffsets` is non-empty; the melodic token is built where `PackedHit.token` is set in `pack.ts`. Hash and reuse logic is unchanged because it works on token strings.
- **Presets.** `emit.ts` scans pattern tokens for `<arp_…>`, builds `effect arp_a_b = arp:a,b` lines, sorts by name and writes them after the kit.

### CLI changes

`--chords <flatten|arp>` added to `midiImportOptionDefs()` and passed to `resolveConvertOptions`; invalid values fail with the usual error style.

### Desktop / web UI changes

None (spec 096).

### Export changes

None.

### Documentation updates

`docs/features/midi-importer.md`: chord policy section with the rules, an example, and the UGE note.

## Testing strategy

### Unit tests

- `reduceArp`: triad, 4-note truncation, octave, duplicate pitch, single note, span fallback, strum within one step vs across steps, overlap after a chord.
- Config: `mono: "arp"` on noise/dmc errors; `chords` parse; CLI flag beats config.
- Emit: presets deduped and sorted; token format; collision error.

### Integration tests

- Fixture `f15-chords` with `mono: "arp"` matches a stored golden and passes `verify` (CLI test) (SC-002).
- All existing goldens unchanged (SC-001).
- UGE export of the golden has no arp truncation warning (SC-003).

### Manual / QA

- Import a piano-chord MIDI from `songs/midi` with `--chords arp` and listen on Game Boy and NES.

## Migration and compatibility

Opt-in. Existing configs and CLI invocations produce identical output.

## Open implementation questions

- OQ-2 in the spec (wave channel playback) is checked in T001 before deciding warn vs error.
