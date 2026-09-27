# CLI MIDI → .bax import

Convert Standard MIDI Files into editable BeatBax source.

```bash
beatbax import midi song.mid song.bax --chip gameboy
beatbax convert midi2bax song.mid song.bax --chip nes   # alias

# NES + DMC kick/snare (example config beside the F03 golden):
beatbax import midi packages/engine/tests/fixtures/midi/f03-nes-kit.mid out.bax \
  --chip nes --config packages/engine/tests/fixtures/midi/f03-nes-kit.import.json
```

## Options

| Flag | Description |
|------|-------------|
| `--chip <chip>` | **Required.** `gameboy` or `nes` (v1) |
| `--config <file>` | Optional JSON mapping / quantize override |
| `--quantize <mode>` | `nearest` (default), `floor`, `ceil`, `strict` |
| `--grid <grid>` | `1/4`, `1/8`, `1/16` (default), `1/32` |
| `--max-bars <N>` | Clamp generated bar count |
| `--max-overlap-ticks <N>` | Allow N ticks of overlap when multiplexing with `inst()` (default 0) |
| `--section-bars <N>` | Bars per Pattern Grid section (default **8**; **0** = monolithic one `seq` per channel) |
| `--dry-run` | Print summary only; do not write `.bax` |
| `--strict` | Fail on strict-quantize / conversion errors |
| `--title <name>` | Override `song name` metadata |

## Config schema (optional)

```json
{
  "chip": "nes",
  "ticksPerBeat": 4,
  "patternTicks": 16,
  "trackMappings": [
    { "midiTrack": 1, "target": "pulse1", "instrument": "lead" },
    { "midiTrack": 2, "target": "pulse2", "instrument": "arp" },
    { "midiTrack": 3, "target": "triangle", "instrument": "bass" },
    { "midiTrack": 4, "target": "noise", "drumMap": { "36": "kick", "38": "snare", "42": "hihat" } }
  ],
  "programFamilies": {
    "0-7": "piano",
    "40-51": "strings"
  },
  "families": {
    "piano": { "gb": { "period": 2, "level": 13 } },
    "strings": { "gb": { "period": 0, "level": 12 } }
  },
  "dmcReinforcement": {
    "enabled": true,
    "kickSample": "@nes/kick",
    "snareSample": "@nes/snare"
  },
  "quantize": {
    "mode": "nearest",
    "grid": "1/16",
    "maxShiftTicks": 1
  },
  "maxOverlapTicks": 0,
  "drumFlamTicks": 0,
  "sectionBars": 8
}
```

`programFamilies` remaps GM program numbers (or `min-max` ranges) onto family ids (`piano|guitar|bass|strings|pad|lead`). `families` overrides articulation fields for those ids (GB `period`/`level`/duty/waveVolume; NES `vol`/`volEnv`/duty). Both merge over built-in defaults. See [family-override.example.json](../../packages/engine/tests/fixtures/midi/family-override.example.json).

`trackMappings[].target` must be one of `pulse1|pulse2|wave|triangle|noise|dmc`. Optional `midiChannel` must be an integer in **0–15** (0-based, matching SMF) or **1–16** (1-based); both conventions are accepted (valid values 0–16 inclusive). Invalid targets or channels are rejected at config parse time.

`drumFlamTicks` (default `0`) optionally nudges losing drum tokens forward into empty ticks. Leave at `0` for clean backbeats; set `≥1` only if you want hats flammed after a kick/snare. Flams never overwrite a native hit.

`sectionBars` (default `8`) chunks each channel playlist into fixed-size arrangement sections with `# --- Section N: Bars A-B ---` headers and `channel … seq s01 s02 …` bindings so Desktop Pattern Grid is not stuck in monolithic mode. Set `0` for a single seq per channel (legacy). Songs with `bars ≤ sectionBars` stay one section.

- Without `--config`, tracks are auto-mapped from GM program, track name, channel 10 (drums), and pitch-range heuristics. Track names prefer chiptune/producer labels (`bassline`, `pluck`, `chords`, `saw lead`, `kick`/…) before orchestral ones (`violin`, `cello`, …).

## Behaviour notes

- Emits a chip instrument kit from **GM program families** (`piano`, `guitar`, `bass`, `strings`, `pad`, `lead`) typed for the packed role (`{family}_p1` / `_p2` / `_bass`), plus named percussion `kick` / `snare` / `hihat` / `ghost` / `crash` (and GB `shaker`). Defaults live in code; `--config` may override via `programFamilies` / `families`. Piano/guitar use shorter GB envelopes; strings/pad use `period=0` hold; synth `lead` stays punchier. GB wave bass uses `volume=25`. NES drums use battle-style noise periods (`12` / `7` / `2`); opt-in `dmcReinforcement` keeps those noise defs and adds distinct `kick_dmc` / `snare_dmc` on channel 5. Config `trackMappings[].instrument` overrides the family name.
- GM drums: kick 35/36, snare 38/40, **hand clap 39 → snare**, hats 42/44/46, crash 49, side stick 37 → ghost. Layered kick+snare on one tick keeps the **snare** (backbeat over four-on-the-floor). Optional `drumFlamTicks ≥ 1` can nudge losers into empty ticks.
- Packs melodic voices into chip channels; multiplexes non-overlapping streams with `inst(name)`; warns and drops on over-polyphony.
- Splits into 16-tick bars by default, reuses identical bars as shared `pat` names, and compresses sequences with `*N`.
- Deterministic: same MIDI + chip + options → byte-identical `.bax`.
- Not a round-trip guarantee with `export midi`; Desktop MIDI step-entry is a separate feature.

## Current limitations

These apply to the shipped importer. Most of them are addressed by the planned follow-up, feature 089 ([issue #213](https://github.com/kadraman/beatbax/issues/213)); none of the 089 config fields are available yet.

- **Whole tracks only.** `trackMappings` map an entire track or channel. A track can only share a chip channel with another part if their notes never overlap (beyond `maxOverlapTicks`). Otherwise it moves to another free channel of the same kind, or is dropped whole with an `over_polyphony` warning. On dense multi-track MIDIs this can drop a large share of the notes.
- **Chord reduction.** When notes start together on one channel, the importer keeps the earliest note, then the louder, then the **lower** pitch (`chord_flatten`). For chordal lead parts this keeps the bottom of the chord rather than the melody.
- **One tempo.** The first tempo event is used for the whole song. Later tempo changes are reported as `tempo_map_ignored`. If a file starts with a count-in at a different tempo, the whole song imports at the count-in tempo.
- **Fixed bars.** Output bars are always `patternTicks` long (16 steps by default). Other or changing time signatures are reported as `time_signature_ignored`.
- **`ticksPerBeat` other than 4.** Setting `ticksPerBeat: 3` gives a triplet-eighth grid, but the source `bpm` is written unchanged, so the result plays at 4/3 of the source speed. Until 089 lands, set the written tempo by hand: source bpm × `ticksPerBeat` / 4 (e.g. 135 → 101).
- **NES drum tokens.** The NES kit has no `shaker`. On NES, map shaker, cabasa and maracas notes to `hihat` in `drumMap`; a `shaker` value is reported by `beatbax verify` as an unknown token.
- **No track filtering.** Tracks that match no `trackMappings` entry are still auto-mapped. To leave a track out, remove it from the MIDI file before importing.

## Spec

- Feature: [specs/complete/006-midi-importer/](../../specs/complete/006-midi-importer/)
- Fixtures: [fixtures.md](../../specs/complete/006-midi-importer/fixtures.md)
- Planned follow-up (arrangement-aware import): [specs/features/089-midi-import-arrangement/](../../specs/features/089-midi-import-arrangement/), [issue #213](https://github.com/kadraman/beatbax/issues/213)
