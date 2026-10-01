---
title: "CLI MIDI → .bax Conversion"
id: 6
slug: "midi-importer"
status: "complete"
authors:
  - "GitHub Copilot"
  - "Cursor Agent"
created: "2026-04-27"
updated: "2026-09-27"
issue: "https://github.com/kadraman/beatbax/issues/101"
area: "engine"
---
## Summary

Add a deterministic **CLI conversion** that turns Standard MIDI Files (`.mid`) into editable BeatBax `.bax` source using `@tonejs/midi`.

Product language may say “conversion” (`import midi` or `convert midi2bax`); the feature ID remains **006**. Same pipeline either way.

This is a **compile-time authoring aid** for the BeatBax CLI. It is **not** Desktop/Web live MIDI input and **not** a full IDE import wizard.

Initial v1 scope:

- Parse `.mid` files with `@tonejs/midi`
- Convert core note events (pitch, start, duration) into BeatBax `pat` / `seq` / `channel` structure
- Require `--chip` so channel budget and default instrument kits are chip-aware
- Auto-map MIDI tracks/channels to chip roles (optional `--config` override)
- Quantize to BeatBax tick grids with explicit policy controls
- Derive reusable patterns and sequences from repeating bars
- Emit default instruments plus named percussion tokens (`kick`, `snare`, `hihat`, …)
- Warn when MIDI voices exceed chip channels; pack with mid-channel `inst()` when parts do not conflict
- Produce human-editable `.bax` with stable formatting and conversion diagnostics

Out of scope for v1:

- Real-time MIDI recording / keyboard step-entry (see completed feature **065**)
- Desktop or Web IDE “Import MIDI…” UI (optional future phase)
- Full expression automation import (CC envelopes, pitch bend lanes, aftertouch)
- Artistic arrangement decisions beyond the deterministic packing and reuse rules below
- Vendoring copyrighted game/pop MIDI files as repo fixtures

---

## Scope Boundaries (CLI vs Desktop)

| Concern | This feature (006) | Not this feature |
|---------|--------------------|------------------|
| CLI `.mid` → `.bax` file conversion | Yes | — |
| Live MIDI keyboard step-entry in Desktop/Web | No | Feature **065** (complete) |
| Full IDE import wizard / mapping UI | No (v1) | Optional later phase of 006 |

Naming note: keep ID **006** and the `midi-importer` slug for continuity; titles and docs may say “CLI MIDI conversion.”

---

## Problem Statement

Transcribing MIDI material into BeatBax currently requires substantial manual work:

- Timing conversion (PPQ/time conversion to BeatBax ticks) is error-prone
- Track/channel mapping to chip channels is repetitive
- Pattern splitting into 16-tick bars is tedious
- Drum mapping to noise (and optional DMC reinforcement) is manual
- Reusable `pat` / `seq` structure is easy to miss when pasting expanded notes
- Chip channel limits force awkward manual voice packing and instrument switches

This slows iteration and introduces avoidable mistakes in pattern tick totals and channel structure.

A deterministic CLI converter would make this workflow faster while preserving BeatBax's language-first architecture.

---

## Proposed Solution

### Summary

Implement a compile-time CLI command that reads MIDI via `@tonejs/midi`, applies chip-aware auto-mapping (with optional config override), quantizes to BeatBax ticks, packs voices into chip channels (with warnings and `inst()` multiplexing where possible), partitions notes into bars/patterns with reuse detection, emits a default instrument kit, and writes valid `.bax` source.

The converter must be deterministic:

- Same MIDI input + same chip + same options/config → byte-identical output
- No hidden randomization
- Stable ordering of instruments, patterns, sequences, and channels

### Example Syntax

No new BeatBax language syntax is required for v1.

The feature is delivered through CLI tooling and an optional programmatic API in the engine. No Desktop/Web UI in v1.

### Example Usage

Minimal (auto-mapping):

```bash
beatbax import midi song.mid song.bax --chip gameboy
```

With optional mapping override:

```bash
beatbax import midi songs/nes/example-1.mid songs/nes/example-1.generated.bax --chip nes --config songs/nes/example-1.import.json
```

Alternate CLI surface (equivalent pipeline):

```bash
beatbax convert midi2bax song.mid song.bax --chip gameboy
```

Minimal mapping config example (optional override):

```json
{
  "chip": "nes",
  "ticksPerBeat": 4,
  "patternTicks": 16,
  "trackMappings": [
    { "midiTrack": 1, "target": "pulse1", "instrument": "lead" },
    { "midiTrack": 2, "target": "pulse2", "instrument": "harm" },
    { "midiTrack": 3, "target": "triangle", "instrument": "tri" },
    { "midiTrack": 4, "target": "noise", "drumMap": { "36": "kick", "38": "snare", "42": "hihat" } }
  ],
  "dmcReinforcement": {
    "enabled": true,
    "kickSample": "@nes/kick",
    "snareSample": "@nes/snare"
  },
  "quantize": {
    "mode": "nearest",
    "grid": "1/16",
    "maxShiftTicks": 1
  }
}
```

---

## Functional Requirements

1. Input and parsing
   - Accept Standard MIDI files (format 0 and 1)
   - Parse tempo map and time signature events via `@tonejs/midi`
   - Read per-track note events and channel metadata

2. Chip targeting
   - Require `--chip` (`gameboy`, `nes`, and later `sms` / `spectrum-128`)
   - Use chip channel count and role table to bound packing
   - Emit a chip instrument kit driven by **GM program families** (plus named percussion); config may override instrument names
   - v1 ships **Game Boy** and **NES** family templates; other chips reuse the same packer with different role tables

3. Timing normalization
   - Convert note start/duration to BeatBax tick units using a configured tick grid
   - Support deterministic quantization modes:
     - nearest (default)
     - floor
     - ceil
     - strict (record off-grid as an error diagnostic; still snap to nearest grid)
   - Default grid: `1/16`
   - CLI `--strict` fails the conversion when any error diagnostic is present (including strict-quantize off-grid); `--quantize strict` alone does not abort

4. Mapping layer
   - **Default:** auto-map using GM program, track name heuristics, channel 10 → drums, and pitch-range cues (bass → wave/triangle, lead → pulse1, etc.). Track-name hints prefer **chiptune / producer labels** (`lead`, `bassline`, `arp`, `pluck`, `chords`, `pad`, `kick`/`snare`/`hat`, …) before orchestral names (`violin`, `viola`, `cello`). Within GM strings: 40 violin → pulse1, 41 viola → pulse2, 42–43 cello/contrabass → wave/triangle
   - GM program also selects a **timbre family** (piano / guitar / bass / strings / pad / lead) that chooses articulation (e.g. piano = short hold, strings = sustain); instrument names are `{family}_p1` / `{family}_p2` / `{family}_bass` for the packed chip role (`bass` family on the bass role stays `bass`). Since feature 090 these carry an `_inst` suffix ([090 spec](../../features/090-midi-import-naming/spec.md))
   - **Optional:** `--config` may override the program→family table (`programFamilies`) and per-family articulation (`families`); values merge over built-in defaults (config wins per program range / field). Known family ids only: `piano|guitar|bass|strings|pad|lead`
   - **Optional:** `--config` explicit track/channel → role mapping (escape hatch)
   - Config `trackMappings[].target` must be a known chip role (`pulse1|pulse2|wave|triangle|noise|dmc`); invalid values are rejected at parse time
   - Config `trackMappings[].midiChannel`, when present, must be an integer in 0–15 (0-based) or 1–16 (1-based)
   - Config `trackMappings[].instrument`, when present, forces that instrument name (kit line still emitted for the packed role)
   - Drum-note map for noise channel (and optional NES DMC reinforcement, opt-in)
   - Named percussion tokens: at least `kick`, `snare`, `hihat` (extendable map)
   - Default GM clap (MIDI 39) maps to `snare` (backbeat); side stick (37) stays `ghost`

5. Voice packing and over-polyphony
   - Separate GM channel-10 / drum notes onto the chip noise role as named hits
   - Prefer time-multiplexing compatible streams onto one hardware channel via `inst(name)` when streams do not overlap (or overlap ≤ configurable `maxOverlapTicks`)
   - When simultaneous melodic polyphony exceeds chip channels: keep higher-priority voices, drop or flatten chords to a single note per channel, and **always warn** with counts
   - Monophonic conflict on a channel: keep earliest-starting note; tie-break higher velocity then lower pitch (or config policy)
   - **Drum stack / flam:** noise is monophonic — when different drum tokens share a start tick (common after 1/16 quantize, or layered kick+snare in dance MIDI), keep the highest-priority hit on that tick (`snare` > `kick` > hats/crash > `ghost`). Snare-over-kick preserves backbeats when GM layers kick+snare on beats 2/4. Optionally nudge lower-priority tokens forward by 1…`drumFlamTicks` BeatBax ticks into an **empty** tick (default `drumFlamTicks=0` drop-only; set `≥1` to flam). Never overwrite a native hit. Emit `drum_flam` diagnostics for nudged hits; still drop when no free flam slot exists

6. Pattern and sequence generation (reuse in v1)
   - Split into bars of configurable `patternTicks` (default 16)
   - Guarantee every emitted pattern sums exactly to `patternTicks`
   - Hash identical bar contents → shared `pat` names (deterministic)
   - Compress repeating pattern playlists into `seq` with `*N` / grouping where stable
   - Empty bars emit rest-only patterns, optionally deduplicated
   - **Arrangement sections (Pattern Grid):** chunk each channel’s bar playlist into fixed-size sections of `sectionBars` bars (default **8**; `0` = monolithic one-seq-per-channel). When more than one section is emitted, write `# --- Section N: Bars A-B ---` headers and bind `channel … => … seq s01 s02 …` with aligned top-level seq refs across channels (Desktop Pattern Grid structured/phased layout). Short songs with `bars ≤ sectionBars` stay a single seq.

7. Diagnostics
   - Report conversion summary: notes imported, quantized, dropped, bars generated, patterns reused, channels packed
   - Warn on unsupported/ignored MIDI data and over-polyphony
   - Fail loudly when CLI `--strict` is set (including strict-quantize off-grid errors)

8. Output
   - Emit readable, editable `.bax` with comments marking generated kit/pattern blocks and, when sectioned, `# --- Section N: Bars A-B ---` arrangement headers
   - Do not emit unsupported syntax for the chosen chip profile
   - Prefer Pattern Grid–compatible multi-seq channel lines when `sectionBars > 0` and the song spans more than one section

---

## Non-Functional Requirements

- Determinism: identical input and options produce identical output
- Performance: conversion should complete quickly for typical song-length MIDI files
- Stability: no changes to runtime scheduler semantics
- Safety: converter must not mutate AST schema or parser behavior for existing songs

---

## Determinism and Mapping Rules

1. Event ordering
   - Sort events by: startTick, pitch, sourceTrackIndex, sourceEventIndex

2. Quantization
   - Apply quantization before bar partitioning
   - Enforce maxShiftTicks guardrails

3. Conflicts and overlap
   - Resolve monophonic overlaps with the policy above
   - Emit warnings when resolution alters source material

4. Naming stability
   - Pattern names use stable prefixes and content hashes or bar indices (example: `lead_b01` or hash-stable `lead_a3f2`). Superseded by feature 090: numbered `lead_01_pat`, shared `rest_x16_pat`, `lead_seq` / `lead_s01_seq` ([090 spec](../../features/090-midi-import-naming/spec.md))
   - Instrument order: kit defaults first, then any extra mapped names, sorted stably

5. Channel completeness
   - Every sequence entry maps to one fixed-length pattern
   - Rest-only patterns deduplicated deterministically

---

## Default Instrument Kits (v1)

Melodic instruments are chosen from **GM program families** and typed for the packed chip role. Only used melodic names are emitted (plus the full percussion kit).

| Family | GM programs | Articulation |
|--------|-------------|--------------|
| `piano` | 0–7 | Short hold / pluck |
| `guitar` | 24–31 | Medium pluck |
| `bass` | 32–39 | Wave (GB) / triangle (NES) bass body |
| `strings` | 40–51 | Long hold / sustain |
| `lead` | 80–87 (+ melodic fallback) | Synth lead (punchier envelope on GB) |
| `pad` | 88–95 | Soft sustain |

Naming: `{family}_p1` / `{family}_p2` / `{family}_bass`, except bass-family on the bass role → `bass`.

### Config overrides (`programFamilies` / `families`)

Built-in defaults may be overridden in `--config` JSON (merge; config wins):

```json
{
  "programFamilies": {
    "0-7": "piano",
    "40-51": "strings",
    "56-63": "lead"
  },
  "families": {
    "piano": { "gb": { "period": 1, "level": 14 } },
    "strings": { "gb": { "period": 0, "level": 12 }, "nes": { "vol": 10 } }
  }
}
```

- `programFamilies` keys are a single GM program (`"40"`) or inclusive range (`"40-51"`); values are family ids.
- `families.<id>.gb`: optional `level` (0–15), `period` (0–7), `dutyP1` / `dutyP2` (12.5|25|50|75), `waveVolume` (0|25|50|100).
- `families.<id>.nes`: optional `vol` (0–15), `dutyP1` / `dutyP2`, `volEnv` (number array or `null` to clear), `pitchEnvP1` (number array or `null` to clear).

Example fixture: `packages/engine/tests/fixtures/midi/family-override.example.json`.

Percussion (always emitted):

- **Game Boy:** noise `kick` / `snare` / `hihat` / `shaker` / `ghost` / `crash` with `uge_note` plus short `pitch_env` / `vol_env` macros (kick uses `uge_note=C-6` and a pitch drop; hihat/shaker/crash use 15-bit LFSR; `ghost` is a soft side-stick); wave bass uses `volume=25`
- **NES:** noise percussion with battle-style periods (`kick` period 12, `snare` 7, `hihat` 2, `note=C5`) plus soft `ghost` / `crash`; optional DMC reinforcement emits distinct `kick_dmc` / `snare_dmc` instruments and tokens on channel 5 (noise `kick`/`snare` remain on channel 4)

Named drum tokens are one-shot hits and must not sticky-change the channel’s current instrument (existing resolver semantics).

---

## Future Enhancements

- Optional import of velocity into instrument/effect heuristics
- Web UI / Desktop import wizard with visual mapping preview
- Additional chip mapping profiles beyond GB/NES (SMS, Spectrum/CPC)
- Richer drum maps (toms, open hat, crash) and DMC sample kits
- Configurable polyphony-reduction strategies beyond the v1 defaults

Arrangement-aware mapping (bar-range track mappings, per-mapping chord reduction and pitch fixes, drum source filtering, timing overrides, `--inspect`) is specified as follow-up feature **089** `midi-import-arrangement` (https://github.com/kadraman/beatbax/issues/213).

---

## Open Questions (resolved for v1 defaults)

| Question | v1 default |
|----------|------------|
| Quantization default? | `nearest` |
| Overlap-resolution policy? | Earliest start; then higher velocity; then lower pitch |
| DMC reinforcement? | Opt-in only (`dmcReinforcement.enabled`) |
| Source MIDI bar offsets in comments? | Yes, brief comments for traceability |

---

## Test Fixtures

Identified synthetic CI fixtures (F01–F09) and well-known stretch songs (S01–S10) are catalogued in [fixtures.md](fixtures.md). Binary `.mid` files are **not** committed in this specification pass.

---

## References

- `@tonejs/midi`: https://github.com/Tonejs/Midi
- BeatBax feature template: `specs/_templates/`
- Existing NES / Game Boy song examples: `songs/nes/*.bax`, `songs/gameboy/*.bax`
- MIDI export (inverse maps): `packages/engine/src/export/midiExport.ts`
- Live MIDI step-entry (out of scope): feature 065

---

## Additional Notes

This proposal intentionally treats MIDI conversion as a compile-time CLI authoring aid. It does not alter parser, AST contracts, scheduler timing behavior, or exporter semantics. Round-trip `export midi` → `import midi` is not required to be bit-identical; it is a transcription aid, not chip authenticity preservation.
