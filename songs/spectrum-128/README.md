# Spectrum 128 / CPC sample songs

BeatBax songs for the `@beatbax/plugin-chip-spectrum-128` plugin (AY-3-8912 — ZX Spectrum 128 & Amstrad CPC).

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements (`chip spectrum-128` or `chip cpc`) |
| `instruments/` | Focused instrument / capability demos (`ay_*.bax`) |
| `effects/` | Macro and hardware trade-off demos |

Same convention as `songs/nes/`, `songs/gameboy/`, and `songs/sms/`.

## Full arrangements

| File | Chip | Key / tempo | Form | Style |
|------|------|-------------|------|-------|
| `spectral_phantoms.bax` | `spectrum-128` | D harmonic minor, 140 | Intro → A → Bridge → B → Break → A' climax → Coda | Gothic set-piece — descending runs, mid-bridge tension, virtuosic sweeps last |
| `steel_justice.bax` | `spectrum-128` | A minor, 128 | Intro → A → Break → B → A' → Coda | Action title — early kit break, march hook, lyrical middle |
| `cave_run_theme.bax` | `cpc` | C major, 132 | Intro → A → Quiet → B → Bridge → A-tag → Coda | Platformer bounce — quiet echo middle, no drum-only break |

All three are original compositions. They demonstrate named instruments, macros (`arp_env`, `vol_env`), `env_bass`, named percussion, and inline effects.

Shared conventions worth copying when writing your own AY arrangements:

- Every drum uses the same `noise_rate` so multiplexed hits never fight over the global R6 register.
- Buzz bass runs at `vol=8`; `env_bass` amplitude comes straight from `vol`, so 15 will swamp the mix.
- Leads use no `pitch_env` — it interpolates across the whole note and detunes sustained melody. Pitch macros are reserved for the kick drop.
- Lead colour instead comes from inline effects (`vib`, `trem`/`sparkle`, `cut`/`gate`, `port`, `bend`, `volSlide`) and, for short notes only, a same-volume `arp_env` lead. Avoid soft/bright volume jumps mid-phrase — AY has no duty cycle, so level changes read as hard drops rather than timbre shifts.
- Arpeggio harmony uses one instrument per chord quality (`arp_min` / `arp_maj` / `arp_dim`) selected per bar, rather than stacking an inline `arp` effect on top of an `arp_env` instrument.
- The kit borrows the bass channel between buzz notes, which is how three-channel AY tunes fit drums in.

## Play

```bash
npm run cli -- play songs/spectrum-128/spectral_phantoms.bax
npm run cli -- play songs/spectrum-128/steel_justice.bax
npm run cli -- play songs/spectrum-128/cave_run_theme.bax
npm run cli -- play songs/spectrum-128/instruments/ay_percussion_demo.bax
npm run cli -- verify songs/spectrum-128/instruments/ay_noise_rate_conflict.bax
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
| `ay_effects_showcase.bax` | Supported inline effects (vib, port, bend, volSlide, trem, cut, …) |
| `ay_unsupported_effects_demo.bax` | Invalid / SMS-only effects and instrument fields (for `verify`) |

## Docs

- [Composition guide](../../docs/chips/zx-spectrum-128/composition_guide.md) — arranging and percussion recipes
- [Plugin README](../../packages/plugins/chip-spectrum-128/README.md)
