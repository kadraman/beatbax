---
title: Game Boy Instrument Macros Policy
status: complete
authors: ["kadraman"]
created: 2026-05-14
updated: 2026-07-18
related:
  - docs/features/gameboy-uge-instrument-subpatterns.md
---

## Summary

BeatBax supports Game Boy instrument programs through a shared tick-program lowerer that drives both preview/WAV and hUGETracker UGE instrument subpatterns. See [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md).

Supported authoring surfaces: `pitch_env`, `vol_env`, `duty_env`, `arp_env`, and native `subpat` (empty rows, mid jumps, raw `fx:`).

## Decision

### Current (Phases 0–4 landed)

For `chip gameboy`, instrument-level macros and `subpat=` are **supported** via the shared tick-program lowerer in [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md). Preview/WAV and UGE subpattern export both consume `lowerGameBoyInstrumentProgram`.

| Field | Lowering |
|-------|----------|
| `pitch_env` | Offset column |
| `vol_env` | Effect `Cxy` (wins over `duty_env` on the same tick) |
| `duty_env` | Effect `9xx` |
| `arp_env` | Offset column when `pitch_env` is absent |
| `subpat=` | Native rows win over macros |

### Approved revisit

Criterion 2 below is **approved** via [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md):

- Authors may use existing `*_env` macro syntax on Game Boy once a single `lowerGameBoyInstrumentProgram` produces a tick program.
- **Both** BeatBax preview/WAV and UGE subpattern export must consume that same tick program.
- Native `subpat` lowers into the same IR (UGE import → `subpat` emission is the remaining follow-up).

## Rationale (original)

1. UGE-first export target.
   Game Boy export compatibility is centered on hUGETracker/UGE. UGE expresses instrument-time motion as **subpatterns** (offset | jump | effect), not as FamiTracker-style macro tables.

2. Existing effect model already covers much expression.
   BeatBax already supports per-note/per-pattern controls (for example `arp`, `vib`, `port`, `volSlide`, `cut`, and `sweep`) for song-level Game Boy workflows.

3. Determinism and compatibility.
   Enabling Game Boy macro fields without a shared lowerer would cause either:
   - non-exportable runtime-only behavior, or
   - a second ad-hoc export mapping with silent preview/export drift.

4. Clear chip boundary.
   Macro-oriented instrument fields were associated with NES/FamiTracker (and later SMS/Spectrum) workflows and must not be implied as “play like NES, export somehow” on Game Boy.

## Non-Goals (still)

- Do not enable Game Boy `*_env` via the NES macro player alone.
- Do not silently reinterpret Game Boy macro-like fields during export without the shared tick program.
- Do not ship export-only lowering with long-term “preview may differ” as the design.
- Do not replace other chips’ macros with hUGE-shaped `subpat` syntax.

## Recommended Game Boy Authoring Pattern

- Prefer `pitch_env` / `vol_env` on instruments for drums and plucks; use `duty_env` / `arp_env` when needed.
- Use native `subpat` for empty first rows, mid-program jumps, or raw hUGE effects.
- Keep `uge_note=` as the noise base note; programs supply relative tick offsets and effects.
- Rely on one-shot halt encoding (or explicit `halt` / `jump:`) so subpatterns do not auto-restart.
- Keep pattern/inline effects (`arp`, `vib`, `port`, …) for song-level expression.
- Demo: [`gb_subpattern_macro_demo.bax`](../../songs/gameboy/instruments/gb_subpattern_macro_demo.bax).

## Revisit Criteria

Reconsider / extend Game Boy macros only when at least one of the following is approved:

1. A new Game Boy target format with native instrument macros is added.
2. ~~A formally specified compile-time lowering model is introduced with deterministic, test-covered semantics.~~ **Approved** — see [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md).
3. Product direction shifts away from UGE-first Game Boy compatibility.

`pitch_env` / `vol_env` are supported through the instrument-program feature. Extend further macros only via that same lowering path.
