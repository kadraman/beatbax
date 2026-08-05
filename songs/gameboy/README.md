# Game Boy sample songs

BeatBax songs for the built-in Game Boy (DMG-01) chip.

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements |
| `instruments/` | Instrument / capability demos (`gb_*.bax`) |
| `effects/` | Per-effect demos |

Same convention as `songs/nes/`, `songs/sms/`, and `songs/spectrum-128/`.

## Full arrangements

| File | Key / tempo | Style |
|------|-------------|-------|
| `a_trainers_journey.bax` | C major (Am bridge), 128 | Bright, bouncy adventure |
| `crypt_of_fallen_kings.bax` | A harmonic minor, 160 | Driving dark heroic |
| `digital_citadel.bax` | C minor, 168 | Fast mechanical action |
| `grassland_dash.bax` | G major, 149 | Bouncy energetic overworld |
| `graveyard_shift.bax` | B minor, 112 | Eerie funky drama |
| `heroes_call.bax` | D major, 112 | Heroic mystical anthem |
| `mystic_voyage.bax` | G major, 128 | Pastoral soaring adventure |
| `night_hawk.bax` | E minor, 128 | Driving cinematic action |
| `tutorial_groove.bax` | C major, 140 | [Tutorial](https://beatbax.com/docs/tutorial/overview) walkthrough groove |

Full songs are original compositions. They demonstrate pulse duty/envelopes/sweep, wave tables, noise kits, macros (`vol_env`, `pitch_env`, `duty_env`, `arp_env`, `subpat`), and UGE-oriented instrument fields such as `uge_note=`.

## Play / export

```bash
npm run cli -- play songs/gameboy/night_hawk.bax
npm run cli -- play songs/gameboy/instruments/gb_subpattern_macro_demo.bax
npm run cli -- export uge songs/gameboy/instruments/gb_subpattern_macro_demo.bax tmp/demo.uge
npm run cli -- export wav songs/gameboy/instruments/gb_subpattern_macro_demo.bax tmp/demo.wav
npm run cli -- verify songs/gameboy/effects/gb_effects_demo.bax
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

## Effect demos

| File | Purpose |
|------|---------|
| `gb_effects_demo.bax` | Combined inline-effects overview |
| `gb_vibrato_demo.bax` | Vibrato |
| `gb_tremolo_demo.bax` | Tremolo |
| `gb_portamento_demo.bax` | Portamento |
| `gb_pitchbend_demo.bax` | Pitch bend |
| `gb_arpeggio_demo.bax` | Arpeggio |
| `gb_volume_slide_demo.bax` | Volume slide |
| `gb_notecut_demo.bax` | Note cut / gate |
| `gb_retrigger_demo.bax` | Retrigger |
| `gb_echo_demo.bax` | Echo |
| `gb_panning_demo.bax` | Panning |
| `gb_sweep_demo.bax` | Sweep (effect-focused) |

## Docs

- [Composition guide](../../docs/chips/gameboy/composition_guide.md)
- [Instrument programs → UGE subpatterns](../../docs/features/complete/gameboy-uge-instrument-subpatterns.md)
- [UGE export guide](../../docs/exports/uge-export-guide.md)
- [Instrument note mapping](../../docs/grammar/instrument-note-mapping-guide.md)
