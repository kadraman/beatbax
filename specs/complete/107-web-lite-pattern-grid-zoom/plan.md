# Implementation Plan: Web-lite Pattern Grid zoom and scroll

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-06 | **Branch**: `feat/107-web-lite-pattern-grid-zoom`

## Summary

Wire Desktop’s shipped zoom/fit math from `@beatbax/app-core` into the React-free web-lite Pattern Grid: Auto scale from viewport width, Zoom in / out / Fit chrome, shared horizontal scroll for ruler and tracks, Ctrl/Cmd+wheel about the pointer, and keep seek/loop overlays aligned. No changes to Desktop, language, or app-core zoom formulas unless a bug is found.

## Technical context

- **Packages / surfaces**: `apps/web-ui` (`pattern-grid.ts`, styles), `packages/app-core` (`pattern-grid-zoom` — reuse only)
- **Language**: TypeScript (strict), ESM; web-lite stays without React
- **Testing**: Jest / jsdom under `apps/web-ui/tests/`; manual browser QA for scroll/wheel
- **Client profile**: web-lite
- **Performance / constraints**: Avoid layout thrash on resize; do not inflate the web bundle with desktop modules

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — UI/layout only
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies — N/A
- [x] Determinism and compatibility preserved (or migration documented) — seek/loop transport outcomes unchanged; Desktop zoom unchanged
- [x] Tests planned for new behavior — Auto vs Fit application in the web grid, scroll alignment, seek still fires correct steps after zoom

**Exceptions**: none

## Project structure

- `apps/web-ui/src/ui/pattern-grid.ts` — zoom mode state, content width, scroll container, chrome buttons, wheel handlers, autoscroll during ruler drag
- `apps/web-ui/src/styles.css` — sticky labels, overflow-x on track strip, zoom control styles
- `apps/web-ui/src/main.ts` — reset zoom on song load / new file if ownership lives outside the grid class
- `apps/web-ui/tests/pattern-grid-*.test.ts` — jsdom coverage for scale application and callback coordinates
- Docs touch: short note under web-lite / Pattern Grid docs if present; update 097 Future pointer (already planned)

Reuse without rewrite:

- `packages/app-core/src/playback/pattern-grid-zoom.ts` — `resolveAutoPxPerStep`, `fitPxPerStep`, `clampPxPerStep`, `contentWidth`, `zoomAboutAnchor`, `steppedPxPerStep`, defaults

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None.

### Desktop / web UI changes

Web-lite only:

1. Measure track viewport width; compute `pxPerStep` from mode (auto / fit / manual) via app-core helpers.
2. Set inner track content width with `contentWidth`; enable `overflow-x` on a shared scrolled strip that contains ruler + channel tracks; keep label/M/S chrome sticky outside the scroll.
3. Map block/overlay positions from global steps × `pxPerStep` (or equivalent percent of content width) so overlays stay aligned.
4. Add Zoom out / Auto / Fit / Zoom in controls on the ruler chrome (match Desktop affordances; labels/titles for a11y).
5. Ctrl/Cmd+wheel → `steppedPxPerStep` + `zoomAboutAnchor`; Shift+wheel / trackpad pan when overflowing.
6. During ruler edge drags, autoscroll the shared strip.
7. Reset to Auto on different song load / new file.

Desktop Pattern Grid: no edits unless a shared app-core bug is discovered (then fix helpers once for both).

### Export changes

None.

### Documentation updates

- Point spec 097 Future at this feature folder.
- Brief user-facing note if web-lite docs mention the Pattern Grid.

## Testing strategy

### Unit tests

- Grid applies Auto vs Fit widths for a long vs short song fixture.
- After zoom, a ruler click at a known client X maps to the same snapped step as before (step math, not CSS pixels of stretch-fit).

### Integration tests

- Existing `pattern-grid-timeline-dom` seek/loop tests still pass; extend with a zoomed viewport case.

### Manual / QA

- Chromium, Firefox, Safari: long song Auto scroll, Fit, wheel zoom about pointer, seek/loop overlays aligned, dark/light themes.

## Migration and compatibility

- Existing web-lite sessions: first load with this feature behaves as Auto (same as Desktop session-only zoom).
- Desktop users: unaffected.

## Open implementation questions

- Whether follow-playhead autoscroll ships (spec open question; default no for v1).
- Whether narrow layouts need a collapsed zoom control cluster.
