# Implementation Plan: Pattern Grid Seek And Loop Playback

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — desktop UI and app-core playback only; no `.bax` syntax, no song metadata.
- [x] AST / ISM / scheduler / expansion impact identified — none for phases 1–3 (see design decision). Phase 4 must re-check the scheduler.
- [x] Plugins remain isolated; core does not gain plugin dependencies — app-core and desktop, plus one optional `Player.playAST` option (see design decision); no plugin, AST or ISM change.
- [x] Determinism and compatibility preserved — whole-song `play()` path unchanged when no range is passed; range state is session-only.
- [x] Tests planned for new behavior — see Test Plan (app-core range/store/manager, engine resolver invariant, desktop timeline mapping and Play routing).

### Design decision (2026-10-08): slice the resolved song in app-core

Phases 2–3 do **not** add `startStep` / `endStep` to the engine `Player`.

- `PlaybackManager` resolves the full song as usual and emits `parse:success` with the full song, so the Pattern Grid layout is unchanged.
- It then plays a shallow copy whose channel `events` are sliced to `[startStep, endStep)`.
- A loop range sets `play.repeat = true` on the copy, so the engine's existing seamless repeat loops the range. A play-from range clears `repeat`.
- A loop range also passes `playAST(copy, { lengthSteps: endStep - startStep })`. By default the engine ends a pass at the last scheduled note, so a window whose channels all end on rests would repeat early. `lengthSteps` fixes the pass to the exact window length. It is optional, defaults to the last-note length, and is reset by `stop()`. Whole-song and play-from playback do not pass it.

This is the spec's "skip full pattern ranges before `startStep`" route, and it is sound for these reasons:

- The resolved ISM is one event per step, and the grid uses the same step coordinates.
- Every resolved note carries its `instrument` and `instProps`, so inline `inst` directives before the start need no replay. An engine test locks this in.
- The resolver drops per-channel `speed`, so all channels share one step duration.

Positions are mapped back to full-song coordinates in `PlaybackManager`:

- Per-channel note index += notes before the start step.
- Elapsed time += `startStep × stepSeconds`.
- A loop wraps on the engine's repeat period.

As a result, the transport, grid and glyphs need no remapping.

Confirmed app-core APIs:

- `PlaybackManager.play(source, { range })`, `playFrom(source, { startStep })`, `playRange(source, { startStep, endStep, loop })` and `getActiveRange()`.
- Range helpers in `packages/app-core/src/playback/playback-range.ts`.
- Session store `packages/app-core/src/stores/playback-range.store.ts` (`playbackStartStep`, `playbackLoopRange`, `playbackLoopEnabled`, `playbackRangeMode`, `getActivePlaybackLoopRange()`). `playbackLoopEnabled` mirrors the transport Loop toggle (`full-ide-setup.ts` keeps both in sync); the range only drives playback while it is on.

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
- Scheduling from a pattern boundary (resolved-song slice; engine unchanged — see design decision).
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
- Restart from `startStep` when reaching `endStep` (engine seamless repeat of the sliced song, pass length fixed to the window so trailing rests are kept).
- Pattern Grid loop overlay remains visible during playback.
- The transport Loop toggle gates the selected range: dragging a new range turns Loop on; Loop off keeps the range (dimmed) but playback ignores it.

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
6. Drag a loop range with transport Loop off, verify Loop turns on. Toggle Loop off, verify the range dims and Play runs the whole song (or from the pending start); toggle it on again, verify Play loops the range. With the loop active, click the ruler outside it: verify Loop turns off, the range dims, and the green start flag appears at the click.
7. While the whole song plays, click the ruler ahead of and then behind the playhead: verify playback jumps to each clicked block start. Pause, click elsewhere, verify playback stops with the playhead at the click and Play starts there. While the whole song plays, drag a new loop range: verify Loop turns on and playback jumps to the loop start and loops. Turn Loop off (playback continues to the end), play the whole song, turn Loop on with the transport button: verify playback jumps back into the range.

Automated coverage:

- Pattern Grid maps block click/drag x positions to expected step boundaries.
- Pending start marker persists within a session.
- Loop overlay uses the same global duration units as pattern blocks.
- `PlaybackManager` emits initial position events for non-zero start offsets.
- Range loop does not advance past `endStep` before jumping back.

---
