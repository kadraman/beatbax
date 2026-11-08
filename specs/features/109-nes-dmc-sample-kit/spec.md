---
title: "NES DMC sample kit expansion"
id: 109
slug: "nes-dmc-sample-kit"
status: "specified"
authors:
  - "kadraman"
created: "2026-11-07"
updated: "2026-11-07"
issue: ""
area: "engine"
related:
  - "specs/complete/058-nes-apu-chip-plugin/spec.md"
  - "specs/complete/074-builtin-nes-chip-plugin/spec.md"
  - "specs/complete/098-instrument-editor-preview-pitch/spec.md"
  - "specs/features/103-instrument-editor-workspace/spec.md"
---

# Feature Specification: NES DMC sample kit expansion

## Summary

Expand the built-in NES `@nes/<name>` DMC library with license-clean percussion and special samples (synth bass, orch hit, short voice syllables and one slowed speech phrase). Keep classic `@nes/kick` and `@nes/snare` bytes unchanged. Replace clap-aliased `hihat`/`crash` with real samples. Retarget selected demo songs and the NES song wizard to stronger kit pieces. No new `.bax` syntax.

## Problem

1. The stock kick is about 31 ms and the snare about 124 ms at rate 15. Demo songs that use DMC only reinforce with those two hits, so drums feel thin and identical across tracks.
2. `@nes/hihat` and `@nes/crash` are aliases of clap. Hover and wizard lists mention names that are missing (`bass_c1`, `shaker`).
3. The DMC demo references `@nes/bass`, which is not a key (`bass_c2` is a 14 ms synthetic).
4. Authors need samples that pulse, triangle, and noise cannot make (voice, synth bass, orch hits), and a documented way to encode speech that is sped up to fit and played back slower.

## User scenarios

### User Story 1 — Stronger bundled kit (Priority: P1)

**Why this priority**: Authors and demos need usable drums and special hits without hunting external files.

**Independent test**: Resolve each new `@nes/<name>`; play at its designed rate; confirm `hihat` bytes differ from `clap`; confirm `kick`/`snare` still match the classic buffers.

**Acceptance scenarios**:

1. **Given** the NES plugin, **When** an instrument uses `@nes/kick_punch`, `@nes/kick_body`, `@nes/snare_tight`, `@nes/snare_fat`, `@nes/hat_closed`, `@nes/hat_open`, `@nes/rim`, `@nes/shaker`, `@nes/cowbell`, `@nes/crash`, `@nes/crash_cym`, the full Fischer 808 set (`kick_808`, `snare_808`, `hat_808`, `hat_open_808`, `clap_808`, `cymbal_808`, `rim_808`, `cowbell_808`, `maracas_808`, `tom_low_808`, `tom_mid_808`, `tom_high_808`), `@nes/kick_909` / `@nes/snare_909` / `@nes/hat_909` / `@nes/hat_open_909`, `@nes/bass_saw_c1` (and pitched `c0`/`d0`/`e0`/`g0`/`a0`), `@nes/orch_hit`, `@nes/orch_hit_up`, `@nes/voice_correct`, `@nes/voice_go`, or `@nes/voice_ready`, **Then** the sample resolves and plays.
2. **Given** `@nes/kick` and `@nes/snare`, **When** decoded, **Then** their bytes match the classic library (aliases `kick_classic` / `snare_classic` may also expose those bytes).
3. **Given** `@nes/hihat`, **When** compared to `@nes/clap`, **Then** the byte streams differ; `hihat` matches `hat_closed`.
4. **Given** `@nes/crash`, **When** compared to `@nes/clap`, **Then** the byte streams differ.
5. **Given** `voice_ready`, **When** played with `dmc_rate` equal to its `designedRate` (12), **Then** the phrase is slower than a rate-15 playback of the same bytes and remains within the hardware length cap.

### User Story 2 — Songs and wizard use the stronger kit (Priority: P1)

**Why this priority**: Existing DMC songs currently showcase only the thin classic kick/snare.

**Independent test**: Verify instrument lines in the retargeted songs and the NES song wizard; play those songs; leave kingdom_hall, shadow_temple, silver_orbit, and effect fixtures on classic kick/snare.

**Acceptance scenarios**:

1. **Given** battle_fanfare and wily_fortress, **When** reading DMC instruments, **Then** they use `kick_punch` and `snare_tight` (or equivalent `@nes/` names from US1).
2. **Given** puffball_parade, **When** reading DMC instruments, **Then** it uses `kick_body` and `snare_fat`.
3. **Given** iron_keep, **When** reading DMC instruments, **Then** it uses bundled `@nes/` samples (no raw GitHub URL as the active sample).
4. **Given** nes_dmc_demo, **When** playing the bass and voice sections, **Then** bass resolves (`bass_saw_c2` or documented alias) and a voice phrase at rate 12 is present; hats are distinct from clap.
5. **Given** the NES song wizard, **When** inserting sample instruments, **Then** channel 5 uses punch/tight (or hat) kit pieces from the expanded library.
6. **Given** kingdom_hall, shadow_temple, silver_orbit, and NES effect demos, **When** inspected, **Then** they are unchanged regarding DMC kit choice (no DMC added to the three 4-channel songs; effect fixtures keep classic kick/snare).

### User Story 3 — License provenance and docs (Priority: P2)

**Why this priority**: Bundled audio must be redistributable; composers need the encode/speech recipe.

**Independent test**: Open `samples/dmc/NOTICE` and the composition guide; confirm every new sample has provenance; confirm speech rate pairs are documented.

**Acceptance scenarios**:

1. **Given** each new sample file or base64 buffer, **When** checking NOTICE, **Then** name, author/source, license, and checksum or generation note are recorded.
2. **Given** the NES composition guide, **When** reading the DMC section, **Then** it documents prep (gain, trim, darkening), monophonic channel limits, and encode-at-15 / play-at-12 (or 7) speech pairs.
3. **Given** hover / kit lists in NES UI contributions, **When** compared to `BUNDLED_SAMPLES` keys, **Then** the lists match (no missing `bass_c1`; includes new names).

### Edge cases

- Unknown `@nes/` names still fail resolution with a list of available names.
- Bundle size growth stays modest (order of tens of KB of base64, not megabytes).
- Game rips, TR-909 ROM dumps, and gray-area soundfonts MUST NOT be vendored.
- Encoder remains greedy ±2; lookahead is a non-goal.

## Requirements

### Functional requirements

- **FR-001**: The NES plugin MUST expose the expanded `@nes/<name>` set listed in US1, with `BUNDLED_SAMPLE_META` `designedRate` (and `baseNote` for tonal hits) matching intended playback.
- **FR-002**: Classic `kick` and `snare` byte streams MUST remain bit-identical to the pre-feature library; `kick_classic` / `snare_classic` MAY alias them.
- **FR-003**: `hihat` MUST NOT share clap bytes; `crash` MUST NOT share clap bytes.
- **FR-004**: Sample sources MUST be original synthesis or documented CC0/CC-BY with NOTICE entries; commercial ROM and game rips are forbidden.
- **FR-005**: Selected songs and the song wizard MUST be retargeted per US2 without changing `.bax` grammar.
- **FR-006**: Docs and UI sample name lists MUST stay aligned with `BUNDLED_SAMPLES`.
- **FR-007**: Tests MUST assert presence of new keys, classic kick/snare stability, and that `hihat` bytes differ from `clap`.

### Non-goals

- New `.bax` syntax or pitch-driven DMC retuning.
- In-panel WAV→DMC conversion (still CLI `wav2dmc`).
- Optimal/lookahead DMC encoder.
- Adding DMC to kingdom_hall, shadow_temple, or silver_orbit.
- Chromatic multi-note bass sample banks.
- Vendoring SmolNES, Bucky rips, or unlicensed 909 WAVs already under `samples/wav/`.

## Success criteria

- **SC-001**: Authors can write a song using only new `@nes/` percussion and voice samples without external files.
- **SC-002**: Retargeted demo songs sound punchier on channel 5 while keeping the same pattern grids.
- **SC-003**: `npm test` covers kit key presence, hihat≠clap, and classic kick/snare continuity.
- **SC-004**: NOTICE + docs let a maintainer regenerate or audit every new buffer.

## Assumptions

- `dmc_rate` on the instrument continues to control playback speed; encode rate is chosen so designedRate matches the intended play rate (except speech encoded at 15 and played at 12).
- Noise channel remains the primary home for continuous hats in full arrangements; DMC hats are for colour hits.

## Open questions

- None blocking; CC0 Freesound downloads may supplement original synthesis if NOTICE can be completed for each file.

## References

- [058 NES APU](../../complete/058-nes-apu-chip-plugin/spec.md)
- [098 Instrument editor preview pitch](../../complete/098-instrument-editor-preview-pitch/spec.md)
- [NESdev APU DMC](https://www.nesdev.org/wiki/APU_DMC)
- [docs/chips/nes/composition_guide.md](../../../docs/chips/nes/composition_guide.md)
