# Tasks: hUGETracker UGE Converter

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [ ] T001 Complete plan Constitution Check; reuse existing UGE reader

## Phase 1: Mechanical CLI converter

- [ ] T010 `convertUGEToBax(uge, opts): string` in engine/import path
- [ ] T011 CLI: `beatbax convert uge song.uge <song.bax>`
- [ ] T012 Instrument, wavetable, pattern, order, effect conversion + unsupported warnings
- [ ] T013 Round-trip smoke: UGE → bax → parse → export UGE playable

## Phase 2: Subpattern preservation

- [ ] T020 Detect UGE instrument subpatterns; emit `subpat` declarations
- [ ] T021 Preserve unsupported details as comments when needed

## Phase 3: Naming and deduplication

- [ ] T030 Stable names for reused patterns; friendlier instrument names
- [ ] T031 Group sequences by channel/section where possible

## Phase 4: UI import

- [ ] T040 Desktop/web “Import UGE” flow with preview + conversion warnings
- [ ] T041 Unit/snapshot tests per Test Plan in [plan.md](plan.md)
- [ ] T042 Move to `specs/complete/016-hugetracker-uge-converter/` when shipped
