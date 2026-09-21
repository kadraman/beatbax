# CLI MIDI → .bax import

Convert Standard MIDI Files into editable BeatBax source.

```bash
beatbax import midi song.mid song.bax --chip gameboy
beatbax convert midi2bax song.mid song.bax --chip nes   # alias
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
  "maxOverlapTicks": 0
}
```

Without `--config`, tracks are auto-mapped from GM program, track name, channel 10 (drums), and pitch-range heuristics.

## Behaviour notes

- Emits a chip default instrument kit (wizard-aligned) plus named percussion tokens `kick` / `snare` / `hihat`.
- Packs melodic voices into chip channels; multiplexes non-overlapping streams with `inst(name)`; warns and drops on over-polyphony.
- Splits into 16-tick bars by default, reuses identical bars as shared `pat` names, and compresses sequences with `*N`.
- Deterministic: same MIDI + chip + options → byte-identical `.bax`.
- Not a round-trip guarantee with `export midi`; Desktop MIDI step-entry is a separate feature.

## Spec

- Feature: [specs/features/006-midi-importer/](../../specs/features/006-midi-importer/)
- Fixtures: [fixtures.md](../../specs/features/006-midi-importer/fixtures.md)
