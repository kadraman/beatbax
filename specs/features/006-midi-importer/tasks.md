# Tasks: CLI MIDI → .bax Conversion

**Input**: [spec.md](spec.md), [plan.md](plan.md), [fixtures.md](fixtures.md)

## A. Specification pass (this work)

Planning and inventory only — no engine/CLI implementation.

- [x] Clarify CLI-only conversion scope; exclude Desktop/Web MIDI step-entry (065) and IDE import UI from v1
- [x] Revise requirements for `--chip`, auto-mapping, default kits, pattern/seq reuse, over-polyphony warnings, and `inst()` packing
- [x] Identify synthetic CI fixtures F01–F09 and well-known stretch songs S01–S10 ([fixtures.md](fixtures.md))
- [x] Defer implementation checklist to section B (no code, deps, or binary `.mid` commits in this pass)

## B. Implementation checklist

- [x] T001 Define converter config schema and defaults (`--chip` required; auto-map on)
- [x] T002 Add `@tonejs/midi` dependency to the appropriate package
- [x] T003 Implement MIDI reader adapter
- [x] T004 Implement timing normalization and quantization pipeline
- [x] T005 Implement role classifier + track/channel mapping (auto + `--config`)
- [x] T006 Implement channel packer (`inst()` multiplexing, over-polyphony warnings)
- [x] T007 Implement kit emitter (GB + NES defaults; GM drum → named tokens)
- [x] T008 Implement pattern partitioning, reuse engine, and sequence emission
- [x] T009 Implement deterministic naming and ordering rules
- [x] T010 Implement CLI `import midi` (optional `convert midi2bax` alias) and option parsing
- [x] T011 Implement diagnostics output and strict-mode behavior
- [x] T012 Obtain/generate F01–F09 fixtures per [fixtures.md](fixtures.md); commit under `packages/engine/tests/fixtures/midi/`
- [x] T013 Add unit tests for all core conversion steps
- [x] T014 Add integration golden tests for F01–F09; `verify` generated `.bax`
- [x] T015 Document CLI usage, config schema, and stretch-set obtainment notes
- [x] T016 (Manual) Stretch conversions S01–S06 / S09–S10 documented as operator-local in [fixtures.md](fixtures.md); never vendor S07–S08
- [x] T017 GM program family → named instrument kit (piano short / strings sustain / …); pack uses family+role names; emit used melodic defs + percussion
- [x] T018 Config `programFamilies` + `families` merge over built-in GM family defaults
- [x] T019 Drum stacks: `snare` > `kick` on same tick (backbeat); optional flam via `drumFlamTicks` (default 0); GM clap (39) → `snare`
