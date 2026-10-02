# Arrangement-aware MIDI import

- **ID**: 089
- **Status**: complete (2026-09-30; all open questions resolved). Operator-local `songs/covers` parity (SC-002 to SC-004) shown and `split-midi.mjs` retired 2026-10-01. See [parity.md](parity.md)
- **Area**: engine
- **Issue**: https://github.com/kadraman/beatbax/issues/213
- **Builds on**: feature **006** `midi-importer` ([specs/complete/006-midi-importer/](../../complete/006-midi-importer/))
- [spec.md](spec.md) — WHAT / WHY
- [plan.md](plan.md) — HOW (Constitution Check)
- [tasks.md](tasks.md) — T000–T904
- [parity.md](parity.md) — SC-001 compatibility results and the covers parity run
- User docs: [docs/features/midi-importer.md](../../../docs/features/midi-importer.md)

Brings the `songs/covers/tools/split-midi.mjs` prototype into `beatbax import midi`:

- bar-range track mappings with gap-fill lanes;
- per-mapping chord reduction, transpose and fold;
- drum include/exclude;
- tempo override and longest-held tempo;
- bar window and nudge;
- triplet tempo scaling;
- `--inspect`;
- `--annotate`.
