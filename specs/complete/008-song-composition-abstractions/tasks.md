# Tasks: Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 0: Code-ready / foundation

- [x] T001 Constitution Check in `specs/features/008-song-composition-abstractions/plan.md`; status → `planned` then `in-progress` in `spec.md`, `README.md`, `specs/STATUS.md`
- [x] T002 AST + schema: authored `aliases` / `sections` / `forms` and channel `role` / `formRef` in `packages/engine/src/parser/ast.ts` and `schema/ast.schema.json`
- [x] T003 Peggy rules in `packages/engine/src/parser/peggy/grammar.peggy`; regenerated parser
- [x] T004 Stmt assembly in `packages/engine/src/parser/peggy/index.ts`; `parseChannelRhs` role/form/`channel auto`
- [x] T005 `packages/engine/src/expand/compositionExpand.ts` wired from `parseWithPeggy`

## Phase 1: `alias` + `cat()` (US1)

- [x] T010 [US1] Expand `cat(...)` seq RHS
- [x] T011 [US1] Expand `alias` (forward refs, cycle diagnostics)
- [x] T012 [US1] `packages/engine/tests/composition-expand-phase1.test.ts`
- [x] T013 [P] [US1] Editor tokens in `packages/app-core/src/editor/*`

## Phase 2: `section` + `form` + channel `role` (US2)

- [x] T020 [US2] Expand `section` → synthetic seqs
- [x] T021 [US2] Expand `form` + channel role bindings
- [x] T022 [US2] Beginner Mode desugar
- [x] T023 [US2] `packages/engine/tests/composition-expand-phase2.test.ts`
- [x] T024 [P] [US2] Editor keywords/completions/hover
- [x] T025 [P] `songs/features/song_composition_demo.bax`
- [x] T026 [US2] NES/Famicom Beginner profile (4|5 lanes incl. optional `dmc`) in `packages/engine/src/expand/compositionExpand.ts` + Peggy `section … use Ident+`; tests in `composition-expand-phase2.test.ts`; `songs/nes/README.md`

## Phase 3: Sample song migration (US3)

Migrated multi-section full arrangements to `section`/`form`. NES root songs use Beginner Mode `channel auto` (4-lane or 5-lane with `dmc`); section bodies stay as advanced blocks where `:inst(...)` / multi-slot lines are needed. Pattern Grid monolithic-split remains available as an editor command for classic `*_main` songs.

### Game Boy

- [x] T030–T038 Structured GB songs migrated; T039 `tutorial_groove` kept classic (documented)
- [x] T040 `songs/gameboy/README.md`

### NES

- [x] T054–T055 `shadow_temple`, `silver_orbit` migrated
- [x] T050–T053, T056 monoliths kept classic (documented)
- [x] T057 `songs/nes/README.md`

### SMS

- [x] T060–T064 kept classic (documented); T065 `songs/sms/README.md`

### Spectrum 128

- [x] T070–T072 migrated; T073 `songs/spectrum-128/README.md`

## Phase 4: Pattern Grid follow-on

- [x] T080 Authored section labels in `listArrangementSections`; `detectArrangementLayout` recognizes multi-section 008 songs as `structured`
- [x] T081 Refresh `specs/features/015-song-timing-pattern-grid-inspector/plan.md` → `planned`
- [x] T082 Implement `097-web-lite-pattern-grid` (seek/loop in web-lite; browser QA signed off and moved to `specs/complete/`)

## Polish

- [x] T900 Cross-link `docs/features/complete/sequence-arrangements.md`
- [x] T901 Full `npm test` monorepo green (PR #235); moved 008 to `specs/complete/` with 097 still in-progress (Phase 3 `include` / Phase 4 preprocessor deferred)
