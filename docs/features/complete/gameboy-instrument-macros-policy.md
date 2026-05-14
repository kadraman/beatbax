---
title: Game Boy Instrument Macros Policy
status: complete
authors: ["kadraman"]
created: 2026-05-14
---

## Summary

BeatBax intentionally does not support Game Boy instrument macro fields such as `arp_env`, `vol_env`, `pitch_env`, or `duty_env` in the Game Boy chip model.

For Game Boy authoring, use pattern/inline effects and sequence transforms that already map to current runtime behavior and UGE export semantics.

## Decision

For `chip gameboy`, instrument-level macro fields are out of scope.

This is an explicit product and architecture decision, not an implementation gap.

## Rationale

1. UGE-first export target.
   Game Boy export compatibility is centered on hUGETracker/UGE. The UGE path is based on per-row effects and instrument parameters that match existing Game Boy semantics.

2. Existing effect model already covers intended expression.
   BeatBax already supports per-note/per-pattern controls (for example `arp`, `vib`, `port`, `volSlide`, `cut`, and `sweep`) that are the primary musical workflow for Game Boy songs.

3. Determinism and compatibility.
   Adding Game Boy macro fields would require either:
   - non-exportable runtime-only behavior, or
   - complex lowering into row effects with lossy edge cases.
   Both increase ambiguity and risk silent behavior drift across playback/export paths.

4. Clear chip boundary.
   Macro-oriented instrument fields are currently associated with NES/FamiTracker workflows and should not be implied as portable to Game Boy.

## Non-Goals

- Do not add parser/runtime acceptance for Game Boy `*_env` macro fields.
- Do not silently reinterpret Game Boy macro-like fields during export.
- Do not add fallback behavior that differs between WebAudio and UGE without explicit feature approval.

## Recommended Game Boy Authoring Pattern

- Express modulation at note/pattern/sequence level.
- Prefer named `effect` presets for reuse.
- Keep exported behavior aligned with UGE-supported semantics.

## Revisit Criteria

Reconsider this policy only if at least one of the following is approved:

1. A new Game Boy target format with native instrument macros is added.
2. A formally specified compile-time lowering model is introduced with deterministic, test-covered semantics.
3. Product direction shifts away from UGE-first Game Boy compatibility.

Until then, Game Boy macro fields remain intentionally unsupported.
