# Implementation Plan: Arrangement-aware MIDI import

**Spec**: [spec.md](spec.md) | **Issue**: https://github.com/kadraman/beatbax/issues/213 | **Date**: 2026-09-27 | **Branch**: `feat/089-midi-import-arrangement`

## Summary

Move the capabilities of the `songs/covers/tools/split-midi.mjs` prototype into the 006 importer as optional `--config` fields and two CLI flags (`--inspect`, `--annotate`). The new behaviour is gated so that configs which do not use it produce byte-identical 006 output. Lane packing is a new, separate path in the packer (`packing: "lanes"`); the 006 stream packer is not modified.

Pipeline after this feature (new stages in bold):

```text
readMidiBytes → **timing (tempo select, bar grid, window, nudge)** → quantize
  → classify (**range-aware multi-mapping, include/exclude, transpose/fold, unmapped drop**)
  → **per-mapping reduce + clip** → pack (**lanes** | 006 streams) → reuse → emit (**annotate, scaled bpm**)
```

## Technical context

- **Packages / surfaces**: `packages/engine` (`src/import/midi/`), `packages/cli` (`src/import-midi.ts`, `src/cli.ts`)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: engine-only + CLI. Engine code stays browser-safe (bytes in, strings/objects out; no `fs`/`path`).
- **Performance / constraints**: typical 250-bar, 30-track MIDI must convert in well under a second. Reduction and lane placement are O(n log n) per mapping (sort + sweep), not the O(n²) pairwise check used by 006 `streamOverlaps`.

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior: output uses existing `inst` / `pat` / `seq` / `channel` / `inst()` / `#` comments only.
- [x] AST / ISM / scheduler / expansion impact identified: **N/A**. The importer only writes `.bax` text.
- [x] Plugins remain isolated; core does not gain plugin dependencies. Chip role tables are the existing `chipRoles.ts`.
- [x] Determinism and compatibility preserved: every new field is optional; absent fields take the 006 code path. The one intended output change (tempo scaling when `ticksPerBeat` ≠ 4, spec FR-040) applies by default (OQ-1) and is documented as a fix.
- [x] Tests planned for new behavior (below).

**Exceptions**

| Principle | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| VI. No silent breaking changes (FR-040; OQ-1 resolved: default on) | Imports with `ticksPerBeat` ≠ 4 currently play at the wrong speed | Gating it behind a new field leaves the existing wrong-speed output as the default; the change is called out in docs and release notes, not silent. No committed fixture uses `ticksPerBeat` ≠ 4. |

## Project structure

```text
packages/engine/src/import/midi/
  types.ts        # extend TrackMapping, MidiImportConfig, MidiConvertOptions, ConversionSummary (additive)
  config.ts       # parse/validate new fields; resolve into options
  timing.ts       # NEW: tempo selection, written-bpm scaling, source bar grid, window/nudge in MIDI ticks
  quantize.ts     # apply nudge before quantize; apply window filter/shift after
  roles.ts        # range-aware findOverrides (multi-match), include/exclude, transpose/fold, unmapped drop
  reduce.ts       # NEW: mono policies (earliest/highest/lowest/newest), legato tail rule, range clipping
  pack.ts         # NEW packLanes() path; 006 packChannels() path unchanged
  reader.ts       # additive per-track programName (from @tonejs/midi) for inspect
  inspect.ts      # NEW: inspectMidiParseResult() → structured report (browser-safe)
  emit.ts         # optional annotation block; bpm already resolved by timing.ts
  index.ts        # wire stages; export inspect API
packages/engine/scripts/generate-midi-fixtures.mjs   # add F10–F14
packages/engine/tests/fixtures/midi/                 # f10..f14 .mid + .import.json
packages/engine/tests/import/midi/                   # new unit + golden tests
packages/cli/src/import-midi.ts                      # --inspect, --annotate
packages/cli/src/cli.ts                              # make --chip / output optional when --inspect
packages/cli/tests/import-midi.test.ts               # CLI coverage
docs/features/midi-importer.md                       # config reference + examples
```

## Implementation

### Config and types (`types.ts`, `config.ts`)

- `TrackMapping` gains `fromBar?`, `toBar?`, `mono?: 'earliest' | 'highest' | 'lowest' | 'newest'`, `transpose?`, `fold?: [number, number]`, `include?: number[]`, `exclude?: number[]`.
- `MidiImportConfig` gains `packing?: 'streams' | 'lanes'`, `unmappedTracks?: 'auto' | 'drop'`, `bpm?`, `tempo?: 'first' | 'longest'`, `startBar?`, `endBar?`, `nudge?`, `annotate?`.
- Validation (all in `parseImportConfig`, same message style as 006):
  - `fromBar`/`toBar`/`startBar`/`endBar`: integers ≥ 1, `from ≤ to`.
  - `fold`: two integers in 0–127 with `hi - lo ≥ 12`.
  - `include`/`exclude`: integer arrays in 0–127, only on `noise`/`dmc` targets.
  - Enum fields are checked against their value sets.
- `resolveConvertOptions` copies resolved values into `MidiConvertOptions`, and adds the CLI `annotate` flag (CLI wins).

### Timing (`timing.ts`, `quantize.ts`, `index.ts`)

- `selectSourceBpm(parsed, options)`: `bpm` override, else `tempo` policy. `longest` sums held MIDI ticks per rounded BPM up to the last note end (ties → lower BPM). `first` keeps the existing `pickBpm`.
- `writtenBpm(sourceBpm, ticksPerBeat)` = `round(sourceBpm × ticksPerBeat / 4)`, applied to every import (OQ-1).
- `sourceBarTicks(parsed)`: MIDI ticks per source bar from the first time signature (4/4 when absent), used to turn every bar number in the config into MIDI tick bounds (spec FR-035). Warn with `bar_numbering_first_signature` when the file has more than one time-signature event.
- Nudge (sixteenths → MIDI ticks, `ppq / 4` each) is added to note starts before `midiTicksToBaxTicks`. Starts are clamped at 0.
- Window: notes whose nudged start lies outside `[startBar, endBar]` are dropped by choice (not counted). The rest are shifted so `startBar` becomes BeatBax tick 0. Bar-range bounds stay in source MIDI ticks and are compared against the nudged, **pre-shift** start, so config bars always mean source bars.
- `pushIgnoredTimingDiagnostics` reports against the selected tempo rather than always the first.

### Classification (`roles.ts`)

- `findOverrides(note, mappings, barBounds)` returns every mapping whose selector matches **and** whose range contains the note (spec FR-014). The 006 `findOverride` stays for mappings without ranges in `streams` mode, so 006 selection is unchanged.
- In `lanes` mode each (mapping index, note) pair becomes part of a stream keyed `lane:<target>:<mappingIndex>`. The stream carries `mappingIndex`, `mono`, `transpose`, `fold` and its range end (in BeatBax ticks) for clipping.
- `include`/`exclude` filter drum notes before `drumMap` lookup.
- Transpose, then fold, is applied to melodic notes. Notes outside 0–127 after transpose are dropped with `pitch_out_of_range` (aggregated).
- `unmappedTracks: 'drop'` skips notes with no matching mapping and collects per-track counts for one `unmapped_dropped` info diagnostic.

### Reduction (`reduce.ts`)

- `reduceMono(notes, policy, gridTicks)` implements spec FR-021 exactly, including the legato tail rule (tail ≤ one grid step or ≤ ¼ of the held duration).
- `earliest` delegates to the existing 006 ordering so behaviour is identical.
- `clipToRange(notes, endTick)` shortens notes at the mapping range end and at the window end (spec FR-013).
- Returns kept notes and dropped counts for the stats in spec FR-070.

### Packing (`pack.ts`)

- `packChannels` branches on `options.packing`:
  - `'streams'` runs the existing function body unchanged.
  - `'lanes'` runs `packLanes()`.
- `packLanes()` steps:
  1. Group lane streams by resolved role (`roleForChip`), in config order.
  2. For each lane, keep a sorted interval list of placed notes. For each mapping's reduced notes, keep those that do not overlap the placed intervals (sweep over sorted lists) and count the rest as `lane_overlap`.
  3. Emit hits with `inst()` tags when a lane has more than one instrument, reusing the existing merge/emit loop so tokens and `inst()` placement match 006.
  4. Pack any `auto` streams afterwards with the 006 stream rules against the occupied slots.
  5. Drums and DMC reinforcement reuse the existing noise/DMC code.
- `PackResult` gains `mappingStats` (per mapping: kept, `lane_overlap`, `mono_reduce`, `pitch_out_of_range`). The summary and annotation read from it.

### Inspect (`inspect.ts`, CLI)

- `inspectMidiParseResult(parsed)` returns `{ ppq, timeSignatures, bars, tempos: [{ bar, bpm }], longestBpm, tracks: [{ index, channel, program, programName, name, notes, lo, hi, firstBar, lastBar, activity: number[], duplicateOf? }] }`.
- Duplicate detection compares the `(start, pitch, duration)` note lists of each track.
- GM program names come from `@tonejs/midi` (`track.instrument.name`); the engine has no table of its own. `readMidiBytes` gains an additive per-track `programName` field.
- `readMidiBytes` already carries track index, channel, program and name per note. Tracks with no notes are omitted, as in the prototype.
- CLI: `--inspect` short-circuits `runMidiImport`. It ignores `--chip`, `--config` and the output path, printing a warning if any are given. `cli.ts` only requires `--chip` when not inspecting.

### Emit (`emit.ts`)

- `emitBaxSource` takes an optional `annotation` model and writes a `#` comment block before `# Generated by beatbax import midi`. It uses the markers `# >>> arrangement notes` / `# <<< arrangement notes`, matching the covers tooling, so hand-written notes can live next to it.
- The `bpm` line uses the resolved written bpm.

### CLI changes

- New flags: `--inspect`, `--annotate`.
- `--chip` becomes conditionally required.
- The summary line is unchanged.

### Desktop / web UI changes

None.

### Export changes

None.

### Documentation updates

- `docs/features/midi-importer.md`:
  - config reference for every new field;
  - a "Arranging dense MIDI" section with one worked example, adapted from a covers recipe;
  - `--inspect` / `--annotate` usage;
  - a note on `ticksPerBeat: 3` for triplet songs, and on the tempo-scaling fix.
- `specs/complete/006-midi-importer/spec.md` already points to 089.

## Testing strategy

### Unit tests (`packages/engine/tests/import/midi/`)

- `midi-arrangement-config.test.ts`: valid and invalid cases for every new field; enum values; `include`/`exclude` rejected on melodic targets; `fold` span < 12 rejected.
- `midi-arrangement-timing.test.ts`:
  - `longest` vs `first` on a two-tempo parse result;
  - `bpm` override;
  - written-bpm scaling for `ticksPerBeat` 3 and 4;
  - window shift, and bar bounds staying in source bars;
  - nudge including the clamp at 0.
- `midi-arrangement-reduce.test.ts`:
  - each policy on chords and overlaps;
  - the legato tail rule at both thresholds;
  - `earliest` identical to 006 `resolveMonophonic` on the same input;
  - clipping.
- `midi-arrangement-lanes.test.ts`:
  - two ranged mappings on one role → both parts, `inst()` at the boundary, no `over_polyphony`;
  - gap-fill drops and counts `lane_overlap`;
  - binding target (never relocated);
  - `unmappedTracks` `auto` vs `drop`;
  - `include`/`exclude`;
  - transpose/fold, and `pitch_out_of_range`.
- `midi-inspect.test.ts`: duplicate detection, activity blocks, tempo list, determinism (two runs deep-equal).
- `midi-annotate.test.ts`: annotation block content and markers; absent without the flag.

### Integration tests

- `midi-golden.test.ts`:
  - F01–F09 unchanged (spec SC-001);
  - new goldens F10 (ranged lanes + gap fill), F11 (mono policies), F12 (tempo map + window + nudge), F13 (triplet `ticksPerBeat: 3`), F14 (duplicate tracks + unmapped drop) generated by `packages/engine/scripts/generate-midi-fixtures.mjs`;
  - every golden passes `verify`.
- `packages/cli/tests/import-midi.test.ts`:
  - `--inspect` prints the report and writes nothing;
  - `--inspect` without `--chip` succeeds;
  - `--annotate` adds the block;
  - a config using the new fields round-trips through the CLI.
- Determinism: convert each new fixture twice and assert byte-identical output.

### Manual / QA

- Parity run (spec SC-002, SC-003) is operator-local. The 13 covers MIDIs are copyrighted and must not be vendored (006 rule).
  1. Translate each `songs/covers/midi/<song>.split.json` into an importer config.
  2. Convert the original `.mid` for both chips.
  3. Diff per-channel note content against the current split-based `.bax`.
  4. Record differences in `specs/features/089-midi-import-arrangement/parity.md`.

## Migration and compatibility

- Existing configs: unchanged output unless they use `ticksPerBeat` ≠ 4. Those now get a scaled `bpm` so they play at the source speed (FR-040). Document this in `docs/features/midi-importer.md` and the release notes.
- `songs/covers`:
  - recipes become plain importer configs, so the `.split.mid` and generated `.json` files are no longer needed;
  - `split-midi.mjs` can be retired after the parity run;
  - `annotate-bax.mjs` remains for the hand-written improvement ideas, and can read the importer's factual block instead of computing stats itself.
- Public engine API: additive only (`inspectMidiParseResult`, new option fields, `PackResult.mappingStats`).

## Open implementation questions

- Whether `mappingStats` should also be exposed on `ConversionSummary` (useful for Desktop later) or stay internal to annotation.
- OQ-1, OQ-2 and OQ-6 (issue #213) are resolved. OQ-3 (confirm the step-duration contract) should be answered before T030; OQ-4 and OQ-5 do not block implementation.
