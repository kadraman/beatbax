# Tasks: MIDI import — chords as arpeggios

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Resolve OQ-1 and OQ-2 with the maintainer (check whether Game Boy wave-channel `arp:` playback still has the WebAudio limitation from spec 025)
- [ ] T002 `packages/engine/src/import/midi/types.ts` and `config.ts`: `mono: "arp"` (melodic only), `chords`, option plumbing (FR-001, FR-002); config tests in `packages/engine/tests/import/midi/midi-arrangement-config.test.ts`

## Phase 1: User Story 1 — Chords as arpeggios (P1)

- [ ] T010 [US1] `reduceArp` in `packages/engine/src/import/midi/reduce.ts` and default-policy wiring in `reduceStreams` (FR-010, FR-013, FR-014)
- [ ] T011 [US1] Carry `arpOffsets` through `pack.ts` / `reuse.ts`; token format (FR-021)
- [ ] T012 [US1] Preset emission and collision check in `emit.ts` (FR-020, FR-022)
- [ ] T013 [US1] `--chords` in `packages/cli/src/import-midi.ts`; CLI test
- [ ] T014 [US1] Fixture `packages/engine/tests/fixtures/midi/f15-chords.mid` (+ `.import.json`) and `packages/engine/tests/import/midi/midi-chord-arp.test.ts`; golden in `midi-golden.test.ts`

## Phase 2: User Story 2 — Fallbacks (P1)

- [ ] T020 [US2] Span fallback and `arp_fallback` aggregation; overlap after a chord; drum-target config error (FR-011, FR-001)

## Phase 3: User Story 3 — Large chords (P2)

- [ ] T030 [US3] Offset truncation with `arp_offsets_truncated`; octave doubling (FR-012)

## Polish

- [ ] T900 [P] `docs/features/midi-importer.md` chord policy section (SC-004); `--annotate` text
- [ ] T901 Check FR-003: all existing goldens byte-identical; UGE export of the new golden has no arp truncation warning (SC-003)
- [ ] T902 Run `npm test`; move this folder to `specs/complete/095-midi-import-chord-arp/` and update `specs/STATUS.md` when shipped
