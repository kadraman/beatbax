# Tasks: Pattern Grid zoom and scroll

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 [P] Add pure zoom helpers in `packages/app-core/src/` (e.g. `pattern-grid-zoom.ts`): `resolveAutoPxPerStep`, `fitPxPerStep`, `clampPxPerStep`, `contentWidth`, `zoomAboutAnchor`
- [ ] T002 [P] Unit tests for those helpers in `packages/app-core/tests/` (Auto vs Fit, clamp, anchor)
- [ ] T003 Export helpers from the app-core package entry used by desktop (match existing export style)

**Checkpoint**: foundation complete before user-story work.

## Phase 1: User Story 1 — Readable default for long songs (P1)

- [ ] T010 [US1] Restructure `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx`: sticky label column + shared horizontal scroller; content width from `contentWidth(W, T, pxPerStep)`
- [ ] T011 [US1] Wire Auto mode: measure track viewport `W`, apply `resolveAutoPxPerStep` on song change and ResizeObserver
- [ ] T012 [US1] Reset zoom to Auto on file load / new song in desktop workspace wiring that owns the grid
- [ ] T013 [US1] Update `apps/desktop/src/renderer/src/styles.css` for scroller, sticky labels, overflow (replace clip-only `.bb-pgrid` behaviour)

**Checkpoint**: long song Auto-scrolls; short song still fits.

## Phase 2: User Story 2 — Zoom to Fit and manual zoom (P1)

- [ ] T020 [US2] Add Zoom in / Zoom out / Zoom to Fit / Auto controls in the grid ruler chrome (`DesktopPatternGrid.tsx` + `styles.css`)
- [ ] T021 [US2] Manual zoom leaves Auto; Fit forces `fitPxPerStep`; Auto re-applies FR-002 policy
- [ ] T022 [US2] Ensure pending start/loop (playback-range store) are unchanged by zoom actions

**Checkpoint**: Fit overview and manual zoom work without breaking seek/loop state.

## Phase 3: User Story 3 — Pan, wheel, overlays (P1)

- [ ] T030 [US3] Move playhead, loop overlay, start marker, and focus column inside scrolled content in `DesktopPatternGrid.tsx`
- [ ] T031 [US3] Confirm `stepFromClientX` / ruler gestures in `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts` against the wide track rect
- [ ] T032 [US3] Ctrl/Cmd+wheel zoom-about-pointer; Shift+wheel / trackpad pan
- [ ] T033 [US3] Edge autoscroll while dragging start/loop handles past the viewport
- [ ] T034 [US3] Rebind ruler tick spacing and compact labels to pixel width in `styles.css`
- [ ] T035 [US3] Do not bind Monaco View `Cmd+=` / `Cmd+-` / `Cmd+0` to grid zoom

**Checkpoint**: overlays stay aligned; 014 gestures work while zoomed/panned.

## Polish

- [ ] T900 [P] Optional: follow-playhead while playing (resolve open question 2) in `DesktopPatternGrid.tsx`
- [ ] T901 [P] Optional: `patternGrid.zoom*` shortcuts in `packages/app-core/src/shortcuts/catalog.ts` (open question 3)
- [ ] T902 Keep `apps/desktop/tests/pattern-grid-timeline.test.ts` and playback-range tests green; add coverage if gesture math changes
- [ ] T903 Manual QA: long song at three panel widths; Fit → zoom in → loop/start; View menu font zoom still independent
- [ ] T904 Amend user-facing docs under `docs/` only if a Pattern Grid help section exists
- [ ] T905 Move this folder to `specs/complete/100-pattern-grid-zoom/` and update `specs/STATUS.md` when shipped
