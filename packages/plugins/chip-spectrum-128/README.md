# @beatbax/plugin-chip-spectrum-128

ZX Spectrum 128 / Amstrad CPC chip plugin for BeatBax.

Targets the **AY-3-8912** PSG with Spectrum 128 as the primary platform and Amstrad CPC as a secondary profile.

## Features

- 3 tone channels (A/B/C) → `tone1`, `tone2`, `tone3`
- Shared noise generator (R6, 5-bit period)
- Shared hardware envelope generator (R11–R13, 16 shapes)
- Per-channel mixer routing (R7, independent tone/noise enable)
- Software macros: `arp_env`, `pitch_env`
- Hardware envelope: `vol_env` (global R11–R13; one program at a time)
- Buzz-bass mode (`env_bass`) — envelope as sub-oscillator
- Conflict detection for simultaneous `noise_rate` and `vol_env` writes
- Amstrad CPC platform profile (`chip cpc` / `chip amstrad-cpc`, 1 MHz AY clock)
- New Song Wizard with Spectrum 128 and CPC variants
- Full UI contributions (Copilot system prompt, hover docs, help sections)

## Installation

```bash
npm install @beatbax/plugin-chip-spectrum-128
```

## Usage

```typescript
import { BeatBaxEngine } from '@beatbax/engine';
import spectrumPlugin from '@beatbax/plugin-chip-spectrum-128';

const engine = new BeatBaxEngine();
engine.registerChipPlugin(spectrumPlugin);
```

## BeatBax Script

```bax
chip spectrum-128
bpm 120

inst lead type=tone1 vol=12 arp_env=[0,4,7|0]
inst bass type=tone2 vol=14
inst pad  type=tone3 vol=10

pat melody = C4 E4 G4 C5 B4 G4 E4 .
pat bass   = C2 . . . G1 . . .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bass
channel 3 => inst pad  pat melody

play
```

## AY-3-8912 Hardware Model

| Voice | BeatBax type | AY register | Notes |
|-------|--------------|-------------|-------|
| A | `tone1` | R0–R1 tone period, R8 attenuation | Square wave, 12-bit period |
| B | `tone2` | R2–R3, R9 | Square wave |
| C | `tone3` | R4–R5, R10 | Square wave; commonly bass or drum borrow |
| — | *(mixer)* | R7 | Per-channel tone/noise enable bits (active-low) |
| — | *(shared)* | R6 | **One** noise period (5-bit) for entire chip |
| — | *(shared)* | R11–R13 | **One** envelope period + shape; global |

## Platform Profiles

| Chip directive | Machine | AY clock | Frame rate |
|---|---|---|---|
| `chip spectrum-128` (default) | ZX Spectrum 128 | 1,773,400 Hz | 50 Hz |
| `chip cpc` or `chip amstrad-cpc` | Amstrad CPC 464/6128 | 1,000,000 Hz | 50 Hz |

To target Amstrad CPC:
```bax
chip cpc
```

Aliases `cpc` and `amstrad-cpc` use the same `@beatbax/plugin-chip-spectrum-128` plugin with the 1 MHz clock preset. Note content and macros are identical across profiles.

## Preview loudness (volume curve)

BeatBax preview maps AY `vol` / R8–R10 through a **logarithmic DAC table** (hardware-accurate step relationships), then scales so three channels at `vol=15` target ~**0.85** peak — the same full-mix headroom as NES and SMS.

| Concern | Behaviour |
|---------|-----------|
| Step shape | AY DAC (e.g. `vol=10` ≪ linear `10/15` of max) |
| Overall level | Peak-normalised for cross-chip comfort in the app |
| vs Arkos Tracker | Relative `vol` steps should match; absolute WAV LUFS may still differ |

Constants: `AY_DAC_LEVELS`, `AY_TARGET_PEAK`, `AY_CHANNEL_PEAK`, `amplitudeToGain()` in `src/ay-volume.ts`.

## Instrument Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `vol` | number | 0–15 | Fixed amplitude (AY log DAC; 0=silent, 15=loudest) |
| `vol_env` | array/string | `[0-15,...\|loopIdx]` | Hardware envelope program (global R11–R13) |
| `arp_env` | array/string | semitone offsets | Arpeggio macro |
| `pitch_env` | array/string | semitone offsets | Pitch bend macro |
| `tone_mix` | boolean | — | Enable noise in R7 mixer for this channel |
| `noise_rate` | number | 0–31 | R6 noise period (global — conflicts when different values overlap) |
| `noise_frames` | number | 0–60 | Mix noise for first N 60 Hz frames only (transient attack) |
| `tone_frames` | number | 0–60 | Mix tone for first N 60 Hz frames only (stick transient) |
| `tone_vol` | number | 0–15 | Cap tone-path volume separately from noise (`vol` / `vol_env`) |
| `env_bass` | boolean | — | Buzz-bass mode (envelope as oscillator) |
| `env_shape` | integer | 8 | R13 envelope shape (0–15); only with `env_bass=true` |

Select the platform with the chip directive: use `chip spectrum-128` for ZX Spectrum 128 or `chip cpc` / `chip amstrad-cpc` for the Amstrad CPC AY clock.

## Shared-Resource Constraints

### Noise period (R6)
Only **one** noise period is active per tick. When multiple channels request different `noise_rate` values on the same tick, the last writer wins and a diagnostic warning is emitted.

**Working pattern:**
```bax
; All percussion uses the same noise_rate — stagger hits
inst kick  type=tone3 vol=15 tone_mix=true noise_rate=10
inst snare type=tone2 vol=12 tone_mix=true noise_rate=10
```

### Envelope (R11–R13)
Only **one** hardware envelope program (`vol_env` or `env_bass`) should be active at a time. For independent per-channel volume shaping, use BeatBax software volume slides instead.

## Sample Songs

See `songs/spectrum-128/` for example BeatBax songs:

**Full arrangements**

- `amstrad-cpc-demo.bax` — Same song with `chip cpc`

**Instrument demos** (`instruments/`)

| Song | Purpose |
|------|---------|
| `ay_synth_channels.bax` | Minimal tone A/B/C smoke check |
| `ay_macro_arp_pitch.bax` | `arp_env` and `pitch_env` on three channels |
| `ay_percussion_demo.bax` | Named drum kit (split + multiplexed) |
| `ay_noise_mixing.bax` | Tone / tone+noise / noise-only mixer routing |
| `ay_buzz_bass.bax` | Buzz bass (`env_bass`) |
| `ay_all_macros.bax` | Valid macro combination without illegal overlaps |
| `ay_noise_rate_conflict.bax` | Intentional R6 conflict — expect `verify` warning |
| `ay_vol_env_conflict.bax` | Intentional R11–R13 conflict — expect `verify` warning |

**Effect demos** (`effects/`)

| Song | Purpose |
|------|---------|
| `ay_effects_showcase.bax` | Supported inline effect coverage |
| `ay_unsupported_effects_demo.bax` | Invalid / SMS-only effects for `verify` |

## Development

```bash
cd packages/plugins/chip-spectrum-128
npm install
npm run build
npm test
```
