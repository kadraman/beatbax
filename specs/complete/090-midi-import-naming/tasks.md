# Tasks: Readable names in MIDI import output

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

## Phase 1: User Story 1 — Read and edit an imported song (P1)

- [x] T010 [US1] Instrument names: `_inst` for generated melodic instruments; parse old and new forms (spec FR-020 to FR-022) in `packages/engine/src/import/midi/kit.ts`
- [x] T011 [US1] Pattern names: `<prefix>_<n>_pat` numbered by first appearance, `rest_x<N>_pat`, order (FR-001 to FR-004) in `packages/engine/src/import/midi/reuse.ts` and `packages/engine/src/import/midi/emit.ts`
- [x] T012 [US1] Sequence names `<prefix>_seq` / `<prefix>_s<NN>_seq` (FR-010) in `packages/engine/src/import/midi/reuse.ts` and `emit.ts`
- [x] T013 [US1] New tests `packages/engine/tests/import/midi/midi-naming.test.ts`; update name assertions in `packages/engine/tests/import/midi/*.test.ts` and `packages/cli/tests/import-midi.test.ts`
- [x] T014 [US1] SC-002: resolved timelines of F01–F14 identical to the pre-090 engine — 2026-10-01: 630 conversions (F01–F14 × `gameboy`/`nes` × no config, `f03-nes-kit`, `f06-inst-switch`, `family-override` and each fixture's own config × 5 option variants); resolved per-step timelines, `inst` line bodies, line counts and diagnostics identical once `_inst` is stripped; no hash names left

**Checkpoint**: story independently testable.

## Polish

- [x] T900 Update `docs/features/midi-importer.md`, add `.changeset/midi-import-naming.md`, note the change in `specs/complete/006-midi-importer/spec.md`
- [x] T901 `npm test` green
- [x] T902 Move this folder to `specs/complete/090-midi-import-naming/` and update `specs/STATUS.md` when shipped (issue [#214](https://github.com/kadraman/beatbax/issues/214))
