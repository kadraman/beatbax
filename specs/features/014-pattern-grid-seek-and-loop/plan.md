# Implementation Plan: Pattern Grid Seek And Loop Playback

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Phases



### Phase 1 - UI Range Selection Only

Add Pattern Grid interaction without changing audio playback.

Deliverables:

- Click/drag global playhead to set a pending start marker.
- Drag loop region with start/end handles.
- Snap to pattern boundaries.
- Store pending start and loop range in app-core state.
- Add clear-loop action.
- Show visual overlay and tooltips.

Acceptance criteria:

- Marker/range can be created, adjusted, and cleared.
- Overlay aligns across all Pattern Grid rows.
- Stop still resets normal playback playhead to the beginning.
- No change to current audio scheduling yet.



### Phase 2 - Pattern-Boundary Start Playback

Add playback from a selected pattern boundary.

Deliverables:

- `PlaybackManager.playFrom(source, { startStep })`.
- Engine scheduling from a pattern boundary.
- Initial `playback:position` and `playback:position-changed` events emitted at start offset.
- Transport time and Pattern Grid playhead start at the selected point.

Acceptance criteria:

- Selecting a boundary and pressing Play starts there.
- Stop resets to the beginning when no loop range is active.
- Pause/resume preserves the selected playback position.
- Existing full-song Play remains unchanged.



### Phase 3 - Pattern-Boundary Loop Playback

Add loop-region playback using pattern boundaries.

Deliverables:

- `PlaybackManager.playRange(source, { startStep, endStep, loop: true })`.
- Engine restarts from `startStep` when reaching `endStep`.
- Pattern Grid loop overlay remains visible during playback.
- Existing whole-song loop remains separate from selected range loop.

Acceptance criteria:

- A selected loop range repeats without visible playhead drift.
- Loop boundary transitions do not emit stale end-of-song positions.
- Clearing the loop returns Play to normal whole-song behavior.
- Loop state is not confused with `play auto repeat`.



### Phase 4 - Step-Accurate Seek And Loop

Expand from pattern-boundary behavior to arbitrary step positions.

Deliverables:

- Fine-grained snap mode.
- Event trimming inside patterns.
- Correct state reconstruction at non-boundary offsets.
- Tests for rests, sustains, inline instruments, transformed sequences, and effects.

Acceptance criteria:

- Seeking into the middle of a pattern starts at the correct musical step.
- Sustained notes and rests behave predictably.
- Inline instrument state is correct after seeking past instrument changes.
- Pattern Grid, transport time, and editor glyphs remain aligned.

---

## Test Plan

Manual scenarios:

1. Open `songs/sample.bax`, set start to a middle pattern, press Play, verify playback and playhead begin there.
2. Open `songs/gameboy/a_trainers_journey.bax`, select a Theme A loop range, verify the highlighted region aligns across rows.
3. Pause inside a selected range, wait, resume, verify the playhead resumes without drift.
4. Stop while loop is active, press Play again, verify playback restarts at loop start.
5. Clear loop, press Play, verify playback starts at the beginning.

Automated coverage:

- Pattern Grid maps block click/drag x positions to expected step boundaries.
- Pending start marker persists within a session.
- Loop overlay uses the same global duration units as pattern blocks.
- `PlaybackManager` emits initial position events for non-zero start offsets.
- Range loop does not advance past `endStep` before jumping back.

---
