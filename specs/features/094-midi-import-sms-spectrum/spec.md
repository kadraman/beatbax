---
title: "MIDI import chip profiles for SMS and ZX Spectrum 128"
id: 94
slug: "midi-import-sms-spectrum"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-08"
updated: "2026-10-08"
issue: "https://github.com/kadraman/beatbax/issues/211"
area: "engine"
related:
  - "specs/complete/006-midi-importer/spec.md"
  - "specs/complete/089-midi-import-arrangement/spec.md"
  - "specs/complete/090-midi-import-naming/spec.md"
---

# Feature Specification: MIDI import chip profiles for SMS and ZX Spectrum 128

## Summary

`beatbax import midi` (spec 006, extended by 089 and 090) only targets Game Boy and NES. BeatBax already ships chip plugins for the Sega Master System (SN76489) and the ZX Spectrum 128 (AY-3-8912), and authors write songs for both by hand. This spec adds two import profiles, `--chip sms` and `--chip spectrum-128`, with their own channel role tables, default instrument kits and diagnostics. All arrangement features from 089 (bar-range mappings, `mono`, lanes, timing, `--inspect`, `--annotate`) work unchanged on the new chips.

## Problem

- `MidiChipId` is `'gameboy' | 'nes'`; `parseChipId` rejects anything else with "v1 supports gameboy|nes".
- Role tables (`packages/engine/src/import/midi/chipRoles.ts`), role names (`pulse1`, `pulse2`, `wave`, `triangle`, `noise`, `dmc`) and kit emission (`kit.ts`) are written for those two chips. Their instrument lines (`duty`, GB `env`, `uge_note`, `noise_period`, DMC samples) are not valid on SMS or Spectrum.
- The Spectrum 128 has **three** tone channels and no separate noise channel: percussion borrows a tone channel's mixer, and all channels share one noise period register (R6). A profile cannot be a copy of the 4-channel layout.
- Desktop MIDI import (#210, spec 096) should offer every chip the engine supports, so the engine needs the profiles first.

## User scenarios

### User Story 1 — Import a MIDI for the Master System (Priority: P1)

**Why this priority**: SMS is the closest fit to the existing "three melodic voices plus noise" packing.

**Independent test**: `beatbax import midi song.mid out.bax --chip sms` produces a song that passes `beatbax verify` and plays.

**Acceptance scenarios**:

1. **Given** a MIDI with a lead, a harmony part, a bass and a GM drum track, **When** imported with `--chip sms`, **Then** the output starts with `chip sms`, lead is on channel 1 (`type=tone1`), harmony on channel 2 (`type=tone2`), bass on channel 3 (`type=tone3`), drums on channel 4 (`type=noise`), and `beatbax verify out.bax` succeeds.
2. **Given** the same MIDI, **When** imported, **Then** no instrument line contains a Game Boy or NES-only field (`duty`, `env=` in GB format, `uge_note`, `noise_period`, `dmc_*`, `wave=`).
3. **Given** a bass note below the lowest SMS tone pitch (A2, 10-bit period limit), **When** imported, **Then** the note is raised by octaves into range and one aggregated `pitch_below_chip_range` warning reports how many notes moved.

### User Story 2 — Import a MIDI for the ZX Spectrum 128 (Priority: P1)

**Why this priority**: The second chip named in #211; it has the most different channel layout.

**Independent test**: `beatbax import midi song.mid out.bax --chip spectrum-128` produces a song that passes `beatbax verify` with no AY noise-rate conflict diagnostics.

**Acceptance scenarios**:

1. **Given** a MIDI with a lead, a bass and no drums, **When** imported with `--chip spectrum-128`, **Then** the output starts with `chip spectrum-128`, uses channels 1–3 only, and channel 2 carries the next melodic stream.
2. **Given** a MIDI with drums, **When** imported, **Then** drum hits are placed on channel 2 as named tokens (`kick`, `snare`, `hihat`, …) defined as AY noise-mix instruments, channel 2 carries no melodic stream unless a `trackMappings` lane puts one there, and one `drums_share_tone_channel` info diagnostic explains the layout.
3. **Given** the default drum kit, **When** any two drum tokens are emitted, **Then** every drum instrument uses the same `noise_rate`, so `beatbax verify` reports no shared-noise conflict.
4. **Given** a MIDI with four or more melodic streams, **When** imported, **Then** the existing `over_polyphony` handling applies with the Spectrum melodic budget (3 without drums, 2 with drums).

### User Story 3 — Reuse an existing importer config on a new chip (Priority: P2)

**Why this priority**: Users already have Game Boy configs (`songs/midi/*.import.json`); rewriting every `target` to switch chips would be tedious.

**Acceptance scenarios**:

1. **Given** a config with `target: "pulse1"`, `"pulse2"`, `"wave"` (or `"triangle"`) and `"noise"`, **When** used with `--chip sms` or `--chip spectrum-128`, **Then** they map to `tone1`, `tone2`, `tone3` and the chip's drum channel, and one `role_alias` info diagnostic lists the substitutions.
2. **Given** `target: "dmc"` with `--chip sms`, **When** options are resolved, **Then** conversion fails with `trackMappings[i].target 'dmc' is not available on chip sms`.
3. **Given** `dmcReinforcement.enabled: true` with a non-NES chip, **When** imported, **Then** it is ignored with a `dmc_reinforcement_ignored` warning (existing NES behaviour unchanged).

### Edge cases

- `--chip sms` with a MIDI that has no drums: channel 4 is omitted, as on Game Boy today.
- Spectrum: a `trackMappings` entry with `target: "tone2"` and `packing: "lanes"` shares channel 2 between harmony and drums in config order (089 lane rules); drums are a lane like any other mapping.
- Spectrum drum hits that start on the same tick collapse to one hit using the existing noise-stack rule (006 drum priority, `drumFlamTicks`).
- `families.<family>.gb` / `.nes` articulation overrides are ignored on the new chips; the new `sms` / `ay` blocks (FR-031) are ignored on GB/NES. No warning, so one config can carry all four.
- Song length, sectioning (`sectionBars`), naming (spec 090) and `--annotate` output are chip-independent.

## Requirements

### Functional requirements

Chip ids and roles

- **FR-001**: `MidiChipId` MUST add `'sms'` and `'spectrum-128'`. `--chip` and config `chip` MUST accept them; the emitted `chip` directive MUST be the same id. Other ids (including `gg`, `cpc`) remain errors in this spec (see OQ-1).
- **FR-002**: `ChipRole` MUST add `'tone1' | 'tone2' | 'tone3'`. Role sets per chip: Game Boy `pulse1, pulse2, wave, noise`; NES `pulse1, pulse2, triangle, noise, dmc`; SMS `tone1, tone2, tone3, noise`; Spectrum 128 `tone1, tone2, tone3, noise`, where `noise` means "the drum channel" (FR-021).
- **FR-003**: When the chip is SMS or Spectrum 128, `pulse1` → `tone1`, `pulse2` → `tone2`, `wave` / `triangle` → `tone3` in `trackMappings[].target`, with one aggregated `role_alias` info diagnostic. `tone1/2/3` on Game Boy or NES is an error. `dmc` on any chip other than NES is an error. These checks run when the chip is known (`resolveConvertOptions`), since `parseImportConfig` has no chip.
- **FR-004**: Track-name, GM-program and pitch-range heuristics (006) MUST map to the new roles by position: lead → `tone1`, harmony/arp → `tone2`, bass → `tone3`, drums → `noise`.

SMS profile

- **FR-010**: Role table: channel 1 `tone1` (lead, priority 100, melodic), channel 2 `tone2` (harmony, 80, melodic), channel 3 `tone3` (bass, 90, bass group), channel 4 `noise` (drums, 50). Melodic budget 3.
- **FR-011**: Melodic instruments MUST be emitted as `inst <name> type=toneN vol=<0-15> [vol_env=[…]] gm=<program>` using SMS attenuation (0 = loudest, 15 = silent).
- **FR-012**: The drum kit MUST define every token in `DEFAULT_DRUM_MAP` (`kick`, `snare`, `hihat`, `shaker`, `ghost`, `crash`) as `type=noise` instruments using only SMS noise fields (`noise_mode`, `noise_rate`, `vol_env`, optional `noise_rate_env`), based on the SMS song-wizard kit.
- **FR-013**: Notes below A2 (the lowest pitch a 10-bit SN76489 tone period can produce at the NTSC clock) MUST be raised by octaves into range and counted in one `pitch_below_chip_range` warning per channel. Notes are not dropped.

Spectrum 128 profile

- **FR-020**: Role table: channel 1 `tone1` (lead, 100, melodic), channel 2 `tone2` (harmony, 80, melodic), channel 3 `tone3` (bass, 90, bass group). No channel 4.
- **FR-021**: When the import contains drum hits, the drum channel is channel 2. Melodic streams are not auto-packed onto channel 2 in that case (melodic budget 2), and one `drums_share_tone_channel` info diagnostic is emitted. Without drums, channel 2 is melodic (budget 3). `trackMappings` lanes (089 `packing: "lanes"`) may still place melodic notes on `tone2` alongside drums.
- **FR-022**: Melodic instruments MUST be emitted as `inst <name> type=toneN vol=<0-15> [vol_env=[…]] gm=<program>` using AY volume (15 = loudest, 0 = silent). The default kit MUST NOT use the shared hardware envelope (`env_bass`, `env_shape`).
- **FR-023**: The drum kit MUST define every `DEFAULT_DRUM_MAP` token as an AY noise-mix instrument on `type=tone2` (`tone=true tone_mix=true noise_rate=<n> …`, following `docs/chips/zx-spectrum-128/composition_guide.md`), and every drum instrument MUST use the **same** `noise_rate` so no two hits need different R6 values.

Articulation and config

- **FR-030**: Each GM family (`piano`, `guitar`, `bass`, `strings`, `pad`, `lead`) MUST have default SMS and AY articulations (volume and optional `vol_env`), chosen to match the relative loudness of the GB/NES defaults.
- **FR-031**: `families.<family>` in the import config MAY contain `sms: { vol?, volEnv? }` and `ay: { vol?, volEnv? }`, validated like the existing `gb` / `nes` blocks (integers 0–15; `volEnv: null` clears the default). Unknown keys stay ignored.
- **FR-032**: `dmcReinforcement` on a chip other than NES MUST be ignored with one `dmc_reinforcement_ignored` warning.

Compatibility and output

- **FR-040**: Game Boy and NES output MUST stay byte-identical for every existing fixture and config.
- **FR-041**: Output for the new chips MUST be deterministic for identical input, config and flags.
- **FR-042**: The engine MUST NOT import chip plugins to build the new profiles; instrument lines are text. Validity is proven by `beatbax verify` in CLI tests, which load the plugins.
- **FR-043**: CLI help (`--chip`) and errors MUST list `gameboy | nes | sms | spectrum-128`.

### Non-goals

- Game Gear stereo (`gg:pan`), Amstrad CPC timing, or any other chip id (OQ-1).
- FM chips (OPLL, OPN2) or chips without a shipped plugin.
- Using the AY hardware envelope (buzz bass) or SN76489 tone-3-clocked noise in the default kits.
- Desktop UI (spec 096 consumes these profiles).
- Changing parser, scheduler or chip plugin behaviour.

## Success criteria

- **SC-001**: All existing MIDI importer tests and golden fixtures (006 F01–F09, 089, 090) pass unchanged.
- **SC-002**: At least one golden fixture per new chip (melodic only, and with drums) matches its stored `.bax`, and each passes `beatbax verify`.
- **SC-003**: Converting `songs/midi` sources with `--chip sms` and `--chip spectrum-128` produces songs that verify with no errors and no AY noise-rate conflict warnings.
- **SC-004**: `docs/features/midi-importer.md` documents both chips, the role aliases and the Spectrum drum-channel rule.

## Assumptions

- SMS output targets the NTSC clock the SMS plugin uses by default; the A2 floor in FR-013 is computed for that clock.
- The Spectrum plugin's default clock (1.7734 MHz) reaches far below MIDI bass ranges, so no low-pitch rule is needed on Spectrum.

## Open questions

- **OQ-1**: Should `gg` (Game Gear) and `cpc` (Amstrad CPC) be accepted as thin aliases that emit `chip gg` / `chip cpc` with the SMS / Spectrum profile? This depends on confirming how those ids resolve in the chip registry. Proposed: leave them out of this spec and add them later if they turn out to be a small change.
- **OQ-2**: Spectrum drum channel. Proposed default: channel 2 (as in the Spectrum song-wizard starter). Alternative: a top-level config key to choose 1, 2 or 3. Proposed: no new key in this spec; users who want another layout use `trackMappings` lanes.

## References

- [#211](https://github.com/kadraman/beatbax/issues/211)
- [Spec 006 — MIDI importer](../../complete/006-midi-importer/spec.md) (future enhancement: SMS / Spectrum / CPC profiles)
- [Spec 089 — Arrangement-aware MIDI import](../../complete/089-midi-import-arrangement/spec.md)
- [Spec 090 — MIDI import naming](../../complete/090-midi-import-naming/spec.md)
- `packages/engine/src/import/midi/chipRoles.ts`, `kit.ts`, `config.ts`
- `packages/plugins/chip-sms/src/songWizard.ts`, `packages/plugins/chip-spectrum-128/src/songWizard.ts`
- [ZX Spectrum 128 composition guide](../../../docs/chips/zx-spectrum-128/composition_guide.md), [SMS composition guide](../../../docs/chips/sms/composition_guide.md)
