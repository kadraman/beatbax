---
title: "Pattern Grid zoom and scroll"
id: 100
slug: "pattern-grid-zoom"
status: "planned"
authors:
  - "kadraman"
created: "2026-10-23"
updated: "2026-10-23"
issue: "https://github.com/kadraman/beatbax/issues/232"
area: "desktop"
related:
  - "specs/complete/014-pattern-grid-seek-and-loop/spec.md"
  - "specs/features/097-web-lite-pattern-grid/spec.md"
  - "specs/features/015-song-timing-pattern-grid-inspector/spec.md"
---

# Feature Specification: Pattern Grid zoom and scroll

## Summary

The desktop Pattern Grid gains **zoom** and **horizontal scroll** so long songs stay readable and clickable. By default the grid keeps a minimum readable scale based on the current track viewport width (wider panels show more of the song before scrolling). Users can Zoom in, Zoom out, Zoom to Fit (force the whole song into the panel), and return to Auto. Seek, loop, and playhead behaviour from [spec 014](../../complete/014-pattern-grid-seek-and-loop/spec.md) remain correct at every zoom. Web-lite zoom is out of scope here and noted as future work on [spec 097](../097-web-lite-pattern-grid/spec.md).

## Problem

The Pattern Grid always stretch-fits the entire song to the panel width. For long songs, pattern blocks shrink until they are hard to see or click. There is no zoom and no horizontal scroll when content does not fit.

## User scenarios

### User Story 1 — Readable default for long songs (Priority: P1)

**Why this priority**: Fixes the visualisation problem without requiring an extra click.

**Independent test**: Open a long song at a typical panel width; blocks stay large enough to click and the grid scrolls horizontally. Widen the panel; more of the song fits before scrolling.

**Acceptance scenarios**:

1. **Given** Auto zoom and a song short enough that `viewportWidth / totalSteps` is at least the readable minimum, **When** the grid renders, **Then** the song fits the track area with no horizontal scrollbar (same look as today).
2. **Given** Auto zoom and a song long enough that fitting would go below the readable minimum, **When** the grid renders, **Then** the grid uses the minimum scale and the track area scrolls horizontally.
3. **Given** Auto zoom and a long song, **When** the user widens the Pattern Grid panel, **Then** more of the song becomes visible before scrolling (panel-width aware).
4. **Given** Auto zoom, **When** the user loads a different song or creates a new file, **Then** zoom returns to Auto for the new song length.

### User Story 2 — Zoom to Fit and manual zoom (Priority: P1)

**Why this priority**: Users still need a whole-song overview and fine control.

**Independent test**: On a long song, Zoom to Fit shows the full arrangement; Zoom in restores readable blocks with scroll.

**Acceptance scenarios**:

1. **Given** a long song under Auto or manual zoom, **When** the user chooses Zoom to Fit, **Then** the whole song fits the track viewport even if blocks are smaller than the readable minimum.
2. **Given** any zoom mode, **When** the user Zooms in or Zooms out, **Then** the scale steps within clamped bounds and leaves Auto for an explicit scale.
3. **Given** a manual zoom or Zoom to Fit, **When** the user chooses Auto (or equivalent reset), **Then** the panel-width aware default policy applies again.
4. **Given** zoom controls in the grid chrome, **When** the user activates them, **Then** pending start and loop range (spec 014) are unchanged.

### User Story 3 — Pan, wheel zoom, and aligned overlays (Priority: P1)

**Why this priority**: Scroll and zoom must not break seeking or alignment.

**Independent test**: Zoom in, pan, set a loop and start flag; overlays and playhead stay aligned with blocks. Ctrl/Cmd+wheel zooms about the pointer.

**Acceptance scenarios**:

1. **Given** content wider than the viewport, **When** the user scrolls horizontally (scrollbar, Shift+wheel, or trackpad), **Then** ruler, section lane, and channel tracks scroll together; channel label controls stay sticky.
2. **Given** the pointer over the track area, **When** the user Ctrl/Cmd+wheels, **Then** zoom changes about the step under the pointer (that step stays under the cursor when possible).
3. **Given** any zoom and scroll position, **When** the user clicks or drags the Pos ruler (start / loop / handles), **Then** snapping and transport outcomes match spec 014.
4. **Given** a loop range, start marker, global playhead, or section focus column, **When** the user zooms or pans, **Then** those overlays stay pixel-aligned with the underlying steps.
5. **Given** a ruler drag that reaches the viewport edge, **When** the pointer stays near the edge, **Then** the grid autoscrolls so the drag can continue.

### Edge cases

- Empty or unparsed song: grid stays hidden; zoom state is irrelevant.
- Song shortens so content fits again under Auto: scrollbar disappears when Auto is active.
- View menu Zoom In / Out / Reset (Monaco font size) MUST remain separate; Pattern Grid MUST NOT steal `Cmd+=` / `Cmd+-` / `Cmd+0`.
- Zoom state is session-only (not written into the song or required to persist across app restarts); clearing on file load is required.
- Compact block labels: when a block’s on-screen width is too small for text, labels hide or truncate without breaking hit targets more than today’s 1-step compact behaviour.

## Requirements

### Functional requirements

- **FR-001**: The desktop Pattern Grid MUST support a scale expressed as pixels per global step, with Auto, Zoom in, Zoom out, and Zoom to Fit.
- **FR-002**: Auto MUST set scale from track viewport width `W` and song length `T` (global step total): if `W / T` is at least a defined readable minimum, fit (`pxPerStep = W / T`); otherwise use that minimum and enable horizontal scroll. Wider viewports MUST show more of the song before scrolling.
- **FR-003**: Zoom to Fit MUST force `pxPerStep = W / T` even when that is below the readable minimum.
- **FR-004**: Channel mute/solo and label chrome MUST stay sticky; ruler, section lane, and channel tracks MUST share one horizontal scroll position.
- **FR-005**: Playhead, loop overlay, start marker, and section focus column MUST remain aligned with steps across zoom and scroll.
- **FR-006**: Spec 014 ruler gestures, snapping, seeking, and Loop gating MUST keep the same transport outcomes at every zoom.
- **FR-007**: Ctrl/Cmd+wheel MUST zoom about the pointer’s step; Shift+wheel or trackpad horizontal scrolling MUST pan when content overflows.
- **FR-008**: Zoom MUST NOT reuse the View menu Monaco font-zoom accelerators.
- **FR-009**: Zoom state MUST be session-only and MUST reset to Auto when a different song is loaded or a new file is created.
- **FR-010**: Pure zoom/fit math used by the desktop grid SHOULD live in `@beatbax/app-core` so web-lite can reuse it later (see spec 097 Future note).

### Non-goals

- Implementing Pattern Grid zoom in web-lite or web-ui in this feature (documented as future on spec 097).
- Language, AST, ISM, or scheduler changes.
- Persisting zoom into the `.bax` file or requiring cross-restart persistence.
- Changing Monaco View zoom behaviour or shortcuts.
- Vertical zoom of row heights.

## Success criteria

- **SC-001**: On a long example song at a typical desktop panel width, Auto keeps pattern blocks clickable without Zoom to Fit, and a horizontal scrollbar (or equivalent pan) is available.
- **SC-002**: At three panel widths (narrow / medium / wide), Auto shows more of the same long song as the panel widens before scrolling.
- **SC-003**: Zoom to Fit shows the full arrangement; Zoom in after Fit restores scrollable readable blocks.
- **SC-004**: Spec 014 acceptance scenarios for seek and loop still pass after zoom/pan.
- **SC-005**: Unit tests cover Auto vs Fit resolution and zoom-about-anchor helpers in app-core.

## Assumptions

- Global step coordinates and block percentage layout from spec 014 remain the source of truth; zoom only changes how many pixels map to those steps.
- Desktop Pattern Grid remains the React implementation under `apps/desktop`; web-lite stays React-free.
- A single design constant (or small clamped range) defines the readable minimum pixels-per-step; exact value is chosen in implementation and tested.

## Open questions

1. **Exact `MIN_PX_PER_STEP`**: what constant (or formula) best balances clickability vs overview? Decide during implementation with a few long demo songs.
2. **Follow playhead**: should Auto scroll keep the playhead in view during playback by default, pausing when the user pans away?
3. **Optional shortcuts**: add `patternGrid.zoom*` entries to the shortcuts catalog, or ship buttons + wheel only for v1?

## References

- [Spec 014 — Pattern Grid seek and loop](../../complete/014-pattern-grid-seek-and-loop/spec.md)
- [Spec 097 — Web-lite Pattern Grid](../097-web-lite-pattern-grid/spec.md)
- [Spec 015 — Song timing / Pattern Grid inspector](../015-song-timing-pattern-grid-inspector/spec.md)
- `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx`
- `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts`
