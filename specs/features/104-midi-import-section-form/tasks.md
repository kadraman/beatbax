# Tasks: MIDI import section/form and Beginner Mode output

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Add `arrangement: 'seqs' | 'form' | 'beginner'` to convert options in `packages/engine/src/import/midi/types.ts`, default `seqs` in `packages/engine/src/import/midi/config.ts`, and reject any other value with the FR-002 message.
- [ ] T002 [P] Parse `--arrangement` in `packages/cli/src/import-midi.ts` and pass it through the same config merge. Help text says the default is `seqs`.

**Checkpoint**: omitted arrangement still selects `seqs`. Invalid values fail before emit.

## Phase 1: User Story 1 — Keep today's output (P1)

- [ ] T010 [US1] Lock SC-001 in `packages/engine/tests/import/midi/`: existing golden and convert tests pass with no `arrangement` field, and an explicit `seqs` value matches the omitted value byte for byte.

**Checkpoint**: default emit is unchanged.

## Phase 2: User Story 2 — Canonical section/form (P1)

- [ ] T020 [US2] In `packages/engine/src/import/midi/reuse.ts`, expose each section's bar range and per-channel compressed pattern playlist (the lists today's seq emitter writes) without a second slice.
- [ ] T021 [US2] In `packages/engine/src/import/midi/emit.ts`, add `form` output: `bars_<start>_<end>` sections, `# --- Section N: Bars A-B ---` comments, `form main` with commas, and `channel <index> => inst <default> role <role> form main` using the FR-021 role map. Do not emit per-section `seq` lines or `channel … seq` lists.
- [ ] T022 [US2] Fail conversion when a section name or generated `<section>_<role>` name collides with a pattern name (`packages/engine/src/import/midi/emit.ts`).
- [ ] T023 [US2] Golden files and pattern-order comparison after spec 008 expansion in `packages/engine/tests/import/midi/` for one Game Boy fixture and one NES fixture, including a short final section (`bars_9_12`) and a lead+bass song that does not gain empty lanes. Cover `sectionBars: 0` as a single `bars_1_<barCount>` section.

**Checkpoint**: `form` verifies and matches `seqs` pattern order.

## Phase 3: User Story 3 — Beginner Mode when the profile matches (P2)

- [ ] T030 [US3] Eligibility check in `packages/engine/src/import/midi/emit.ts` (or a sibling module under `packages/engine/src/import/midi/`): allow only the FR-032 role sets; on failure throw one error that names the chip and says to use arrangement `form`; do not return source.
- [ ] T031 [US3] `beginner` emit: keep spec 090 seqs, `section … use` in profile order, `form main` with ` > `, one `channel auto` line. No advanced `section { }` blocks.
- [ ] T032 [US3] Tests in `packages/engine/tests/import/midi/` for GB quartet, NES 4-lane, NES 5-lane (goldens plus pattern-order equality), and one under-filled song that errors without source.

**Checkpoint**: beginner sugar is opt-in and refuses partial songs.

## Polish

- [ ] T900 [P] Document `--arrangement`, config `arrangement`, both shapes, and the Beginner eligibility rule in `docs/features/midi-importer.md`.
- [ ] T901 Move this folder to `specs/complete/104-midi-import-section-form/` and update `specs/STATUS.md` when shipped.
