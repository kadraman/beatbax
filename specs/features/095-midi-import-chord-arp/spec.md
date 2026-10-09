---
title: "MIDI import: chords as arpeggios"
id: 95
slug: "midi-import-chord-arp"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-08"
updated: "2026-10-08"
issue: "https://github.com/kadraman/beatbax/issues/209"
area: "engine"
related:
  - "specs/complete/006-midi-importer/spec.md"
  - "specs/complete/089-midi-import-arrangement/spec.md"
  - "specs/complete/025-arpeggio-effect/spec.md"
---

# Feature Specification: MIDI import — chords as arpeggios

## Summary

When several melodic notes start on the same tick, the MIDI importer keeps one of them (spec 006 `chord_flatten`, or the 089 `mono` policies `highest` / `lowest`) and drops the rest. This spec adds an opt-in chord policy, `arp`, that keeps the chord as one note with the existing `arp:` effect (spec 025): the lowest pitch plays as the root and the other pitches become semitone offsets, so a C–Eb–G block chord becomes `C4<arp_3_7>:4` with `effect arp_3_7 = arp:3,7`. The default behaviour does not change.

## Problem

- Piano and pad tracks voiced in block chords lose their harmony on import: only one pitch survives per chord, and 006 emits one `chord_flatten` warning per chord.
- Chiptune composers already write chords as arpeggios (`arp:` is in every chip song-wizard template), but the importer cannot produce them.
- Spec 089 lets each mapping choose which single note to keep (`mono`); it has no way to keep the chord itself.

## User scenarios

### User Story 1 — Keep block chords as arpeggios (Priority: P1)

**Why this priority**: This is the request in #209.

**Independent test**: Import a fixture with a C–Eb–G chord using `mono: "arp"` on its mapping; the output has one `C4<arp_3_7>` note and the `effect arp_3_7 = arp:3,7` line.

**Acceptance scenarios**:

1. **Given** a mapping with `mono: "arp"` and a C4–Eb4–G4 chord lasting one beat, **When** imported, **Then** the channel plays `C4<arp_3_7>:4` (with `ticksPerBeat` 4) and the song defines `effect arp_3_7 = arp:3,7` once.
2. **Given** `--chords arp` on the command line (or `chords: "arp"` in the config), **When** a MIDI with block chords is imported without `trackMappings`, **Then** every melodic stream without its own `mono` uses the `arp` policy.
3. **Given** the same MIDI imported without the flag, config key or `mono: "arp"`, **When** imported, **Then** the output is byte-identical to the current importer (flatten and `chord_flatten` warnings).
4. **Given** two chords with the same intervals on different roots, **When** imported, **Then** both use the same effect preset (`effect` lines are deduplicated and sorted by name).

### User Story 2 — Do not arpeggiate what is not a chord (Priority: P1)

**Why this priority**: Arpeggiating a bass note together with a melody two octaves up sounds wrong; the policy has to be conservative.

**Acceptance scenarios**:

1. **Given** `mono: "arp"` and two notes 19 semitones apart starting together, **When** imported, **Then** the group is not arpeggiated: the `earliest` rule (006) keeps one note, and one aggregated `arp_fallback` warning per mapping reports the count and reason (`span`).
2. **Given** a note that starts while an arpeggiated chord is still sounding, **When** imported, **Then** the 006 `earliest` overlap rule applies to it (it is not merged into the chord).
3. **Given** a drum mapping (`target: "noise"` or `"dmc"`) with `mono: "arp"`, **When** the config is parsed, **Then** parsing fails with `trackMappings[i].mono 'arp' is only allowed on melodic targets`.

### User Story 3 — Chords larger than the export can carry (Priority: P2)

**Why this priority**: hUGETracker (UGE export) carries two arp offsets; four-note chords are common in MIDI.

**Acceptance scenarios**:

1. **Given** a C–E–G–Bb chord, **When** imported with `mono: "arp"`, **Then** the note is `C4<arp_4_7>` (the two lowest offsets are kept) and one aggregated `arp_offsets_truncated` info diagnostic per mapping reports how many chords lost notes.
2. **Given** a C4–C5 chord (octave doubling), **When** imported, **Then** the note is `C4<arp_12>` with `effect arp_12 = arp:12`.

### Edge cases

- Notes with the same pitch in one group count once.
- A chord that crosses a bar line is split the same way as any note today (written again in the next bar), and each part keeps the same preset.
- A group of one note is a normal note (no effect).
- Group duration: the chord lasts as long as its longest note; the following overlap handling is the 006 `earliest` rule.
- Grouping uses quantized start ticks (after 006 quantization and 089 `nudge`), so slightly strummed chords that quantize to the same step are grouped; strums spread over more than one step are not.
- 089 `transpose` / `fold` run before grouping (FR-021 order), so offsets are computed on the adjusted pitches.
- `--annotate` lists `arp` as the mapping's policy and the `arp_fallback` / truncation counts.
- The importer only writes existing syntax (`effect name = arp:…`, `Note<name>:N`); nothing new is added to the language.

## Requirements

### Functional requirements

Configuration

- **FR-001**: `trackMappings[].mono` MAY be `"arp"` in addition to the 089 values. It is a config error on `noise` and `dmc` targets.
- **FR-002**: A top-level config key `chords: "flatten" | "arp"` (default `"flatten"`) and a CLI flag `--chords <flatten|arp>` set the policy for melodic streams that have no `mono` of their own. The CLI flag overrides the config key. `"flatten"` is the 006 behaviour.
- **FR-003**: With no `"arp"` anywhere, output MUST be byte-identical to the current importer (golden fixtures unchanged).

Grouping and offsets

- **FR-010**: Under `arp`, melodic notes of one stream that start on the same quantized tick form a group. Groups of two or more distinct pitches become one note: the root is the lowest pitch; offsets are the semitone distances of the other distinct pitches from the root, ascending.
- **FR-011**: If the group's span (highest − lowest pitch) is greater than 12 semitones, the group is not arpeggiated; the 006 `earliest` rule picks the kept note, and the group is counted in an aggregated `arp_fallback` warning (reason `span`), one diagnostic per mapping (or per stream when there is no mapping).
- **FR-012**: At most 2 offsets are kept (the two smallest), matching the UGE export limit. Groups that lose offsets are counted in one aggregated `arp_offsets_truncated` info diagnostic per mapping.
- **FR-013**: The resulting note lasts as long as the longest note in the group. Overlaps with later notes are then resolved with the 006 `earliest` rule.
- **FR-014**: Arpeggiated groups MUST NOT produce `chord_flatten` warnings. Notes merged into an arpeggio are not counted as dropped in `ConversionSummary.notesDropped`; a new `notesArpeggiated` count (notes merged into arpeggios) is added to the summary.

Emission

- **FR-020**: Each distinct offset list emits one effect preset `effect arp_<o1>[_<o2>] = arp:<o1>[,<o2>]` (for example `arp_3_7`, `arp_12`). Preset lines are written once, sorted by name, after the instrument lines and before the first `pat`.
- **FR-021**: Arpeggiated notes are written as `<Note><<preset>>:<duration>` (for example `C4<arp_3_7>:4`). Pattern reuse (006) treats them as ordinary tokens.
- **FR-022**: If a preset name collides with an instrument or effect name already in the output, the importer MUST fail with an error rather than rename silently. (The generated instrument names from spec 090 end in `_inst` or are drum tokens, so a collision is not expected.)

### Non-goals

- Splitting one piano track into bass and lead by pitch range.
- Using spare chip channels for chord tones.
- `arp_env` instrument macros or per-note arp speed.
- More than two offsets per arpeggio (see OQ-1).
- Desktop UI (spec 096 exposes the flag once this ships).

## Success criteria

- **SC-001**: All existing importer tests and goldens pass unchanged (FR-003).
- **SC-002**: A new fixture with triads, a 4-note chord, an octave doubling, a wide bass+melody pair and a strum converts with `mono: "arp"` to the expected tokens, presets and diagnostics, and the output passes `beatbax verify`.
- **SC-003**: The arp fixture exported to UGE has no arp truncation warning (at most 2 offsets per note).
- **SC-004**: `docs/features/midi-importer.md` documents `mono: "arp"`, `chords`, `--chords` and the fallback rules.

## Assumptions

- `arp:` works on every melodic channel type the importer writes for Game Boy and NES, and on SMS / Spectrum tone channels (spec 094). Any channel where playback does not support `arp:` is called out in OQ-2.

## Open questions

- **OQ-1**: Should a config key (for example `arpMaxOffsets`, 1–3) allow three offsets for chips without the UGE limit? Proposed: not in this spec; 2 is enough for triads and keeps every output UGE-exportable.
- **OQ-2**: Spec 025 lists "no arpeggio support in WebAudio on the Game Boy wave channel" as a known limitation. If that still holds, should `mono: "arp"` on a `wave` target warn (`arp_wave_playback`) or be a config error? Proposed: warn, because UGE export and hardware still play it. Confirm the current state during implementation.

## References

- [#209](https://github.com/kadraman/beatbax/issues/209)
- [Spec 006 — MIDI importer](../../complete/006-midi-importer/spec.md) (chord flattening, overlap policy)
- [Spec 089 — Arrangement-aware MIDI import](../../complete/089-midi-import-arrangement/spec.md) (`mono` policies, FR-020/FR-021)
- [Spec 025 — Arpeggio effect](../../complete/025-arpeggio-effect/spec.md)
- [UGE export guide](../../../docs/exports/uge-export-guide.md) (two-offset limit)
- `packages/engine/src/import/midi/reduce.ts`, `pack.ts`, `emit.ts`
