# Tasks: Song Timing Pattern Grid Inspector

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [ ] T001 Complete plan Constitution Check

## Phase 1: Engine / app-core

- [ ] T010 Resolver-side timeline extraction helper (channel lengths, blocks, event rows, source refs)
- [ ] T011 Timing diagnostics after resolution
- [ ] T012 Expose diagnostics through existing editor/app-core validation plumbing
- [ ] T013 [P] Optional UGE exporter-readiness diagnostics

## Phase 2: UI

- [ ] T020 Pattern Grid Inspector tab / diagnostics mode
- [ ] T021 Channel rows with block widths ∝ `lengthSteps`; bar/step ruler
- [ ] T022 Diagnostic badges on affected blocks
- [ ] T023 Block details panel (pat/seq, length, step table, diagnostics, jump-to-source)

## Phase 3: Tests and ship

- [ ] T030 Fixtures: 15-step pattern, channel length mismatch, section mismatch, split kit, portamento/UGE warnings
- [ ] T031 Move to `specs/complete/015-song-timing-pattern-grid-inspector/` when shipped
