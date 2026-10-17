---
title: "Web-lite Pattern Grid with seek and loop"
id: 93
slug: "web-lite-pattern-grid"
status: "planned"
authors:
  - "kadraman"
created: "2026-10-12"
updated: "2026-10-12"
issue: "https://github.com/kadraman/beatbax/issues/227"
area: "web"
related:
  - "specs/complete/014-pattern-grid-seek-and-loop/spec.md"
  - "specs/complete/076-desktop-first-client-split/spec.md"
  - "specs/complete/079-desktop-web-ui-retirement/spec.md"
  - "specs/complete/087-pattern-combination-preview/spec.md"
---

# Feature Specification: Web-lite Pattern Grid with seek and loop

## Summary

Bring the Pattern Grid back to the browser client (`web-lite`), shown by default, with the same timeline seek and loop behaviour that ships on desktop under [spec 014](../../complete/014-pattern-grid-seek-and-loop/spec.md): a `Pos` ruler to set the playback start, DAW-style seeking during playback, and a drag-selected loop range gated by the transport Loop button. Mute/solo and click-to-navigate work as they do in the existing web grid. The desktop-only section lane and section focus stay out of scope.

This reverses one decision in [spec 076](../../complete/076-desktop-first-client-split/spec.md), which removed the pattern grid from web-lite to keep the "try it" client minimal. The grid is the quickest way to see a song's arrangement and to audition part of it, and those are exactly what a first-time user tries.

## Problem

- **No arrangement overview in the browser.** Spec 076 Phase 2 set `patternGrid: false` for web-lite. Browser users see only the editor, so they cannot see how patterns line up across channels or where playback is in the song.
- **No way to audition part of a song.** Web-lite Play always starts at the beginning. To hear the chorus a user has to wait for it, or edit the song. The Loop button only repeats the whole song.
- **The code is already there.** `apps/web-ui` still contains a `PatternGrid` component (blocks, playhead, mute/solo, click-to-navigate, Shift+click section play), and the seek/loop state and snapping live in `@beatbax/app-core`. The grid is gated off twice: by the web-lite capability, and by the "Pattern grid" experimental feature flag, which defaults off and can only be turned on from a Settings panel that web-lite does not have.
- **Behaviour must match desktop.** Users who move between web-lite and desktop should find the ruler, loop range and Loop button working the same way. Web-lite stays React-free (spec 076), so it cannot mount the desktop React grid; the shared behaviour has to be specified once and reused as framework-free logic.

## User scenarios

### User Story 1 — See the arrangement in the browser (Priority: P1)

**Why this priority**: Everything else builds on the grid being visible.

**Independent test**: Open an example song in web-lite and confirm the grid shows one row per channel, the playhead tracks playback, M/S buttons work, and clicking a block jumps the editor to that `pat`.

**Acceptance scenarios**:

1. **Given** a fresh web-lite session, **When** a song parses, **Then** the Pattern Grid shows above the editor with a `Pos` ruler and one row per channel.
2. **Given** the grid is visible, **When** the user hides it from the status bar Window menu, **Then** it hides and stays hidden after a reload; showing it again restores it.
3. **Given** a playing song, **When** the user clicks a block, **Then** the editor jumps to that `pat` definition and playback is unaffected.
4. **Given** a song, **When** the user clicks M or S on a row, **Then** that channel mutes or solos exactly as from the channel mixer.

### User Story 2 — Choose where playback starts and seek (Priority: P1)

**Why this priority**: Starting from a chosen point is the most common audition need.

**Independent test**: Click the ruler while stopped and while playing; confirm the start flag and the jump.

**Acceptance scenarios**:

1. **Given** the song is stopped, **When** the user clicks the ruler, **Then** a green start flag appears at the block boundary at or before the pointer and Play starts there.
2. **Given** the whole song is playing, **When** the user clicks the ruler ahead of or behind the playhead, **Then** playback jumps to that block start and continues to the song end.
3. **Given** playback is paused, **When** the user clicks the ruler, **Then** playback stops with the playhead at the click, and Play starts there.
4. **Given** a start flag is set and no loop is active, **When** the user presses Stop, **Then** the flag returns to the beginning.

### User Story 3 — Loop part of the song (Priority: P1)

**Why this priority**: Looping a section while editing it is the core reason to use the grid for audition.

**Independent test**: Drag a range on the ruler, toggle Loop, edit the range while it plays.

**Acceptance scenarios**:

1. **Given** Loop is off, **When** the user drags across the ruler, **Then** a loop range covering every block touched is drawn across all rows and Loop turns on.
2. **Given** an active loop range, **When** the user presses Play, **Then** the range plays and repeats seamlessly until Stop.
3. **Given** the whole song is playing, **When** the user drags a new range or turns Loop on, **Then** playback jumps to the loop start and loops.
4. **Given** a loop range, **When** the user turns Loop off, **Then** the range dims, stays selected, and Play ignores it; if it was playing, playback continues to the song end from the start flag, else from the old loop start.
5. **Given** an active loop range, **When** the user clicks the ruler, **Then** Loop turns off and the start flag is set at the click (seeking if playing).
6. **Given** a loop range, **When** the user drags a bracket handle or presses `✕`, **Then** that edge moves (keeping at least one block) or the range clears.

### Edge cases

- A file is loaded or a new song is created: the start flag and loop range clear.
- An edit shortens the song so the range or flag no longer fits: that state is dropped.
- A song contains no channels or fails to parse: the grid is hidden, as on desktop.
- A snap point from one row falls inside another row's block: every channel starts at that exact step; a note held across it stays silent until that channel's next event (spec 014 behaviour).
- Shift+click section playback is running and the user clicks or drags the ruler: the section preview ends and the full song plays from the pick or loops the new range.
- The song's `play repeat` turns Loop on: any selected range becomes active, the same as pressing the Loop button.
- Narrow windows: the grid stays usable at the narrowest width web-lite supports today; label cells and tracks stay aligned.

## Requirements

### Functional requirements

- **FR-001**: The web-lite client MUST show the Pattern Grid by default when a song has parsed, and MUST let the user hide or show it from the status bar Window (panels) menu. The choice MUST persist across reloads. Web-lite has no Settings panel, so the grid MUST NOT depend on the "Pattern grid" experimental feature flag there; desktop keeps that flag and its default unchanged.
- **FR-002**: The grid MUST show a `Pos` ruler row above the channel rows, and one row per channel with M/S buttons, a channel-colour dot, and pattern blocks sized by step count. Every row's label cell MUST have the same width so all tracks, overlays and the playhead line up.
- **FR-003**: Clicking a pattern block MUST navigate the editor to that `pat`; Shift+click (or Shift+Enter) MUST play that section as today. M/S MUST mute/solo through the shared channel store.
- **FR-004**: Ruler gestures, snapping, and the start flag MUST behave as in spec 014 § Implemented Behaviour: click sets the start (block boundary at or before the pointer, never the song end); dragging the flag moves it to the nearest boundary; dragging across the ruler creates a loop range covering every touched block; dragging a bracket handle moves that edge keeping at least one block; `✕` clears the loop range, else the start flag. There MUST be no ruler context menu.
- **FR-005**: The loop range MUST be gated by the transport Loop button exactly as in spec 014 § Transport Loop toggle: a new drag turns Loop on; Loop off dims the range and Play ignores it; running playback follows the active range (Loop on or a range edit jumps into it; Loop off or clearing continues to the song end from the start flag, else the old loop start). Paused playback is not moved by Loop changes.
- **FR-006**: Seeking MUST behave as in spec 014 § Seeking: a start pick or loop drag while playing moves playback there; while paused it stops at the pick; while stopped it only updates state. A ruler click while a loop is active turns Loop off. Shift+click section playback takes the place of desktop section focus: a ruler pick during it plays the full song from the pick.
- **FR-007**: Play precedence MUST be: active loop range, then start flag, then whole song. Rewind and live-play restarts MUST follow the same order. Stop MUST reset the start flag unless a loop range is active. While stopped the playhead MUST rest at the active loop start, else the start flag, else step 0.
- **FR-008**: Loop range brackets, the dimmed inactive range, the start flag and the start marker MUST match desktop visually (bracket handles flush with the range edges, aligned with the overlay edges across the rows), in both light and dark themes.
- **FR-009**: Start and loop state MUST be session-only (not written to the song or storage) and MUST clear when a different song is loaded.
- **FR-010**: Web-lite and desktop MUST produce the same transport outcome for the same sequence of grid and transport actions on the same song.

### Non-goals

- The `SEQ` section lane, section focus, F5/F6/F8 section shortcuts, and the editor section highlight (desktop only, spec 087).
- Step-accurate seek inside a pattern (spec 014 Phase 4). Web-lite picks it up when that phase ships.
- Persisting start/loop state, or encoding it in the song.
- Merging the desktop and web-lite grid components or stylesheets. Sharing the desktop React component was considered (one implementation, no duplicated alignment and gesture code) and rejected to keep React and react-dom out of the web-lite bundle.
- Restoring any other feature spec 076 removed from web-lite (export, Copilot, channel mixer host, advanced editor, MIDI step entry).

## Success criteria

- **SC-001**: In a fresh web-lite session (empty localStorage), an example song shows the grid with no setting change, and hiding it from the Window menu persists across a reload.
- **SC-002**: Every acceptance scenario in User Stories 2 and 3 passes in web-lite on Chromium, Firefox and Safari.
- **SC-003**: For the scripted action sequences in the shared timeline tests, web-lite and desktop call the playback manager identically (same method, same range) — no client-specific branches in the shared logic.
- **SC-004**: Ruler brackets and row overlays line up to the pixel at three window widths in both themes (manual QA screenshots).
- **SC-005**: Web-lite load size grows by no more than the grid code and styles; no desktop-only module is pulled into the web bundle.

## Assumptions

- The shared seek/loop logic currently in `apps/desktop` can move to `@beatbax/app-core` without desktop behaviour changes (it only uses app-core stores and `PlaybackManager`).
- `PlaybackManager.playFrom` / `playRange` work the same in the browser build as on desktop (same engine and Web Audio path).
- The web-lite status bar Window menu already has a Pattern Grid entry that is hidden only by the capability gate.
- Desktop's "Pattern grid" feature flag stays as it is; this spec does not change desktop defaults.

## Open questions

1. **Keyboard shortcut.** Desktop toggles the grid with `view.togglePatternGrid`. Should web-lite get a shortcut, given browser shortcut conflicts, or only the Window menu toggle?
2. **Touch input.** Should ruler click/drag be required to work with touch (tablets), which needs the ruler to stop page scrolling during a drag? This spec assumes mouse/trackpad; touch can follow.
3. **Shift+click section play.** Keep it in web-lite as today, or drop it now that the loop range covers auditioning a section?

## References

- [Spec 014 — Pattern Grid seek and loop](../../complete/014-pattern-grid-seek-and-loop/spec.md) (behaviour this spec mirrors)
- [Spec 076 — Desktop-first client split](../../complete/076-desktop-first-client-split/spec.md) (removed the grid from web-lite; partly reversed here)
- [Spec 079 — Desktop web-ui retirement](../../complete/079-desktop-web-ui-retirement/spec.md) (separate UI implementations)
- [Spec 087 — Pattern combination preview](../../complete/087-pattern-combination-preview/spec.md) (Shift+click section play, desktop section focus)
- `apps/web-ui/src/ui/pattern-grid.ts`, `packages/app-core/src/stores/playback-range.store.ts`
