---
title: "CLI MIDI → .bax Conversion"
id: 6
slug: "midi-importer"
status: "specified"
authors:
  - "GitHub Copilot"
  - "Cursor Agent"
created: "2026-04-27"
updated: "2026-09-21"
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
   - Emit a chip default instrument kit (wizard/preset-aligned names)
   - v1 ships **Game Boy** and **NES** kits; other chips reuse the same packer with different role tables

3. Timing normalization
   - Convert note start/duration to BeatBax tick units using a configured tick grid
   - Support deterministic quantization modes:
     - nearest (default)
     - floor
     - ceil
     - strict (fail when off-grid)
   - Default grid: `1/16`

4. Mapping layer
   - **Default:** auto-map using GM program, track name heuristics, channel 10 → drums, and pitch-range cues (bass → wave/triangle, lead → pulse1, etc.)
   - **Optional:** `--config` explicit track/channel → role mapping (escape hatch)
   - Drum-note map for noise channel (and optional NES DMC reinforcement, opt-in)
   - Named percussion tokens: at least `kick`, `snare`, `hihat` (extendable map)

5. Voice packing and over-polyphony
   - Separate GM channel-10 / drum notes onto the chip noise role as named hits
   - Prefer time-multiplexing compatible streams onto one hardware channel via `inst(name)` when streams do not overlap (or overlap ≤ configurable `maxOverlapTicks`)
   - When simultaneous melodic polyphony exceeds chip channels: keep higher-priority voices, drop or flatten chords to a single note per channel, and **always warn** with counts
   - Monophonic conflict on a channel: keep earliest-starting note; tie-break higher velocity then lower pitch (or config policy)

6. Pattern and sequence generation (reuse in v1)
   - Split into bars of configurable `patternTicks` (default 16)
   - Guarantee every emitted pattern sums exactly to `patternTicks`
   - Hash identical bar contents → shared `pat` names (deterministic)
   - Compress repeating pattern playlists into `seq` with `*N` / grouping where stable
   - Empty bars emit rest-only patterns, optionally deduplicated

7. Diagnostics
   - Report conversion summary: notes imported, quantized, dropped, bars generated, patterns reused, channels packed
   - Warn on unsupported/ignored MIDI data and over-polyphony
   - Fail loudly in strict mode

8. Output
   - Emit readable, editable `.bax` with comments marking generated sections
   - Do not emit unsupported syntax for the chosen chip profile

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
   - Pattern names use stable prefixes and content hashes or bar indices (example: `lead_b01` or hash-stable `lead_a3f2`)
   - Instrument order: kit defaults first, then any extra mapped names, sorted stably

5. Channel completeness
   - Every sequence entry maps to one fixed-length pattern
   - Rest-only patterns deduplicated deterministically

---

## Default Instrument Kits (v1)

Align with existing song-wizard / preset conventions:

- **Game Boy:** `lead` (pulse1), `arp`/`harmony` (pulse2), `bass` (wave), noise percussion `kick` / `snare` / `hihat` (and optional `shaker`)
- **NES:** pulse lead/harmony, triangle bass, noise percussion; optional DMC reinforcement for kick/snare when enabled in config

Named drum tokens are one-shot hits and must not sticky-change the channel’s current instrument (existing resolver semantics).

---

## Future Enhancements

- Optional import of velocity into instrument/effect heuristics
- Web UI / Desktop import wizard with visual mapping preview
- Additional chip mapping profiles beyond GB/NES (SMS, Spectrum/CPC)
- Richer drum maps (toms, open hat, crash) and DMC sample kits
- Configurable polyphony-reduction strategies beyond the v1 defaults

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
