---
title: "Arrangement-aware MIDI import"
id: 89
slug: "midi-import-arrangement"
status: specified
authors: ["Cursor Agent"]
created: 2026-09-27
updated: 2026-09-27
issue: "https://github.com/kadraman/beatbax/issues/213"
area: engine
---

# Feature Specification: Arrangement-aware MIDI import

## Summary

Extend the shipped CLI MIDI → `.bax` conversion (feature **006**, `specs/complete/006-midi-importer/`) so that a single `--config` file can arrange a dense multi-track MIDI onto the Game Boy / NES channel budget without an external preprocessing step:

- map a source track to a chip role for a **bar range** only, so different instruments can share one channel at different points in the song;
- give each mapping its own **chord-reduction policy** (keep the top line for leads, the bottom line for bass);
- **transpose / fold** a mapping into the target channel's range;
- **filter drum sources** by note number;
- override the **tempo**, trim the song to a **bar window**, and **nudge** early/late MIDI grids;
- keep **triplet-grid** imports (`ticksPerBeat: 3`) playing at the source tempo;
- **inspect** a MIDI file's tracks before writing a config;
- optionally emit a factual **arrangement notes** comment header.

No BeatBax language syntax changes. Output remains ordinary `.bax` source. When none of the new config fields or flags are used, output is byte-identical to 006. The single intended exception is the tempo fix for `ticksPerBeat` ≠ 4 (FR-040).

## Problem

006 maps whole tracks only. Its packer places a stream on a channel only when it never overlaps what is already there, flattens chords to the earliest/loudest/lowest note, and uses the first tempo event. On real songs this drops 40–75% of notes: whole melody tracks are discarded as `over_polyphony`, top-line melodies are replaced by their lowest chord note, and songs with a count-in tempo import at the wrong speed.

The `songs/covers` work (13 pop/TV-theme MIDIs → 26 Game Boy / NES `.bax` files) solved this with a standalone script, `songs/covers/tools/split-midi.mjs`, that rewrote each MIDI into a pre-arranged `<song>.split.mid` plus a generated importer config. With it, every song converted with **zero** `over_polyphony`, `chord_flatten` or `mono_conflict` warnings; the only remaining drops were drum hits stacked on the single noise channel. That capability belongs in the importer: it needs Node file I/O and a second file format today, cannot run in browser-safe engine code, and leaves users maintaining two configs per song.

## User scenarios

### User Story 1 — Arrange a dense MIDI with bar-range mappings (Priority: P1)

A composer converts a pop MIDI with 9+ melodic tracks. They map the synth riff to pulse1 for the intro and outro, the vocal line to pulse1 for the verses and choruses, and let a guitar fill the vocal gaps; harpsichord, strings and guitar chords share pulse2 the same way.

**Why this priority**: this is the capability that removed the mass note drops.

**Independent test**: a fixture with two non-overlapping-by-range but overlapping-in-time tracks mapped to one role imports both parts, each in its own bar range, with `inst()` switches, and no `over_polyphony` warning.

**Acceptance scenarios**:

1. **Given** mappings `{track 5, pulse1, bars 14–29}` and `{track 0, pulse1, bars 30–97}`, **When** imported, **Then** channel 1 plays track 5 in bars 14–29 and track 0 in bars 30–97, switching instrument with `inst()` at the boundary.
2. **Given** a later mapping on the same target that overlaps notes already placed by an earlier mapping, **When** imported, **Then** only the non-overlapping notes of the later mapping are kept (gap fill) and the dropped count is reported for that mapping.
3. **Given** a note that starts inside a mapping's range but ends after `toBar`, **When** imported, **Then** the note is shortened to end at the range boundary.

### User Story 2 — Keep the melody when reducing chords (Priority: P1)

A lead track is voiced in chords. The composer wants the top note; for the bass they want the bottom note; for a fast sequencer line they want each new note to cut off the previous one.

**Independent test**: a chord fixture imported with `mono: "highest"` keeps the top pitch on every chord and applies the legato-tail rule.

**Acceptance scenarios**:

1. **Given** `mono: "highest"`, **When** three notes start together, **Then** the highest pitch is kept.
2. **Given** `mono: "lowest"` on a bass mapping, **When** a chord occurs, **Then** the lowest pitch is kept.
3. **Given** `mono: "newest"`, **When** a note starts while another is held, **Then** the held note is shortened to end where the new note starts.
4. **Given** `mono: "highest"` and a lower note that starts while a higher note has only a short tail left, **When** imported, **Then** the lower note is kept and the held note is shortened (legato tail rule, FR-021).

### User Story 3 — Fix timing without editing the MIDI (Priority: P2)

The Miami Vice MIDI starts with a one-bar 200 BPM count-in before settling at 96 BPM; the Take On Me MIDI's grid is one sixteenth late; the Airwolf MIDI is in triplet eighths; several MIDIs have an empty bar or a sound-effect intro before the song starts.

**Independent test**: a two-tempo fixture imported with `tempo: "longest"` writes the longer-held tempo; `startBar: 2` makes source bar 2 the first bar of output.

**Acceptance scenarios**:

1. **Given** `bpm: 96`, **When** imported, **Then** the output `bpm` is 96 (scaled per FR-032 when `ticksPerBeat` ≠ 4).
2. **Given** `startBar: 4, endBar: 40`, **When** imported, **Then** output bar 1 holds source bar 4 and the song ends after source bar 40.
3. **Given** `nudge: -1`, **When** imported, **Then** every note starts one sixteenth earlier before quantization.
4. **Given** `ticksPerBeat: 3` and a 135 BPM source, **When** imported, **Then** the output plays at the source tempo (written `bpm` 101 = round(135 × 3 / 4)).

### User Story 4 — Inspect a MIDI before writing a config (Priority: P2)

Before writing a config the composer needs to know which track is the vocal, which tracks double each other, where each part plays, and what the tempo map looks like.

**Independent test**: `beatbax import midi --inspect song.mid` prints a deterministic per-track report and writes nothing.

**Acceptance scenarios**:

1. **Given** a MIDI with duplicate tracks, **When** inspected, **Then** each duplicate is marked as a copy of the first identical track.
2. **Given** a MIDI with tempo changes, **When** inspected, **Then** every tempo event is listed with its bar, and the longest-held tempo is shown.

### User Story 5 — Drum sources and unmapped tracks (Priority: P3)

The composer wants only the combined kit track (not the per-sound copies), wants to drop a few non-GM notes, and wants tracks they did not map (sound effects, doubled parts) left out.

**Acceptance scenarios**:

1. **Given** a noise mapping with `exclude: [87, 88, 89]`, **When** imported, **Then** those note numbers are ignored for that mapping.
2. **Given** `unmappedTracks: "drop"`, **When** imported, **Then** tracks that match no mapping produce no output and are listed in a diagnostic.

### User Story 6 — Arrangement notes header (Priority: P3)

The composer wants the generated `.bax` to record where each part came from and what was dropped, so they can improve it by hand later.

**Acceptance scenarios**:

1. **Given** `--annotate` (or `annotate: true`), **When** imported, **Then** the output starts with a comment block listing each channel's mappings (source track, instrument, bar range), per-mapping dropped-note counts by reason, and timing decisions (tempo chosen, window, nudge, ignored tempo / time-signature events).

### Edge cases

- `fromBar` > `toBar`, a bar range outside the song, or `endBar` < `startBar`: config error at parse time.
- Two mappings for the same track and overlapping bar ranges with **different** targets: allowed (the track is heard on both channels in that range).
- Two mappings for the same track, same target, overlapping ranges: allowed; the second only fills gaps (FR-011).
- `fold` range narrower than 12 semitones: config error (a pitch class may not fit).
- `fold` bounds outside MIDI 0–127: config error. `transpose` alone pushing a note outside 0–127: the note is dropped and counted (diagnostic `pitch_out_of_range`).
- `include`/`exclude` on a melodic target: config error.
- `nudge` moving a note before tick 0: the note starts at tick 0.
- Non-4/4 sources: config bar numbers are source bars (FR-035), so in a 2/4 file source bar 3 starts at output step 16. Output bars are still `patternTicks` long, and the existing `time_signature_ignored` warning still fires.
- `--inspect` with `--chip`, `--config` or an output path: those are ignored with a warning (inspect never writes).

## Requirements

### Functional requirements

Config compatibility

- **FR-001**: All new fields are optional. A config that uses none of them, run without the new CLI flags, MUST produce byte-identical output to 006, except for the tempo fix in FR-040 when `ticksPerBeat` ≠ 4.
- **FR-002**: New fields MUST be validated at config-parse time with the same error style as 006 (`trackMappings[i].field …`). Unknown keys remain ignored.

Bar-range mappings and lanes

- **FR-010**: `trackMappings[]` MAY specify `fromBar` and/or `toBar` (1-based, inclusive). A note belongs to the mapping only if its quantized start lies in `[fromBar, toBar]`. Absent `fromBar` = song start; absent `toBar` = song end.
- **FR-011**: A top-level `packing: "lanes"` option enables lane packing. In lane mode, mappings that share a `target` form a lane, processed in config array order. A mapping's notes are placed on the lane only where they do not overlap notes already placed by earlier mappings on that lane; overlapping notes are dropped and counted per mapping (diagnostic `lane_overlap`). Each mapping keeps its own instrument; the lane is emitted on the target's channel with `inst()` switches (006 multiplex semantics).
- **FR-012**: In lane mode a mapping's `target` is binding: its notes are never relocated to a different channel and never cause the whole stream to be dropped. Unmapped tracks (when `unmappedTracks` is `"auto"`) are packed afterwards by the 006 stream rules into whatever the lanes leave free. Drum mappings keep 006 noise merging and stack resolution. Default `packing` is `"streams"` (006 behaviour).
- **FR-013**: A note that extends past its mapping's `toBar` (or past `endBar`) MUST be shortened to end at that boundary.
- **FR-014**: A track may appear in several mappings. A note is assigned to every mapping whose track/channel selector and bar range match it (006 selector-scoring still picks between mappings that differ only in selector specificity).

Chord reduction and pitch

- **FR-020**: `trackMappings[].mono` MAY be `"highest" | "lowest" | "newest" | "earliest"`. `"earliest"` is the 006 rule (earliest start, then higher velocity, then lower pitch). Absent = `"earliest"`.
- **FR-021**: Reduction runs per mapping, after bar-range selection and pitch adjustment and before lane placement. Among notes starting on the same tick, `highest`/`lowest` keep the highest/lowest pitch. When a note starts while an earlier kept note is still sounding: under `newest` the new note always wins; under `highest`/`lowest` it wins if its pitch is ≥ / ≤ the held note's, **or** if the held note's remaining tail is ≤ one quantize grid step or ≤ ¼ of the held note's duration (legato tail rule). A winning note shortens the held note to end at the new note's start; a losing note is dropped and counted (diagnostic `mono_reduce`, aggregated per mapping).
- **FR-022**: `trackMappings[].transpose` (integer semitones) and `fold: [lo, hi]` (MIDI note numbers, `hi - lo ≥ 12`) MAY be set on melodic mappings. Transpose is applied first; fold then moves the note by octaves until it lies in `[lo, hi]`.

Drums and unmapped tracks

- **FR-025**: Mappings with target `noise` or `dmc` MAY set `include` and/or `exclude` (arrays of MIDI note numbers 0–127) applied before drum mapping. Remapping a note to a different drum sound is done with the existing `drumMap` (e.g. `"61": "snare"`); no separate remap field is added.
- **FR-026**: Top-level `unmappedTracks: "auto" | "drop"`. `"auto"` (default) is 006 behaviour. `"drop"` excludes every note that matches no mapping and emits one `unmapped_dropped` info diagnostic listing the tracks and note counts. Dropped-by-choice notes are not counted as `notesDropped`.

Timing

- **FR-030**: Top-level `bpm` (number > 0) overrides the source tempo.
- **FR-031**: Top-level `tempo: "first" | "longest"`. `"first"` (default) is 006 behaviour. `"longest"` selects the tempo held for the most MIDI ticks (ties → lower BPM). `tempo` is ignored when `bpm` is set. `tempo_map_ignored` still reports the unused events.
- **FR-032**: When `ticksPerBeat` ≠ 4 the written `bpm` is `round(sourceBpm × ticksPerBeat / 4)`, so `ticksPerBeat` output steps span one source beat. This applies to every import (FR-040).
- **FR-033**: Top-level `startBar` / `endBar` (1-based, inclusive) select a song window. Notes starting outside the window are excluded; output bar 1 is `startBar`.
- **FR-035**: Every bar number in the config (`fromBar`, `toBar`, `startBar`, `endBar`) is a **source** bar, 1-based, measured with the MIDI file's first time signature (4/4 when none is present). When the file contains more than one time-signature event, a `bar_numbering_first_signature` warning is emitted.
- **FR-034**: Top-level `nudge` (integer, in sixteenth notes of the source) shifts every note before quantization.

Inspect

- **FR-050**: `beatbax import midi --inspect <file.mid>` prints, without writing files: PPQ, time signature(s), bar count, every tempo event with its bar and the longest-held tempo, and per track: index, MIDI channel (1-based), GM program number and name, track name, note count, pitch range, first/last bar, activity per 8-bar block, and "duplicate of T*n*" when the track's note list is identical to an earlier track's.
- **FR-051**: The inspect report MUST be deterministic and produced by a browser-safe engine API returning structured data; the CLI formats it.

Arrangement notes

- **FR-060**: `--annotate` / config `annotate: true` emits a comment block before the existing generated header containing: per channel, each contributing mapping (track, instrument, bar range) in lane order; per mapping, notes kept and dropped by reason (`lane_overlap`, `mono_reduce`, pitch out of range); drum hits dropped on the noise channel; and timing decisions (chosen tempo and policy, written bpm, window, nudge, ignored tempo / time-signature events). Content is factual only.

Diagnostics and summary

- **FR-070**: New drop reasons MUST be counted in `ConversionSummary.notesDropped` and reported as aggregated diagnostics (one per mapping per reason), not one diagnostic per note.
- **FR-071**: Output MUST remain deterministic for identical input, config and flags.

Behaviour change to 006

- **FR-040**: 006 currently writes the source bpm unchanged when `ticksPerBeat` ≠ 4, so such imports play at 4 / `ticksPerBeat` × the source speed. FR-032 corrects this for every import, including configs that use no other 089 field (OQ-1). The change MUST be documented in `docs/features/midi-importer.md` and the release notes.

### Non-goals

- New BeatBax syntax: no tempo maps, meter changes or triplet grid in the language.
- Editorial improvement suggestions (macro / effect / DCM ideas) in the annotation header; those stay hand-written.
- Converting to several chips in one run.
- A Desktop / Web import UI.
- Changing 006 behaviour for configs that do not use the new fields (other than FR-040).
- Keeping `songs/covers/tools/split-midi.mjs`; it can be retired once parity is shown (SC-002).

## Success criteria

- **SC-001**: 006 golden fixtures F01–F09 and existing importer tests pass unchanged.
- **SC-002**: The 13 `songs/covers/midi` songs, converted directly from the original `.mid` with configs translated from their `.split.json` recipes, produce the same notes per channel as the current split-based `.bax` files (pattern names may differ). Any difference is listed and explained.
- **SC-003**: Those 26 outputs report zero `over_polyphony`, `chord_flatten` and `mono_conflict` warnings and pass `beatbax verify`.
- **SC-004**: `--inspect` output for the 13 songs lists the same duplicate tracks as `split-midi.mjs --inspect`.

## Assumptions

- The PCM renderer and scheduler play one step as a sixteenth of the written `bpm` (observed: `tickSeconds = secondsPerBeat / 4` in `packages/engine/src/audio/pcmRenderer.ts`). FR-032 depends on this; see OQ-3.
- `@tonejs/midi` remains the reader; inspect uses the same parse result as conversion.

## Open questions

- **OQ-1** *(resolved 2026-09-27)*: FR-032 tempo scaling for `ticksPerBeat` ≠ 4 applies **by default**. It is treated as a bug fix to 006 and called out in the docs and release notes.
- **OQ-2** *(resolved 2026-09-27)*: `fromBar`/`toBar`/`startBar`/`endBar` count **source bars**, measured with the first time signature (what a DAW shows). A warning is emitted if the source time signature changes.
- **OQ-3**: Confirm the step-duration contract (one step = one sixteenth of `bpm`) is the specified behaviour, or point to the spec that defines it.
- **OQ-4**: Should `tempo` default flip to `"longest"` in a later release? *Recommendation: no — keep `"first"` for compatibility; recommend `"longest"` in docs.*
- **OQ-5**: Should `--inspect` also offer `--json` output for tooling? *Recommendation: yes, low cost once FR-051's structured API exists.*
- **OQ-6** *(resolved 2026-09-27)*: GitHub issue https://github.com/kadraman/beatbax/issues/213.

## References

- Feature 006 (shipped baseline): [specs/complete/006-midi-importer/spec.md](../../complete/006-midi-importer/spec.md)
- Importer code: `packages/engine/src/import/midi/` (`config.ts`, `roles.ts`, `pack.ts`, `quantize.ts`, `index.ts`), CLI `packages/cli/src/import-midi.ts`
- Prototype: `songs/covers/tools/split-midi.mjs`, recipes `songs/covers/midi/*.split.json`
- User docs: [docs/features/midi-importer.md](../../../docs/features/midi-importer.md)
