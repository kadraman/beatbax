# @beatbax/plugin-chip-sms

[![npm version](https://img.shields.io/npm/v/@beatbax/plugin-chip-sms)](https://www.npmjs.com/package/@beatbax/plugin-chip-sms)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Sega Master System / Game Gear SN76489 PSG chip plugin for [BeatBax](https://github.com/kadraman/beatbax).

## Features

- **4 audio channels**: 3 tone (square wave) + 1 noise (LFSR)
- **SN76489-compatible PSG emulation**: Accurate period calculation and register behavior
- **Game Gear stereo support**: Discrete L/C/R panning per channel
- **Full effects support**: vol_env, arp_env, pitch_env, noise_rate_env macros
- **Software-driven articulation**: No hardware envelopes or LFO — all effects via per-tick register writes
- **Deterministic playback**: Identical output across runs
- **Dual rendering paths**: PCM (CLI/headless) + Web Audio (browser)

## Installation

```bash
npm install @beatbax/plugin-chip-sms @beatbax/engine
```

## Usage

### Programmatic

```typescript
import { BeatBaxEngine } from '@beatbax/engine';
import smsPlugin from '@beatbax/plugin-chip-sms';

const engine = new BeatBaxEngine();
engine.registerChipPlugin(smsPlugin);

// Now you can compile and play SMS songs
const result = engine.compile(reaxSongSource);
```

### In BeatBax Scripts

Add `chip sms` at the top of your `.bax` file:

```bax
chip sms
bpm 150

inst lead  type=tone1   vol=10 vol_env=[0,3,6,9,12,15]
inst harm  type=tone2   vol=8  vol_env=[4,6,8,10]
inst bass  type=tone3   vol=12
inst kick  type=noise   noise_mode=white noise_rate=2 vol_env=[0,6,10,15]

pat melody = C5 E5 G5 C6 C5 E5 G5 A5
pat bassline = C3 . G2 . A2 . F2 .
pat drums = kick . . kick kick . kick .

seq main = melody melody melody melody
seq bass_seq = bassline bassline
seq drum_seq = drums drums drums drums

channel 1 => inst lead  seq main
channel 2 => inst harm  seq main:oct(-1)
channel 3 => inst bass  seq bass_seq
channel 4 => inst kick  seq drum_seq

play
```

## Channel Types

| Channel | BeatBax Type | Hardware | Notes |
|---------|--------------|----------|-------|
| 1 | `tone1` | Tone 1 | Square wave, 10-bit period |
| 2 | `tone2` | Tone 2 | Square wave, 10-bit period |
| 3 | `tone3` | Tone 3 | Square wave, 10-bit period |
| 4 | `noise` | Noise | 15-bit LFSR, white/periodic modes |

## Instrument Fields

### Common (all types)

| Field | Description | Range |
|-------|-------------|-------|
| `vol` | Constant volume | 0-15 (0 = loudest, 15 = silent) |
| `vol_env` | Volume envelope macro | `[0-15,...\|N]` |
| `gg:pan` | Game Gear stereo pan | `L`, `C`, or `R` |

### Tone Channels (tone1, tone2, tone3)

| Field | Description | Range |
|-------|-------------|-------|
| `arp_env` | Arpeggio macro (semitone offsets) | Any semitone values |
| `pitch_env` | Pitch bend macro (semitone offsets) | Any semitone values |

### Noise Channel

| Field | Description | Range |
|-------|-------------|-------|
| `noise_mode` | LFSR feedback mode | `white` or `periodic` |
| `noise_rate` | Clock divisor selector | 0, 1, 2, or `tone3` |
| `noise_rate_env` | Animated noise rate | `[0-3,...\|N]` |

Notes:
- `noise_rate` numeric strings (for example `"1"`) are normalized internally to numbers.
- `tone3` is the only string sentinel retained for `noise_rate`.

## Effects Support

| Effect | Support | Notes |
|--------|---------|-------|
| Volume control | ✅ | 4-bit attenuation (0-15) |
| Arpeggio (arp) | ✅ | Software-driven |
| Pitch bend (bend) | ✅ | Software-driven |
| Vibrato (vib) | ✅ | Approximate via per-tick period writes |
| Portamento (port) | ✅ | Approximate via per-tick period writes |
| Volume slide (volSlide) | ✅ | Per-tick attenuation writes (positive delta = louder/fade-in; negative = quieter/fade-out) |
| Tremolo (trem) | ✅ | Per-tick attenuation modulation |
| Cut | ✅ | Instant mute via attenuation=15 |
| Retrigger (retrig) | ⚠️ | Emulation-dependent phase reset |
| **Sweep** | ❌ | Use `pitch_env` or `bend` |
| **Echo** | ❌ | No spare channels for delay |

## Examples

### Minimal SMS Song

```bax
chip sms
bpm 150

inst lead type=tone1 vol=12 vol_env=[0,3,6,9,12,15]

pat melody = C5 E5 G5 C6

seq main = melody melody melody melody

channel 1 => inst lead seq main

play
```

### Arpeggios

```bax
chip sms
bpm 180

effect majorArp = arp:4,7
effect minorArp = arp:3,7

inst lead type=tone1 vol=10 vol_env=[4,4,4,4|0]
inst harm type=tone2 vol=8 vol_env=[6,6,6,6|0]

pat melody = C5<majorArp>:4 F5<majorArp>:4 G5<minorArp>:4 A5<minorArp>:4

seq main = melody melody

channel 1 => inst lead seq main
channel 2 => inst harm seq main:oct(-1)

play
```

### Noise Percussion

```bax
chip sms
bpm 120

inst kick  type=noise noise_mode=white noise_rate=2 vol_env=[0,4,8,12,15]
inst snare type=noise noise_mode=white noise_rate=1 vol_env=[2,7,12,15]
inst hihat type=noise noise_mode=white noise_rate=0 vol=8 vol_env=[3,9,15]

pat drums = kick . snare . kick kick snare hihat

seq beat = drums drums drums drums

channel 4 => inst kick seq beat

play
```

### Tone3 + Noise Sync (Kick follows Bass)

```bax
chip sms
bpm 120

inst bass type=tone3 vol=12 vol_env=[2,5,8,11,15]
inst kick type=noise noise_mode=white noise_rate=tone3 vol_env=[0,6,10,15]

pat bass_pat = C3:8 G2:8 A2:8 F2:8
pat kick_pat = kick . kick . kick . kick .

seq bass = bass_pat
seq drums = kick_pat

channel 3 => inst bass seq bass
channel 4 => inst kick seq drums

play
```

### Game Gear Stereo

```bax
chip sms
bpm 140

inst lead  type=tone1 vol=10 gg:pan=R
inst harm  type=tone2 vol=8  gg:pan=L
inst bass  type=tone3 vol=12 gg:pan=C
inst kick  type=noise vol=10 gg:pan=C

pat melody = C5:4 E5:4 G5:4 A5:4
pat drums = kick . . .

seq main = melody melody
seq drum_seq = drums drums

channel 1 => inst lead  seq main
channel 2 => inst harm  seq main
channel 3 => inst bass  seq main:oct(-2)
channel 4 => inst kick  seq drum_seq

play
```

## Game Gear vs SMS

| Feature | SMS | Game Gear |
|---------|-----|-----------|
| Clock speed | 3,579,545 Hz (NTSC) | 3,579,545 Hz |
| Channels | 4 (mono) | 4 (stereo) |
| Pan support | ❌ | ✅ via `gg:pan` |
| Stereo register | ❌ | ✅ (0x4F command) |

The plugin automatically handles both targets. When `gg:pan` fields are present, they are interpreted as Game Gear stereo routing intent. On SMS (mono) playback, these pan settings are safely ignored.

## Hardware Notes

- **Clock rate**: NTSC SMS and Game Gear both use 3,579,545 Hz. PAL SMS uses 3,546,895 Hz. The plugin uses NTSC rate by default.
- **Tone period**: 10-bit value (0-1023). Formula: `period = clock / (32 × frequency)`
- **Noise LFSR**: 15-bit shift register with feedback from bits 0&1 (white) or 0&6 (periodic)
- **Volume**: 4-bit attenuation register: 0 = loudest (no attenuation), 15 = silent (max attenuation)
- **No hardware envelope**: All volume changes are implemented by writing to the attenuation register each frame

## VGM Export

VGM (Video Game Music) export for SMS is supported via the optional [`@beatbax/plugin-exporter-vgm`](https://github.com/kadraman/beatbax/blob/main/docs/features/vgm-exporter-plugin.md) package. When installed alongside this plugin, you can export SMS songs to `.vgm` files playable in Sega emulators.

```bash
npm install @beatbax/plugin-exporter-vgm
```

Then use the `beatbax export vgm` command.

## Development

```bash
# Build
npm run build

# Test
npm test

# Clean
npm run clean
```

## License

MIT
