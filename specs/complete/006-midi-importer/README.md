# CLI MIDI → .bax Conversion

- **ID**: 006
- **Status**: complete (shipped in https://github.com/kadraman/beatbax/pull/208)
- **Area**: engine
- **Issue**: https://github.com/kadraman/beatbax/issues/101
- [spec.md](spec.md) — WHAT / WHY (CLI conversion; not Desktop MIDI step-entry)
- [plan.md](plan.md) — HOW
- [tasks.md](tasks.md) — T001–T020 complete
- Follow-up: feature **089** `midi-import-arrangement` ([specs/features/089-midi-import-arrangement/](../../features/089-midi-import-arrangement/))
- [fixtures.md](fixtures.md) — F01–F09 CI fixtures + S01–S10 stretch songs

Product language may say “conversion”; slug remains `midi-importer` for continuity.

## Quick usage

```bash
beatbax import midi song.mid song.bax --chip gameboy
beatbax convert midi2bax song.mid song.bax --chip nes --config mapping.json
beatbax import midi song.mid --chip gameboy --dry-run
```
