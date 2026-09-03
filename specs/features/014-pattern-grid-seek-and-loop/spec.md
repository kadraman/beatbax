---
title: "Pattern Grid Seek And Loop Playback"
id: 14
slug: "pattern-grid-seek-and-loop"
status: "specified"
authors:
  - "kadraman"
created: "2026-06-22"
updated: "2026-09-03"
issue: "https://github.com/kadraman/beatbax/issues/190"
area: "desktop"
related:
  - "docs/features/desktop-client-enhancements.md"
  - "docs/features/complete/daw-channel-mixer.md"
  - "docs/features/complete/pattern-combination-preview.md"
  - "docs/features/song-timing-pattern-grid-inspector.md"
---
## Summary

Add DAW-style navigation controls to the Pattern Grid so users can choose where playback starts and define a loop range directly on the song timeline.

The Pattern Grid already provides a compact per-channel overview and a global playhead. This feature turns that read-only timeline into an interactive playback surface while keeping the first implementation conservative: snap to pattern or bar boundaries before attempting arbitrary step-level seeking.

### Relationship to shipped work

**[Pattern Combination Preview](complete/pattern-combination-preview.md)** (complete, issue #189) is **Phase 0** of timeline interaction — not this feature:

| Shipped today (synthetic AST) | This spec (engine seek/loop) |
| --- | --- |
| Play a **named section column** (seq-level window) on all channels | Play from **any** pending start step on the **full** song |
| Loop via transport toggle + `play auto repeat` on synthetic source | Loop via **drag-selected range** on the full timeline |
| Section focus mode (F5/F6/F8, section lane, editor highlight) | Pending start marker + loop handles on the grid |
| No engine `startStep` / `endStep` | Requires engine range-aware scheduling |

Desktop section focus may **look** like loop/seek (column highlight, playhead at section start) but it does not implement drag-to-set start, drag loop ranges, or mid-song seek on the unresolved full song. This spec remains the right long-term design for those behaviours.

Shared foundation already in app-core: [`arrangement-slice.ts`](../../packages/app-core/src/editor/arrangement-slice.ts) (`buildChannelTimelines`, step windows, `listArrangementSections`) — seek/loop UI should reuse the same global step coordinate system.

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

## Suggested First Slice

Implement Phase 1 only:

1. Add a Pattern Grid overlay model in app-core.
2. Add click-to-set pending start marker.
3. Add drag-to-select loop range, snapped to pattern boundaries.
4. Add clear loop action.
5. Do not change audio playback yet.

This creates the visible interaction model and validates timeline mapping before touching engine scheduling.
