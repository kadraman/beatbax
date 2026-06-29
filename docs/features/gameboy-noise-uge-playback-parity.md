---
title: Game Boy Noise UGE Playback Parity
status: proposed
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/149
---

## Summary

Improve Game Boy noise-channel playback so BeatBax web/desktop preview sounds closer to exported hUGETracker/UGE playback.

The immediate goal is to reduce the gap between local playback and hUGETracker for noise percussion such as kicks, snares, hats, crashes, and toms. The broader goal is to make BeatBax's Game Boy noise model consistently hardware-oriented across preview, export, docs, and song examples.

---

## Problem Statement

Game Boy noise percussion can sound noticeably different between:

- BeatBax web/desktop playback.
- Exported hUGETracker UGE files.
- Real hUGEDriver/Game Boy playback.

This is especially confusing now that BeatBax supports `uge_note=` for named noise hits. `uge_note=` makes the tracker row display explicit, but it does not necessarily make local playback use the same noise clock/width behavior as hUGETracker.

Current pain points:

- Authors may tune a snare/hat in BeatBax preview, export to UGE, and hear a different brightness or transient character.
- Noise instruments often specify envelope and `uge_note`, but not explicit hardware clock parameters.
- Web/desktop playback may interpret noise parameters differently from the UGE/hardware model.
- There is no "export preview" mode that lets users hear the hUGE-compatible approximation before exporting.

---

## Goals

1. Make Game Boy noise playback use hardware-style NR43 concepts where possible.
2. Keep `uge_note=` as the explicit UGE row/display note for named noise hits.
3. Provide an option for BeatBax preview to use UGE/hUGEDriver-style noise mapping.
4. Update docs and examples so noise instruments include explicit hardware-ish parameters.
5. Add tests that compare BeatBax noise parameter mapping with UGE export behavior.

---

## Non-Goals

- Perfect hardware emulation in the first implementation.
- Replacing hUGETracker as the source of truth for tracker playback.
- Making every existing song sound identical after export without small authoring changes.
- Supporting arbitrary custom hUGEDriver forks with different noise behavior.

---

## Proposed Solution

### Hardware-Oriented Noise Model

Represent Game Boy noise in terms close to NR43:

- `gb:width` / `width`: LFSR width mode (`7` or `15`).
- `divisor`: clock divisor code.
- `shift`: clock shift.
- `env`: NR42-style volume envelope.
- `length`: optional duration/length behavior.
- `uge_note`: hUGETracker display/frequency-row hint for UGE export.

For local playback, derive the LFSR clock from the same `divisor` and `shift` values that UGE/hUGEDriver will use.

### UGE Preview Mode

Add a preview mode that favors hUGE-compatible behavior:

```bax
chip gameboy

inst snare type=noise gb:width=7 divisor=3 shift=4 env=10,down,2 uge_note=C-7
inst hat   type=noise gb:width=15 divisor=1 shift=2 env=4,down,1 uge_note=C-8
```

Potential UI options:

- `Preview Mode: BeatBax`
- `Preview Mode: UGE / hUGEDriver`

Potential language option:

```bax
song preview "uge"
```

This should be considered optional; a UI-level preference may be enough for the first version.

---

## Authoring Guidance

Short-term guidance before full parity work lands:

- Prefer explicit `gb:width`, `divisor`, and `shift` on noise instruments.
- Use `uge_note=` to document the hUGETracker row display.
- Avoid relying on `uge_note=` alone to define the local playback timbre.
- Keep noise instrument recipes in examples simple and hardware-like.

Example:

```bax
inst kick  type=noise gb:width=7  divisor=7 shift=6 env=14,down,1 uge_note=C-6
inst snare type=noise gb:width=7  divisor=3 shift=4 env=10,down,2 uge_note=C-7
inst hat   type=noise gb:width=15 divisor=1 shift=2 env=4,down,1  uge_note=C-8
```

---

## Implementation Plan

### Phase 1 - Audit Current Behavior

Deliverables:

- Document how `packages/engine/src/chips/gameboy/noise.ts` maps `width`, `divisor`, `shift`, `env`, and note/default-note values.
- Document how `packages/engine/src/export/ugeWriter.ts` maps noise instruments and pattern notes.
- Identify where `uge_note`, `note`, `divisor`, and `shift` currently diverge between preview and export.

Acceptance criteria:

- A short technical note or test fixture explains one kick/snare/hat example from BeatBax source to UGE rows.

### Phase 2 - Explicit Hardware Parameter Parity

Deliverables:

- Ensure local playback and UGE export agree on `gb:width`, `divisor`, `shift`, and envelope interpretation.
- Add tests for representative noise instruments:
  - kick,
  - snare,
  - closed hat,
  - open hat/tom.
- Update docs to recommend explicit hardware parameters.

Acceptance criteria:

- Given the same instrument definition, local playback and UGE export use the same derived LFSR width/clock inputs.

### Phase 3 - UGE Preview Mode

Deliverables:

- Add a preview flag in app-core/playback that selects hUGE-compatible noise behavior.
- Expose the flag in web/desktop settings or song preview controls.
- Consider showing a small "UGE preview mode active" badge near export controls.

Acceptance criteria:

- Users can switch preview mode and hear noise percussion closer to exported UGE.
- Default playback behavior remains backwards-compatible unless the user opts in.

### Phase 4 - Song And Docs Cleanup

Deliverables:

- Update Game Boy example songs to use explicit noise recipes.
- Add a dedicated instrument demo comparing `BeatBax preview` and `UGE preview` expectations.
- Update `docs/grammar/instruments.md`, `docs/exports/uge-export-guide.md`, and Game Boy composition docs.

Acceptance criteria:

- New Game Boy noise examples document both audible parameters and UGE display notes.

---

## Test Plan

- Unit tests for noise parameter parsing and mapping.
- UGE export tests for named noise hits with `uge_note=`.
- Playback smoke tests that render representative noise instruments and assert non-silent, stable output.
- Golden metadata tests for derived noise settings, avoiding fragile raw audio waveform comparisons where possible.
- Manual comparison:
  - Play in web/desktop with UGE preview mode.
  - Export UGE.
  - Open in hUGETracker.
  - Compare kick/snare/hat brightness and rhythm.

---

## Risks And Tradeoffs

- A more hUGE-compatible preview may change how existing songs sound locally.
- Hardware-accurate noise can be harder for users to reason about than simple abstract noise controls.
- Real hUGETracker/hUGEDriver behavior may still differ depending on driver version or playback environment.
- Audio golden tests can be brittle; prefer testing derived hardware parameters where possible.

---

## Open Questions

1. Should UGE-compatible noise preview be the default for `chip gameboy`, or an opt-in mode?  
- should be default
2. Should `uge_note=` ever influence local playback directly, or should playback only use explicit hardware noise parameters?  
- explicit noise parameters first
3. Do we need a dedicated `noise_note` or `gb:noise_note` field separate from `uge_note`?
4. Should the UI show a warning when a noise instrument has `uge_note=` but no explicit `divisor` / `shift`?
5. Should existing Game Boy songs be migrated in one pass, or only new examples and touched songs?

