# Game Boy sample songs

BeatBax songs for the built-in Game Boy (DMG-01) chip.

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements |
| `instruments/` | Instrument / capability demos |
| `effects/` | Per-effect demos |

## Play / export

```bash
npm run cli -- play songs/gameboy/instruments/gb_subpattern_macro_demo.bax
npm run cli -- export uge songs/gameboy/instruments/gb_subpattern_macro_demo.bax tmp/demo.uge
npm run cli -- export wav songs/gameboy/instruments/gb_subpattern_macro_demo.bax tmp/demo.wav
```

## UGE tempo alignment

hUGETracker stores integer ticks per row (`round(896 / bpm)`). Prefer BPM values that divide 896 evenly so BeatBax preview and UGE export match:

| `bpm` | UGE ticks/row | Notes |
|------:|-------------:|-------|
| 128 | 7 | Default for most demos and several full songs |
| 112 | 8 | `heroes_call`, `graveyard_shift` |
| 149 | 6 | `grassland_dash`, percussion / faster effect demos |

Demos and most arrangements use these exact-match tempos. A few full songs still use approximate BPMs (`crypt_of_fallen_kings` 160, `digital_citadel` 168, `gb_wave_scan_demo` 156) where the Bax groove matters more than export parity — see [UGE export guide — Tempo and BPM alignment](../../docs/exports/uge-export-guide.md#tempo-and-bpm-alignment).

## Instrument demos

| File | Purpose |
|------|---------|
| `gb_instrument_demo.bax` | Pulse / wave / noise basics |
| `gb_uge_note_demo.bax` | `uge_note=` → NR43 + UGE pattern note |
| `gb_percussion_demo.bax` | Named drum kit with `uge_note=` + `pitch_env` / `vol_env` / `subpat` |
| `gb_subpattern_macro_demo.bax` | `pitch_env` / `vol_env` / `duty_env` / `arp_env` / native `subpat` → UGE subpatterns |
| `gb_sweep_demo.bax` | Pulse 1 hardware sweep |
| `gb_wave_scan_demo.bax` | Wave channel tables |
| `gb_dcm_demo.bax` | Duty-cycle modulation (`inst` switches + `duty_env` within-note wah) |

## Docs

- [Instrument programs → UGE subpatterns](../../docs/features/complete/gameboy-uge-instrument-subpatterns.md)
- [Composition guide](../../docs/chips/gameboy/composition_guide.md)
- [UGE export guide](../../docs/exports/uge-export-guide.md)
- [Instrument note mapping](../../docs/grammar/instrument-note-mapping-guide.md)
