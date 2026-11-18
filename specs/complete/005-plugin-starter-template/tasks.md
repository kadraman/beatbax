# Tasks: Create plugin starter template repository on github.com/beatbax

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [x] T001 Review [plan.md](plan.md) Constitution Check and pin `@beatbax/engine` peer range

## Phase 1: Template repository

- [x] T010 Create public repo `kadraman/beatbax-plugin-chip-template` (or org) and enable Template repository
- [x] T011 [P] Scaffold `package.json`, `tsconfig.json`, `jest.config.cjs` matching chip-nes conventions
- [x] T012 [P] Add skeleton `src/index.ts`, `channel.ts`, optional `periodTables.ts` / `validate.ts`
- [x] T013 [P] Add optional `ui-contributions.ts` and `songWizard.ts` mirrors of SMS plugin structure
- [x] T014 Add `tests/plugin.test.ts` so `npm test` passes out of the box
- [x] T015 [P] Add `.github/workflows/ci.yml` (build + test)

## Phase 2: Docs

- [x] T020 README with Use-this-template button, quickstart, and clear `{{PLACEHOLDER}}` markers
- [x] T021 Link to `docs/contributing/creating-plugins.md` in main BeatBax repo
- [x] T022 Optional `CONTRIBUTING.md` pointing at BeatBax contributing guide

## Phase 3: Acceptance

- [x] T030 Verify all Acceptance Criteria in [spec.md](spec.md)
- [x] T031 Move to `specs/complete/005-plugin-starter-template/` and update `specs/STATUS.md`
