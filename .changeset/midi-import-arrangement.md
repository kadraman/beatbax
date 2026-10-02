---
"@beatbax/engine": minor
"@beatbax/cli": minor
---

Arrangement-aware MIDI import (feature 089, [#213](https://github.com/kadraman/beatbax/issues/213)): describe which part plays where in the import config instead of pre-splitting the MIDI file.

**Behaviour change:** imports with `ticksPerBeat` other than 4 now write `bpm` as `round(source bpm × ticksPerBeat / 4)`, so they play at the source speed. Previously the source bpm was written unchanged, so a `ticksPerBeat: 3` import played 4/3 too fast. Imports with the default `ticksPerBeat: 4` are unchanged.

**Fix:** drum notes longer than one step are now written as a one-step hit plus rests (`kick .:3`) instead of `kick:4`. Named drum tokens always play for one step, so the old output left the noise and DMC channels shorter than the rest of the song and pushed later hits out of time.

**Engine**

- `trackMappings[]` gain `fromBar` / `toBar` (source bars), `mono` (`earliest` | `highest` | `lowest` | `newest`, with a legato tail rule), `transpose` / `fold` for melodic targets, and `include` / `exclude` for noise and DMC targets. A track may appear in several mappings.
- Top-level `packing: "lanes"` makes mapping targets binding: mappings sharing a target fill one channel in config order, and overlapping notes are dropped and counted per mapping (`lane_overlap`).
- Top-level `unmappedTracks: "drop"`, `bpm`, `tempo: "longest"`, `startBar` / `endBar` window, `nudge`, and `annotate`.
- `inspectMidiBytes()` / `inspectMidiParseResult()` return a deterministic per-track report (channels, programs, ranges, activity, duplicate tracks, tempos with bars).
- Optional `ConversionSummary.mappingStats` with kept and dropped counts per mapping.
- Configs that use none of the new fields produce the same output as before, apart from the tempo and drum-length fixes above.

**CLI**

- `beatbax import midi song.mid --inspect` (no `--chip` needed) prints the track report; `--json` prints it as JSON.
- `--annotate` starts the output with a comment block listing each channel's mappings, kept and dropped notes by reason, and timing decisions.
