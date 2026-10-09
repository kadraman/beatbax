# Tasks: MIDI import chip profiles for SMS and ZX Spectrum 128

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Resolve OQ-1 and OQ-2 with the maintainer before implementation
- [ ] T002 Refactor `packages/engine/src/import/midi/chipRoles.ts` and `kit.ts` to a per-chip profile record with GB and NES profiles wrapping today's code; all existing tests and goldens pass unchanged (FR-040)
- [ ] T003 `packages/engine/src/import/midi/types.ts`: add chip ids, `tone1..3` roles, `sms` / `ay` articulation types; `config.ts`: `SUPPORTED_CHIPS`, error text, `families.*.sms` / `.ay` parsing (FR-001, FR-002, FR-031)
- [ ] T004 Chip-aware target validation and aliases in `resolveConvertOptions` with `role_alias` diagnostic; `dmc_reinforcement_ignored` (FR-003, FR-032)

**Checkpoint**: GB/NES byte-identical; new chips accepted but not yet emitting.

## Phase 1: User Story 1 — SMS (P1)

- [ ] T010 [US1] SMS profile: role table, melodic `type=toneN` lines, default articulations, drum kit (FR-010, FR-011, FR-012, FR-030); confirm the A2 floor from `packages/plugins/chip-sms/src/periodTables.ts`
- [ ] T011 [US1] SMS low-pitch octave raise with `pitch_below_chip_range` (FR-013)
- [ ] T012 [US1] Tests in `packages/engine/tests/import/midi/midi-chip-profiles.test.ts`; SMS goldens (melodic, with drums) in `midi-golden.test.ts`

## Phase 2: User Story 2 — Spectrum 128 (P1)

- [ ] T020 [US2] Spectrum profile: role table, AY melodic lines, default articulations, shared-`noise_rate` drum kit on `type=tone2` (FR-020, FR-022, FR-023, FR-030)
- [ ] T021 [US2] Drum-channel rule in `roles.ts` / `pack.ts`: channel 2 reserved when drums exist, budget 2, `drums_share_tone_channel` (FR-021)
- [ ] T022 [US2] Tests and Spectrum goldens (melodic, with drums)

## Phase 3: User Story 3 — Config reuse (P2)

- [ ] T030 [US3] Tests: a GB config (`packages/engine/tests/fixtures/midi/f06-inst-switch.import.json`) converts on SMS and Spectrum through aliases; `dmc` target error on SMS

## Polish

- [ ] T900 [P] `packages/cli/src/import-midi.ts` help and errors (FR-043); `packages/cli/tests/import-midi.test.ts` runs `verify` on the four new goldens
- [ ] T901 [P] `docs/features/midi-importer.md` (SC-004); update spec 006 "Future enhancements" to point here
- [ ] T902 Run `npm test`; manual listen (SC-003); move this folder to `specs/complete/094-midi-import-sms-spectrum/` and update `specs/STATUS.md` when shipped
