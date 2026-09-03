# Tasks: C64 SID Chip Plugin

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Engine + parser prerequisites

- [ ] T001 Add `chipModel` directive and AST field
- [ ] T002 Extend `chip sid pal|ntsc` region validation
- [ ] T003 Pass `chipModel` through resolver → SongModel → `configureForSong()`
- [ ] T004 Add `beginSongSession()` (or equivalent) to playback / PCM renderer

## Phase 1: Shared chip core

- [ ] T010 [P] Create `@beatbax/plugin-chip-sid` package structure
- [ ] T011 [P] Implement `sid-profiles.ts` (6581/8580 × PAL/NTSC)
- [ ] T012 [P] Implement `periodTables.ts`
- [ ] T013 Implement `sid-chip.ts` (voice, ADSR, filter approx)
- [ ] T014 Unit tests: frequency, ADSR, profiles, determinism

## Phase 2: Register intents + plugin wiring

- [ ] T020 Implement register intent / arbitrator / log modules
- [ ] T021 Implement channel backends as intent emitters (facades)
- [ ] T022 Implement `validate.ts` / `validate-song.ts`
- [ ] T023 Plugin `index.ts` session lifecycle + registration
- [ ] T024 Integration: `sid-smoke-test.bax` register-log SHA stable across 3 runs

## Phase 3: Preview audio + UI

- [ ] T030 Implement audio-from-registers preview
- [ ] T031 [P] `ui-contributions.ts` + `songWizard.ts` (always emit model + region)
- [ ] T032 CLI + Desktop/Web play smoke song with non-zero audio

## Phase 4: Macros + filter effects

- [ ] T040 Map filter sweeps to chip-global intents; region-aware macro rate
- [ ] T041 Profile-specific filter curves; conflict/demo song gates

## Phase 5: Samples + docs

- [ ] T050 [P] Sample/demo/test songs under `songs/c64-sid/`
- [ ] T051 [P] `docs/chips/c64-sid/` hardware + composition guides
- [ ] T052 Move to `specs/complete/009-c64-sid-chip-plugin/` when shipped
