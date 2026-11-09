# Tasks: Game Boy pulse portamento continuity

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T001 Add `contiguousPulsePortChainEnd` and `noteHasPort` in `packages/engine/src/chips/gameboy/pulsePortamento.ts`, covering contiguous sustains, rests, non-pulse notes, and baked pulse programs (FR-006, FR-007).

**Checkpoint**: chain end is a pure function of the channel event list.

## Phase 1: User Story 1 — A portamento run is one voice (P1)

- [x] T010 [US1] Teach `playPulse` in `packages/engine/src/chips/gameboy/pulse.ts` to reuse a held oscillator, skip the end-fade while `hold` is set, stop the oscillator at the chain end, and apply legato gain with `PULSE_OUTPUT_GAIN` (FR-001, FR-002, FR-003).
- [x] T011 [US1] Skip envelope-flag updates in `packages/engine/src/effects/index.ts` when the gain node is marked as a joined voice, so the opening note's level is not replaced.
- [x] T012 [US1] In `packages/engine/src/audio/playback.ts`, plan join / hold / chain end while scheduling a pulse note and pass that link into `playPulse`. Clear the hold map and the held voice from `stop()`.

**Checkpoint**: a contiguous `port` run creates one oscillator and does not fade at interior steps.

## Phase 2: User Story 2 — The note after the run attacks (P1)

- [x] T020 [US2] A note without `port` starts a new oscillator in the `playPulse` link tests, and the last joined note of the chain schedules the short fade (FR-005). Covered by `packages/engine/tests/gameboy/gbPulsePortamento.test.ts`.

**Checkpoint**: the landing note re-attacks.

## Phase 3: User Story 3 — A gap does not extend the voice (P2)

- [x] T030 [US3] Chain-end tests in `packages/engine/tests/gameboy/gbPulsePortamento.test.ts` stop the voice at a rest, a non-pulse note, and a baked `duty_env` instrument (FR-006, FR-007, FR-008).

**Checkpoint**: only touching pulse `port` notes share a voice.

## Polish

- [x] T040 Keep the seeded previous-pitch glide covered by `packages/engine/tests/effects.port.test.ts` (FR-004, SC-004).
- [x] T900 Note the shared pulse voice under pitch slides in `docs/chips/gameboy/composition_guide.md`.
- [x] T902 Add an `@beatbax/engine` patch changeset at `.changeset/gameboy-pulse-portamento.md`.
- [ ] T901 Move this folder to `specs/complete/110-gameboy-pulse-portamento/` and update `specs/STATUS.md` when the behavior has shipped.
