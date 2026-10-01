---
title: "Readable names in MIDI import output"
id: 90
slug: "midi-import-naming"
status: in-progress
authors: ["Cursor Agent"]
created: 2026-10-01
updated: 2026-10-01
issue: "https://github.com/kadraman/beatbax/issues/214"
area: engine
---

# Feature Specification: Readable names in MIDI import output

## Summary

Give the instruments, patterns and sequences that `beatbax import midi` generates (features **006** and **089**) names that follow the conventions composers use by hand: `_inst`, `_pat` and `_seq` suffixes, numbered patterns instead of content hashes, and a `rest_x<N>_pat` name for bars that are all rest. No syntax changes; output is still ordinary `.bax`.

## Problem

Imported songs are meant to be edited by hand, but the generated names make the file hard to read:

- Patterns are named `<role>_<content hash>` (e.g. `lead_c446943e`, `drums_5e2988f3`) and listed in alphabetical order, which is hash order, so related bars are scattered.
- The shared all-rest bar is named after whichever channel produced it first, so `seq arp_s05` and `seq bass_s05` play `lead_080dca96 = .:12`.
- Sequences (`lead_seq`, `lead_s01`) and generated instruments (`lead_p1`, `bass`) carry no suffix, so a name does not say what kind of thing it is. A pattern and a sequence with the same name are legal, and the sequence silently wins when referenced.

The grammar and UI docs examples already use `melody_pat` / `lead_seq` style names.

## User scenarios

### User Story 1 — Read and edit an imported song (Priority: P1)

**Why this priority**: every import is edited by hand afterwards; names are the first thing a composer reads.

**Independent test**: convert any fixture and check the names of every `inst`, `pat` and `seq` line and their order.

**Acceptance scenarios**:

1. **Given** a MIDI with a lead, a bass and drums, **When** it is imported, **Then** patterns are named `lead_01_pat`, `lead_02_pat`, …, `bass_01_pat`, …, `drums_01_pat`, … in the order each first plays, and are listed in that order.
2. **Given** a song where some bars are silent on a channel, **When** it is imported with 16-step bars, **Then** those bars play one shared pattern `rest_x16_pat`, listed before the channel patterns.
3. **Given** an import split into sections, **When** it is imported, **Then** sequences are `lead_s01_seq`, `lead_s02_seq`, …; with one section they are `lead_seq`, `bass_seq`, ….
4. **Given** generated melodic instruments, **When** the song is imported, **Then** they are named `lead_p1_inst`, `strings_p2_inst`, `bass_inst`, …; drum instruments keep `kick`, `snare`, `hihat`, `ghost`, `crash`, `shaker`, `kick_dmc`, `snare_dmc`; instrument names given in the config are written unchanged.

### Edge cases

- More than 99 patterns for one channel: the number widens (`lead_100_pat`); all patterns of that channel use the same width (`lead_001_pat` … `lead_100_pat`).
- A bar with identical content on two channels is still one shared pattern (006 reuse), named after the channel that plays it first.
- `ticksPerBeat: 3` with `patternTicks: 12`: the all-rest bar is `rest_x12_pat`.
- A bar that holds only `inst(...)` switches and rests cannot occur (switches are written only before a note); it would be a channel pattern, not a rest pattern.

## Requirements

### Functional requirements

Patterns

- **FR-001**: The channel prefix stays the 006 role name: `lead` (pulse1), `arp` (pulse2), `bass` (wave / triangle), `drums` (noise), `dmc` (NES DMC).
- **FR-002**: A pattern that is not all rest is named `<prefix>_<n>_pat`, where `n` counts that prefix's patterns from 1 in order of first appearance (channels in channel order, bars in song order). `n` is zero-padded to at least 2 digits and to the digit count of that prefix's largest number.
- **FR-003**: A pattern whose tokens are all rests (`.` / `.:N`) is named `rest_x<N>_pat`, where `N` is its length in steps. It is shared by every channel and does not use a channel number.
- **FR-004**: Patterns are listed with rest patterns first (ascending `N`), then by channel prefix in channel order, then by number. The `# bar source index … hash=…` comment before each pattern is kept.

Sequences

- **FR-010**: With one section, each channel's sequence is `<prefix>_seq` (unchanged). With sections (`sectionBars`), they are `<prefix>_s<NN>_seq` (`NN` two-digit section number, as in 006).

Instruments

- **FR-020**: Melodic instruments the importer names itself get an `_inst` suffix: `{family}_p1_inst`, `{family}_p2_inst`, `{family}_bass_inst`, and `bass_inst` for the bass family on the bass channel (006 names plus `_inst`).
- **FR-021**: Drum instruments keep their names (`kick`, `snare`, `hihat`, `ghost`, `crash`, `shaker`, `kick_dmc`, `snare_dmc`), because those names are also the hit tokens inside patterns.
- **FR-022**: Instrument names from `trackMappings[].instrument` are written exactly as given.

General

- **FR-030**: Names are deterministic: identical input, config and flags give identical output (006 / 089 determinism).
- **FR-031**: The new names apply to every import by default. This is a behaviour change to 006 / 089 output and MUST be documented in `docs/features/midi-importer.md` and the release notes.

### Non-goals

- New syntax, or any change to how `.bax` names are parsed or resolved.
- A config option to choose a naming style.
- Detecting transposed or near-identical patterns, or naming patterns after musical content.
- Renaming the channel prefixes (e.g. `arp` on a pulse2 counter-melody).
- Changing names in songs that were already imported.

## Success criteria

- **SC-001**: Every importer test and golden fixture F01–F14 passes with the new names, and every generated song passes `beatbax verify`.
- **SC-002**: Apart from `inst`, `pat` and `seq` names and pattern order, output is unchanged: the resolved per-channel timelines (notes, instruments, rests, sustains per step) of F01–F14 are identical before and after.
- **SC-003**: A generated file contains no pattern name with a content hash and no unsuffixed generated melodic instrument or sequence.

## Assumptions

- Pattern, sequence and instrument names are free identifiers; suffixes and digits are already valid (`melody_pat`, `lead_seq`, `rest16` appear in shipped songs).
- No tool consumes the old hash names. Desktop and app-core do not parse importer names.

## Open questions

None. Decisions taken with the maintainer (2026-10-01): `_inst` on generated melodic instruments only; numbered patterns rather than hashes; keep role prefixes; new names by default.

## References

- 006 importer: [specs/complete/006-midi-importer/spec.md](../../complete/006-midi-importer/spec.md) (instrument names, pattern naming "stable prefixes and content hashes or bar indices")
- 089 arrangement import: [specs/complete/089-midi-import-arrangement/spec.md](../../complete/089-midi-import-arrangement/spec.md)
- User docs: [docs/features/midi-importer.md](../../../docs/features/midi-importer.md)
