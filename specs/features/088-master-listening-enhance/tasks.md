# Tasks: Optional master listening enhancement

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [x] T001 Add `specs/features/088-master-listening-enhance/{spec,plan,tasks}.md` and STATUS entry
- [ ] T002 [P] Add `packages/engine/src/audio/listeningEnhance.ts` presets + types
- [ ] T003 Wire enhance chain + API in `packages/engine/src/audio/playback.ts`

**Checkpoint**: Player can set Off/Mild/Strong on a mock AudioContext.

## Phase 1: User Story 1 — Engine behaviour (P1)

- [ ] T010 [US1] Tests in `packages/engine/tests/playback.listening-enhance.test.ts`
- [ ] T011 [US1] Update `playback.master-volume.test.ts` if disconnect/wiring assertions need enhance awareness
- [ ] T012 [US1] Engine CHANGELOG entry

## Phase 2: User Story 2 — Mixer control (P1)

- [ ] T020 [US2] StorageKey + event-bus + PlaybackManager bridge
- [ ] T021 [US2] Desktop Channel Mixer master strip control + CSS
- [ ] T022 [US2] Web-lite Channel Mixer master strip control + CSS

## Polish

- [ ] T900 Docs pointer under `docs/features/`
- [ ] T901 `codefence scan --staged`
