---
title: "Web-lite Pattern Grid zoom and scroll"
id: 107
slug: "web-lite-pattern-grid-zoom"
status: "complete"
authors:
  - "kadraman"
created: "2026-11-06"
updated: "2026-11-09"
issue: "https://github.com/kadraman/beatbax/issues/245"
area: "web"
related:
  - "specs/complete/100-pattern-grid-zoom/spec.md"
  - "specs/complete/097-web-lite-pattern-grid/spec.md"
  - "specs/complete/014-pattern-grid-seek-and-loop/spec.md"
  - "https://github.com/kadraman/beatbax/issues/232"
  - "https://github.com/kadraman/beatbax/issues/227"
---

# Feature Specification: Web-lite Pattern Grid zoom and scroll

## Summary

Web-lite’s Pattern Grid gains the same **zoom** and **horizontal scroll** behaviour that Desktop shipped in [spec 100](../../complete/100-pattern-grid-zoom/spec.md): Auto (readable minimum from track viewport width), Zoom in / out, Zoom to Fit, pan when content overflows, and Ctrl/Cmd+wheel zoom about the pointer. Seek, loop, and playhead behaviour from [spec 014](../../complete/014-pattern-grid-seek-and-loop/spec.md) / [spec 097](../../complete/097-web-lite-pattern-grid/spec.md) remain correct at every zoom. Pure scale helpers already live in `@beatbax/app-core` (`pattern-grid-zoom`); this feature wires them into the React-free web grid only. Desktop is unchanged. No language changes.

## Problem

1. Spec 100 delivered zoom on Desktop and left web-lite out of scope.
2. Spec 097 restored the web-lite grid with seek/loop but stretch-fits the whole song to the panel width, so long songs shrink until blocks are hard to see or click.
3. Shared math already exists for reuse; web-lite has no UI chrome or scroll model that applies it.

## User scenarios

### User Story 1 — Readable default for long songs (Priority: P1)

**Why this priority**: Fixes the visualisation problem without requiring an extra click.

**Independent test**: Open a long song in web-lite at a typical browser width; blocks stay large enough to click and the grid scrolls horizontally. Widen the window; more of the song fits before scrolling.

**Acceptance scenarios**:

1. **Given** Auto zoom and a song short enough that `viewportWidth / totalSteps` is at least the readable minimum, **When** the grid renders, **Then** the song fits the track area with no horizontal scrollbar.
2. **Given** Auto zoom and a song long enough that fitting would go below the readable minimum, **When** the grid renders, **Then** the grid uses the minimum scale and the track area scrolls horizontally.
3. **Given** Auto zoom and a long song, **When** the user widens the browser (or grid host), **Then** more of the song becomes visible before scrolling.
4. **Given** Auto zoom, **When** the user loads a different song or creates a new file, **Then** zoom returns to Auto for the new song length.

### User Story 2 — Zoom to Fit and manual zoom (Priority: P1)

**Why this priority**: Users still need a whole-song overview and fine control.

**Independent test**: On a long song, Zoom to Fit shows the full arrangement; Zoom in restores readable blocks with scroll.

**Acceptance scenarios**:

1. **Given** a long song under Auto or manual zoom, **When** the user chooses Zoom to Fit, **Then** the whole song fits the track viewport even if blocks are smaller than the readable minimum.
2. **Given** any zoom mode, **When** the user Zooms in or Zooms out, **Then** the scale steps within clamped bounds and leaves Auto for an explicit scale.
3. **Given** a manual zoom or Zoom to Fit, **When** the user chooses Auto (or equivalent reset), **Then** the panel-width aware default policy applies again.
4. **Given** zoom controls in the grid chrome, **When** the user activates them, **Then** pending start and loop range (spec 014 / 097) are unchanged.

### User Story 3 — Pan, wheel zoom, and aligned overlays (Priority: P1)

**Why this priority**: Scroll and zoom must not break seeking or alignment.

**Independent test**: Zoom in, pan, set a loop and start flag; overlays and playhead stay aligned with blocks. Ctrl/Cmd+wheel zooms about the pointer.

**Acceptance scenarios**:

1. **Given** content wider than the viewport, **When** the user scrolls horizontally (scrollbar, Shift+wheel, or trackpad), **Then** ruler and channel tracks scroll together; channel label controls stay sticky.
2. **Given** the pointer over the track area, **When** the user Ctrl/Cmd+wheels, **Then** zoom changes about the step under the pointer (that step stays under the cursor when possible).
3. **Given** any zoom and scroll position, **When** the user clicks or drags the Pos ruler (start / loop / handles), **Then** snapping and transport outcomes match spec 014 / 097.
4. **Given** a loop range, start marker, or global playhead, **When** the user zooms or pans, **Then** those overlays stay pixel-aligned with the underlying steps.
5. **Given** a ruler drag that reaches the viewport edge, **When** the pointer stays near the edge, **Then** the grid autoscrolls so the drag can continue.

### Edge cases

- Empty or unparsed song: grid stays hidden; zoom state is irrelevant.
- Song shortens so content fits again under Auto: scrollbar disappears when Auto is active.
- Web-lite has no Monaco View zoom menu; Pattern Grid zoom MUST NOT invent browser-wide font zoom shortcuts that conflict with the page.
- Zoom state is session-only; clearing on file load is required.
- Compact block labels: when a block’s on-screen width is too small for text, labels hide or truncate without breaking hit targets more than today’s compact behaviour.
- Desktop section lane / section focus remain out of scope (spec 097 non-goals).

## Requirements

### Functional requirements

- **FR-001**: The web-lite Pattern Grid MUST support a scale expressed as pixels per global step, with Auto, Zoom in, Zoom out, and Zoom to Fit.
- **FR-002**: Auto MUST set scale from track viewport width `W` and song length `T` using the same policy as spec 100 / `@beatbax/app-core` `resolveAutoPxPerStep` (fit when at or above the readable minimum; otherwise minimum + horizontal scroll).
- **FR-003**: Zoom to Fit MUST force `pxPerStep = W / T` even when that is below the readable minimum (`fitPxPerStep`).
- **FR-004**: Channel mute/solo and label chrome MUST stay sticky; ruler and channel tracks MUST share one horizontal scroll position.
- **FR-005**: Playhead, loop overlay, and start marker MUST remain aligned with steps across zoom and scroll.
- **FR-006**: Spec 014 / 097 ruler gestures, snapping, seeking, and Loop gating MUST keep the same transport outcomes at every zoom.
- **FR-007**: Ctrl/Cmd+wheel MUST zoom about the pointer’s step; Shift+wheel or trackpad horizontal scrolling MUST pan when content overflows.
- **FR-008**: Zoom MUST reuse `@beatbax/app-core` helpers (`pattern-grid-zoom`) rather than duplicating the math in `apps/web-ui`.
- **FR-009**: Zoom state MUST be session-only and MUST reset to Auto when a different song is loaded or a new file is created.
- **FR-010**: Web-lite MUST remain React-free; this feature MUST NOT pull `react` / `react-dom` or the desktop Pattern Grid component into the web bundle.
- **FR-011**: Desktop Pattern Grid zoom behaviour MUST remain unchanged by this feature.
- **FR-012**: Zoom out, Auto, Fit, and Zoom in MUST expose the same hover text as Desktop (short labels for in/out; Auto and Fit explain readable scale versus fitting the whole song).
- **FR-013**: When a playback start or loop range is set, the bar under the grid MUST show the same left-side Position and Loop readout as Desktop (step numbers and clock), including a dimmed Loop chip while Loop is off.

### Non-goals

- Changing Desktop zoom (spec 100 is complete).
- Merging desktop and web-lite grid components or stylesheets.
- Vertical zoom of row heights.
- Persisting zoom into the `.bax` file or requiring cross-restart persistence.
- Desktop-only section lane, section focus, or section shortcuts.
- New language, AST, ISM, or scheduler behaviour.

## Success criteria

- **SC-001**: On a long example song at a typical browser width, Auto keeps pattern blocks clickable without Zoom to Fit, and a horizontal scrollbar (or equivalent pan) is available.
- **SC-002**: At three window widths (narrow / medium / wide), Auto shows more of the same long song as the viewport widens before scrolling.
- **SC-003**: Zoom to Fit shows the full arrangement; Zoom in after Fit restores scrollable readable blocks.
- **SC-004**: Spec 097 acceptance scenarios for seek and loop still pass after zoom/pan in Chromium, Firefox, and Safari.
- **SC-005**: Web-lite load size grows only by the grid zoom/scroll UI; no desktop-only module is pulled into the web bundle.

## Assumptions

- Spec 097 seek/loop wiring in `apps/web-ui` is available as the host for zoom (097 may still have residual QA; zoom builds on that grid).
- Global step coordinates and block percentage layout from 014 remain the source of truth; zoom only changes pixels per step.
- Readable minimum / max / step factor constants already chosen for Desktop (`DEFAULT_MIN_PX_PER_STEP` and siblings in app-core) are reused unless web QA shows a clear need to override.

## Open questions

1. **Follow playhead**: should Auto scroll keep the playhead in view during playback by default, pausing when the user pans away? Same open question as spec 100; propose: out of scope for v1 (match Desktop if Desktop has not shipped follow-playhead).
2. **Chrome placement**: put Zoom out / Auto / Fit / Zoom in on the ruler controls cell (mirroring Desktop chrome), or on a compact overflow menu for narrow widths? Propose: same four controls on the ruler chrome, collapsing visually only if the existing web layout already needs it.

## References

- [Spec 100 — Pattern Grid zoom and scroll](../../complete/100-pattern-grid-zoom/spec.md)
- [Spec 097 — Web-lite Pattern Grid](../../complete/097-web-lite-pattern-grid/spec.md)
- [Spec 014 — Pattern Grid seek and loop](../../complete/014-pattern-grid-seek-and-loop/spec.md)
- `packages/app-core/src/playback/pattern-grid-zoom.ts`
- `apps/web-ui/src/ui/pattern-grid.ts`
- GitHub issue: https://github.com/kadraman/beatbax/issues/245
