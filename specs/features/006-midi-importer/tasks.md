# Tasks: CLI MIDI → .bax Conversion

**Input**: [spec.md](spec.md), [plan.md](plan.md), [fixtures.md](fixtures.md)

## A. Specification pass (this work)

Planning and inventory only — no engine/CLI implementation.

- [x] Clarify CLI-only conversion scope; exclude Desktop/Web MIDI step-entry (065) and IDE import UI from v1
- [x] Revise requirements for `--chip`, auto-mapping, default kits, pattern/seq reuse, over-polyphony warnings, and `inst()` packing
- [x] Identify synthetic CI fixtures F01–F09 and well-known stretch songs S01–S10 ([fixtures.md](fixtures.md))
- [x] Defer implementation checklist to section B (no code, deps, or binary `.mid` commits in this pass)

## B. Deferred implementation checklist

Normalize to `Tnnn` as work proceeds. **Do not start these in the specification pass.**

- [ ] T001 Define converter config schema and defaults (`--chip` required; auto-map on)
- [ ] T002 Add `@tonejs/midi` dependency to the appropriate package
- [ ] T003 Implement MIDI reader adapter
- [ ] T004 Implement timing normalization and quantization pipeline
- [ ] T005 Implement role classifier + track/channel mapping (auto + `--config`)
- [ ] T006 Implement channel packer (`inst()` multiplexing, over-polyphony warnings)
- [ ] T007 Implement kit emitter (GB + NES defaults; GM drum → named tokens)
- [ ] T008 Implement pattern partitioning, reuse engine, and sequence emission
- [ ] T009 Implement deterministic naming and ordering rules
- [ ] T010 Implement CLI `import midi` (optional `convert midi2bax` alias) and option parsing
- [ ] T011 Implement diagnostics output and strict-mode behavior
- [ ] T012 Obtain/generate F01–F09 fixtures per [fixtures.md](fixtures.md); commit under `packages/engine/tests/fixtures/midi/`
- [ ] T013 Add unit tests for all core conversion steps
- [ ] T014 Add integration golden tests for F01–F09; `verify` generated `.bax`
- [ ] T015 Document CLI usage, config schema, and stretch-set obtainment notes
- [ ] T016 (Manual) Run stretch conversions S01–S06 / S09–S10; document results; never vendor S07–S08 copyrighted MIDIs
