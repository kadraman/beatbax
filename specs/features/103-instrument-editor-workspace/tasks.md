# Tasks: Instrument Editor workspace

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T001 Author `specs/features/103-instrument-editor-workspace/{spec,plan,tasks}.md`, restore/complete 098–099, restore 100, mark 101/102 superseded in `specs/STATUS.md`, file umbrella issue and link related #233 / #234
- [x] T002 [P] Add optional `nav?: string` on field/macro defs in `packages/engine/src/chips/types.ts`
- [x] T003 [P] Add nav-visibility / section-list helper in `packages/app-core/src/editor/instrument-editor-schema.ts` + unit tests in `packages/app-core/tests/`
- [x] T004 [P] Add `parseSubPatternRow` (inverse of format) in `packages/app-core/src/editor/subpat-format.ts` (or sibling) + round-trip tests in `packages/app-core/tests/subpat-format.test.ts`
- [x] T005 Extend `packages/app-core/src/editor/instrument-editor-writeback.ts`: subpat block extent, `replaceSubpatBlock`, `insertSubpatBlock`; set/clear `subpat=` via existing `replaceInstLine`; tests in `packages/app-core/tests/`
- [ ] T006 [P] Add song-dir relative path helper (absolute → `local:` remainder; reject `..` / outside / missing song path) in `packages/app-core/src/editor/` (e.g. `instrument-sample-path.ts`) + unit tests
- [ ] T007 [P] Extend NES `packages/engine/src/chips/nes/validate.ts` to reject unknown `@nes/<name>` against bundled kit keys; tests in `packages/engine/tests/nes/`
- [x] T008 Ensure draft fingerprint includes `subpat` name + rows in `packages/app-core/src/editor/instrument-editor-draft.ts`

**Checkpoint**: schema helpers, subpat writeback, sample path helper, NES validate green under `npm test`.

## Phase 1: User Story 1 — Modal shell (P1)

- [x] T010 [US1] Body-mounted modal host for Instrument Editor (open/close/dispose) patterned on `apps/desktop/src/renderer/src/components/panels/DesktopSettingsModal.tsx`; styles in `apps/desktop/src/renderer/src/styles.css`
- [x] T011 [US1] Refactor `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` into header + left nav + one section pane; omit empty sections via T003 helper
- [x] T012 [US1] Remove Instruments from `apps/desktop/src/renderer/src/components/shell/tabs.ts`; stop mounting into right pane in `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`; fall back `ui.activeRightTab === 'instruments'`
- [x] T013 [US1] Rewire View / Panels / shortcuts (`menu-bar.ts`, `panels-menu.ts`, `register-shortcuts.ts`, `setup-desktop-monaco-shortcuts.ts`) and `instrument-editor:open` to modal open/close; update `panel.instrument-editor` / `shouldShowInstrumentEditor` semantics in `packages/app-core/src/utils/instrument-editor-panel.ts` and settings store usage
- [x] T014 [US1] Gate preview keys in `apps/desktop/src/renderer/src/lib/instrument-editor-keys.ts` and MIDI audition in `desktop-workspace.ts` on modal open; update `apps/desktop/tests/instrument-editor-keys.test.ts` and `apps/desktop/tests/menu.test.ts`
- [x] T015 [US1] Dirty-close guard (099) before modal dismiss; center rename/dirty dialogs on modal
- [x] T016 [US1] Update Features copy in `apps/desktop/src/renderer/src/components/settings/features.tsx`

**Checkpoint**: Flag on → open modal from shortcut/CodeLens; no Instruments right tab; preview keys only while modal open.

## Phase 2: User Story 2 — Toolbar picker (P1)

- [x] T020 [US2] Instrument `<select>` + Edit in `apps/desktop/src/renderer/src/components/workspace/DesktopToolbar.tsx` (flag + `advancedEditor` gated)
- [x] T021 [US2] Sync names/selection from parse AST / event bus; select → reveal without caret steal (`instrument-editor-nav.ts`); Edit → `instrument-editor:open`

**Checkpoint**: Select name while typing in Monaco; Edit opens modal on that inst.

## Phase 3: User Story 4 — Subpat rows (P1)

- [x] T030 [US4] Subpattern section UI (row list, Add/Remove, Create/Attach/Detach, shared-use note, go-to-source) in `DesktopInstrumentEditor.tsx` + styles
- [x] T031 [US4] Wire Live/Apply path for `subpat` block + `inst` `subpat=` through draft helpers
- [x] T032 [US4] Write-valid-only invalid cells; empty-row guard

**Checkpoint**: Create/edit/Detach on `songs/gameboy/instruments/gb_subpattern_macro_demo.bax`.

## Phase 4: User Story 5 — Sample Browse + Check (P1)

- [ ] T040 [US5] Ensure Desktop open-file supports DMC filters (`apps/desktop/src/main/ipc-handlers.ts`, preload, `apps/desktop/src/shared/electron-api.ts` as needed)
- [ ] T041 [US5] Browse… + Check + status on sample field in `DesktopInstrumentEditor.tsx`; resolve via chip `resolveSampleAsset` / IPC
- [ ] T042 [US5] Align kit lists in `packages/engine/src/chips/nes/ui-contributions.ts` and `songWizard.ts` with `dmcSamples.ts`

**Checkpoint**: Browse/Check on `songs/nes/instruments/nes_dmc_demo.bax`; blocked host shows remediation.

## Phase 5: User Story 3 — Regression polish

- [ ] T050 [US3] Confirm Live/Apply, imported copy-into-song, 098 preview modes, CodeLens Edit still open modal
- [ ] T051 [P] Unit coverage gaps for nav helper / writeback / sample path already green under `npm test`

## Polish

- [ ] T900 Update `docs/grammar/instruments.md` (modal workspace, toolbar picker, `subpat` editing)
- [ ] T901 Note Browse + Check in `docs/chips/nes/composition_guide.md`
- [ ] T902 Amend Future Enhancements in `specs/complete/021-instrument-editor-panel/spec.md` (workspace 103; single-column subpat + Browse/Check absorbed; multi-column tracker still future)
- [ ] T903 Manual QA: GB subpat demo + NES DMC demo + toolbar/CodeLens/Escape dirty close
- [ ] T904 Move this folder to `specs/complete/103-instrument-editor-workspace/` and update `specs/STATUS.md` when shipped
