---
title: "Pattern Grid Seek And Loop Playback"
status: proposed
authors: ["kadraman"]
created: 2026-06-22
updated: 2026-06-22
related:
  - docs/features/desktop-client-enhancements.md
  - docs/features/complete/daw-channel-mixer.md
---

## Summary

Add DAW-style navigation controls to the Pattern Grid so users can choose where playback starts and define a loop range directly on the song timeline.

The Pattern Grid already provides a compact per-channel overview and a global playhead. This feature turns that read-only timeline into an interactive playback surface while keeping the first implementation conservative: snap to pattern or bar boundaries before attempting arbitrary step-level seeking.

---

## Goals

1. Allow users to set a pending playback start position from the Pattern Grid.
2. Allow users to define, edit, clear, and persist a loop range.
3. Keep playback, global playhead, transport time, and editor glyphs aligned after seek/loop actions.
4. Avoid breaking existing whole-song playback and `play auto repeat`.
5. Prefer pattern/bar-boundary behavior first, then expand to step-accurate behavior once engine support is reliable.

---

## Non-Goals

- Full audio scrubbing while dragging.
- Editing song structure by dragging pattern blocks.
- Per-channel independent loop ranges.
- Replacing the existing transport loop button in the first phase.
- Step-accurate seeking inside sustained notes in the first implementation.

---

## User Experience

### Set Start Position

The user can click or drag the global Pattern Grid timeline to set a pending playback start point.

Expected behavior:

1. Moving the pending start point shows the global playhead at that location while stopped.
2. Pressing Play starts from that location.
3. Pressing Stop resets the pending start point to the beginning unless a loop range is active.
4. A visible indicator distinguishes "pending start" from "currently playing".

Recommended initial snapping:

- Snap to pattern block boundaries.
- If bar metadata is available, optionally snap to bar boundaries.
- Later, allow a modifier key such as `Alt` for finer step-level placement.

### Loop Range

The user can drag a range on the Pattern Grid to create a loop region.

Expected behavior:

1. The loop region is highlighted across all rows.
2. Play starts at the loop start when a loop range is active.
3. Playback returns to the loop start when it reaches the loop end.
4. The user can drag loop start/end handles to adjust the region.
5. The user can clear the loop range from the Pattern Grid context menu, transport control, or keyboard shortcut.

Recommended initial snapping:

- Loop start and end snap to pattern boundaries.
- The loop end is exclusive: playback jumps when it reaches the start of the end boundary.
- The selected range must contain at least one pattern/block duration.

---

## Proposed Design

### Playback Model

Introduce an explicit playback range model:

```ts
interface PlaybackRange {
  startStep: number;
  endStep?: number;
  snap: 'pattern' | 'bar' | 'step';
}
```

The first implementation can keep the model in UI/app-core state, but the engine ultimately needs range-aware scheduling.

Recommended app-core concepts:

- `playbackStartStep`: pending start step when stopped.
- `playbackLoopRange`: optional `{ startStep, endStep }`.
- `playbackRangeMode`: `off | pending-start | loop`.

### Pattern Grid Mapping

Pattern Grid should continue using musical step duration for block widths. It should expose enough mapping data to convert x-coordinate to timeline position:

- `totalSteps`
- block start/end steps
- pattern name and sequence name
- channel-independent global step boundaries

The global timeline should be derived from the maximum channel duration, not row-specific pixel widths.

### Engine Scheduling

The engine currently schedules playback from the beginning of the resolved song. Seeking and loop ranges require scheduling from a non-zero offset.

Minimum engine support:

```ts
interface PlayASTOptions {
  startStep?: number;
  endStep?: number;
  loopRange?: boolean;
}
```

For pattern-boundary playback, the engine can skip full pattern ranges before `startStep`. For step-level playback, it must trim events inside patterns and preserve state.

State that must be preserved at a start offset:

- Current instrument after inline `inst` directives.
- Channel mute/solo/volume.
- Active chip/channel configuration.
- Effects attached to notes at or after the start.
- Tempo and time signature assumptions.
- Pattern/sequence metadata for tracker and editor glyphs.

---

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

## Risks And Open Questions

- **Inline instrument state:** Seeking after `inst` tokens requires reconstructing the active instrument at the start offset.
- **Sustain behavior:** Starting inside a held note may need a policy: retrigger the note, start silent until the next event, or trim the note.
- **Effects:** Some effects depend on note start time. Starting mid-note may sound different unless the engine supports effect phase offsets.
- **Loop clicks:** Hard loop boundaries may need short fades or scheduling overlap to avoid audible clicks.
- **Repeat semantics:** Selected loop ranges must not conflict with `play auto repeat` or the existing transport loop toggle.
- **Persistence:** Decide whether loop ranges are session-only, stored per document path, or encoded in song metadata.

Recommended defaults:

- Session-only loop ranges initially.
- Pattern-boundary snapping by default.
- Clear loop on file load unless the range can be safely mapped to the new song.

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

## Suggested First Slice

Implement Phase 1 only:

1. Add a Pattern Grid overlay model in app-core.
2. Add click-to-set pending start marker.
3. Add drag-to-select loop range, snapped to pattern boundaries.
4. Add clear loop action.
5. Do not change audio playback yet.

This creates the visible interaction model and validates timeline mapping before touching engine scheduling.
