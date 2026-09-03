# Tasks: Pattern Grid Seek And Loop Playback

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [ ] T001 Complete plan Constitution Check; confirm app-core playback APIs to extend

## Phase 1: UI range selection only

- [ ] T010 [US1] Click/drag global playhead for pending start marker
- [ ] T011 [US1] Drag loop region with start/end handles; snap to pattern boundaries
- [ ] T012 [US1] Store pending start + loop range in app-core; clear-loop action
- [ ] T013 [US1] Visual overlay + tooltips (no audio change yet)

## Phase 2: Pattern-boundary start playback

- [ ] T020 [US2] `PlaybackManager.playFrom(source, { startStep })`
- [ ] T021 [US2] Engine schedule from pattern boundary; emit initial position events
- [ ] T022 [US2] Transport + Pattern Grid playhead start at selected point; Stop resets when no loop

## Phase 3: Pattern-boundary loop playback

- [ ] T030 [US3] `PlaybackManager.playRange(..., { loop: true })`
- [ ] T031 [US3] Restart at `startStep` when reaching `endStep`; keep overlay visible
- [ ] T032 [US3] Keep whole-song loop separate from range loop; clear restores normal Play

## Phase 4: Step-accurate seek and loop

- [ ] T040 [US4] Fine-grained snap + event trimming inside patterns
- [ ] T041 [US4] Correct reconstruction for rests, sustains, inline inst, transforms, effects
- [ ] T042 Tests for Grid mapping, pending marker, overlay units, non-zero start events, range loop bounds
- [ ] T043 Move to `specs/complete/014-pattern-grid-seek-and-loop/` when shipped
