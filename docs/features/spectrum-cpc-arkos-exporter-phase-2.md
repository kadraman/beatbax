---
title: Spectrum-128 / Amstrad CPC Arkos Exporter — Phase 2 (full compatibility)
status: proposed
authors:
  - kadraman
created: 2026-07-19T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/162
---

## Summary

Extend `@beatbax/plugin-exporter-arkos` beyond the experimental v1 subset so typical Spectrum/CPC BeatBax songs — including macros, buzz bass, percussion recipes, and common inline effects — export to Arkos Tracker 3 with faithful pitch, timbre, and envelope behaviour.

Phase 1 (complete) ships a working `.aks` / `.aki` path for simple tone songs. Phase 2 closes the semantic gap so authors do not need to strip macros before export.

## Problem Statement

v1 deliberately fail-hards on the instrument fields and effects that make most real Spectrum demos interesting:

- Software macros: `arp_env`, `pitch_env`, `vol_env`
- Hardware buzz bass: `env_bass`, `env_shape`
- Percussion framing: `noise_frames`, `tone_frames`, `tone_vol`
- Inline effects (e.g. `volSlide`)

Those songs play in BeatBax but cannot export without rewriting. Homebrews using Arkos Tracker need those mappings, or an explicit documented compatibility mode — not a dead end.

## Proposed Solution



### Summary

Grow the Arkos lowering + serializers so BeatBax Spectrum/CPC semantics map onto AT3 constructs:


| BeatBax                                             | Arkos target (phase 2 intent)                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `arp_env`                                           | Arpeggio expressions + cell links / instrument arpeggio cells                             |
| `pitch_env`                                         | Pitch expressions and/or per-cell primary pitch                                           |
| `vol_env`                                           | Multi-cell instrument volume envelopes (loop/end indexes)                                 |
| `env_bass` + `env_shape`                            | Hardware envelope instrument links (`softwareAndHardware` / hardware-only as appropriate) |
| `noise_frames` / `tone_frames` / `tone_vol`         | Short instrument cell sequences or mixer cell changes                                     |
| Inline `volSlide` (and other representable effects) | Arkos effect columns / instrument volume ramps where AT3 allows                           |
| Constant `vol` (v1)                                 | Keep looping single-cell sustain                                                          |


Keep fail-hard for mappings that remain lossy unless an opt-in compatibility mode is explicitly chosen.

### Example Syntax (must become exportable)

```bax
chip spectrum-128
bpm 120

inst lead type=tone1 vol=12 arp_env=[0,4,7|0]
inst bass type=tone3 vol=14 env_bass=true
inst kick type=tone3 vol=15 tone=true tone_mix=true noise_rate=4 noise_frames=3 note=C3 pitch_env=[+5,+2,0,-2,-4]

pat a = C4 E4 G4 C5
pat b = C2 . . .
pat d = kick . . kick

channel 1 => inst lead pat a
channel 2 => inst bass pat b
channel 3 => inst kick pat d

play
```

```bash
beatbax export arkos songs/spectrum-128/instruments/ay_macro_arp_pitch.bax
beatbax export arkos songs/spectrum-128/instruments/ay_buzz_bass.bax
beatbax export arkos songs/spectrum-128/instruments/ay_percussion_demo.bax
```



### Example Usage

- Default remains `.aks` song export (desktop + CLI parity).
- CLI `--instruments` remains `.aki` bank-only.
- Optional later: desktop “Export instrument bank” action for UI parity.



## Implementation Plan



### AST / Parser Changes

None expected. Use existing resolved song / instrument fields.

### Exporter Changes (`packages/plugins/export-arkos/`)

1. **Expressions** — emit real arpeggio/pitch tables from `arp_env` / `pitch_env` (beyond Default `0`).
2. **Multi-cell instruments** — lower `vol_env` and percussion frame recipes to instrument cell sequences with correct `speed`, `loopStartIndex`, `endIndex`, `isLooping`.
3. **Hardware envelope instruments** — map `env_bass` / `env_shape` to AT3 hardware links + envelope period/shape.
4. **Inline effects** — map representable effects (`volSlide` first); document/reject the rest.
5. **Validation** — replace blanket v1 field bans with per-field capability checks; keep clear diagnostics.
6. **Timing** — revisit `initialSpeed` / `stepsPerBar` / BPM mapping for songs that are not 16th-grid assumptions.
7. **CPC soak** — validate `chip cpc` exports open and pitch-match at 1 MHz.



### CLI / UI Changes

- Keep `export arkos` and `--instruments`.
- Surface phase-2 diagnostics consistently in CLI and desktop Problems/Output.
- Optional: desktop instrument-bank export action.



### Documentation Updates

- Expand `packages/plugins/export-arkos/README.md` supported/unsupported tables.
- Update Spectrum composition / export docs with “what exports to Arkos”.
- Cross-link from completed v1 feature doc.



## Testing Strategy



### Unit Tests

- Macro → expression / cell lowering for arp, pitch, vol
- Buzz-bass hardware link cells and shapes 8 / 10
- Percussion `noise_frames` / `tone_frames` cell sequences
- Effect mapping / rejection diagnostics
- Deterministic serializer snapshots



### Integration Tests

- Export and open (manual AT3 checklist) for:
  - `ay_macro_arp_pitch.bax`
  - `ay_buzz_bass.bax`
  - `ay_percussion_demo.bax`
  - `ay_all_macros.bax` (where jointly representable)
  - `amstrad-cpc-demo.bax` / CPC profile songs
- Optional WAV A/B: BeatBax vs Arkos export for pitch/envelope smoke checks



## Migration Path

Additive. Songs that exported under v1 must keep working. Songs that previously failed validation become exportable when mapped.

## Implementation Checklist

- [ ] Spec AT3 mapping table for each BeatBax Spectrum field/effect
- [ ] Implement `arp_env` → Arkos arpeggio expressions
- [ ] Implement `pitch_env` → Arkos pitch expressions / cells
- [ ] Implement `vol_env` → multi-cell volume instruments
- [ ] Implement `env_bass` / `env_shape` → hardware envelope instruments
- [ ] Implement `noise_frames` / `tone_frames` / `tone_vol` percussion lowering
- [ ] Map or diagnose inline effects (`volSlide` first)
- [ ] Relax/replace v1 blanket validation bans
- [ ] CPC clock / pitch validation in AT3
- [ ] Snapshot + integration tests for demo songs above
- [ ] Update exporter README and Spectrum docs
- [ ] Manual AT3 open/play checklist for phase-2 fixtures



## Future Enhancements (beyond phase 2)

- Soft compatibility mode (lossy approximations with warnings)
- Round-trip / import validation tooling
- PT3 exporter (separate feature)
- Digi/sample event-track workflows



## Open Questions

1. Should `pitch_env` linear interpolation in BeatBax become stepped Arkos pitch tables, or instrument pitch cells only?
2. Is one shared hardware envelope per song still a hard AT3 constraint we must mirror in validation (same as BeatBax R11–R13)?
3. Which inline effects are in-scope for phase 2 vs permanently unsupported?
4. Do we need an explicit `--compat=lossy` flag, or stay fail-hard until every mapped construct is faithful?



## References

- `docs/features/complete/spectrum-cpc-arkos-exporter.md` (v1 complete)
- `docs/features/complete/zx-spectrum-128-chip-plugin.md`
- `packages/plugins/export-arkos/`
- `packages/plugins/chip-spectrum-128/`
- `.github/ISSUES/spectrum-cpc-arkos-export-phase-2.md`
- Arkos Tracker 3 docs / AT3 XML schema



## Additional Notes

Phase 1 already fixed octave mapping (`MIDI − 12`), looping sustain cells, export filename/icon UX, and CLI/desktop `.aks` parity. Phase 2 should not regress those behaviours.
