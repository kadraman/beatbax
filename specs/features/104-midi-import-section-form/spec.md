---
title: "MIDI import section/form and Beginner Mode output"
id: 104
slug: "midi-import-section-form"
status: "specified"
authors:
  - "kadraman"
created: "2026-11-04"
updated: "2026-11-04"
issue: "https://github.com/kadraman/beatbax/issues/238"
area: "engine"
related:
  - "specs/complete/006-midi-importer/spec.md"
  - "specs/complete/008-song-composition-abstractions/spec.md"
  - "specs/complete/089-midi-import-arrangement/spec.md"
  - "specs/complete/090-midi-import-naming/spec.md"
  - "specs/features/094-midi-import-sms-spectrum/spec.md"
  - "specs/features/096-desktop-midi-import/spec.md"
---

# Feature Specification: MIDI import section/form and Beginner Mode output

## Summary

`beatbax import midi` slices every channel on one bar grid (`sectionBars`, default 8) but writes classic `seq` definitions and repeats that list on every `channel` line. Spec 008 already has the authoring form for that shape: `section`, `form`, and `channel … role … form`, plus Beginner Mode sugar when the lanes match a chip profile. This spec adds an opt-in arrangement mode so import can emit those forms. The default stays today's `seq` / `channel` text. No new language syntax.

## Problem

- Authors and Copilot now prefer `section` / `form`. Imported songs still repeat `channel N => inst … seq lead_s01_seq lead_s02_seq` and rely on `# --- Section N: Bars A-B ---` comments for Pattern Grid structure.
- Those comments do not give the grid an authored section name. The strip label is the reference channel's seq name (`lead_s01_seq`).
- Beginner Mode (`section … use`, `form … > …`, `channel auto`) fits a full Game Boy or NES profile and does not fit a partial import. The importer has no way to choose.
- `@beatbax/engine@0.26.0` already publishes the classic text. A silent change would break scripts and golden fixtures that match it.

## User scenarios

### User Story 1 — Keep today's output (Priority: P1)

**Why this priority**: Existing configs, fixtures, and published engine output must not change unless the user asks.

**Independent test**: Convert any existing MIDI fixture with no new flag or config key and diff it against the stored `.bax`.

**Acceptance scenarios**:

1. **Given** a MIDI and a config that omit the arrangement mode, **When** imported, **Then** the `.bax` text is byte-identical to today's emitter, including `# --- Section N: Bars A-B ---` headers, `seq <prefix>_sNN_seq` lines, and `channel … seq` lists.
2. **Given** `sectionBars: 0`, **When** imported in the default mode, **Then** the song still has one `seq` per channel and no section headers.

### User Story 2 — Emit canonical section/form (Priority: P1)

**Why this priority**: This is the editable form for any channel count, including lead-and-bass imports that Beginner Mode cannot express.

**Independent test**: `beatbax import midi song.mid out.bax --arrangement form` parses, `beatbax verify` succeeds, and each channel's lowered pattern order matches the default import of the same file.

**Acceptance scenarios**:

1. **Given** a 16-bar Game Boy lead imported with `sectionBars: 8` and arrangement `form`, **When** conversion finishes, **Then** the song contains `section bars_1_8 { mel = <pattern list> }`, `section bars_9_16 { … }`, `form main = bars_1_8, bars_9_16`, and `channel 1 => inst <default> role mel form main`, and it does not contain `seq lead_s01_seq` or `channel … seq`.
2. **Given** the same MIDI imported once as `seqs` and once as `form`, **When** both are expanded, **Then** each channel plays the same pattern names in the same order. Generated seq names (`bars_1_8_mel` versus `lead_s01_seq`) may differ.
3. **Given** a MIDI that packs only lead and bass, **When** imported as `form`, **Then** each section lists only `mel` and `bass`, only those two channels are emitted, and no empty `harm` or `perc` lane is added.
4. **Given** a section whose last slice is shorter than `sectionBars` (bars 9–12 of a 12-bar song), **When** imported as `form`, **Then** that section is named `bars_9_12` and the comment above it is `# --- Section 2: Bars 9-12 ---`.
5. **Given** `sectionBars: 0` and arrangement `form`, **When** imported, **Then** the song has one section named `bars_1_<barCount>` and one `form main` entry. Pattern Grid section focus stays monolithic, as spec 008 already treats a single section.

### User Story 3 — Emit Beginner Mode when the profile matches (Priority: P2)

**Why this priority**: Full-chip imports should read like the Game Boy and NES songs under `songs/`. Partial imports must not be padded to make the sugar valid.

**Independent test**: A four-channel Game Boy import with `--arrangement beginner` uses `section … use`, `form main = … > …`, and one `channel auto`. A two-channel import fails before writing a song.

**Acceptance scenarios**:

1. **Given** a Game Boy import whose packed channels are exactly pulse1, pulse2, wave, and noise, **When** arrangement is `beginner`, **Then** each section is `section bars_<start>_<end> use <melSeq> <harmSeq> <bassSeq> <percSeq>` using the spec 090 seq names, `form main` joins those sections with ` > `, and the song ends with one `channel auto form main inst=<pulse1>|<pulse2>|<wave>|<noise>` using each channel's default instrument.
2. **Given** a NES import with pulse1, pulse2, triangle, and noise and no DMC, **When** arrangement is `beginner`, **Then** the sugar uses 4 lanes. **Given** those four plus DMC, **Then** it uses 5 lanes with `dmc` last.
3. **Given** any other lane set (missing harmony, lead only, DMC without the quartet, Spectrum 128), **When** arrangement is `beginner`, **Then** conversion fails, writes no song, and the error tells the user to use arrangement `form`. It does not invent silent lanes.
4. **Given** the same full-profile MIDI imported as `seqs` and as `beginner`, **When** both are expanded, **Then** each channel's pattern order matches.

### Edge cases

- Arrangement notes (`--annotate`, spec 089) stay the same comment block in every mode. They describe packed channels, not which arrangement syntax was chosen.
- `inst(name)` tokens inside patterns are unchanged. The channel or `channel auto` instrument is the channel's default instrument, as on today's `channel` line.
- Every section in one song lists the same roles. A channel that is only rests in a slice still has its all-rest pattern list, so no section omits a role that a channel binds.
- Section names and generated `<section>_<role>` seq names must not collide with emitted pattern names (`lead_01_pat`, `rest_x16_pat`) or, in beginner mode, with the explicit seq names. On a collision, conversion fails rather than emitting a song spec 008 would reject.
- `form` and `beginner` use the same `sectionBars` boundaries as `seqs`, including the rule that a song shorter than or equal to `sectionBars` is one section.
- SMS `tone1` / `tone2` / `tone3` / `noise` use the same composition roles as Game Boy when spec 094 profiles exist. This spec does not add those profiles. Spectrum 128 has no Beginner Mode profile in spec 008, so `beginner` on that chip fails under story 3.

## Requirements

### Functional requirements

Mode selection

- **FR-001**: Import options MUST accept arrangement `seqs` (default), `form`, or `beginner` from CLI `--arrangement` and from config key `arrangement`. Omitting it MUST mean `seqs`.
- **FR-002**: Any other arrangement value MUST fail at config parse time with an error that lists the three allowed values.
- **FR-003**: `seqs` MUST keep today's emit byte-identical for the same MIDI, chip, and other options, including fixtures for 006, 089, and 090.

Shared section grid

- **FR-010**: Section boundaries MUST follow `sectionBars` exactly as they do today (default 8; `0` or a song no longer than `sectionBars` means one section).
- **FR-011**: The Nth section MUST be named `bars_<start>_<end>` where `<start>` and `<end>` are the 1-based source bar numbers already printed in `# --- Section N: Bars <start>-<end> ---`. That comment MUST still be written immediately above the section in `form` and `beginner` modes.
- **FR-012**: One form MUST be emitted, named `main`, listing every section in time order. `form` mode MUST use comma separators. `beginner` mode MUST use ` > `.
- **FR-013**: Pattern names and pattern bodies MUST stay as spec 090 defines them. Role item lists and beginner seq bodies MUST use the same `*N` repetition compression as today's seq emitter.

Canonical `form`

- **FR-020**: `form` mode MUST NOT emit per-section `seq` definitions or `channel … seq` lists.
- **FR-021**: Each section MUST be an advanced block whose keys are composition roles and whose values are the pattern list for that channel's slice. Packed role to composition role: `pulse1` and `tone1` → `mel`; `pulse2` and `tone2` → `harm`; `wave`, `triangle`, and `tone3` → `bass`; `noise` → `perc`; `dmc` → `dmc`.
- **FR-022**: Each packed channel MUST be emitted as `channel <index> => inst <defaultInstrument> role <compositionRole> form main`, with the same channel index and default instrument as `seqs` mode, in channel-index order. Roles inside a section follow that same order.
- **FR-023**: Channels the importer does not pack MUST be omitted. `form` mode MUST NOT add rest-only lanes to fill a Beginner profile.

Beginner Mode

- **FR-030**: `beginner` mode MUST emit the spec 090 per-section seq definitions, then `section <name> use <seq> …` with one bare seq name per lane, then `form main`, then exactly one `channel auto form main inst=<i1>|…|<iN>`.
- **FR-031**: Lane order MUST be the spec 008 profile order: `mel`, `harm`, `bass`, `perc`, and `dmc` last only for a NES 5-lane song. Instruments on `channel auto` follow that same order.
- **FR-032**: `beginner` is allowed only when the packed roles are exactly a profile spec 008 already accepts: Game Boy or SMS `pulse1|tone1`, `pulse2|tone2`, `wave|tone3`, `noise`; NES those four with `triangle` in the bass lane and no DMC; or NES those four plus `dmc`. Any other set, including Spectrum 128, MUST fail conversion with one error that names the chip and tells the user to use arrangement `form`. No song file is written.
- **FR-033**: `beginner` MUST NOT emit advanced `section { }` blocks or `channel … role … form` lines.

Equivalence and diagnostics

- **FR-040**: For the same input and options, expanding `form` or a successful `beginner` song MUST schedule the same pattern name order on each channel as `seqs`. Spec 008 lowering is the only expansion. The importer MUST NOT pre-lower.
- **FR-041**: Output of each mode MUST be deterministic for identical input, chip, and options.
- **FR-042**: `form` and successful `beginner` output MUST parse and MUST pass `beatbax verify` for the Game Boy and NES fixtures this spec adds.
- **FR-043**: If an emitted section name or generated `<section>_<role>` seq name would collide with a pattern or seq name in the same song, conversion MUST fail before writing.

### Non-goals

- Changing the default arrangement from `seqs`.
- Naming sections after musical form (intro, verse, chorus) or inferring form from `trackMappings` bar ranges.
- Padding missing lanes so `beginner` succeeds.
- A new Beginner Mode profile for Spectrum 128 or any chip spec 008 does not already accept.
- Desktop File → Import MIDI (spec 096). That wizard may pass `arrangement` later; this spec does not add UI.
- Changes to the parser, AST, scheduler, ISM, or chip plugins.
- Rewriting the 089 arrangement-notes comment block.

## Success criteria

- **SC-001**: Existing MIDI importer tests and golden fixtures pass with no `.bax` diff when arrangement is omitted.
- **SC-002**: At least one Game Boy fixture and one NES fixture, each imported as `form`, match a stored `.bax`, verify, and match the `seqs` import's per-channel pattern order after expansion.
- **SC-003**: A full four-channel Game Boy fixture and a NES fixture (4-lane and 5-lane) imported as `beginner` match stored `.bax` files and the same pattern-order check. One under-filled fixture asserts the `beginner` error and that no song is written.
- **SC-004**: `docs/features/midi-importer.md` documents `--arrangement`, the config key, both output shapes, the Beginner eligibility rule, and that the default is unchanged.

## Assumptions

- Spec 008 lowering of `section` / `form` / Beginner sugar stays as shipped. This spec only chooses which of that syntax to print.
- Pattern Grid already labels a strip from the authored section name when `ast.sections` is present. No grid change is required for SC-002's labels.
- Spec 094 may add SMS and Spectrum packing later. The role map in FR-021 is the contract those profiles use; this spec does not implement them.

## Open questions

- **OQ-1**: Should a later release switch the default from `seqs` to `form`? Proposed: no decision here. Default stays `seqs` until a release note accepts the text break.

## References

- [#238](https://github.com/kadraman/beatbax/issues/238)
- [Spec 006 — MIDI importer](../../complete/006-midi-importer/spec.md)
- [Spec 008 — Song composition abstractions](../../complete/008-song-composition-abstractions/spec.md)
- [Spec 089 — Arrangement-aware MIDI import](../../complete/089-midi-import-arrangement/spec.md)
- [Spec 090 — MIDI import naming](../../complete/090-midi-import-naming/spec.md)
- [docs/features/midi-importer.md](../../../docs/features/midi-importer.md)
