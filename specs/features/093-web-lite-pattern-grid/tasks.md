# Tasks: Web-lite Pattern Grid with seek and loop

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Resolve spec Open questions 1–3 (shortcut, touch, Shift+click) and update `specs/features/093-web-lite-pattern-grid/spec.md`
- [ ] T002 Move `apps/desktop/src/renderer/src/lib/pattern-grid-timeline.ts` to `packages/app-core/src/playback/pattern-grid-timeline.ts`; update imports in `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx` and `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`
- [ ] T003 Move `apps/desktop/tests/pattern-grid-timeline.test.ts` to `packages/app-core/tests/pattern-grid-timeline.test.ts`; desktop and app-core suites green
- [ ] T004 Add the per-profile flag-gating capability in `packages/app-core/src/client-profile.ts`; set `WEB_LITE.patternGrid = true`; update `packages/app-core/src/utils/pattern-grid-panel.ts`; add capability tests

**Checkpoint**: desktop unchanged; shared logic and capability ready.

## Phase 1: User Story 1 — See the arrangement in the browser (P1)

- [ ] T010 [US1] Show the grid in web-lite and the Window menu entry: `apps/web-ui/src/app/layout.ts`, `apps/web-ui/src/ui/panels-menu.ts`, `apps/web-ui/src/main.ts`
- [ ] T011 [P] [US1] Equal-width label cells in `apps/web-ui/src/styles.css`
- [ ] T012 [US1] Update `apps/web-ui/tests/web-lite.test.ts` and `apps/web-ui/tests/panels-menu.test.ts`

**Checkpoint**: grid visible by default in web-lite; hide/show persists.

## Phase 2: User Story 2 — Choose where playback starts and seek (P1)

- [ ] T020 [US2] Ruler row, start flag, dashed start marker, idle playhead and store subscriptions in `apps/web-ui/src/ui/pattern-grid.ts`
- [ ] T021 [US2] Pointer gestures (click, flag drag) calling `onPickStart`; `✕` clear in `apps/web-ui/src/ui/pattern-grid.ts`
- [ ] T022 [US2] Wire `pickTimelineStart`, `tryPlayOverride`, Rewind/live-play routing, Stop reset, clear on load, clamp on parse in `apps/web-ui/src/main.ts`
- [ ] T023 [P] [US2] Ruler and start flag styles in `apps/web-ui/src/styles.css`
- [ ] T024 [US2] jsdom tests in `apps/web-ui/tests/pattern-grid-timeline-dom.test.ts` (click → snapped `onPickStart`)

**Checkpoint**: start flag and seek match desktop.

## Phase 3: User Story 3 — Loop part of the song (P1)

- [ ] T030 [US3] Loop bar, bracket handles, row overlay, inactive/preview states and loop drags calling `onPickLoop` in `apps/web-ui/src/ui/pattern-grid.ts`
- [ ] T031 [US3] Loop button ↔ `playbackLoopEnabled` sync and `followActiveLoop` listeners in `apps/web-ui/src/main.ts`
- [ ] T032 [P] [US3] Loop overlay, bracket handle, inactive and light-theme styles in `apps/web-ui/src/styles.css`
- [ ] T033 [US3] Extend `apps/web-ui/tests/pattern-grid-timeline-dom.test.ts` (new drag → `enableLoop: true`, handle drag → `false`, inactive class, `✕` order)

**Checkpoint**: loop range and Loop button behave as on desktop.

## Polish

- [ ] T900 Note the reversal in `specs/complete/076-desktop-first-client-split/spec.md` and `docs/features/complete/desktop-first-client-split.md`; note the app-core move in `specs/complete/014-pattern-grid-seek-and-loop/plan.md`
- [ ] T901 Manual QA scenarios 1–8 in [plan.md](plan.md#manual--qa) on Chromium, Firefox, Safari
- [ ] T902 Move this folder to `specs/complete/093-web-lite-pattern-grid/` and update `specs/STATUS.md` when shipped
