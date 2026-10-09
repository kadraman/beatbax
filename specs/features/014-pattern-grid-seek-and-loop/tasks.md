# Tasks: Pattern Grid Seek And Loop Playback

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [x] T001 Complete plan Constitution Check; confirm app-core playback APIs to extend

## Phase 1: UI range selection only

- [x] T010 [US1] Click/drag global playhead for pending start marker
- [x] T011 [US1] Drag loop region with start/end handles; snap to pattern boundaries
- [x] T012 [US1] Store pending start + loop range in app-core; clear-loop action
- [x] T013 [US1] Visual overlay + tooltips (no audio change yet)

## Phase 2: Pattern-boundary start playback

- [x] T020 [US2] `PlaybackManager.playFrom(source, { startStep })`
- [x] T021 [US2] Schedule from pattern boundary (resolved-song slice); emit initial position events
- [x] T022 [US2] Transport + Pattern Grid playhead start at selected point; Stop resets when no loop

## Phase 3: Pattern-boundary loop playback

- [x] T030 [US3] `PlaybackManager.playRange(..., { loop: true })`
- [x] T031 [US3] Restart at `startStep` when reaching `endStep`; keep overlay visible
- [x] T032 [US3] Keep whole-song loop separate from range loop; clear restores normal Play

Phases 1–3 tests:

- `packages/app-core/tests/playback-range.test.ts`: slicing, snapping, store, and `PlaybackManager` range playback with full-song positions.
- `packages/engine/tests/resolver-step-state.test.ts`: per-note instrument state invariant.
- `apps/desktop/tests/pattern-grid-timeline.test.ts`: ruler mapping, gestures, idle playhead, and Play routing.

Pending: manual scenarios 1–5 in [plan.md](plan.md#test-plan) (desktop QA row "Pattern Grid seek and loop").

## Phase 4: Step-accurate seek and loop (separate later step)

- [ ] T040 [US4] Fine-grained snap + event trimming inside patterns
- [ ] T041 [US4] Correct reconstruction for rests, sustains, inline inst, transforms, effects
- [ ] T042 Tests for Grid mapping, pending marker, overlay units, non-zero start events, range loop bounds (phases 1–3 portion done above; extend for step-level offsets)
- [ ] T043 Move to `specs/complete/014-pattern-grid-seek-and-loop/` when shipped
