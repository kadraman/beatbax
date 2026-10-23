# Tasks: Instrument editor DMC sample Browse + Check

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 0: Foundation (blocks stories)

- [x] T001 Author `specs/features/102-instrument-editor-sample-browse-verify/{spec,plan,tasks}.md` and STATUS entry (issue 234)
- [ ] T002 [P] Add song-dir relative path helper (absolute → `local:` remainder; reject `..` / outside / missing song path) in `packages/app-core/src/editor/` (e.g. `instrument-sample-path.ts`) + unit tests in `packages/app-core/tests/`
- [ ] T003 [P] Extend NES `packages/engine/src/chips/nes/validate.ts` to reject unknown `@nes/<name>` against bundled kit keys; tests in `packages/engine/tests/nes/`
- [ ] T004 [P] Ensure Desktop open-file path supports DMC filters/title (extend `chooseOpenFile` options in `apps/desktop/src/main/ipc-handlers.ts` + preload / `apps/desktop/src/shared/electron-api.ts` as needed)

**Checkpoint**: path helper + validate green under `npm test` before UI wiring.

## Phase 1: User Story 1 — Browse Local (P1)

- [ ] T010 [US1] Add **Browse…** to `InstrumentSampleField` in `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` (Local scheme only; disabled when imported read-only)
- [ ] T011 [US1] Wire dialog → relative helper → `formatInstrumentSampleRef` + Live/Apply from `packages/app-core/src/editor/instrument-editor-draft.ts` / existing writeback
- [ ] T012 [US1] Panel errors for unsaved song / non-relativizable path; styles in `apps/desktop/src/renderer/src/styles.css` if needed

**Checkpoint**: Browse a `.dmc` beside a saved NES song; `dmc_sample` is relative `local:`.

## Phase 2: User Story 2 — Check sample (P1)

- [ ] T020 [US2] Add **Check** control + status line on the sample row in `DesktopInstrumentEditor.tsx`
- [ ] T021 [US2] Resolve via chip `resolveSampleAsset` (NES → `packages/engine/src/chips/nes/dmc.ts` / `plugin.ts`); show byte length on success
- [ ] T022 [US2] Surface allowlist / load failure messages (including Settings → Advanced remediation from main-process policy)

**Checkpoint**: Check Local / `@nes/kick` / HTTPS or `github:` allowed host; blocked host shows remediation without song play.

## Phase 3: User Stories 3–4 — Bundled validity + docs (P2)

- [ ] T030 [US3] Confirm panel field validation surfaces T003 errors for unknown bundled names (write-valid-only)
- [ ] T031 [US4] Align kit lists in `packages/engine/src/chips/nes/ui-contributions.ts` and `packages/engine/src/chips/nes/songWizard.ts` with `packages/engine/src/chips/nes/dmcSamples.ts`
- [ ] T032 [US4] Note Browse + Check in `docs/chips/nes/composition_guide.md`

## Polish

- [ ] T900 Amend Future Enhancements in `specs/complete/021-instrument-editor-panel/spec.md` (Browse + Check → feature 102; remove “No filesystem Browse” as current state once shipped)
- [ ] T901 Manual QA on `songs/nes/instruments/nes_dmc_demo.bax` (Browse, Check, Trigger, blocked host)
- [ ] T902 Move this folder to `specs/complete/102-instrument-editor-sample-browse-verify/` and update `specs/STATUS.md` when shipped
