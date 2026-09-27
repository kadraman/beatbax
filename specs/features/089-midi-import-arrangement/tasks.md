# Tasks: Arrangement-aware MIDI import

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T000 Resolve OQ-1 (tempo scaling on by default) and OQ-2 (source bars, first time signature); recorded in `specs/features/089-midi-import-arrangement/spec.md`
- [x] T001a File the GitHub issue: https://github.com/kadraman/beatbax/issues/213 (spec frontmatter `issue:`)
- [ ] T001 Resolve remaining open questions OQ-3 to OQ-5
- [ ] T002 Extend types additively in `packages/engine/src/import/midi/types.ts` (TrackMapping, MidiImportConfig, MidiConvertOptions, PackResult `mappingStats`)
- [ ] T003 Parse and validate the new config fields in `packages/engine/src/import/midi/config.ts`; resolve into options (`resolveConvertOptions`)
- [ ] T004 [P] Config unit tests in `packages/engine/tests/import/midi/midi-arrangement-config.test.ts`
- [ ] T005 Add fixtures F10–F14 to `packages/engine/scripts/generate-midi-fixtures.mjs`; generate into `packages/engine/tests/fixtures/midi/` and record hashes in `specs/complete/006-midi-importer/fixtures.md` (new "089 fixtures" table)

**Checkpoint**: config parses, F01–F09 goldens still pass (`npm test`).

## Phase 1: User Story 1 — Bar-range mappings and lanes (P1)

- [ ] T010 [US1] Range-aware multi-match `findOverrides` and lane stream keys in `packages/engine/src/import/midi/roles.ts` (006 `findOverride` path untouched for `streams` mode)
- [ ] T011 [US1] Range clipping helper in `packages/engine/src/import/midi/reduce.ts`
- [ ] T012 [US1] `packLanes()` in `packages/engine/src/import/midi/pack.ts`: ordered gap fill, binding targets, `inst()` emission via the shared merge loop, `lane_overlap` stats, then 006 packing for `auto` streams
- [ ] T013 [US1] Source bar grid (first time signature, 4/4 fallback, `bar_numbering_first_signature` warning; spec FR-035) in `packages/engine/src/import/midi/timing.ts`
- [ ] T014 [US1] Wire lanes into `packages/engine/src/import/midi/index.ts`; aggregate diagnostics per mapping
- [ ] T015 [P] [US1] Unit tests in `packages/engine/tests/import/midi/midi-arrangement-lanes.test.ts`; golden F10 in `packages/engine/tests/import/midi/midi-golden.test.ts`

**Checkpoint**: US1 acceptance scenarios pass.

## Phase 2: User Story 2 — Chord reduction and pitch (P1)

- [ ] T020 [US2] `reduceMono` policies and legato tail rule in `packages/engine/src/import/midi/reduce.ts`; `earliest` delegates to 006 ordering
- [ ] T021 [US2] Transpose / fold and `pitch_out_of_range` in `packages/engine/src/import/midi/roles.ts`
- [ ] T022 [P] [US2] Unit tests in `packages/engine/tests/import/midi/midi-arrangement-reduce.test.ts` (including `earliest` ≡ 006 `resolveMonophonic`); golden F11

## Phase 3: User Story 3 — Timing (P2)

- [ ] T030 [US3] Tempo selection (`bpm`, `tempo: first|longest`) and written-bpm scaling for every import with `ticksPerBeat` ≠ 4 (spec FR-032 / FR-040) in `packages/engine/src/import/midi/timing.ts`; use it in `index.ts` and `pushIgnoredTimingDiagnostics`
- [ ] T031 [US3] Window (`startBar`/`endBar`) and `nudge` in `packages/engine/src/import/midi/quantize.ts` using `timing.ts` bar bounds
- [ ] T032 [P] [US3] Unit tests in `packages/engine/tests/import/midi/midi-arrangement-timing.test.ts`; goldens F12 (tempo map + window + nudge) and F13 (triplet)

## Phase 4: User Story 4 — Inspect (P2)

- [ ] T040 [US4] `inspectMidiParseResult()` in `packages/engine/src/import/midi/inspect.ts`; export from `packages/engine/src/import/midi/index.ts`
- [ ] T041 [US4] `--inspect` in `packages/cli/src/import-midi.ts` and conditional `--chip` in `packages/cli/src/cli.ts`
- [ ] T042 [P] [US4] Tests in `packages/engine/tests/import/midi/midi-inspect.test.ts` and `packages/cli/tests/import-midi.test.ts`

## Phase 5: User Story 5 — Drum sources and unmapped tracks (P3)

- [ ] T050 [US5] `include`/`exclude` for noise/dmc mappings and `unmappedTracks: drop` in `packages/engine/src/import/midi/roles.ts`
- [ ] T051 [P] [US5] Tests in `packages/engine/tests/import/midi/midi-arrangement-lanes.test.ts`; golden F14

## Phase 6: User Story 6 — Arrangement notes (P3)

- [ ] T060 [US6] Annotation model from `mappingStats` + timing decisions; emit block in `packages/engine/src/import/midi/emit.ts`
- [ ] T061 [US6] `--annotate` flag in `packages/cli/src/import-midi.ts` / `packages/cli/src/cli.ts`
- [ ] T062 [P] [US6] Tests in `packages/engine/tests/import/midi/midi-annotate.test.ts` and CLI test

## Polish

- [ ] T900 Update `docs/features/midi-importer.md` (config reference, "Arranging dense MIDI" example, `--inspect`, `--annotate`, triplet notes, and the `ticksPerBeat` ≠ 4 tempo fix as a behaviour change) and add a release-notes entry for the tempo fix
- [ ] T901 Operator-local parity run for the 13 `songs/covers` songs (spec SC-002 to SC-004); record results in `specs/features/089-midi-import-arrangement/parity.md`
- [ ] T902 Convert `songs/covers/midi/*.split.json` recipes to importer configs; retire `songs/covers/tools/split-midi.mjs` and the generated `.split.mid` files once parity is accepted
- [ ] T903 `npm test` green; determinism assertions for F10–F14
- [ ] T904 Move this folder to `specs/complete/089-midi-import-arrangement/` and update `specs/STATUS.md` when shipped
