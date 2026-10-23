# Implementation Plan: Pattern Grid zoom and scroll

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-23 | **Branch**: `feat/100-pattern-grid-zoom`

## Summary

Add panel-width-aware Auto zoom plus Zoom in / out / Fit and horizontal scroll to the desktop Pattern Grid. Keep seek/loop/playhead (spec 014) correct by nesting overlays in a shared scrolled content strip and putting pure scale math in `@beatbax/app-core` for later web-lite reuse.

## Technical context

- **Packages / surfaces**: `packages/app-core`, `apps/desktop`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full (`patternGrid` capability)
- **Performance / constraints**: ResizeObserver on track viewport; avoid re-layout thrash while dragging zoom/scroll

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A (UI scale only)
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (or migration documented) — transport outcomes unchanged; zoom is view-only
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

- `packages/app-core/src/` — new pure zoom helpers (e.g. `pattern-grid-zoom.ts` or under `editor/` / `playback/` as fits existing layout)
- `packages/app-core/tests/` — unit tests for Auto/Fit/clamp/zoom-about-anchor
- `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx` — scroll shell, zoom state, controls
- `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts` — confirm pointer→step mapping against wide track rect; edge autoscroll hooks if needed
- `apps/desktop/src/renderer/src/styles.css` — sticky labels, scroller, ticks vs `pxPerStep`, compact labels by pixel width
- Optional: `packages/app-core/src/shortcuts/catalog.ts` if v1 adds grid zoom shortcuts

## Implementation

### AST changes

N/A

### Parser / grammar changes

N/A

### CLI changes

N/A

### Desktop / web UI changes

1. **app-core helpers**: `resolveAutoPxPerStep(W, T, minPx)`, `fitPxPerStep(W, T)`, `clampPxPerStep`, `contentWidth`, `zoomAboutAnchor`, optional `scrollToKeepStepVisible`.
2. **Scroll shell**: sticky label column; one `overflow-x: auto` region wrapping ruler + section lane + channel tracks; inner width = `max(W, T * pxPerStep)`; keep block flex % of `T`.
3. **Overlays**: move playhead, loop range, start marker, focus column inside scrolled content so they track without scroll-offset math.
4. **Zoom UI**: controls in ruler chrome (Zoom out / Auto or Fit / Zoom in); Ctrl/Cmd+wheel about pointer; Shift+wheel pan; do not bind Monaco View accelerators.
5. **Auto on resize / song change**: ResizeObserver on track viewport; reset to Auto on file load.
6. **Drag edge autoscroll** while adjusting start/loop past the visible range.
7. **CSS**: rebind ruler tick spacing to `pxPerStep`; compact labels when block pixel width is too small.

Web-lite UI is **not** implemented in this feature (spec 097 Future only).

### Export changes

N/A

### Documentation updates

- Brief note in desktop/user docs if a Pattern Grid section exists; otherwise skip until implementation.
- Keep `specs/STATUS.md` and 097 Future note in sync when shipping.

## Testing strategy

### Unit tests

- Auto chooses fit vs min based on `W` and `T`
- Zoom to Fit ignores min
- Clamp bounds
- Zoom-about-anchor keeps the anchored step stable

### Integration tests

- Existing `apps/desktop/tests/pattern-grid-timeline.test.ts` and app-core playback-range tests remain green
- Optional: light component/DOM test for content width > viewport when Auto scrolls

### Manual / QA

- Long song at narrow / medium / wide panel widths
- Zoom to Fit → Zoom in → pan → set loop and start; overlays aligned
- Confirm View menu font zoom still works independently

## Migration and compatibility

- Default Auto preserves today’s fit look for short songs
- No song-file format change; session-only zoom
- Spec 014 behaviour unchanged aside from view scale/scroll

## Open implementation questions

- Exact `MIN_PX_PER_STEP` (and optional max) — tune against demo songs
- Follow-playhead default on/off
- Shortcuts catalog vs buttons + wheel only for v1
