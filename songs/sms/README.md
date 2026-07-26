# SMS / Game Gear sample songs

BeatBax songs for the `@beatbax/plugin-chip-sms` plugin (SN76489 PSG — Master System & Game Gear).

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements (`chip sms` or `chip gg`) |
| `instruments/` | Instrument / capability demos (`sms_*.bax`, `gamegear_*.bax`) |
| `effects/` | Inline-effect and unsupported-effect demos |

Same convention as `songs/nes/`, `songs/gameboy/`, and `songs/spectrum-128/`.

## Full arrangements

| File | Chip | Key / tempo | Style |
|------|------|-------------|-------|
| `battle_field.bax` | `sms` | D major, 172 | Driving arcade action / shooter |
| `battle_field_remix.bax` | `gg` | E major, 168 | Bright platformer / zone (stereo) |
| `green_zone.bax` | `gg` | C major, 174 | Bouncy platformer action (stereo) |
| `green_hill_remix.bax` | `gg` | C major, 174 | Alternate GG platformer arrangement (stereo) |
| `night_raid.bax` | `gg` | A minor, 148 | Dark urban action / beat-em-up (stereo) |

Arrangements are original compositions. They demonstrate attenuation-accurate `vol_env`, Tone-3–clocked / layered noise percussion, macros (`arp_env`, `pitch_env`, `noise_rate_env`), and — on Game Gear — `gg:pan` stereo routing.

SMS / GG attenuation reminder: **0 = loudest, 15 = mute**. Decay envelopes count **up** toward 15.

## Play

```bash
npm run cli -- play songs/sms/battle_field.bax
npm run cli -- play songs/sms/night_raid.bax
npm run cli -- play songs/sms/green_zone.bax
npm run cli -- play songs/sms/instruments/sms_synth_channels.bax
npm run cli -- verify songs/sms/effects/sms_unsupported_effects_demo.bax
```

## Instrument demos

| File | Purpose |
|------|---------|
| `sms_synth_channels.bax` | Tone 1/2/3 + noise smoke check |
| `sms_noise_channel.bax` | Noise modes / rates |
| `sms_tone3-sync.bax` | Tone 3 as noise clock |
| `sms_macro_arp_env.bax` | `arp_env` |
| `sms_macro_pitch_env.bax` | `pitch_env` |
| `sms_macro_noise_rate_env.bax` | `noise_rate_env` |
| `sms_percussion_layered_template.bax` | Layered kick / snare / hat kit |
| `sms_percussion_layered_slow.bax` | Slower layered groove |
| `gamegear_stereo_pan.bax` | `gg:pan` L/C/R routing |
| `gamegear_inline_pan.bax` | Inline pan changes |

## Effect demos

| File | Purpose |
|------|---------|
| `sms_effects_demo.bax` | Supported inline effects |
| `sms_unsupported_effects_demo.bax` | Invalid / other-chip effects (for `verify`) |

## Docs

- [Composition guide](../../docs/chips/sms/composition_guide.md)
- [Plugin README](../../packages/plugins/chip-sms/README.md)
