# Tasks: Duplicate definition warnings

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

Complete. Live-model check of the Copilot repair/block path (scenario 37 in `docs/qa/copilot-test-scenarios.md`, SC-004) is pending.

## Phase 0: Baseline

- [x] T001 Capture AST definition maps and ISM for every `songs/**/*.bax` before any change, as a test fixture or in-test comparison, in `packages/engine/tests/` (SC-003) — `packages/engine/tests/songs-definition-baseline.test.ts` with `packages/engine/tests/fixtures/songs-definition-baseline.json` (regenerate only with `BEATBAX_UPDATE_SONG_BASELINE=1`)

## Phase 1: User Story 1 — Parser warning (P1)

- [x] T010 [US1] Warn on `pat` / `seq` / `inst` / `effect` redefinition in `packages/engine/src/parser/peggy/index.ts` (FR-001, FR-002, FR-004)
- [x] T011 [US1] Tests in `packages/engine/tests/parser-redefinition.test.ts`: per-kind warning, three definitions, cross-kind names, last-wins maps, `subpat` / `channel` unchanged, imported override gets no extra warning (FR-003)
- [x] T012 [P] [US1] Remove superseded definitions from `songs/sms/green_zone.bax` and `songs/sms/green_hill_remix.bax` (the copies under `apps/web-ui/public/songs/` and `apps/desktop/build/songs/` are untracked build output) (FR-009)
- [x] T013 [US1] Song-wide test: zero redefinition warnings and AST/ISM equal to the T001 baseline (SC-002, SC-003)

**Checkpoint**: SC-001–SC-003 pass.

## Phase 2: User Story 2 — Copilot duplicate check (P1)

- [x] T020 [US2] `findNewDuplicateDefinitions(previous, next)` in `apps/desktop/src/renderer/src/lib/bax-def-index.ts`; tests in `apps/desktop/tests/bax-def-index.test.ts`
- [x] T021 [US2] Validation loop in `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx`: duplicates skip the definition merge, join the repair prompt and counter, and block with the FR-007 summary (FR-005–FR-007)

**Checkpoint**: SC-004 and SC-005 pass.

## Phase 3: User Story 3 — Edit prompt rule (P2)

- [x] T030 [US3] Add the FR-008 rule to the Edit mode hint in `apps/desktop/src/renderer/src/lib/copilot-context.ts`; assertions in `apps/desktop/tests/copilot-context.test.ts`

## Polish

- [x] T900 Add the redefinition contract line to `specs/global/language.md`; add an Edit-apply item to `specs/complete/017-copilot-local-ollama/spec.md` and a sentence to `specs/complete/052-ai-chatbot-assistant/spec.md` (also the warning row in `docs/formats/ast-schema.md`)
- [x] T901 Add a duplicate-reply QA scenario to `docs/qa/copilot-test-scenarios.md` (scenario 37)
- [x] T902 Run `npm test`; move this folder to `specs/complete/092-duplicate-definition-warnings/` and update `specs/STATUS.md` when shipped
