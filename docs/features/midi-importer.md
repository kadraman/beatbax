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
  "drumFlamTicks": 0
}
```

`programFamilies` remaps GM program numbers (or `min-max` ranges) onto family ids (`piano|guitar|bass|strings|pad|lead`). `families` overrides articulation fields for those ids (GB `period`/`level`/duty/waveVolume; NES `vol`/`volEnv`/duty). Both merge over built-in defaults. See [family-override.example.json](../../packages/engine/tests/fixtures/midi/family-override.example.json).

`trackMappings[].target` must be one of `pulse1|pulse2|wave|triangle|noise|dmc`. Optional `midiChannel` must be an integer in **0–15** (0-based, matching SMF) or **1–16** (1-based); both conventions are accepted (valid values 0–16 inclusive). Invalid targets or channels are rejected at config parse time.

`drumFlamTicks` (default `0`) optionally nudges losing drum tokens forward into empty ticks. Leave at `0` for clean backbeats; set `≥1` only if you want hats flammed after a kick/snare. Flams never overwrite a native hit.

- Without `--config`, tracks are auto-mapped from GM program, track name, channel 10 (drums), and pitch-range heuristics. Track names prefer chiptune/producer labels (`bassline`, `pluck`, `chords`, `saw lead`, `kick`/…) before orchestral ones (`violin`, `cello`, …).

## Behaviour notes

- Emits a chip instrument kit from **GM program families** (`piano`, `guitar`, `bass`, `strings`, `pad`, `lead`) typed for the packed role (`{family}_p1` / `_p2` / `_bass`), plus named percussion `kick` / `snare` / `hihat`. Defaults live in code; `--config` may override via `programFamilies` / `families`. Piano/guitar use shorter GB envelopes; strings/pad use `period=0` hold; synth `lead` stays punchier. GB wave bass uses `volume=25`. NES drums use battle-style noise periods (`12` / `7` / `2`) unless `dmcReinforcement` is enabled. Config `trackMappings[].instrument` overrides the family name.
- GM drums: kick 35/36, snare 38/40, **hand clap 39 → snare**, hats 42/44/46, crash 49, side stick 37 → ghost. Layered kick+snare on one tick keeps the **snare** (backbeat over four-on-the-floor). Optional `drumFlamTicks ≥ 1` can nudge losers into empty ticks.
- Packs melodic voices into chip channels; multiplexes non-overlapping streams with `inst(name)`; warns and drops on over-polyphony.
- Splits into 16-tick bars by default, reuses identical bars as shared `pat` names, and compresses sequences with `*N`.
- Deterministic: same MIDI + chip + options → byte-identical `.bax`.
- Not a round-trip guarantee with `export midi`; Desktop MIDI step-entry is a separate feature.

## Spec

- Feature: [specs/features/006-midi-importer/](../../specs/features/006-midi-importer/)
- Fixtures: [fixtures.md](../../specs/features/006-midi-importer/fixtures.md)
