# Spectrum 128 sample songs

BeatBax songs for the `@beatbax/plugin-chip-spectrum-128` plugin (AY-3-8912).

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements (e.g. `mony_mony.bax`, `amstrad-cpc-demo.bax`) |
| `instruments/` | Focused instrument / capability demos (`ay_*.bax`) |
| `effects/` | Macro and hardware trade-off demos |

Same convention as `songs/nes/` and `songs/sms/`.

## Play

```bash
beatbax play songs/spectrum-128/instruments/ay_percussion_demo.bax
beatbax verify songs/spectrum-128/instruments/ay_noise_rate_conflict.bax
```

## Instrument demos

| File | Purpose |
|------|---------|
| `ay_synth_channels.bax` | Tone A/B/C smoke check |
| `ay_macro_arp_pitch.bax` | `arp_env`, `pitch_env` |
| `ay_percussion_demo.bax` | Full named drum kit |
| `ay_noise_mixing.bax` | R7 mixer routing |
| `ay_buzz_bass.bax` | Buzz bass |
| `ay_all_macros.bax` | All macro fields (3 sections; hardware-multiplexed) |
| `ay_noise_rate_conflict.bax` | Intentional R6 conflict (verify warning) |
| `ay_vol_env_conflict.bax` | Intentional envelope conflict (verify warning) |

## Effect demos

| File | Purpose |
|------|---------|
| `ay_effects_showcase.bax` | Macros + hardware limits |

## Docs

- [Composition guide](../../docs/chips/zx-spectrum-128/composition_guide.md) — arranging and percussion recipes
- [Plugin README](../../packages/plugins/chip-spectrum-128/README.md)
