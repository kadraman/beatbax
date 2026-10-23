# Tasks: Instrument editor preview pitch by type

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 0: Foundation (blocks stories)

- [x] T001 Extend `ChipInstrumentTypeDef` / `ChipPlugin` in `packages/engine/src/chips/types.ts` (`previewMode`, `previewOctave`, `bundledSampleMeta`)
- [x] T002 [P] Set type preview fields in `packages/engine/src/chips/gameboy/instrument-editor.ts`
- [x] T003 [P] Set type preview fields in `packages/engine/src/chips/nes/instrument-editor.ts`
- [x] T004 [P] Set type preview fields in `packages/plugins/chip-sms/src/instrument-editor.ts`
- [x] T005 [P] Set type preview fields in `packages/plugins/chip-spectrum-128/src/instrument-editor.ts`
- [x] T006 Add `BUNDLED_SAMPLE_META` in `packages/engine/src/chips/nes/dmcSamples.ts` and wire `bundledSampleMeta` in `packages/engine/src/chips/nes/plugin.ts`
- [x] T007 Add resolve helpers in `packages/app-core/src/editor/instrument-editor-schema.ts` (mode, octave from note/type)

**Checkpoint**: foundation complete before user-story work.

## Phase 1: User Story 1 — Melodic default octave (P1)

- [x] T010 [US1] Apply octave resolution on select/type change in `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx`
- [x] T011 [US1] Unit tests for octave resolution in `packages/app-core/tests/` (or desktop tests)

**Checkpoint**: story independently testable.

## Phase 2: User Story 2–3 — Oneshot / uge_note preview (P1)

- [x] T020 [US2] [US3] Named-hit and uge_note-patched preview in `packages/app-core/src/editor/codelens-preview.ts`
- [x] T021 [US2] [US3] Trigger / uge_note strip / DMC meta UI in `DesktopInstrumentEditor.tsx`
- [x] T022 [US2] Tests for preview helpers / meta lookup

## Phase 3: User Story 4 — CodeLens (P2)

- [x] T030 [US4] CodeLens Hit/Sample vs melodic notes in `codelens-preview.ts`
- [x] T031 [US4] Update related tests in `packages/app-core/tests/` / `apps/desktop/tests/`

## Phase 4: User Story 5 — Spectrum tone_mix oneshot (P1)

- [x] T040 [US5] `resolvePreviewMode` overrides to oneshot when `tone_mix` is true (`packages/app-core/src/editor/instrument-editor-schema.ts`)
- [x] T041 [US5] Pass draft / line props from `DesktopInstrumentEditor.tsx` and `codelens-preview.ts`
- [x] T042 [US5] Unit tests for tone_mix override

## Polish

- [x] T900 Document schema fields in `docs/contributing/creating-plugins.md`; brief note in `docs/grammar/instrument-note-mapping-guide.md`
- [ ] T901 Keep `specs/STATUS.md` entry for 098 linked to issue 229; move to `specs/complete/` when shipped
