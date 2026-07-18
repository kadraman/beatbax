---
title: Game Boy Instrument Macros Policy
status: complete
authors: ["kadraman"]
created: 2026-05-14
updated: 2026-07-17
related:
  - docs/features/gameboy-uge-instrument-subpatterns.md
---

## Summary

BeatBax now supports Game Boy `pitch_env` and `vol_env` through a shared tick-program lowerer that drives both preview/WAV and hUGETracker UGE instrument subpatterns. See [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md).

`duty_env` and `arp_env` are still not lowered on Game Boy (v1). For song-level expression, continue to use pattern/inline effects and sequence transforms.

## Decision

### Current (Phase 1+ landed)

For `chip gameboy`, instrument-level `pitch_env` and `vol_env` are **supported** via the shared tick-program lowerer in [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md). Preview/WAV and UGE subpattern export both consume `lowerGameBoyInstrumentProgram`.

`duty_env` and `arp_env` remain out of scope for v1 (warned at export; not lowered).

### Approved revisit

Criterion 2 below is **approved** via [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md):

- Authors may use existing `*_env` macro syntax on Game Boy once a single `lowerGameBoyInstrumentProgram` produces a tick program.
- **Both** BeatBax preview/WAV and UGE subpattern export must consume that same tick program.
- Native `subpat` syntax is optional later for import/power users; it must lower into the same IR.

When Phase 1 of that feature is marked complete, update this policy’s “Current” section to “Superseded for fields covered by the lowering feature” and list the enabled macros explicitly (`pitch_env`, `vol_env`, …).

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

**Until the lowering feature ships:**

- Express modulation at note/pattern/sequence level.
- Prefer named `effect` presets for reuse.
- Keep exported behavior aligned with UGE-supported semantics.
- Use `uge_note=` for noise pitched hits ([noise playback parity](gameboy-noise-uge-playback-parity.md)).

**After Phase 1 of the instrument-program feature:**

- Prefer `pitch_env` / `vol_env` on instruments for drums and plucks.
- Keep `uge_note=` as the base note; macros supply relative tick offsets and volume steps.
- Always rely on one-shot halt encoding so subpatterns do not auto-restart.

## Revisit Criteria

Reconsider / extend Game Boy macros only when at least one of the following is approved:

1. A new Game Boy target format with native instrument macros is added.
2. ~~A formally specified compile-time lowering model is introduced with deterministic, test-covered semantics.~~ **Approved** — see [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md).
3. Product direction shifts away from UGE-first Game Boy compatibility.

`pitch_env` / `vol_env` are supported through the instrument-program feature. Extend further macros only via that same lowering path.
