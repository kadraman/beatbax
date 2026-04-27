---
title: "MIDI Importer Using @tonejs/midi"
status: proposed
authors: ["GitHub Copilot"]
created: 2026-04-27
issue: "https://github.com/kadraman/beatbax/issues/101"
---

## Summary

Add a deterministic MIDI-to-BeatBax importer that converts Standard MIDI Files (.mid) into editable .bax source using @tonejs/midi.

The importer is intended to reduce manual transcription effort while preserving BeatBax correctness, readability, and deterministic behavior.

Initial v1 scope:

- Parse .mid files with @tonejs/midi
- Import core note events (pitch, start, duration) into BeatBax patterns/sequences
- Quantize events to BeatBax tick grids with explicit policy controls
- Support chip-aware mapping profiles (starting with NES)
- Generate human-editable .bax output with stable formatting
- Produce import diagnostics and warnings for dropped/adjusted events

Out of scope for v1:

- Real-time MIDI recording
- Full expression automation import (CC envelopes, pitch bend lanes, aftertouch)
- Chord-intelligence rewriting beyond deterministic note mapping
- Automatic artistic arrangement decisions that are not explicitly configured

---

## Problem Statement

Transcribing MIDI material into BeatBax currently requires substantial manual work:

- Timing conversion (PPQ/time conversion to BeatBax ticks) is error-prone
- Track/channel mapping to chip channels is repetitive
- Pattern splitting into 16-tick bars is tedious
- Drum mapping to noise and optional DMC reinforcement is manual
- Repeating this workflow for multiple songs is time-consuming

This slows iteration and introduces avoidable mistakes in pattern tick totals and channel structure.

A deterministic importer would make this workflow faster while preserving BeatBax's language-first architecture.

---

## Proposed Solution

### Summary

Implement a compile-time import command that reads MIDI via @tonejs/midi, applies an explicit mapping configuration, quantizes to BeatBax ticks, partitions notes into bars/patterns, and emits valid .bax source.

The importer must be deterministic:

- Same MIDI input + same importer config -> byte-identical output
- No hidden randomization
- Stable ordering of instruments, patterns, sequences, and channels

### Example Syntax

No new BeatBax language syntax is required for v1.

The feature is delivered through CLI tooling and optional programmatic API.

### Example Usage

CLI example:

```bash
node bin/beatbax import midi songs/nes/example-1.mid songs/nes/example-1.generated.bax --chip nes --config songs/nes/example-1.import.json
```

Minimal mapping config example:

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
- Parse tempo map and time signature events via @tonejs/midi
- Read per-track note events and channel metadata

2. Timing normalization
- Convert note start/duration to BeatBax tick units using a configured tick grid
- Support deterministic quantization modes:
  - nearest
  - floor
  - ceil
  - strict (fail when off-grid)

3. Mapping layer
- Require explicit mapping from MIDI tracks/channels to BeatBax channel roles
- Provide presets for NES channel roles in v1:
  - pulse1
  - pulse2
  - triangle
  - noise
  - dmc (optional reinforcement)
- Support configurable drum-note map for noise channel and optional DMC triggers

4. Pattern and sequence generation
- Split imported events into bars and 16-tick patterns (configurable pattern length)
- Guarantee every emitted pattern sums exactly to patternTicks
- Emit deterministic pattern names and sequence ordering

5. Diagnostics
- Report import summary:
  - notes imported
  - notes quantized
  - events dropped
  - bars generated
- Warn on unsupported or ignored MIDI data
- Fail loudly in strict mode

6. Output
- Emit readable, editable .bax source with comments indicating generated sections
- Do not emit unsupported syntax for the chosen chip profile

---

## Non-Functional Requirements

- Determinism: identical input and config produce identical output
- Performance: import should complete quickly for typical song-length MIDI files
- Stability: no changes to runtime scheduler semantics
- Safety: importer must not mutate AST schema or parser behavior for existing songs

---

## Implementation Plan

### AST Changes

No AST shape changes are required.

Importer output is normal BeatBax source, parsed by existing parser and resolver.

### Parser Changes

No parser changes required for v1.

### CLI Changes

Add a new command:

```text
beatbax import midi <input.mid> <output.bax> [options]
```

Suggested options:

- --chip <chip>
- --config <file>
- --strict
- --quantize <nearest|floor|ceil|strict>
- --grid <1/4|1/8|1/16|1/32>
- --max-bars <N>
- --dry-run (prints summary only)

### Engine / Import Module Changes

Add a dedicated import module under engine/cli boundaries, for example:

- MIDI reader adapter using @tonejs/midi
- timing normalizer
- mapping engine (track -> channel role)
- pattern partitioner
- bax emitter

Keep importer as compile-time tooling.
Runtime playback and scheduler remain unchanged.

### Web UI Changes

No mandatory web-ui changes for v1.

Optional phase 2: expose importer in web UI as file-upload + mapping wizard.

### Export Changes

No export format changes required.

Generated .bax is handled by existing play/verify/export pipeline.

### Documentation Updates

- Add CLI usage examples to README and/or TUTORIAL
- Add mapping config schema reference
- Add example importer config files for NES songs

---

## Determinism and Mapping Rules

1. Event ordering
- Sort events by: startTick, pitch, sourceTrackIndex, sourceEventIndex

2. Quantization
- Apply quantization before bar partitioning
- Enforce maxShiftTicks guardrails

3. Conflicts and overlap
- If overlapping notes occur on a monophonic target channel, resolve by deterministic policy:
  - keep earliest-starting note
  - tie-break by higher velocity then lower pitch (or config-defined policy)
- Emit warnings when overlap resolution alters source material

4. Naming stability
- Pattern names use stable prefixes and bar indices (example: lead_b01)

5. Channel completeness
- Every sequence entry maps to one fixed-length pattern
- Empty bars emit rest-only patterns, optionally deduplicated deterministically

---

## Testing Strategy

### Unit Tests

- MIDI parsing adapter tests (tempo, time signatures, note extraction)
- Timing conversion tests (PPQ -> ticks)
- Quantization mode tests (nearest/floor/ceil/strict)
- Drum mapping tests (MIDI drum note -> noise token / DMC trigger)
- Pattern tick-balance tests (all emitted patterns sum to patternTicks)
- Determinism tests (same input/config yields byte-identical output)

### Integration Tests

- Golden-file tests for representative MIDI fixtures
- Round-trip validation:
  - import .mid -> .bax
  - run verify on generated .bax
- Strict-mode failure tests for unquantizable and unsupported cases

### Manual Tests

- Import a multi-track NES-style MIDI
- Validate generated song structure and channel assignments
- Spot-check bars with tuplets/syncopation under different quantization modes

---

## Migration Path

No migration required.

This is an additive feature delivered through a new command and does not change existing BeatBax source semantics.

---

## Implementation Checklist

- [ ] Define importer config schema and defaults
- [ ] Add @tonejs/midi dependency to appropriate package
- [ ] Implement MIDI reader adapter
- [ ] Implement timing normalization and quantization pipeline
- [ ] Implement track/channel mapping engine
- [ ] Implement pattern partitioning and sequence emission
- [ ] Implement deterministic naming and ordering rules
- [ ] Implement CLI command and option parsing
- [ ] Implement diagnostics output and strict-mode behavior
- [ ] Add unit tests for all core conversion steps
- [ ] Add integration golden tests for known MIDI fixtures
- [ ] Add docs and example config files

---

## Future Enhancements

- Polyphony reduction strategies configurable per channel role
- Phrase-aware pattern deduplication and motif naming
- Optional import of velocity into instrument/effect heuristics
- Web UI import wizard with visual mapping preview
- Additional chip mapping profiles beyond NES

---

## Open Questions

- Should v1 default to strict quantization or nearest quantization?
- What should be the default overlap-resolution policy for monophonic channels?
- Should DMC reinforcement be auto-enabled for mapped kick/snare notes, or opt-in only?
- Should generated comments include source MIDI bar offsets for traceability?

---

## References

- @tonejs/midi: https://github.com/Tonejs/Midi
- BeatBax feature template: docs/features/FEATURE_TEMPLATE.md
- Existing NES song examples: songs/nes/*.bax

---

## Additional Notes

This proposal intentionally treats MIDI import as a compile-time authoring aid. It does not alter parser, AST contracts, scheduler timing behavior, or exporter semantics.
