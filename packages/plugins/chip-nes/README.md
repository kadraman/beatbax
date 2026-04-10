# @beatbax/plugin-chip-nes

NES Ricoh 2A03 APU chip plugin for [BeatBax](https://github.com/kadraman/beatbax).

## Summary

Adds support for the Nintendo Entertainment System audio hardware to BeatBax. Provides five hardware-accurate audio channels:

| Channel | Type       | Description |
|---------|-----------|-------------|
| 1       | Pulse 1   | Duty cycle oscillator with envelope and hardware sweep |
| 2       | Pulse 2   | Duty cycle oscillator with envelope and hardware sweep |
| 3       | Triangle  | Fixed 32-step triangle waveform with linear counter |
| 4       | Noise     | 15-bit LFSR noise generator (normal + loop modes) |
| 5       | DMC       | Delta-modulation sample playback |

## Installation

```bash
npm install @beatbax/plugin-chip-nes @beatbax/engine
```

## Usage

### In code

```typescript
import { BeatBaxEngine } from '@beatbax/engine';
import nesPlugin from '@beatbax/plugin-chip-nes';

const engine = new BeatBaxEngine();
engine.registerChipPlugin(nesPlugin);

// Now 'chip nes' is available in .bax files
console.log(engine.listChips()); // ['gameboy', 'nes']
```

### In BeatBax scripts

```bax
chip nes
bpm 150

; Pulse channels
inst lead   type=pulse1  duty=25   env=13,down  env_period=2
inst harm   type=pulse2  duty=50   env=10,down  env_period=4

; Triangle (no hardware volume control)
inst bass   type=triangle

; Short percussive triangle (linear counter)
inst tri_kick  type=triangle  linear=3

; Noise percussion
inst kick   type=noise  noise_mode=normal  noise_period=12  env=15,down  env_period=3
inst snare  type=noise  noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat  type=noise  noise_mode=normal  noise_period=3   env=8,down   env_period=0

; DMC sample playback
inst bass_hit  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="@nes/bass_c2"

; Channel routing (1-5 = Pulse1, Pulse2, Triangle, Noise, DMC)
channel 1 => inst lead   seq melody
channel 2 => inst harm   seq harmony
channel 3 => inst bass   seq bassline
channel 4 => inst kick   seq drums
channel 5 => inst bass_hit  seq bass_hits

play
```

## Instrument Fields

### Pulse channels (`type=pulse1`, `type=pulse2`)

| Field | Range | Description |
|-------|-------|-------------|
| `duty` | `12`, `12.5`, `25`, `50`, `75` | Duty cycle percentage |
| `env` | `level,direction[,period]` | Volume envelope (e.g. `13,down`) |
| `env_period` | `0`–`15` | Envelope decay period |
| `env_loop` | `true`/`false` | Envelope repeats |
| `vol` | `0`–`15` | Constant volume (bypasses envelope) |
| `sweep_en` | `true`/`false` | Enable hardware pitch sweep |
| `sweep_period` | `1`–`7` | Sweep divider period |
| `sweep_dir` | `up`/`down` | Sweep direction |
| `sweep_shift` | `0`–`7` | Sweep shift count |

### Triangle (`type=triangle`)

| Field | Range | Description |
|-------|-------|-------------|
| `linear` | `1`–`127` | Linear counter duration (ticks at 240 Hz); omit for sustain |
| `vol` | `0` or any | `0` = mute; any other value = full amplitude |

### Noise (`type=noise`)

| Field | Values | Description |
|-------|--------|-------------|
| `noise_mode` | `normal`, `loop` | LFSR feedback mode (normal = white noise; loop = metallic) |
| `noise_period` | `0`–`15` | Noise frequency index (0 = highest, 15 = lowest) |
| `env` | `level,direction` | Volume envelope |
| `env_period` | `0`–`15` | Envelope period |
| `vol` | `0`–`15` | Constant volume |

### DMC (`type=dmc`)

| Field | Values | Description |
|-------|--------|-------------|
| `dmc_sample` | `@nes/<name>`, `https://...`, `local:<path>` | Sample reference |
| `dmc_rate` | `0`–`15` | Playback rate index (0 = fastest ~4182 Hz; 15 = slowest ~70 Hz) |
| `dmc_loop` | `true`/`false` | Loop sample |
| `dmc_level` | `0`–`127` | Initial DAC level |

#### Bundled DMC samples

| Name | Description |
|------|-------------|
| `@nes/kick` | Short kick drum |
| `@nes/snare` | Snare hit |
| `@nes/hihat` | Closed hi-hat |
| `@nes/crash` | Crash cymbal |
| `@nes/bass_c2` | Bass note (C2) |

## Hardware Accuracy Notes

- **Pulse channels:** Period register muting (period < 8) is enforced; hardware sweep with one's complement (Pulse 1) vs two's complement (Pulse 2) negate is modelled.
- **Triangle:** Uses a hardware-exact 32-step quantised triangle waveform; no amplitude control on the channel itself.
- **Noise:** Pre-generated LFSR buffers (15-bit, 32,767-sample period for normal mode; 93-sample period for loop mode) for accurate noise texture.
- **Mixer:** Linear approximation of the NES non-linear DAC using NESDev reference gain weights: `output = 0.00752 × (p1 + p2) + 0.00851 × tri + 0.00494 × noise + 0.00335 × dmc`.

## License

MIT
