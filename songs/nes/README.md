# NES sample songs

BeatBax songs for the built-in NES / Famicom (Ricoh 2A03) chip.

## Layout

| Path | Contents |
|------|----------|
| `*.bax` (root) | Full arrangements |
| `instruments/` | Focused instrument / capability demos (`nes_*.bax`) |
| `effects/` | Inline-effect and unsupported-effect demos |
| `samples/` | Local `.dmc` samples referenced by some full songs |

Same convention as `songs/gameboy/`, `songs/sms/`, and `songs/spectrum-128/`.

## Full arrangements

| File | Channels | Key / tempo | Style |
|------|----------|-------------|-------|
| `battle_fanfare.bax` | 5 (incl. DMC) | A minor, 155 | Heroic RPG battle march |
| `iron_keep.bax` | 5 (local DMC) | A minor, 150 | Tense dungeon / action RPG |
| `kingdom_hall.bax` | 4 | C major / Am, 108 | Grand castle / throne-room RPG |
| `puffball_parade.bax` | 5 (incl. DMC) | F major, 132 | Bright platformer fanfare |
| `shadow_temple.bax` | 4 | D natural minor, 90 | Atmospheric dungeon / cave |
| `silver_orbit.bax` | 4 | E natural minor, 96 | Exploratory space-platformer |
| `wily_fortress.bax` | 5 (bundled DMC) | A minor, 160 | Fast action-platformer / boss stage |

Full songs are original compositions. They demonstrate pulse duty/envelopes, triangle bass writing, noise kits, macros (`vol_env`, `arp_env`, `pitch_env`, `duty_env`), delayed vibrato, and optional DMC percussion.

Triangle has **no hardware volume** — control presence with register (prefer low octaves), note length, and rests between hits.

## Play

```bash
npm run cli -- play songs/nes/silver_orbit.bax
npm run cli -- play songs/nes/iron_keep.bax
npm run cli -- play songs/nes/wily_fortress.bax
npm run cli -- play songs/nes/instruments/nes_synth_channels.bax
npm run cli -- verify songs/nes/effects/nes_unsupported_effects_demo.bax
```

## Instrument demos

| File | Purpose |
|------|---------|
| `nes_synth_channels.bax` | Pulse 1/2, triangle, noise smoke check |
| `nes_macro_vol_env_loop.bax` | Looped `vol_env` |
| `nes_macro_noise_vol_env_oneshot.bax` | One-shot noise volume macros |
| `nes_macro_pitch_env.bax` | `pitch_env` |
| `nes_macro_arp_triangle.bax` | Triangle + `arp_env` |
| `nes_macro_duty_env.bax` | Pulse `duty_env` |
| `nes_dmc_demo.bax` | DMC sample triggering |
| `nes_dpcm_channel.bax` | DPCM / DMC channel coverage |

## Effect demos

| File | Purpose |
|------|---------|
| `nes_effects_demo.bax` | Supported inline effects (arp, cut, volSlide, vib, bend, port, sweep) |
| `nes_unsupported_effects_demo.bax` | Invalid / other-chip effects (for `verify`) |

## Docs

- [Composition guide](../../docs/chips/nes/composition_guide.md)
- [Hardware guide](../../docs/chips/nes/hardware_guide.md)
- [NES APU chip plugin](../../docs/features/complete/nes-apu-chip-plugin.md)
