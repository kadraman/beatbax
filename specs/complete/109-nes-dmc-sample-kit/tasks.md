# Tasks: NES DMC sample kit expansion

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 0: Foundation

- [x] T001 Create `samples/wav/nes_kit/` and a generator script under `scripts/` (or `tools/`) that writes mono 16-bit WAVs for the kit listed in plan.md
- [x] T002 Encode WAVs with `packages/cli` `convert wav2dmc` into `samples/dmc/`; write `samples/dmc/NOTICE`
- [x] T003 [P] Update `specs/STATUS.md` to list feature **109** as active / in-progress

**Checkpoint**: `.dmc` files and NOTICE exist before embedding.

## Phase 1: User Story 1 — Stronger bundled kit (P1)

- [x] T010 [US1] Register new samples + meta in `packages/engine/src/chips/nes/dmcSamples.ts` (classic kick/snare preserved; hihat/crash no longer clap; aliases `kick_classic`, `snare_classic`, optional `bass`)
- [x] T011 [US1] Extend `packages/engine/tests/nes/nes-plugin.test.ts` for new keys, hihat≠clap, crash≠clap

**Checkpoint**: `@nes/kick_punch` etc. resolve under `npm test`.

## Phase 2: User Story 2 — Songs and wizard (P1)

- [x] T020 [US2] Retarget `songs/nes/battle_fanfare.bax` and `songs/nes/wily_fortress.bax` to punch/tight
- [x] T021 [US2] Retarget `songs/nes/puffball_parade.bax` to body/fat
- [x] T022 [US2] Retarget `songs/nes/iron_keep.bax` to bundled `@nes/` samples
- [x] T023 [US2] Update `songs/nes/instruments/nes_dmc_demo.bax` (bass, hats, voice_ready at rate 12)
- [x] T024 [US2] Update `packages/engine/src/chips/nes/songWizard.ts` starter DMC kit

**Checkpoint**: effect fixtures and 4-channel songs untouched for kit choice.

## Phase 3: User Story 3 — Docs and lists (P2)

- [x] T030 [US3] Align kit name lists in `packages/engine/src/chips/nes/ui-contributions.ts` with `BUNDLED_SAMPLES`
- [x] T031 [US3] Expand DMC section in `docs/chips/nes/composition_guide.md` (prep, monophonic limit, speech rate pairs)

## Polish

- [x] T900 Run `npm test` for NES-related suites and fix failures
- [x] T901 Move this folder to `specs/complete/109-nes-dmc-sample-kit/` and update `specs/STATUS.md` when shipped
