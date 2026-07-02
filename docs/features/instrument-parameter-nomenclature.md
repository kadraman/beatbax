---
title: Instrument Parameter Nomenclature
status: proposed
authors:
  - kadraman
created: 2026-07-01T00:00:00.000Z
---

## Summary

BeatBax aims for **generic cross-chip params** where the concept is shared, and **`chip:`-prefixed params** where hardware semantics differ. Current state is mixed; Game Boy noise parity ([gameboy-noise-uge-playback-parity.md](./gameboy-noise-uge-playback-parity.md)) aligned GB noise on the hUGE model. Broader renames remain follow-up work documented here.

## Problem

| Issue | Current | Recommended | Scope |
|-------|---------|-------------|-------|
| GB noise width | `width=` and `gb:width=` | `gb:width=` canonical in docs | Parity PR (done) |
| GB export note | `uge_note=` unprefixed | `gb:uge_note=` canonical; `uge_note=` alias | Parity PR (done) |
| GB noise clock | `divisor`/`shift` | **Removed** — internal from `gb:uge_note` | Parity PR (done) |
| Volume | GB `volume=100` vs NES/SMS `vol=15` | Document split; optional alias | Follow-up |
| `noise_rate` | SMS 0–3 vs Spectrum 0–31 same name | `sms:noise_rate` / `ay:noise_rate` | Follow-up |
| NES noise/sweep | unprefixed | `nes:` prefix with alias | Follow-up |
| Spectrum percussion | `tone_mix`, `noise_frames` unprefixed | `ay:` prefix | Follow-up |

## Migration path

Phased alias + deprecation per chip — **no implementation in this spec**:

1. Add chip-prefixed canonical names with unprefixed aliases (one release).
2. Emit parser warnings on bare names (next release).
3. Remove bare aliases after migration window.

## Open questions

- Timeline for `vol` vs `volume` unification across chips.
- When to remove bare `width=` for Game Boy noise (deprecation warning first?).

## References

- [instrument-parameters.md](../grammar/instrument-parameters.md) — author-facing naming matrix
- [gameboy-noise-uge-playback-parity.md](./gameboy-noise-uge-playback-parity.md) — implemented GB noise alignment
