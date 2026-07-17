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

BeatBax historically did not support Game Boy instrument macro fields such as `arp_env`, `vol_env`, `pitch_env`, or `duty_env` in the Game Boy chip model.

That restriction remains in force **until** the approved lowering feature lands. The revisit path is specified in [`gameboy-uge-instrument-subpatterns.md`](../gameboy-uge-instrument-subpatterns.md) (macros → shared tick program → UGE subpatterns + preview).

Until that feature’s Phase 1 ships, for Game Boy authoring use pattern/inline effects and sequence transforms that already map to current runtime behavior and UGE export semantics.

## Decision

### Current (until lowering ships)

For `chip gameboy`, instrument-level macro fields remain **out of scope** in parser validation and runtime.

This was an explicit product and architecture decision, not an implementation gap.

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

Until Phase 1 of that feature lands, Game Boy macro fields remain intentionally unsupported in the product.
