# Tasks: WebAudio ↔ PCM effect parity

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T001 Spike Offline WebAudio capture in Node (`node-web-audio-api` + `offlineWebAudioRender.ts`) vs `renderSongToPCM` for a 1-bar pulse note; simple pulse ~0.97 after lag alignment; full `tutorial_groove` still low on PCM. That Node spike path was removed; CLI play and WAV stay on PCM.
- [x] T002 [P] Inventory effect coverage matrix (WebAudio vs pulse/wave/noise PCM) into `specs/features/112-webaudio-pcm-effect-parity/research.md`.
- [x] T003 Add shared modulation module `packages/engine/src/effects/modulation.ts` with types + APIs for vib/arp/port/trem/bend/sweep/volSlide/cut; export from `packages/engine/src/effects/` as needed.
- [x] T004 Unit tests in `packages/engine/tests/modulation.test.ts` for arp frame steps, vib Δf formula, and port duration formula matching `packages/engine/src/effects/index.ts`.

**Checkpoint**: kernel unit tests green; harness spike records compare preprocess.

## Phase 1: User Story 1 + 2 — tutorial_groove + shared kernel (P1)

- [x] T010 [US2] Wire `renderPulse` in `packages/engine/src/audio/pcmRenderer.ts` to `modulation.ts` for vib/arp/port/trem/bend/sweep/volSlide/cut (replace duplicated loops).
- [x] T011 [US2] Wire `renderWave` in `packages/engine/src/audio/pcmRenderer.ts` to the same kernel; add missing wave `arp` and `cut` parsing/application.
- [x] T012 [US1][US2] Align wave vibrato in PCM to continuous LFO (remove divergent GB-only step path for wave vib, or gate it behind matching WebAudio behavior).
- [x] T013 [US1] Implement PCM continuous `port` phase + no per-step fade for Game Boy pulse and wave in `packages/engine/src/audio/pcmRenderer.ts` (FR-004; supersedes 110 PCM carve-out).
- [x] T014 [US2] Assert or drive WebAudio schedules in `packages/engine/src/effects/index.ts` from the shared kernel tables (vib/arp/port at minimum).
- [x] T015 [US1] Parity tests: `packages/engine/tests/parity.tutorial_groove.test.ts` comparing Chromium Offline WebAudio fixtures vs PCM for `songs/gameboy/tutorial_groove.bax` (windowed correlation). This box records that harness only. It does not satisfy revised SC-001 (2026-11-22). Follow-up is T050.
- [x] T016 [US1] Manual QA checklist entry under `docs/qa/` for Desktop vs CLI vs WAV on `tutorial_groove.bax`.

**Checkpoint**: revised SC-001 is T050–T056, not this checkpoint. The windowed-correlation run is recorded above and is not the gate.

## Phase 2: User Story 4 — wave table / level (P2)

- [x] T020 [US4] Replace PCM-local wave parse in `packages/engine/src/audio/pcmRenderer.ts` with shared `parseWaveTable` from `packages/engine/src/chips/gameboy/wave.ts` (16→32 tile).
- [x] T021 [US4] Align wave output scale with WebAudio (0.9 or agreed constant) in `pcmRenderer.ts` / `wave.ts`; add unit test for 16-value tiling + level.
- [x] T022 [P] [US4] Update `docs/grammar/instruments.md` to remove the PCM wave-table discrepancy note once fixed.

**Checkpoint**: 16-value wave fixtures match WebAudio within gate.

## Phase 3: User Story 3 — echo / retrig (P2)

- [x] T030 [US3] Implement echo delay buffer + feedback + wet/dry in `packages/engine/src/audio/pcmRenderer.ts` per #42.
- [x] T031 [US3] Implement retrigger expansion (interval + volume delta) in `packages/engine/src/audio/pcmRenderer.ts` matching WebAudio `tryScheduleRetriggers`.
- [x] T032 [US3] Tests `packages/engine/tests/pcmRenderer.echo.test.ts` and `packages/engine/tests/pcmRenderer.retrig.test.ts`; parity vs Offline WebAudio for `songs/effects/echo.bax` and `songs/effects/retrigger.bax`.
- [x] T033 [US3] Remove echo warn from `packages/engine/src/node/play.ts`; remove `echo`/`retrig` from `WEB_AUDIO_ONLY_EFFECTS` in `packages/app-core/src/export/pcm-export-warnings.ts`.

**Checkpoint**: SC-002 / SC-004 for echo and retrig; no PCM unsupported warnings.

## Phase 4: Noise / plugin pass-through

- [x] T040 Pass note effects into `renderNoise` in `packages/engine/src/audio/pcmRenderer.ts` where meaningful, or emit a consistent warning; add a regression test.
- [ ] T041 Apply remaining effects after `applyInlineRenderEffects` on plugin PCM path in `pcmRenderer.ts` / `playback.ts`, or warn loudly; document in dual-render docs.

**Checkpoint**: no silent effect drops on noise/plugin PCM without a warning.

## Phase 5: Revised gates (spec 2026-11-22)

- [x] T050 [US1] Replace the correlation gate in `packages/engine/tests/parity.tutorial_groove.test.ts` with the SC-001 feature gates. Capture helper lives under `packages/engine/scripts/parity/` and records Chromium real-time WebAudio and OfflineAudioContext. WebAudio real-time vs WebAudio offline (limiter bypassed) passes. PCM is reported and does not fail this task.
- [x] T051 [US1] Fix Desktop vibrato in `packages/engine/src/effects/index.ts`: depth from the note's frequency (Δf = depth × f² / 131072) and LFO phase 0. The C4/C5/C6 probe in `tests/effects.vib-depth.test.ts` stays within 2% of that deviation. Phase 0 uses the one-cycle buffer.
- [x] T052 [US1] Fix Desktop portamento in `packages/engine/src/effects/index.ts`: glide from the previous note on the channel, including a note that did not use `port`. The first note of a channel does not glide.
- [x] T053 [US2] Apply envelope gain before the first voice sample in `packages/engine/src/chips/gameboy/pulse.ts`, `wave.ts`, and `noise.ts`. The real-time capture peak on channel 1 is 0.37, matching offline. There is no unity-gain sample.
- [x] T054 [US1] Make the master limiter in `packages/engine/src/audio/playback.ts` transparent per FR-013 and the spec 077 amendment. Threshold is 0 dB; knee 6, ratio 12, attack 0.003, and release 0.1 stay. On `tutorial_groove.bax` at master 1.0 the post-limiter level is within 0.01 dB of pre-limiter.
- [ ] T055 [US1] Match FR-011 releases and note-start alignment in `packages/engine/src/audio/pcmRenderer.ts`. SC-001 passes for channels 1–4 and the full mix against WebAudio captured after T051–T054. Pulse and noise now render the 5 ms linear tail, wave without a GB envelope renders the 20 ms exponential tail, and the GB curve holds its last step until that tail. The full mix and channels 2–4 pass. Channel 1 still fails: one envelope frame by 1.02 dB, and the bands from 20 Hz to 250 Hz are about 4.3 dB quieter than WebAudio.
- [ ] T056 [US1] Author listen of Desktop (after T051–T054) and of the PCM export (after T055) for `songs/gameboy/tutorial_groove.bax`. Record the result in `docs/qa/webaudio-pcm-parity-qa.md`.
- [ ] T057 [US2][US3] Run `songs/effects/` vib, arp, port, trem, cut, echo, and retrig fixtures through SC-002. Fix any Desktop handler that has the same defect class as T051–T053.

## Polish

- [x] T900 [P] Update dual-rendering section in `docs/contributing/creating-plugins.md` (PCM effects ≠ “None”).
- [ ] T901 [P] Note in `specs/STATUS.md` / completed 110 entry that FR-004 supersedes the PCM carve-out when this feature ships.
- [ ] T902 Regenerate `songs/gameboy/tutorial_groove.wav` and `songs/gameboy/tutorial_groove-channel-*.wav` from PCM after T055. The files on disk were exported from PCM before the revised gates; they are not the sign-off fixtures.
- [ ] T903 Move this folder to `specs/complete/112-webaudio-pcm-effect-parity/` and update `specs/STATUS.md` when shipped; comment completion on https://github.com/kadraman/beatbax/issues/276 and close #42 if echo/retrig fully done.
