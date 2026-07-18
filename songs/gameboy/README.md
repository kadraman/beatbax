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

- [Instrument programs → UGE subpatterns](../../docs/features/gameboy-uge-instrument-subpatterns.md)
- [Composition guide](../../docs/chips/gameboy/composition_guide.md)
- [UGE export guide](../../docs/exports/uge-export-guide.md)
- [Instrument note mapping](../../docs/grammar/instrument-note-mapping-guide.md)
