# Tasks: Instrument editor Game Boy subpat row editor

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 0: Foundation (blocks stories)

- [x] T001 Author `specs/features/101-instrument-editor-subpat-rows/{spec,plan,tasks}.md` and STATUS entry (issue 233)
- [ ] T002 [P] Add `parseSubPatternRow` (inverse of format) in `packages/app-core/src/editor/subpat-format.ts` (or sibling) + round-trip tests in `packages/app-core/tests/subpat-format.test.ts`
- [ ] T003 Extend `packages/app-core/src/editor/instrument-editor-writeback.ts`: subpat block extent, `replaceSubpatBlock`, `insertSubpatBlock`; reuse `findSubpatLineIndex` / `replaceInstLine`
- [ ] T004 Unit tests in `packages/app-core/tests/instrument-editor.test.ts` (or new `instrument-editor-subpat-writeback.test.ts`) for insert/replace/set-clear `subpat=` without deleting the block

**Checkpoint**: format/parse + writeback helpers green under `npm test` before UI.

## Phase 1: User Story 1 — Edit rows (P1)

- [ ] T010 [US1] Wire draft `subpatRows` + Live/Apply path in `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` (respect `packages/app-core/src/editor/instrument-editor-draft.ts`)
- [ ] T011 [US1] Single-column row list UI (index, text cell, remove, add) + styles in `apps/desktop/src/renderer/src/styles.css`
- [ ] T012 [US1] Write-valid-only: invalid cell shows panel error and does not call writeback

**Checkpoint**: Edit existing `subpat` on demo song with Live on/off.

## Phase 2: User Stories 2–4 — Create / Attach / Detach (P1)

- [ ] T020 [US2] Create: unique name + insert starter block + set `subpat=` on inst (writeback helpers + panel control)
- [ ] T021 [US3] Attach: picker of song-local `ast.subpatterns` keys; set `subpat=` and load rows
- [ ] T022 [US4] Detach: clear `subpat=` on inst; leave `subpat` block; unlock macros UI
- [ ] T023 [US2–US4] Dirty navigation / Apply consistency with 099 for Create / Attach / Detach

**Checkpoint**: Full lifecycle on a local noise/pulse instrument without hand-editing source.

## Phase 3: User Story 5 — Shared note (P2)

- [ ] T030 [US5] Non-blocking “Also used by N instruments” note when other local insts share `subpat=`

## Polish

- [ ] T900 Update `docs/grammar/instruments.md` (Instrument Editor can edit `subpat` rows; Create/Attach/Detach)
- [ ] T901 Amend Future Enhancements in `specs/complete/021-instrument-editor-panel/spec.md` (101 single-column shipped; multi-column still future)
- [ ] T902 Manual QA on `songs/gameboy/instruments/gb_subpattern_macro_demo.bax`
- [ ] T903 Move this folder to `specs/complete/101-instrument-editor-subpat-rows/` and update `specs/STATUS.md` when shipped
