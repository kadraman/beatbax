# Tasks: Tracker pattern and sequence editor

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

Parent issue: https://github.com/kadraman/beatbax/issues/239

Implementation slices (GitHub issues under the parent):

1. Edit model + statement spans + unit tests — https://github.com/kadraman/beatbax/issues/240
2. Desktop tracker panel + Monaco sync — https://github.com/kadraman/beatbax/issues/241
3. Pattern Grid arrangement handles — https://github.com/kadraman/beatbax/issues/242
4. User-facing docs for flatten-on-edit — https://github.com/kadraman/beatbax/issues/243

## Phase 0: Foundation — edit model (blocks stories)

- [ ] T001 [P] Add read-only `pat` / `seq` / `channel` statement-span helper beside `listTopLevelDefinitions` in `packages/engine/src/parser/peggy/index.ts` and export via `packages/engine/src/parser/index.ts`
- [ ] T002 [P] Implement step projection and flat RHS serialization in `packages/app-core/src/editor/pattern-editor-model.ts` (commands: `setStep`, `setEffect`; compact-RHS detection; `:N` preserve; declaration-modifier read-only flag)
- [ ] T003 [P] Implement classic `seq` / channel clause rewrite, shared-seq detection, and flatten metadata in `packages/app-core/src/editor/sequence-editor-writeback.ts`
- [ ] T004 Unit tests in `packages/app-core/tests/pattern-editor-model.test.ts` and `packages/app-core/tests/sequence-editor-writeback.test.ts` (flat round-trip, compact flatten, seq reorder/modifiers, channel keep `inst`/`speed`/`lock`, composition read-only)
- [ ] T005 [P] Engine helper unit coverage (new or existing parser test file under `packages/engine/tests/`) for statement spans on `pat` / shorthand / `seq` / `channel`

**Checkpoint**: model + writeback tested; no Desktop UI required yet. Maps to implementation issue “Edit model”.

## Phase 1: User Story 1–2, 4–5 — Desktop tracker panel (P1/P2)

- [ ] T010 [US1] Mount tracker UI under `apps/desktop/src/renderer/src/components/panels/` (panel or split host) with step grid, effect field, `inst` markers, note palette, and zoomed cell targets
- [ ] T011 [US1] [US4] Wire `parse:success`, pattern selection (Pattern Grid + Monaco), and `applyUndoableReplace(..., 'pattern-editor', …)` in `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`; preserve selection as pattern name + step index; do not steal focus on refresh
- [ ] T012 [US2] Flatten confirmation dialog (session memory of confirm per statement); Cancel leaves source unchanged
- [ ] T013 [US5] Tracker-focused keyboard entry only; `touch-action` on grid; button equivalents for paint gestures; View / shortcut / feature flag as needed (`apps/desktop/src/renderer/src/lib/desktop-menu-bar.ts`, shortcuts catalog under `packages/app-core/src/shortcuts/` if a new command is required)
- [ ] T014 [US1] Invalid parse keeps last good model; surface existing diagnostics only

**Checkpoint**: flat pattern editable in tracker with Undo. Maps to implementation issue “Desktop tracker panel”.

## Phase 2: User Story 3 — Arrangement handles (P1)

- [ ] T020 [US3] Add grip + Move / Duplicate / Delete on `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx` without changing ruler seek/loop (014)
- [ ] T021 [US3] Call `sequence-editor-writeback` via `applyUndoableReplace(..., 'sequence-editor', …)`; keep item modifiers; shared-seq warning copy
- [ ] T022 [US3] Compact `seq` RHS flatten confirm on first structural edit; composition / `cat` / `alias` / `section` / `form` / `channel auto` lanes stay read-only with jump-to-text
- [ ] T023 [US3] Manual or e2e check that click-to-navigate and seek/loop still match 014/100

**Checkpoint**: classic seq/channel arrange edits write source. Maps to implementation issue “Pattern Grid arrangement handles”.

## Polish

- [ ] T900 [US2] Document flatten-on-edit, read-only composition and declaration-modifier cases, and tracker vs Pattern Grid roles under `docs/features/` (and index links if applicable)
- [ ] T901 Move this folder to `specs/complete/105-tracker-pattern-editor/` and update `specs/STATUS.md` when shipped

**Checkpoint**: docs issue slice. Maps to implementation issue “User-facing docs”.
