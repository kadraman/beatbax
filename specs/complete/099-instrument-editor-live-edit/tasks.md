# Tasks: Instrument editor Live edit vs Apply

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Spec / foundation

- [x] T001 Author `specs/features/099-instrument-editor-live-edit/{spec,plan,tasks}.md` and STATUS entry (issue 230)
- [x] T002 Add draft helpers in `packages/app-core/src/editor/instrument-editor-draft.ts`
- [x] T003 Add `StorageKey.INSTRUMENT_EDITOR_LIVE_EDIT` in `packages/app-core/src/utils/local-storage.ts`

## Phase 1: Panel write path + preview

- [x] T010 Split draft vs `commitToSource` in `DesktopInstrumentEditor.tsx`; persist Live preference
- [x] T011 Dirty-aware `parse:success` / `setAst`; draft `instPatch` on audition; hit timing uses patched inst in `codelens-preview.ts`
- [x] T012 Toolbar Live toggle + Apply / Revert + dirty dialog + styles

## Phase 2: Tests / docs

- [x] T020 Unit tests in `packages/app-core/tests/` for draft helpers
- [x] T021 Brief note in `docs/grammar/instrument-note-mapping-guide.md` or instrument editor help if present
