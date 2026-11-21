# Tasks: WebAudio ↔ PCM effect parity

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Spike Offline WebAudio capture in Node (`packages/engine/tests/` helper) vs `renderSongToPCM` for a 1-bar pulse note; document correlation preprocess (DC-block / low-pass) needed for SC-001 in `specs/features/112-webaudio-pcm-effect-parity/plan.md`.
- [ ] T002 [P] Inventory effect coverage matrix (WebAudio vs pulse/wave/noise PCM) into `specs/features/112-webaudio-pcm-effect-parity/research.md`.
- [ ] T003 Add shared modulation module `packages/engine/src/effects/modulation.ts` with types + APIs for vib/arp/port/trem/bend/sweep/volSlide/cut; export from `packages/engine/src/effects/` as needed.
- [ ] T004 Unit tests in `packages/engine/tests/modulation.test.ts` for arp frame steps, vib Δf formula, and port duration formula matching `packages/engine/src/effects/index.ts`.

**Checkpoint**: kernel unit tests green; harness spike records compare preprocess.

## Phase 1: User Story 1 + 2 — tutorial_groove + shared kernel (P1)

- [ ] T010 [US2] Wire `renderPulse` in `packages/engine/src/audio/pcmRenderer.ts` to `modulation.ts` for vib/arp/port/trem/bend/sweep/volSlide/cut (replace duplicated loops).
- [ ] T011 [US2] Wire `renderWave` in `packages/engine/src/audio/pcmRenderer.ts` to the same kernel; add missing wave `arp` and `cut` parsing/application.
- [ ] T012 [US1][US2] Align wave vibrato in PCM to continuous LFO (remove divergent GB-only step path for wave vib, or gate it behind matching WebAudio behavior).
- [ ] T013 [US1] Implement PCM continuous `port` phase + no per-step fade for Game Boy pulse and wave in `packages/engine/src/audio/pcmRenderer.ts` (FR-004; supersedes 110 PCM carve-out).
- [ ] T014 [US2] Assert or drive WebAudio schedules in `packages/engine/src/effects/index.ts` from the shared kernel tables (vib/arp/port at minimum).
- [ ] T015 [US1] Parity tests: `packages/engine/tests/parity.tutorial_groove.test.ts` comparing Offline WebAudio vs PCM for `songs/gameboy/tutorial_groove.bax` full mix and channels 1–4 (gates per SC-001).
- [ ] T016 [US1] Manual QA checklist entry under `docs/qa/` for Desktop vs CLI vs WAV on `tutorial_groove.bax`.

**Checkpoint**: SC-001 green for tutorial_groove; Desktop/CLI/WAV manual listen pass.

## Phase 2: User Story 4 — wave table / level (P2)

- [ ] T020 [US4] Replace PCM-local wave parse in `packages/engine/src/audio/pcmRenderer.ts` with shared `parseWaveTable` from `packages/engine/src/chips/gameboy/wave.ts` (16→32 tile).
- [ ] T021 [US4] Align wave output scale with WebAudio (0.9 or agreed constant) in `pcmRenderer.ts` / `wave.ts`; add unit test for 16-value tiling + level.
- [ ] T022 [P] [US4] Update `docs/grammar/instruments.md` to remove the PCM wave-table discrepancy note once fixed.

**Checkpoint**: 16-value wave fixtures match WebAudio within gate.

## Phase 3: User Story 3 — echo / retrig (P2)

- [ ] T030 [US3] Implement echo delay buffer + feedback + wet/dry in `packages/engine/src/audio/pcmRenderer.ts` per #42.
- [ ] T031 [US3] Implement retrigger expansion (interval + volume delta) in `packages/engine/src/audio/pcmRenderer.ts` matching WebAudio `tryScheduleRetriggers`.
- [ ] T032 [US3] Tests `packages/engine/tests/pcmRenderer.echo.test.ts` and `packages/engine/tests/pcmRenderer.retrig.test.ts`; parity vs Offline WebAudio for `songs/effects/echo.bax` and `songs/effects/retrigger.bax`.
- [ ] T033 [US3] Remove echo warn from `packages/engine/src/node/play.ts`; remove `echo`/`retrig` from `WEB_AUDIO_ONLY_EFFECTS` in `packages/app-core/src/export/pcm-export-warnings.ts`.

**Checkpoint**: SC-002 / SC-004 for echo and retrig; no PCM unsupported warnings.

## Phase 4: Noise / plugin pass-through

- [ ] T040 Pass note effects into `renderNoise` in `packages/engine/src/audio/pcmRenderer.ts` where meaningful, or emit a consistent warning; add a regression test.
- [ ] T041 Apply remaining effects after `applyInlineRenderEffects` on plugin PCM path in `pcmRenderer.ts` / `playback.ts`, or warn loudly; document in dual-render docs.

**Checkpoint**: no silent effect drops on noise/plugin PCM without a warning.

## Polish

- [ ] T900 [P] Update dual-rendering section in `docs/contributing/creating-plugins.md` (PCM effects ≠ “None”).
- [ ] T901 [P] Note in `specs/STATUS.md` / completed 110 entry that FR-004 supersedes the PCM carve-out when this feature ships.
- [ ] T902 Regenerate optional golden stems `songs/gameboy/tutorial_groove.wav` and `songs/gameboy/tutorial_groove-channel-*.wav` from fixed PCM once gates are green.
- [ ] T903 Move this folder to `specs/complete/112-webaudio-pcm-effect-parity/` and update `specs/STATUS.md` when shipped; comment completion on https://github.com/kadraman/beatbax/issues/276 and close #42 if echo/retrig fully done.
