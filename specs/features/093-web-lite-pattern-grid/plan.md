# Implementation Plan: Web-lite Pattern Grid with seek and loop

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-12 | **Branch**: `feat/093-web-lite-pattern-grid`

## Summary

Turn the existing web-ui `PatternGrid` back on for web-lite and give it the spec 014 ruler, seek and loop behaviour. The behaviour logic already exists on desktop as pure functions over app-core stores and `PlaybackManager`; move it into `@beatbax/app-core` so both clients call the same code, then build the web DOM for the ruler, overlays and bracket handles in `apps/web-ui`. The desktop React component is not reused: web-lite stays React-free (spec 076), so only framework-free logic is shared (see spec Non-goals).

## Technical context

- **Packages / surfaces**: `packages/app-core` (shared timeline logic, client capabilities, pattern grid visibility rule), `apps/web-ui` (grid DOM, wiring, styles), `apps/desktop` (import path change only)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (app-core unit tests; web-ui jsdom tests)
- **Client profile**: web-lite (desktop-full unchanged in behaviour)
- **Performance / constraints**: no per-frame layout reads beyond what the web grid already caches for the playhead; no desktop-only modules in the web bundle

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — UI/transport only; behaviour mirrors spec 014.
- [x] AST / ISM / scheduler / expansion impact identified — none. Range playback reuses the existing `PlaybackManager.playFrom` / `playRange` (resolved-song slice, spec 014 plan).
- [x] Plugins remain isolated; core does not gain plugin dependencies — no plugin code touched.
- [x] Determinism and compatibility preserved — desktop behaviour unchanged (shared logic moves verbatim, desktop tests move with it); web-lite gains a panel; no song or storage format change.
- [x] Tests planned for new behavior — see Testing strategy.
- [x] Client boundaries (VIII) — shared logic in app-core uses no DOM or Node APIs; web and desktop keep separate UI components and stylesheets; no React in web-lite (spec 076).

**Exceptions**: none.

## Project structure

```
packages/app-core/src/
  client-profile.ts                      # web-lite patternGrid: true; flag gating per profile
  utils/pattern-grid-panel.ts            # visibility rule honours the per-profile flag gating
  playback/pattern-grid-timeline.ts      # NEW (moved from apps/desktop): gestures, snapping helpers,
                                         #   idle playhead, tryPlayRequestedRange, pickTimelineStart,
                                         #   pickTimelineLoop, followActiveLoop, TimelinePickDeps
  shortcuts/catalog.ts                   # only if Open question 1 resolves to a web-lite shortcut
packages/app-core/tests/
  pattern-grid-timeline.test.ts          # NEW (moved from apps/desktop/tests)
apps/desktop/src/renderer/src/
  lib/pattern-grid-timeline.ts           # REMOVED (re-export or direct app-core imports)
  components/panels/DesktopPatternGrid.tsx, lib/desktop-workspace.ts  # import path only
apps/web-ui/src/
  ui/pattern-grid.ts                     # ruler row, overlays, start flag/marker, bracket handles,
                                         #   pointer gestures, store subscriptions, idle playhead
  main.ts                                # pick handlers, Play/Rewind/live routing, Stop reset,
                                         #   Loop button ↔ playbackLoopEnabled, followActiveLoop,
                                         #   clear on song load, clamp on parse
  styles.css                             # ruler/loop/bracket styles; equal label-cell widths
apps/web-ui/tests/
  web-lite.test.ts, panels-menu.test.ts  # capability and Window menu expectations
  pattern-grid-timeline-dom.test.ts      # NEW jsdom tests for the web ruler
```

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None.

### Desktop / web UI changes

**1. Shared timeline logic → app-core.** Move `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts` to `packages/app-core/src/playback/pattern-grid-timeline.ts` unchanged. Desktop imports from `@beatbax/app-core/playback/pattern-grid-timeline`. The section-focus hook stays a dependency (`exitSectionFocus`, `isSectionFocusActive`); web passes functions that end Shift+click section playback / report it.

**2. Capability and visibility.**
- `WEB_LITE.patternGrid = true`.
- Add a capability that says whether the grid is behind the experimental flag (desktop: yes, web-lite: no). `isPatternGridAllowed` checks it; `shouldShowPatternGrid` keeps the `panel.pattern-grid` preference so the Window menu toggle persists.
- The status bar Window menu (`apps/web-ui/src/ui/panels-menu.ts`) shows the Pattern Grid entry once the capability is on.

**3. Web grid DOM (`apps/web-ui/src/ui/pattern-grid.ts`).** Keep the class-based, imperative style of the file.
- Add a `Pos` ruler row first (label cell with `✕`, spacer dot, ruler track) using the same global step scale as the blocks.
- Add overlays in the rows wrapper: loop range (with inactive/preview classes) and dashed start marker, positioned from the first channel track like the existing playhead.
- On the ruler: loop bar with start/end bracket handles, and the green start flag.
- Pointer handling mirrors desktop: pointer capture on the ruler, 4px drag threshold, live preview while dragging, `resolveTimelineGesture` on release, then `onPickStart(step)` / `onPickLoop(loop, enableLoop)` callbacks.
- Subscribe to `playbackStartStep`, `playbackLoopRange`, `playbackLoopEnabled`; re-render the ruler/overlays and rest the playhead with `idlePlayheadStep` while stopped.
- Every row's label cell gets one fixed width.

**4. Web wiring (`apps/web-ui/src/main.ts`).**
- `TransportControls` gets `tryPlayOverride: () => tryPlayRequestedRange(playbackManager, getSource)`; Rewind and live-play restarts use the same override.
- Stop button: reset the start flag unless `getActivePlaybackLoopRange()`.
- `_applyLoopMode` also sets `playbackLoopEnabled`; a `playbackLoopEnabled.listen` turns the Loop button on/off when the grid changes it (sets `_loopUserOverride`).
- `playbackLoopRange.listen` and `playbackLoopEnabled.listen` call `followActiveLoop`.
- Grid callbacks: `onPickStart` → `pickTimelineStart`, `onPickLoop` → `pickTimelineLoop`, with deps built from `playbackManager`, `getSource`, and the Shift+click section-play state.
- Song load clears range state (`clearPlaybackRange`); successful parse clamps it (`clampPlaybackRangeToSong(songStepCount(song))`).

**5. Styles (`apps/web-ui/src/styles.css`).** Port the desktop ruler, loop overlay, start flag/marker, bracket handle (`::before` edge line + `::after` tab, `currentColor`), inactive (`opacity`) and light-theme rules. No shared stylesheet; desktop styles are not imported into web-lite.

### Export changes

None.

### Documentation updates

- `specs/complete/076-desktop-first-client-split/spec.md`: note that spec 093 restores the pattern grid to web-lite.
- `docs/features/complete/desktop-first-client-split.md`: same note in the web-lite feature table.
- `specs/features/014-pattern-grid-seek-and-loop/plan.md`: shared logic now lives in app-core.

## Testing strategy

### Unit tests

- Move `apps/desktop/tests/pattern-grid-timeline.test.ts` to `packages/app-core/tests/pattern-grid-timeline.test.ts` (gestures, snapping, idle playhead, Play routing, `pickTimelineStart`, `pickTimelineLoop`, `followActiveLoop`). These are the shared behaviour contract for SC-003.
- `packages/app-core` capability tests: web-lite grid allowed without the flag; desktop still requires it.

### Integration tests

- `apps/web-ui/tests/pattern-grid-timeline-dom.test.ts` (jsdom): ruler row renders; click calls `onPickStart` with the snapped step; drag calls `onPickLoop(loop, true)`; handle drag calls `onPickLoop(loop, false)`; inactive class when Loop is off; `✕` clears loop then start; label cells share a width class.
- `apps/web-ui/tests/web-lite.test.ts`: `caps.patternGrid === true`.
- `apps/web-ui/tests/panels-menu.test.ts`: Window menu contains `pattern-grid`.

### Manual / QA

Web-lite on Chromium, Firefox and Safari, light and dark themes:

1. Fresh profile (clear site data): load an example song; grid visible. Hide from Window menu, reload, still hidden; show again.
2. Click the ruler while stopped, Play starts there; Stop returns to the beginning.
3. While playing, click ahead of and behind the playhead; playback jumps each time. Pause, click, playback stops at the click.
4. Drag a range with Loop off; Loop turns on; Play loops it. Drag a handle while looping; restarts on the new range.
5. Turn Loop off while looping; range dims, playback continues to the end. Play the whole song, turn Loop on; jumps into the range.
6. With a loop active, click the ruler; Loop turns off and the flag appears.
7. Shift+click a block to play a section, then click the ruler; the full song plays from the click.
8. Check bracket/overlay alignment at three window widths.

## Migration and compatibility

- No song, AST or storage format change. Web-lite users with an old `panel.pattern-grid = "false"` value keep the grid hidden (the preference is honoured).
- Desktop behaviour is unchanged; only import paths move.

## Open implementation questions

- Whether to keep `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts` as a thin re-export for one release or update imports directly (prefer direct imports).
- Name of the new capability field (e.g. `patternGridBehindFlag`).
