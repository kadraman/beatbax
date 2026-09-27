# Arrangement-aware MIDI import

- **ID**: 089
- **Status**: specified (OQ-1, OQ-2 and OQ-6 resolved; OQ-3 to OQ-5 open)
- **Area**: engine
- **Issue**: https://github.com/kadraman/beatbax/issues/213
- **Builds on**: feature **006** `midi-importer` ([specs/complete/006-midi-importer/](../../complete/006-midi-importer/))
- [spec.md](spec.md) — WHAT / WHY
- [plan.md](plan.md) — HOW (Constitution Check)
- [tasks.md](tasks.md) — T000–T904

Brings the `songs/covers/tools/split-midi.mjs` prototype into `beatbax import midi`:

- bar-range track mappings with gap-fill lanes;
- per-mapping chord reduction, transpose and fold;
- drum include/exclude;
- tempo override and longest-held tempo;
- bar window and nudge;
- triplet tempo scaling;
- `--inspect`;
- `--annotate`.
