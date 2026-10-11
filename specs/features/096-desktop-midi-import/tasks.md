# Tasks: Desktop MIDI import

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Resolve OQ-1 and OQ-2 with the maintainer
- [ ] T002 [P] Export `SUPPORTED_MIDI_IMPORT_CHIPS` from `packages/engine/src/import/midi/config.ts` / `index.ts` (FR-012)
- [ ] T003 [P] `packages/app-core/src/import/midi-import-options.ts`: `companionConfigName`, `resolveMidiDialogFields`, `buildMidiConvertArgs`, `nextRememberedValues`; tests in `packages/app-core/tests/midi-import-options.test.ts` for the FR-022 source order (user → config → remembered → default), remembered chip vs config chip, remembered quantize vs config quantize, config cleared, memory never holding config values or title, and CLI parity on `f03-nes-kit` (FR-010, FR-011, FR-021, FR-022, SC-002)

## Phase 1: User Story 1 — Import without a config (P1)

- [ ] T010 [US1] Main-process `chooseMidiFile` in `apps/desktop/src/main/ipc-handlers.ts`, preload bridge, `apps/desktop/src/shared/electron-api.ts` types (FR-002, FR-004)
- [ ] T011 [US1] Menu items in `apps/desktop/src/main/menu.ts` and `apps/desktop/src/renderer/src/components/shell/menu-bar.ts` (FR-001)
- [ ] T012 [US1] `MidiImportDialog.tsx`: chip, options, Import / Cancel, inline errors; field values and "from config" / "last used" labels from `resolveMidiDialogFields`; session memory in `App.tsx` updated with `nextRememberedValues` on success (FR-020, FR-021, FR-022, FR-032)
- [ ] T013 [US1] `apps/desktop/src/renderer/src/App.tsx` handler: open as unsaved `<base>.bax`, Output summary and diagnostics (FR-030, FR-031)

## Phase 2: User Story 2 — Companion config (P1)

- [ ] T020 [US2] Sibling `.import.json` detection in `chooseMidiFile`; `chooseImportConfigFile` for Browse… (FR-002, FR-003)
- [ ] T021 [US2] Dialog config field: detected label, Browse…, Clear, parse errors; fields recomputed when the config changes (US2 scenarios 5, 7, 8; FR-022)

## Phase 3: User Story 3 — Inspect (P3)

- [ ] T030 [US3] "Tracks" section using `inspectMidiBytes`

## Phase 4: End-to-end

- [ ] T040 `apps/desktop/tests/e2e/midi-import.spec.ts`: no config, explicit config, auto-detected, detected then cleared/replaced, bad config (SC-001); a second import where the remembered chip or quantize meets an auto-detected config that sets it (config wins and is labelled) and one that does not (remembered value used)

## Polish

- [ ] T900 [P] `docs/features/midi-importer.md` Desktop section; Desktop help (SC-003)
- [ ] T901 [P] Packaged-build QA rows in `docs/qa/desktop-release-qa.md`
- [ ] T902 Run `npm test`; move this folder to `specs/complete/096-desktop-midi-import/` and update `specs/STATUS.md` when shipped
