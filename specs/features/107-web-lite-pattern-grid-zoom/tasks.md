# Tasks: Web-lite Pattern Grid zoom and scroll

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Import and apply `@beatbax/app-core` zoom helpers (`resolveAutoPxPerStep`, `fitPxPerStep`, `contentWidth`, `clampPxPerStep`, `steppedPxPerStep`, `zoomAboutAnchor`) from `packages/app-core/src/playback/pattern-grid-zoom.ts` inside `apps/web-ui/src/ui/pattern-grid.ts` (export path via existing app-core playback barrel).
- [ ] T002 Introduce zoom mode state (`auto` | `fit` | `manual`) and effective `pxPerStep` in `apps/web-ui/src/ui/pattern-grid.ts`, driven by track viewport width measurement (ResizeObserver or equivalent).
- [ ] T003 [P] Add a shared horizontally scrolled content strip and sticky label chrome styles in `apps/web-ui/src/styles.css` so ruler and channel tracks share one `scrollLeft`.

**Checkpoint**: long song under Auto produces content wider than the viewport and scrolls without breaking row alignment.

## Phase 1: User Story 1 — Readable default (P1)

- [ ] T010 [US1] Layout blocks, playhead, start marker, and loop overlays from step × `pxPerStep` (or content-width percent) in `apps/web-ui/src/ui/pattern-grid.ts` so Auto matches `resolveAutoPxPerStep`.
- [ ] T011 [US1] Reset zoom mode to Auto when a different song is loaded or a new file is created (`apps/web-ui/src/ui/pattern-grid.ts` and/or `apps/web-ui/src/main.ts`).
- [ ] T012 [P] [US1] jsdom tests in `apps/web-ui/tests/` asserting Auto uses minimum scale (scrollable) for a long step count and fits a short song.

**Checkpoint**: Auto readable policy works without chrome buttons.

## Phase 2: User Story 2 — Zoom to Fit and manual zoom (P1)

- [ ] T020 [US2] Add Zoom out / Auto / Fit / Zoom in controls on the ruler chrome in `apps/web-ui/src/ui/pattern-grid.ts` with accessible labels; Fit uses `fitPxPerStep`; in/out use `steppedPxPerStep`.
- [ ] T021 [P] [US2] Style the zoom controls in `apps/web-ui/src/styles.css` (light and dark).
- [ ] T022 [US2] Confirm zoom control clicks do not clear or alter pending start/loop state; add a regression assertion in `apps/web-ui/tests/`.

**Checkpoint**: Fit and manual zoom work from chrome; Auto restores policy.

## Phase 3: User Story 3 — Pan, wheel, overlays (P1)

- [ ] T030 [US3] Ctrl/Cmd+wheel zoom about pointer via `zoomAboutAnchor` and Shift+wheel / trackpad pan in `apps/web-ui/src/ui/pattern-grid.ts`.
- [ ] T031 [US3] Autoscroll the shared strip when a ruler drag reaches the viewport edge in `apps/web-ui/src/ui/pattern-grid.ts`.
- [ ] T032 [US3] Extend `apps/web-ui/tests/pattern-grid-timeline-dom.test.ts` (or sibling) so seek/loop callbacks still receive the correct snapped steps after zoom and scroll.
- [ ] T033 [US3] Manual QA checklist note: Chromium / Firefox / Safari alignment of playhead, start flag, and loop brackets after zoom/pan (tie to remaining 097 QA if useful).

**Checkpoint**: seek/loop parity holds under zoom; wheel and pan feel match Desktop intent.

## Polish

- [ ] T900 [P] Update the Future section in `specs/features/097-web-lite-pattern-grid/spec.md` to point at this feature as the zoom follow-up (if not already).
- [ ] T901 [P] Brief user-facing Pattern Grid zoom note for web-lite under `docs/` if a Pattern Grid / web-lite doc exists.
- [ ] T902 Move this folder to `specs/complete/107-web-lite-pattern-grid-zoom/` and update `specs/STATUS.md` when shipped.
