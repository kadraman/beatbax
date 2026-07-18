---
title: hUGETracker UGE Converter
status: proposed
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
related:
  - docs/features/gameboy-uge-instrument-subpatterns.md
  - docs/features/gameboy-noise-uge-playback-parity.md
  - docs/exports/uge-export-guide.md
issue: https://github.com/kadraman/beatbax/issues/151
---

## Summary

Add the ability to import or convert hUGETracker `.uge` songs into BeatBax `.bax` source.

The first implementation should be a CLI converter:

```bash
beatbax convert uge song.uge <song.bax>
```

Later, web/desktop UI can support "Import UGE" using the same conversion core.

---

## Problem Statement

BeatBax can export Game Boy songs to hUGETracker UGE, and the engine already has a UGE reader that can parse `.uge` files. However, there is no workflow for bringing existing hUGETracker songs into BeatBax.

This limits migration and round-trip workflows:

- Users with existing `.uge` songs cannot use BeatBax editing/composition features.
- hUGETracker instrument subpatterns, wavetables, and pattern/order data cannot be converted into readable `.bax`.
- BeatBax UGE export improvements cannot be validated through round-trip import/export tests.

Subpattern emission is especially important: BeatBax already authors and exports instrument programs via macros / `subpat` ([`gameboy-uge-instrument-subpatterns.md`](gameboy-uge-instrument-subpatterns.md)). The converter must emit that grammar so imported drums keep their character instead of expanding into song-timeline patterns.

---

## Goals

1. Convert UGE files into mechanically correct `.bax` source.
2. Preserve instruments, wavetables, patterns, orders, effects, and metadata where possible.
3. Preserve hUGETracker instrument subpatterns as BeatBax `subpat` (or equivalent macros).
4. Emit warnings/comments for unsupported or lossy mappings.
5. Provide both a programmatic conversion API and CLI entry point.
6. Leave room for a later UI import workflow.

---

## Non-Goals

- Perfectly recovering the original human-authored structure or comments.
- Guaranteeing imported `.bax` sounds identical before Game Boy playback parity work lands.
- Supporting non-UGE tracker formats in this feature.
- Full round-trip identity of binary UGE files in the first phase.
- Beautifying generated `.bax` beyond reasonable naming/formatting heuristics.

---

## Existing Foundation

The engine already includes a UGE reader:

```text
packages/engine/src/import/uge/uge.reader.ts
```

It can parse:

- UGE version.
- Song metadata.
- Duty, wave, and noise instruments.
- Wavetables.
- Patterns and rows.
- Orders.
- Instrument subpattern row data where available.

The missing piece is a converter that maps this parsed UGE model into BeatBax AST/source.

---

## Proposed CLI

### Basic Conversion

```bash
beatbax convert uge song.uge <song.bax>
```

### Dry Run / Summary

```bash
beatbax convert uge input.uge --summary
```

Example output:

```text
UGE v6: song.uge
Patterns: 42
Orders: duty1=16 duty2=16 wave=16 noise=16
Instruments: duty=5 wave=2 noise=4
Subpatterns: noise=3
Unsupported effects: 2
```

### Strict Mode

```bash
beatbax convert uge song.uge <song.bax> --strict
```

Strict mode should fail on lossy or unsupported mappings instead of emitting comments.

---

## Generated `.bax` Shape

Generated output should be readable and stable:

```bax
chip gameboy
bpm 140
song name "ConvertedUGE Song"
song artist "Unknown"
song description "Convertedfrom hUGETracker UGE."

inst duty_01 type=pulse1 duty=50 env=12,down,1
inst duty_02 type=pulse2 duty=25 env=10,down,2

inst wave_01 type=wave wave="0478ABBB986202467776420146777631"

subpat noise_kick_sub =
  C-6:1
  B-5:1
  A-5:1
  G-5:1

inst noise_kick type=noise gb:width=7 env=14,down,1 subpat=noise_kick_sub

effect arp_47 = arp:4,7
effect port_40 = port:64
effect vib_23 = vib:2,3

pat ch1_p00 = C5 . D5 . E5 .
pat ch2_p00 = G4<arp_47>:4 . . .
pat ch3_p00 = inst wave_01 C3:4 D3:4
pat ch4_p00 = noise_kick . snare .

seq ch1 = ch1_p00 ch1_p01 ch1_p02
seq ch2 = ch2_p00 ch2_p01 ch2_p02
seq ch3 = ch3_p00 ch3_p01 ch3_p02
seq ch4 = ch4_p00 ch4_p01 ch4_p02

channel 1 => inst duty_01 seq ch1
channel 2 => inst duty_02 seq ch2
channel 3 => inst wave_01 seq ch3
channel 4 => inst noise_kick seq ch4
```

---

## Mapping Requirements

### Metadata

- UGE name -> `song name`.
- UGE artist -> `song artist`.
- UGE comment -> `song description` or generated comment block.
- UGE tempo/ticks -> `bpm`, with warning if conversion is approximate.

### Instruments

Duty instruments:

- UGE duty instrument -> `type=pulse1` or `type=pulse2` depending on channel usage.
- Duty cycle -> `duty=`.
- Envelope -> `env=`.
- Sweep fields -> `sweep=` where supported.

Wave instruments:

- UGE wave instrument -> `type=wave`.
- Wavetable -> `wave="32-nibble-hex"`.
- Output level -> `volume=`.

Noise instruments:

- UGE noise instrument -> `type=noise`.
- Width/noise mode -> `gb:width=7|15`.
- Envelope -> `env=`.
- Default/display note -> `uge_note=`.
- Subpattern -> `subpat=...` once available.

### Patterns And Orders

UGE is tracker/order based. BeatBax should generate:

- One `pat` per channel pattern/order where needed.
- One `seq` per channel order list.
- Stable names like `ch1_p00`, `ch2_p00`, etc.
- Optional deduplication if identical pattern rows appear multiple times.

Phase 1 can avoid aggressive deduplication to keep conversion straightforward.

### Effects

Suggested mappings:


| UGE Effect         | BeatBax                  |
| ------------------ | ------------------------ |
| `0xy` arpeggio     | `arp:x,y`                |
| `3xx` portamento   | `port:xx`                |
| `4xy` vibrato      | `vib:x,y` or approximate |
| `8xx` panning      | `pan` / `gb:pan`         |
| `Axy` volume slide | `volSlide`               |
| `E0x` note cut     | `cut:x`                  |


Unsupported or ambiguous effects should become comments near the pattern:

```bax
# TODO: unsupported UGE effect 7xx at ch1_p03 row 12
```

---

## Subpattern Emission

BeatBax already supports native `subpat` and macro lowering for preview + UGE export. Import should emit the same authoring surface:

- Prefer `subpat` declarations for arbitrary rows (empty ticks, mid jumps, raw `fx:`).
- Optionally emit `pitch_env` / `vol_env` / `duty_env` when a subpattern is a simple one-shot zip of those lanes.
- Fallback: comment the raw UGE rows if a row cannot be represented cleanly.

```bax
subpat kick_sub =
  +0 vol:15
  -2 vol:12
  -4 vol:8
  -6 vol:0
  halt
inst kick type=noise uge_note=C-6 subpat=kick_sub
```

See [`gameboy-uge-instrument-subpatterns.md`](gameboy-uge-instrument-subpatterns.md) for offset/`halt`/`jump:` conventions (C-6 = +0; jumps are 1-based).

---

## Implementation Plan

### Phase 1 - Mechanical CLI Converter

Deliverables:

- `convertUGEToBax(uge: UGESong, opts): string`.
- CLI command: `beatbax convert uge song.uge <song.bax>`.
- Basic instrument, wavetable, pattern, order, and effect conversion.
- Warnings for unsupported features.

Acceptance criteria:

- A simple hUGETracker song converts to `.bax`.
- The generated `.bax` parses successfully.
- Exporting the generated `.bax` back to UGE produces a playable song.

### Phase 2 - Subpattern Preservation

Deliverables:

- Detect instrument subpatterns from UGE.
- Emit `subpat` declarations (grammar already shipped).
- Preserve unsupported subpattern details as comments if needed.

Acceptance criteria:

- A UGE song with noise kick/snare subpatterns imports with recognizable BeatBax `subpat` blocks.

### Phase 3 - Better Naming And Deduplication

Deliverables:

- Detect reused patterns and assign stable names.
- Generate friendlier instrument names from UGE instrument names.
- Group generated sequences by channel/section where possible.

Acceptance criteria:

- Generated `.bax` is readable enough for manual editing.
- Repeated UGE patterns are not unnecessarily duplicated when safe.

### Phase 4 - UI Import

Deliverables:

- Web/desktop "Import UGE" flow.
- Preview generated `.bax` before saving.
- Show conversion warnings in the diagnostics panel.

Acceptance criteria:

- User can select a `.uge` file and load generated BeatBax source into the editor.

---

## Test Plan

- Unit tests for UGE instrument-to-BeatBax instrument conversion.
- Unit tests for wavetable hex output.
- Pattern/order conversion tests.
- Effect mapping tests.
- Snapshot tests for generated `.bax` from small fixture UGE files.
- Round-trip smoke tests:
  1. Read UGE.
  2. Convert to `.bax`.
  3. Parse/resolve `.bax`.
  4. Export UGE.
  5. Confirm exported file opens through the UGE reader.

---

## Risks And Tradeoffs

- Generated `.bax` may be mechanically correct but not idiomatic.
- Some UGE effects or subpattern behaviors may not map cleanly.
- Tempo conversion may be approximate depending on UGE timer settings.
- Channel-specific instrument assumptions may be ambiguous when instruments are reused across channels.
- Preview/WAV already run instrument programs; remaining gaps are import emission and edge-case parity.

---

## Open Questions

1. Should the importer target readable source first or maximum round-trip fidelity first?  
- readable source
2. Should unsupported effects become comments, warnings, or hard errors by default?  
- warnings and comments
3. Should generated patterns be deduplicated in phase 1 or left one-to-one with UGE orders?  
- dedupliocated
4. How should UGE routines be represented, if at all?  
- not supported
5. Should UI import preserve the original `.uge` as an attached artifact or comment metadata?  
- comment metadata

