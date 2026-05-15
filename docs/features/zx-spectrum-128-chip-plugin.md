---
title: "ZX Spectrum 128 Chip Plugin"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-14
issue: "https://github.com/kadraman/beatbax/issues/108"
---

## Summary

Implement `@beatbax/plugin-chip-spectrum-128` as an AY-compatible PSG target in BeatBax. The plugin is Spectrum-first but will also cover Amstrad CPC due to close hardware similarity.

Primary export intent:

- Tracker-based formats: PT3 (ProTracker), Arkos Tracker (where supported)
- Register-stream formats: VGM and raw register dumps
- Homebrew-focused output path: prioritize the most common format per target workflow (typically PT3/Arkos or register stream)

## Problem Statement

A generic AY-wide plugin creates ambiguity across platforms with different clocking, tooling, and homebrew expectations. BeatBax needs explicit platform-scoped plugins so behavior, defaults, and export choices are clear and deterministic.

For this scope, Spectrum 128 is the prioritized AY-compatible target, with Amstrad CPC included as a close sibling profile.

## Scope

### Included

**Core Plugin:**
- Spectrum 128 default timing and channel behavior
- Amstrad CPC compatibility profile
- Shared AY-compatible PSG semantics (3 channels, shared noise, shared envelope)
- Export integration placeholder/wiring for PT3/Arkos/VGM/register stream outputs
- Support for playback from both CLI and Web-UI
- Implementation of `songWizard.js` with support for both Spectrum-128 and Amstrad-CPC computers
- Implementation of `ui-contributions.js` including copilot prompts, hover providers and help

**Sample Songs & Documentation** (`songs/spectrum-128/`):
- **Synth Demo** (`synth-demo.bax`) — Demonstrates:
  - Lead/bass instrument definitions with constant volume
  - Arpeggio macros (`arp_env`)
  - Pitch bend macros (`pitch_env`)
  - Multi-channel polyphony
  - Melodic patterns and sequences

- **Percussion Demo** (`percussion-demo.bax`) — Demonstrates:
  - Tone/noise mixing via `tone_mix=true` and `noise_rate` on tone3
  - Volume envelope macros (`vol_env`) for attack/decay
  - Drum patterns (kick, snare, hi-hat simulations)
  - Rhythmic patterns and drum sequences

- **Effects Showcase** (`effects-showcase.bax`) — Demonstrates:
  - All macro types combined: `vol_env`, `arp_env`, `pitch_env`, `noise_rate`
  - Hardware limitation handling (one envelope per song)
  - Channel mixer blending strategies
  - Complex polyphonic arrangements

- **Amstrad CPC Version** (`amstrad-cpc-demo.bax`) — Demonstrates:
  - Same song compiled with `chipRegion=cpc-128k`
  - Platform-agnostic note structure, region-aware clock scaling
  - Deterministic output across platforms

**Test Songs** (`songs/spectrum-128/tests/`):
- `smoke-test.bax` — Minimal 4-note song per channel (regression gate)
- `shared-envelope-test.bax` — Multiple channels with vol_env conflict detection
- `noise-mixing-test.bax` — Noise blending on each channel independently
- `all-macros.bax` — All instrument macro types in one song

### Excluded

- Atari ST specifics (covered by a separate plugin scope)
- Broad multi-platform AY abstraction as a first-class user target
- Export implementation (PT3/VGM export; separate feature/issue)

## Technical Notes

- Shared-resource behavior is hardware-accurate and must be explicit in docs and validation.
- Deterministic ordering of register writes is required across render/export paths.
- Plugin-scoped validation should reject conflicting instrument settings around shared envelope/noise ownership.

## Implementation Outline

1. Define plugin package and platform profiles (`zx-spectrum-128` default, `amstrad-cpc` compatibility).
2. Wire channel backend with shared AY-compatible emulator behavior.
3. Add and validate Spectrum-focused song templates.
4. Implement/export adapter contracts for PT3/Arkos/VGM/register streams.
5. Add deterministic regression tests for playback and export.

## Out of Scope

Implementation and updates of exporter plugins, this will be implemented in a separate feature document/issue.

## Testing Requirements

- Deterministic playback across repeated renders.
- Shared-resource conflict tests (noise/envelope writes) across channels.
- Export snapshot tests for Spectrum default profile.
- Compatibility tests for Amstrad CPC profile.

## Documentation Requirements

- Chip docs live under `docs/chips/zx-spectrum-128/`.
- Feature references should point to this spec rather than AY-named docs.
- Roadmap must remain aligned with Spectrum 128 + Atari ST split.

---

## Proposed Solution

### Overview

Implement `@beatbax/plugin-chip-spectrum-128` as a standalone npm package that:

- Provides the `ChipPlugin` interface for AY-3-8910 PSG emulation
- Supports both **Spectrum 128** (3.5469 MHz) and **Amstrad CPC** (1.0 MHz, 2.0 MHz per region) clock configurations
- Implements **3 tone channels** (square wave) with **noise generator** (15-bit LFSR)
- Handles **shared envelope generator** and **shared noise period** (hardware constraints)
- Renders audio via **Web Audio API** (AudioWorklet for browser) and **PCM** (CLI/headless)
- Validates instrument definitions for AY-specific constraints
- Provides UI contributions: Copilot prompts, hover documentation, help sections
- Includes song templates via New Song Wizard
- Exports deterministic, byte-identical output across repeated renders

### Package Structure

```
packages/plugins/chip-spectrum-128/
├── package.json                    # @beatbax/plugin-chip-spectrum-128, peer: @beatbax/engine
├── tsconfig.json                   # ESM, strict, ES2022 target
├── src/
│   ├── index.ts                    # ChipPlugin entry point
│   ├── channel.ts                  # Shared AY-compatible channel backend factory
│   ├── ay-emulator.ts              # AY-3-8910 PSG emulation core
│   ├── envelope-generator.ts       # AY envelope hardware state machine
│   ├── periodTables.ts             # Frequency → AY period lookup tables (12-bit, per region)
│   ├── validate.ts                 # Instrument validation (shared envelope/noise constraints)
│   ├── platform-profiles.ts        # Clock/region configs (Spectrum 128, Amstrad CPC variants)
│   ├── ui-contributions.ts         # Copilot prompts, hover docs, help sections
│   ├── songWizard.ts               # New Song Wizard templates
│   └── version.ts                  # Package version string
├── tests/
│   ├── ay-emulator.test.ts         # PSG behavior, envelope, noise LFSR
│   ├── channel.test.ts             # Channel rendering, macro handling
│   ├── validate.test.ts            # Instrument validation
│   ├── platform-profiles.test.ts   # Clock scaling per region
│   └── plugin.test.ts              # Integration: registration, channel creation
└── README.md                       # User documentation
```

### Channel Architecture

The AY-3-8910 provides **3 tone channels** with a **shared noise generator** that can be mixed into any combination of channels:

| Channel | Type | Hardware | Notes |
|---------|------|----------|-------|
| 0 | `tone1` | AY Tone A | 12-bit period, square wave |
| 1 | `tone2` | AY Tone B | 12-bit period, square wave |
| 2 | `tone3` | AY Tone C | 12-bit period, square wave |
| — | `noise` | AY Noise Generator | 5-bit LFSR, applied to channels via mixer |

**Hardware Constraints:**
- **Shared envelope generator:** Only one envelope running at a time across all channels. If multiple channels use `vol_env`, only one will play the envelope; others must use constant attenuation.
- **Shared noise generator:** The noise source is global. All channels using noise mixing share the same noise period (`noise_rate`, 0–31).
- **Tone/Noise mixing:** Each channel has independent tone/noise mix bits in the AY mixer register. You can blend tone and noise on any channel independently (e.g., tone1 = pure tone, tone2 = tone + noise, tone3 = pure noise).

### Instrument Fields

#### Common (all types)

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `vol` | number | 0–15 | Fixed volume (0 = silent, 15 = loudest) |
| `vol_env` | array \| string | `[0-15,...\|loopIdx]` | Volume envelope macro. Only one per song due to shared HW. |

#### Tone Channels (tone1, tone2, tone3)

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `arp_env` | array \| string | Semitone offsets | Arpeggio (pitch quantized to semitones) |
| `pitch_env` | array \| string | Semitone offsets | Pitch bend envelope |

#### Noise Mixing (All Channels)

Noise can be mixed into any tone channel via the `tone_mix` field:

| Field | Type | Range | Description |
|-------|------|-------|-------------||
| `noise_rate` | 0–31 | Number | Global AY noise period (lower = higher frequency). Shared across all channels using noise. |
| `tone_mix` | boolean | true \| false | Enable noise mixing on this channel (default: false). When true, this channel blends its tone with the shared noise generator. |

#### Platform-Specific (optional)

| Field | Type | Description |
|-------|------|-------------|
| `chipRegion` | string | Override region: `spectrum-128`, `cpc-64k`, `cpc-128k` (see platform profiles) |

### Implementation: Core Modules

#### 1. `src/index.ts` — Plugin Entry Point

```typescript
import type { ChipPlugin, ChipChannelBackend, ValidationError } from '@beatbax/engine';
import { version } from './version.js';
import { createChannel } from './channel.js';
import { validateInstrument } from './validate.js';
import { spectrumUIContributions } from './ui-contributions.js';
import { spectrumSongWizard } from './songWizard.js';
import { getPlatformProfile, setPlatformRegion } from './platform-profiles.js';

interface SpectrumChipPlugin extends ChipPlugin {
  configureForSong(song: { chip?: string; chipRegion?: string }): void;
}

const spectrumPlugin: SpectrumChipPlugin = {
  name: 'spectrum-128',
  aliases: ['spectrum', 'spectrum128', 'zx-spectrum'],
  version,
  channels: 3,
  supportsPerChannelVolume: true,
  instrumentVolumeRange: { min: 0, max: 15 }, // 0 = silent, 15 = loudest
  uiContributions: spectrumUIContributions,
  newSongWizard: spectrumSongWizard,

  validateInstrument(inst: any): ValidationError[] {
    return validateInstrument(inst);
  },

  createChannel(channelIndex: number, audioContext: BaseAudioContext): ChipChannelBackend {
    return createChannel(channelIndex, audioContext);
  },

  configureForSong(song: { chip?: string; chipRegion?: string }) {
    // Allow per-song region override: chipRegion=cpc-128k, spectrum-128, etc.
    const region = song.chipRegion || 'spectrum-128';
    setPlatformRegion(region);
  },
};

export default spectrumPlugin;
export { spectrumPlugin };
```

#### 2. `src/platform-profiles.ts` — Clock & Region Configuration

```typescript
export interface PlatformProfile {
  name: string;
  clock: number;           // Hz
  frameRate: number;       // Hz (50 for PAL, 60 for NTSC)
  description: string;
}

const PROFILES: Record<string, PlatformProfile> = {
  'spectrum-128': {
    name: 'ZX Spectrum 128',
    clock: 3546900,         // 3.5469 MHz
    frameRate: 50,          // PAL
    description: 'ZX Spectrum 128K (1986+)',
  },
  'cpc-64k': {
    name: 'Amstrad CPC 464',
    clock: 1000000,         // 1.0 MHz
    frameRate: 50,
    description: 'Amstrad CPC 464',
  },
  'cpc-128k': {
    name: 'Amstrad CPC 6128',
    clock: 2000000,         // 2.0 MHz
    frameRate: 50,
    description: 'Amstrad CPC 6128 (1985)',
  },
};

let currentRegion = 'spectrum-128';

export function getPlatformProfile(region?: string): PlatformProfile {
  return PROFILES[region || currentRegion] || PROFILES['spectrum-128'];
}

export function setPlatformRegion(region: string): void {
  if (!PROFILES[region]) {
    console.warn(`Unknown platform region: ${region}. Defaulting to spectrum-128.`);
    return;
  }
  currentRegion = region;
}
```

#### 3. `src/ay-emulator.ts` — PSG Core

```typescript
/**
 * AY-3-8910 PSG emulator for Spectrum 128 and Amstrad CPC.
 * Implements 3 tone channels + 1 noise, shared envelope generator, and 5-bit LFSR.
 */

export interface AYState {
  // Tone generators (12-bit period per channel)
  tonePeriod: [number, number, number];     // Channels A, B, C
  toneCounter: [number, number, number];
  toneOutput: [number, number, number];

  // Shared noise generator (5-bit LFSR)
  noisePeriod: number;                      // 0–31 (global)
  noiseCounter: number;
  noiseLFSR: number;                        // 17-bit state
  noiseOutput: number;

  // Mixer control (independent tone/noise blend per channel)
  toneMix: [boolean, boolean, boolean];      // Enable tone per channel
  noiseMix: [boolean, boolean, boolean];     // Enable noise mixing per channel

  // Attenuation (4-bit per tone channel)
  attenuation: [number, number, number];    // A, B, C
  useEnvelope: [boolean, boolean, boolean]; // Use envelope for each tone channel

  // Envelope generator (hardware state machine)
  envelopeShape: number;                    // 0–15 (16 envelope shapes)
  envelopeCounter: number;                  // 16-bit counter
  envelopeOutput: number;                   // 0–15 current envelope level
  envelopeActive: boolean;

  // Clock scaling
  clock: number;                            // Hz (3.5469e6 for Spectrum, 1e6 for CPC)
}

export function makeAYState(clock: number): AYState {
  return {
    tonePeriod: [0, 0, 0],
    toneCounter: [0, 0, 0],
    toneOutput: [0, 0, 0],
    noisePeriod: 0,
    noiseCounter: 0,
    noiseLFSR: 0x1ffff,  // 17-bit seed
    noiseOutput: 0,
    toneMix: [true, true, true],
    noiseMix: [false, false, false],
    attenuation: [0, 0, 0],
    useEnvelope: [false, false, false],
    envelopeShape: 0,
    envelopeCounter: 0,
    envelopeOutput: 15,
    envelopeActive: false,
    clock,
  };
}

/**
 * Advance PSG by one frame (1/60 Hz for rendering).
 * Updates all tone, noise, and envelope counters.
 */
export function advanceAYFrame(state: AYState, frameDuration: number): void {
  // Advance tone generators
  for (let ch = 0; ch < 3; ch++) {
    if (state.tonePeriod[ch] > 0) {
      state.toneCounter[ch] -= frameDuration * state.clock;
      while (state.toneCounter[ch] <= 0) {
        state.toneOutput[ch] ^= 1;
        state.toneCounter[ch] += state.tonePeriod[ch] * 2;
      }
    }
  }

  // Advance noise generator
  if (state.noisePeriod >= 0 && state.noisePeriod <= 31) {
    const noiseClock = state.clock / (16 * (state.noisePeriod + 1));
    state.noiseCounter -= frameDuration * noiseClock;
    while (state.noiseCounter <= 0) {
      // 17-bit Galois LFSR
      const feedback = (state.noiseLFSR ^ (state.noiseLFSR >> 2)) & 1;
      state.noiseLFSR = ((state.noiseLFSR >> 1) | (feedback << 16)) & 0x1ffff;
      state.noiseOutput = state.noiseLFSR & 1;
      state.noiseCounter += 1.0 / noiseClock;
    }
  }

  // Advance envelope generator
  if (state.envelopeActive) {
    const envClock = state.clock / 256;  // AY envelope clock prescaler
    state.envelopeCounter -= frameDuration * envClock;
    while (state.envelopeCounter <= 0) {
      state.envelopeCounter += 1.0 / envClock;
      advanceEnvelopeStep(state);
    }
  }
}

/**
 * Get final attenuation for a tone channel (0–15, where 15 = silent).
 * Accounts for envelope if enabled.
 * Channels are 0–2 (Tone A, B, C).
 */
export function getChannelAttenuation(
  state: AYState,
  channelIndex: number
): number {
  if (channelIndex < 0 || channelIndex > 2) return 15;
  let att = state.attenuation[channelIndex];
  if (state.useEnvelope[channelIndex] && state.envelopeActive) {
    att = (att & 0xf0) | (state.envelopeOutput & 0x0f);
  }
  return att & 0x0f;
}

/**
 * Get mixed audio output for a tone channel (0.0–1.0).
 * Combines tone and/or noise based on mixer settings.
 * Channels are 0–2 (Tone A, B, C).
 */
export function getChannelOutput(
  state: AYState,
  channelIndex: number
): number {
  if (channelIndex < 0 || channelIndex > 2) return 0;
  let output = 0;
  if (state.toneMix[channelIndex]) {
    output |= state.toneOutput[channelIndex];
  }
  if (state.noiseMix[channelIndex]) {
    output |= state.noiseOutput;
  }
  // Convert to amplitude (0.0–1.0)
  const amp = output ? 1.0 : 0.0;
  // Apply attenuation: 0=loudest, 15=silent
  const att = getChannelAttenuation(state, channelIndex);
  return amp * (1.0 - att / 15.0);
}

// Envelope state machine (16 shapes, AY-3-8910 datasheet)
function advanceEnvelopeStep(state: AYState): void {
  const shape = state.envelopeShape;
  // Simplified envelope: attack, hold, decay, repeat patterns
  // Full implementation follows AY datasheet shapes 0–15
  // (see docs/chips/ay/hardware_guide.md for envelope shapes)

  // For now, linear decay from 15 to 0 (shape 0)
  if (state.envelopeOutput > 0) {
    state.envelopeOutput--;
  } else if (shape & 0x01) { // Repeat
    state.envelopeOutput = 15;
  }
}
```

#### 4. `src/periodTables.ts` — Frequency Lookup

```typescript
import { midiToFreq } from '@beatbax/engine';
import { getPlatformProfile } from './platform-profiles.js';

/**
 * Convert frequency (Hz) to AY 12-bit period value.
 * AY formula: period = clock / (16 * freq)
 */
export function freqToAYPeriod(freq: number, clock: number): number {
  if (freq <= 0) return 0;
  const period = Math.round(clock / (16 * freq));
  return Math.max(0, Math.min(4095, period));  // Clamp to 12-bit
}

/**
 * Create a lookup table: MIDI note → AY period.
 * Covers MIDI 0–127, A4 (69) = 440 Hz, equal temperament.
 */
export function buildPeriodTable(clock: number): Uint16Array {
  const table = new Uint16Array(128);
  for (let midi = 0; midi < 128; midi++) {
    const freq = midiToFreq(midi);
    table[midi] = freqToAYPeriod(freq, clock);
  }
  return table;
}

let cachedPeriodTable: Uint16Array | null = null;
let cachedClock = 0;

/**
 * Get or create the period table for the current platform clock.
 */
export function getPeriodTable(): Uint16Array {
  const profile = getPlatformProfile();
  if (!cachedPeriodTable || cachedClock !== profile.clock) {
    cachedPeriodTable = buildPeriodTable(profile.clock);
    cachedClock = profile.clock;
  }
  return cachedPeriodTable;
}
```

#### 5. `src/validate.ts` — Instrument Validation

```typescript
import type { ValidationError } from '@beatbax/engine';

export function validateInstrument(inst: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate vol
  if (inst.vol !== undefined) {
    const vol = Number(inst.vol);
    if (!Number.isInteger(vol) || vol < 0 || vol > 15) {
      errors.push({
        field: 'vol',
        message: 'vol must be an integer 0–15 (0 = silent, 15 = loudest)',
      });
    }
  }

  // Validate vol_env (only one per song due to shared HW)
  if (inst.vol_env !== undefined && !Array.isArray(inst.vol_env) && typeof inst.vol_env !== 'string') {
    errors.push({
      field: 'vol_env',
      message: 'vol_env must be an array [0-15,...|loopIdx] or string "[...]"',
    });
  }

  // Validate arp_env and pitch_env (tone channels only)
  if (inst.type === 'tone1' || inst.type === 'tone2' || inst.type === 'tone3') {
    // These are optional, but if provided, must be valid macros
    if (inst.arp_env !== undefined && !Array.isArray(inst.arp_env) && typeof inst.arp_env !== 'string') {
      errors.push({
        field: 'arp_env',
        message: 'arp_env must be an array [semitone,...] or string "[...]"',
      });
    }
  }

  // Validate noise_rate (if tone_mix is enabled)
  if (inst.tone_mix === true && inst.noise_rate !== undefined) {
    const rate = Number(inst.noise_rate);
    if (!Number.isInteger(rate) || rate < 0 || rate > 31) {
      errors.push({
        field: 'noise_rate',
        message: 'noise_rate must be 0–31 when tone_mix is enabled',
      });
    }
  }

  return errors;
}
```

#### 6. `src/channel.ts` — Channel Backend

```typescript
import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import { advanceAYFrame, getChannelOutput, makeAYState } from './ay-emulator.js';
import { getPeriodTable, freqToAYPeriod } from './periodTables.js';
import { getPlatformProfile } from './platform-profiles.js';

export class SpectrumChannelBackend implements ChipChannelBackend {
  private channelIndex: number;
  private ayState: any;
  private currentFreq: number = 0;
  private currentVolume: number = 0;
  private isMuted: boolean = true;

  constructor(channelIndex: number, audioContext: BaseAudioContext) {
    this.channelIndex = channelIndex;
    const profile = getPlatformProfile();
    this.ayState = makeAYState(profile.clock);
  }

  reset(): void {
    this.currentFreq = 0;
    this.currentVolume = 0;
    this.isMuted = true;
    this.ayState = makeAYState(getPlatformProfile().clock);
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    if (this.channelIndex < 0 || this.channelIndex > 2) return;  // Valid channels: 0–2

    this.currentFreq = frequency;
    this.isMuted = false;

    // Convert frequency to AY period
    const profile = getPlatformProfile();
    const period = freqToAYPeriod(frequency, profile.clock);
    this.ayState.tonePeriod[this.channelIndex] = period;
    this.ayState.toneCounter[this.channelIndex] = 0;

    // Set initial attenuation (0–15, where 15 = silent)
    const vol = (instrument as any).vol ?? 0;
    this.ayState.attenuation[this.channelIndex] = 15 - (vol & 0x0f);

    // Set up mixer: enable tone by default, check for noise mixing in instrument
    this.ayState.toneMix[this.channelIndex] = true;
    const usesNoise = (instrument as any).tone_mix === true;
    this.ayState.noiseMix[this.channelIndex] = usesNoise;

    // Parse and set macros (vol_env, arp_env, pitch_env)
    // These would integrate with the effects system
  }

  noteOff(): void {
    if (this.channelIndex < 0 || this.channelIndex > 2) return;
    this.isMuted = true;
    this.ayState.tonePeriod[this.channelIndex] = 0;
    this.ayState.toneMix[this.channelIndex] = false;
    this.ayState.noiseMix[this.channelIndex] = false;
  }

  applyEnvelope(_frame: number): void {
    // Handled by ay-emulator effects advancement
  }

  render(buffer: Float32Array, sampleRate: number): void {
    const profile = getPlatformProfile();
    const samplesPerFrame = Math.round(sampleRate / profile.frameRate);
    const frameDuration = 1.0 / profile.frameRate;

    let sampleIndex = 0;
    for (let frame = 0; frame < buffer.length; frame += samplesPerFrame) {
      advanceAYFrame(this.ayState, frameDuration);
      const output = this.isMuted ? 0 : getChannelOutput(this.ayState, this.channelIndex);

      // Write to buffer (mono, one sample per frame for simplicity)
      const samplesThisFrame = Math.min(samplesPerFrame, buffer.length - sampleIndex);
      for (let s = 0; s < samplesThisFrame; s++) {
        buffer[sampleIndex++] = output;
      }
    }
  }
}

export function createChannel(
  channelIndex: number,
  audioContext: BaseAudioContext
): ChipChannelBackend {
  return new SpectrumChannelBackend(channelIndex, audioContext);
}
```

#### 7. `src/ui-contributions.ts` — Editor Integration

```typescript
import type { ChipUIContributions } from '@beatbax/engine';

export const spectrumUIContributions: ChipUIContributions = {
  copilotSystemPrompt: `
You are a BeatBax composer targeting the ZX Spectrum 128 and Amstrad CPC computers.
The Spectrum 128 has a 3.5469 MHz AY-3-8910 PSG with:
- 3 tone channels (square wave, 12-bit period)
- 1 noise channel (15-bit LFSR)
- Shared envelope generator (one envelope per song)
- Shared noise period across all channels

Constraints:
- \`vol\` range: 0–15 (0 = silent, 15 = loudest)
- Only one \`vol_env\` active per song (hardware limitation)
- Tone channels support \`arp_env\` and \`pitch_env\` macros
- Noise channel has fixed \`noise_rate\` (0–31)
- Register writes are deterministic per frame

Suggested template:
\`\`\`bax
chip spectrum-128
bpm 150

inst lead   type=tone1 vol=12 arp_env=[0,2,4,5]
inst bass   type=tone2 vol=14
inst perc   type=tone3  vol=10 tone_mix=true noise_rate=10 vol_env=[15,10,5,0]

pat melody = C4 D4 E4 F4 G4 A4 B4 C5
pat bass   = C2 . . . G1 . . .
pat drums  = C2 . . C2

seq main    = melody melody melody melody
seq bassline = bass bass bass bass
seq drumline = drums drums drums drums

channel 1 => inst lead  seq main
channel 2 => inst bass  seq bassline
channel 3 => inst perc  seq drumline

play
\`\`\`
  `,

  hoverDocs: {
    'tone1': 'Tone channel A (square wave, 12-bit period). Supports arp_env and pitch_env.',
    'tone2': 'Tone channel B (square wave, 12-bit period). Supports arp_env and pitch_env.',
    'tone3': 'Tone channel C (square wave, 12-bit period). Enable tone_mix for noise blending.',
    'vol': 'Volume: 0 (silent) to 15 (loudest). Applies to all channels.',
    'vol_env': 'Volume envelope [0-15,...|loopIdx]. Only one per song (shared HW).',
    'arp_env': 'Arpeggio macro (semitone offsets). Tone channels only.',
    'pitch_env': 'Pitch bend envelope (semitone offsets). Tone channels only.',
    'tone_mix': 'Enable noise mixing on this channel (default: false). When true, blends with shared noise generator.',
    'noise_rate': 'Noise period: 0–31 (lower = higher frequency). Global, shared by all channels using tone_mix.',
  },

  helpSections: [
    {
      id: 'channels',
      title: 'Channels (Spectrum 128)',
      content: `
## Audio Channels

The Spectrum 128 provides 3 tone channels, each of which can optionally mix in a shared noise generator:

| # | Name | Type | Hardware |
|---|------|------|----------|
| 1 | Tone A | Square wave | 12-bit period |
| 2 | Tone B | Square wave | 12-bit period |
| 3 | Tone C | Square wave | 12-bit period |
| — | Noise | Shared generator | 5-bit LFSR (applied via mixer) |

### Shared Resources

- **Envelope Generator:** Only one envelope can run at a time. If multiple instruments use \`vol_env\`, only one channel will play the envelope.
- **Noise Generator:** The noise source is global (5-bit LFSR). All channels using noise mixing blend in the same noise signal. The `noise_rate` (0–31) is shared globally.
      `,
    },
    {
      id: 'instruments',
      title: 'Instrument Fields',
      content: `
## Instrument Definition

### Common Fields (all types)

- \`vol\`: Fixed volume (0 = silent, 15 = loudest)
- \`vol_env\`: Volume envelope macro \`[0-15,...|loopIdx]\`

### Tone Channels (tone1, tone2, tone3)

- \`arp_env\`: Arpeggio as semitone offsets \`[0,2,4,5,...]\`
- \`pitch_env\`: Pitch bend as semitone offsets \`[0,-1,-2,...]\`

### Noise Mixing (all tone channels)

- \`tone_mix\`: Enable noise mixing (default: false)
- \`noise_rate\`: Noise period when tone_mix is enabled (0–31, lower = higher pitch)

## Example

\`\`\`bax
inst lead  type=tone1 vol=12 arp_env=[0,2,4,5]
inst bass  type=tone2 vol=14
inst perc  type=tone3  vol=15 tone_mix=true noise_rate=12 vol_env=[15,8,0]
\`\`\`
      `,
    },
  ],
};
```

#### 8. `src/songWizard.ts` — New Song Templates

```typescript
import type { ChipNewSongWizardConfig } from '@beatbax/engine';

export const spectrumSongWizard: ChipNewSongWizardConfig = {
  metadata: {
    chipDisplayName: 'ZX Spectrum 128',
    platform: 'Sinclair ZX Spectrum 128K',
    year: '1986',
    channelSummary: '3 tone channels (noise mixed per channel)',
  },
  templates: {
    instruments: [
      {
        id: 'spectrum-lead',
        label: 'Lead (Tone A)',
        content: 'inst lead type=tone1 vol=12 arp_env=[0,2,4,5]',
      },
      {
        id: 'spectrum-bass',
        label: 'Bass (Tone B)',
        content: 'inst bass type=tone2 vol=14',
      },
      {
        id: 'spectrum-perc',
        label: 'Percussion (Tone C + Noise)',
        content: 'inst kick type=tone3 vol=15 tone_mix=true noise_rate=10 vol_env=[15,6,0]',
      },
    ],
    effects: [
      {
        id: 'spectrum-vib',
        label: 'Vibrato (pitch_env)',
        content: 'pitch_env=[0,1,2,1,0,-1,-2,-1]',
      },
      {
        id: 'spectrum-arp',
        label: 'Arpeggio',
        content: 'arp_env=[0,2,4,7]',
      },
    ],
    patterns: [
      {
        id: 'spectrum-melody',
        label: 'Melody pattern',
        content: 'pat melody = C4 D4 E4 F4 G4 A4 B4 C5',
      },
      {
        id: 'spectrum-bass-line',
        label: 'Bass pattern',
        content: 'pat bass = C2 . . . G1 . . .',
      },
      {
        id: 'spectrum-drums',
        label: 'Drum pattern',
        content: 'pat drums = C2 . . C2',
      },
    ],
    sequences: [
      {
        id: 'spectrum-main',
        label: 'Main sequence',
        content: 'seq main = melody melody melody melody',
      },
      {
        id: 'spectrum-bass-seq',
        label: 'Bass sequence',
        content: 'seq bassline = bass bass bass bass',
      },
      {
        id: 'spectrum-drums-seq',
        label: 'Drums sequence',
        content: 'seq drumline = drums drums drums drums',
      },
    ],
    arrangement: [
      {
        id: 'spectrum-full',
        label: 'Full arrangement',
        content: `channel 1 => inst lead seq main
channel 2 => inst bass seq bassline
channel 3 => inst kick seq drumline`,
      },
    ],
  },
};
```

---

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create package structure (`src/` directories, `package.json`, `tsconfig.json`)
2. Implement `ay-emulator.ts` (PSG tone/noise/envelope generation)
3. Implement `platform-profiles.ts` (Spectrum 128, Amstrad CPC clock configs)
4. Implement `periodTables.ts` (MIDI → AY period lookup)
5. Add unit tests for emulator and period tables
6. Verify deterministic output (repeated renders match exactly)

**Gate:** Emulator test suite passes; determinism verified.

### Phase 2: Chip Plugin Interface

1. Implement `validate.ts` (instrument validation)
2. Implement `channel.ts` (ChipChannelBackend factory)
3. Implement `index.ts` (ChipPlugin entry point)
4. Wire plugin registration in engine
5. Add integration tests: channel creation, instrument validation
6. Test playback on a simple 4-note song (CLI + Web Audio)

**Gate:** Plugin registers correctly; channels render non-zero audio.

### Phase 3: UI & New Song Wizard

1. Implement `ui-contributions.ts` (Copilot prompts, hover docs, help sections)
2. Implement `songWizard.ts` (New Song templates)
3. Wire UI contributions into web editor
4. Test Copilot completions and hover docs

**Gate:** New Song modal loads; Copilot suggestions appear in editor.

### Phase 4: Effects Integration

1. Implement macro parsing in `channel.ts`: `vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`
2. Integrate with effects system for per-tick advancement
3. Add tests for effect application across all channels
4. Verify deterministic effect output

**Gate:** All effects render correctly; determinism preserved.

### Phase 5: Sample Songs & Documentation

1. Create `songs/spectrum-128/synth-demo.bax`:
   - Define 3 synth instruments (lead, bass, harmonic) with `vol`, `arp_env`, `pitch_env`
   - Compose a 16-bar polyphonic melody
   - Include documentation comments explaining each instrument and macro

2. Create `songs/spectrum-128/percussion-demo.bax`:
   - Define percussion instruments using `tone_mix=true`, `noise_rate`, `vol_env`
   - Compose kick, snare, hi-hat drum patterns
   - Demonstrate attack/decay curves via volume envelopes
   - Include pattern/sequence templates

3. Create `songs/spectrum-128/effects-showcase.bax`:
   - Combine all macro types: `vol_env`, `arp_env`, `pitch_env`, `noise_rate`
   - Demonstrate hardware limitations (one envelope per song)
   - Show noise mixing across multiple channels
   - Include comments on mixing strategies

4. Create `songs/spectrum-128/amstrad-cpc-demo.bax`:
   - Port one of the above songs with `chipRegion=cpc-128k`
   - Verify clock scaling produces correct output
   - Include region-aware comments

5. Create regression test songs in `songs/spectrum-128/tests/`:
   - `smoke-test.bax` — Minimal 4-note monotonic song (binary output regression gate)
   - `shared-envelope-test.bax` — Conflict detection for multiple `vol_env` instruments
   - `noise-mixing-test.bax` — Independent noise blending on each channel
   - `all-macros.bax` — One of each macro type in single song

6. Add README: `songs/spectrum-128/README.md`
   - Index of sample songs
   - How to play each song (CLI: `beatbax play`, Web: drag-and-drop)
   - Macro parameter reference
   - Troubleshooting section

**Gate:** All sample songs render without errors; regression test hashes match baseline.

### Phase 6: Export Integration (Future)

When VGM exporter is ready:
1. Register the exporter via explicit plugin/host registration (`exporterPlugins` or host discovery)
2. Wire VGM backend for AY-3-8910 (per VGM exporter feature doc)
3. Add snapshot tests for VGM export determinism

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `ay-emulator.test.ts` | Tone/noise/envelope generation, LFSR behavior, attenuation calculation |
| `periodTables.test.ts` | Frequency → period conversion, lookup table consistency |
| `validate.test.ts` | Instrument validation (valid/invalid ranges, macros) |
| `platform-profiles.test.ts` | Clock scaling, region switching |
| `channel.test.ts` | Channel rendering, macro state advancement, noteOn/noteOff |

### Integration Tests

| Test file | Scope |
|-----------|-------|
| `plugin.test.ts` | Plugin registration, channel creation, validateInstrument, configureForSong |
| Playback tests | Play a 4-note melody on each channel; compare output across runs (determinism) |
| Effects tests | Apply vol_env, arp_env, pitch_env; verify per-frame advancement |
| Sample song tests | Load and render all sample songs; verify non-zero audio output and determinism |

### Sample Song Tests

| Song | Scope |
|------|-------|
| `synth-demo.bax` | Verify arp_env, pitch_env, polyphonic playback; render to WAV |
| `percussion-demo.bax` | Verify tone_mix, noise_rate, vol_env; drum pattern timing |
| `effects-showcase.bax` | Verify all macros interact; check for envelope conflicts |
| `amstrad-cpc-demo.bax` | Verify chipRegion switching; clock scaling accuracy |
| `smoke-test.bax` | Minimal regression gate (4 notes per channel, compare SHA-256) |
| `shared-envelope-test.bax` | Verify validation warns of vol_env conflicts |
| `noise-mixing-test.bax` | Verify independent noise mixing per channel |
| `all-macros.bax` | Verify all macro types work in one song |

### Regression Gate

Before merging each phase:
1. **Phase 2 Gate:** `smoke-test.bax` renders to identical bytes across 3 runs (SHA-256 match)
2. **Phase 4 Gate:** All effect tests pass; all sample songs render non-zero audio
3. **Phase 5 Gate:** All sample songs produce byte-for-byte identical output on repeated renders
4. **Cross-platform test:** Both `synth-demo.bax` and `amstrad-cpc-demo.bax` render without errors; regional clock scaling verified via spectrum analyzer

---

## Sample Songs Reference

### synth-demo.bax

**Purpose:** Demonstrate instrument definitions and melodic macros.

**Structure:**
```bax
chip spectrum-128
bpm 150

; Lead synthesizer: arpeggio-based melody
inst lead type=tone1 vol=12 arp_env=[0,2,4,7,4,2,0]

; Bass synthesizer: pitch bend for expression
inst bass type=tone2 vol=14 pitch_env=[0,-2,-4,-2,0]

; Harmonic pad: constant tone, no macros
inst pad  type=tone3 vol=10

; 16-bar patterns
pat lead_riff = C4 E4 G4 C5 B4 G4 E4 . | ...
pat bass_line = C2 . . . G1 . . . | ...
pat pad_sust  = E3 . . . E3 . . . | ...

seq main = lead_riff lead_riff lead_riff lead_riff
seq bass = bass_line bass_line bass_line bass_line
seq pad  = pad_sust pad_sust pad_sust pad_sust

channel 1 => inst lead seq main
channel 2 => inst bass seq bass
channel 3 => inst pad  seq pad

play
```

**Demonstrates:**
- 3-channel polyphonic playback
- `arp_env` for step-sequenced arpeggio
- `pitch_env` for expressive pitch bends
- Constant volume instruments
- Pattern reuse via sequences

---

### percussion-demo.bax

**Purpose:** Demonstrate noise mixing, volume envelopes, and percussive articulation.

**Structure:**
```bax
chip spectrum-128
bpm 120

; Kick drum: low tone + noise, fast decay
inst kick type=tone3 vol=15 tone_mix=true noise_rate=2 vol_env=[15,10,5,0]

; Snare: mid noise with quick attack
inst snare type=tone1 vol=14 tone_mix=true noise_rate=8 vol_env=[14,8,0]

; Hi-hat: bright noise, short sustain
inst hihat type=tone2 vol=12 tone_mix=true noise_rate=15 vol_env=[12,6,0]

; Bass drum fill
pat kick = C2 . . C2 . C2 . .

; Snare on 2 and 4
pat snare = . . D3 . . . E3 .

; Hi-hat eighth notes
pat hihat = F4 . F4 . F4 . F4 .

seq drums = kick . snare . hihat hihat snare .

channel 1 => inst kick  seq drums
channel 2 => inst snare seq drums
channel 3 => inst hihat seq drums

play
```

**Demonstrates:**
- Noise mixing via `tone_mix=true` on all 3 channels
- Per-channel `noise_rate` (shared globally)
- `vol_env` for percussive attack/decay
- Drum pattern timing and articulation
- Practical arrangement (kick + snare + hi-hat)

---

### effects-showcase.bax

**Purpose:** Demonstrate all macro types and hardware constraints.

**Structure:**
```bax
chip spectrum-128
bpm 140

; Lead with all three macros
inst complex type=tone1 vol=13
  arp_env=[0,2,4,5]     ; Arpeggio pattern
  pitch_env=[0,1,0,-1]  ; Subtle vibrato-like pitch bend
  vol_env=[15,12,9,6]   ; Fade out over 4 steps

; Bass: volume envelope (uses the one shared envelope HW)
inst bass type=tone2 vol=14 vol_env=[14,14,10,6]

; Percussion: noise mixing + no macros
inst perc type=tone3 vol=15 tone_mix=true noise_rate=12

pat melody = C4 E4 G4 C5 B4 A4 G4 .
pat bass   = C2 . . . G1 . . .
pat drums  = D2 . . D2 . . D2 .

seq main = melody melody melody melody
seq bass = bass bass bass bass
seq perc = drums drums drums drums

channel 1 => inst complex seq main  ; Uses arp_env + pitch_env
channel 2 => inst bass    seq bass  ; Uses vol_env (shared HW)
channel 3 => inst perc    seq perc  ; Uses tone_mix

play
```

**Demonstrates:**
- Multiple macro types: `arp_env`, `pitch_env`, `vol_env`
- Hardware limitation: only one `vol_env` per song (ch2 gets it, ch1 has other macros)
- Noise mixing independent of macros
- Deterministic macro advancement per frame
- Practical polyphonic arrangement

---

### amstrad-cpc-demo.bax

**Purpose:** Verify platform-agnostic song structure and region-aware clock scaling.

**Structure:**
```bax
chip spectrum-128
chipRegion amstrad-cpc-128k

; Same instruments as synth-demo, platform independent
inst lead type=tone1 vol=12 arp_env=[0,2,4,7]
inst bass type=tone2 vol=14
inst pad  type=tone3 vol=10

pat melody = C4 E4 G4 C5 B4 A4 G4 .
pat bass   = C2 . . . G1 . . .

seq main = melody melody melody melody
seq bass = bass bass bass bass

channel 1 => inst lead seq main
channel 2 => inst bass seq bass
channel 3 => inst pad  seq main:oct(-1)

play
```

**Demonstrates:**
- `chipRegion` override to CPC 128K (2.0 MHz clock)
- Platform-agnostic note names and macros
- Deterministic output across clock regions
- Usage in multi-target homebrew projects

---

### Test Songs

**smoke-test.bax** — Binary regression gate:
```bax
chip spectrum-128
inst tone1 type=tone1 vol=10
inst tone2 type=tone2 vol=10
inst tone3 type=tone3 vol=10

channel 1 => inst tone1 . : C4 D4 E4 F4
channel 2 => inst tone2 . : C3 D3 E3 F3
channel 3 => inst tone3 . : C2 D2 E2 F2

play
```

**shared-envelope-test.bax** — Validates envelope conflict detection (should warn or error):
```bax
chip spectrum-128
inst lead type=tone1 vol=12 vol_env=[15,10,5,0]
inst bass type=tone2 vol=14 vol_env=[14,10,6,0]  ; Conflict!

channel 1 => inst lead .
channel 2 => inst bass .
```

**noise-mixing-test.bax** — Verifies per-channel noise control:
```bax
chip spectrum-128
inst tone  type=tone1 vol=12               ; Pure tone
inst blend type=tone2 vol=12 tone_mix=true noise_rate=8  ; Tone + noise
inst noise type=tone3 vol=12 tone_mix=true noise_rate=20 ; Mostly noise

channel 1 => inst tone  . : C4 C4 C4 C4
channel 2 => inst blend . : C3 C3 C3 C3
channel 3 => inst noise . : C2 C2 C2 C2
```

**all-macros.bax** — Tests all macro types in one song (no conflicts):
```bax
chip spectrum-128
inst lead type=tone1 vol=12 arp_env=[0,2,4,5] pitch_env=[0,1,0,-1]
inst bass type=tone2 vol=14
inst perc type=tone3 vol=14 tone_mix=true noise_rate=12 vol_env=[15,8,0]

channel 1 => inst lead .
channel 2 => inst bass .
channel 3 => inst perc .
```

---

## Compatibility & Constraints

### Shared Hardware Limitations

1. **One Envelope:** Only one channel can use `vol_env` at a time due to single shared envelope generator. Validation must warn if multiple instruments declare `vol_env`.
2. **Noise Period:** All channels using `tone_mix=true` share the same global `noise_rate`. Recommend documenting this in help + Copilot prompts.
3. **Mixer Blending:** Each tone channel has independent tone/noise mix control. Recommended patterns: tone1/tone2 use pure tone, tone3 can blend with noise for percussion effects.

### Clock Accuracy

The period table uses equal temperament (A4 = 440 Hz) and must be recomputed when switching regions (Spectrum 128 vs. Amstrad CPC). The `configureForSong()` hook handles this.

---

## Documentation

### User-Facing

- [docs/chips/zx-spectrum-128/](docs/chips/zx-spectrum-128/) — Hardware reference, constraints, limitations
  - `hardware.md` — AY-3-8910 registers, LFSR, envelope shapes
  - `tutorial.md` — First song template, macro examples
- [packages/plugins/chip-spectrum-128/README.md](packages/plugins/chip-spectrum-128/README.md) — Installation, usage, channel types

### Sample Songs & Examples

- [songs/spectrum-128/synth-demo.bax](songs/spectrum-128/synth-demo.bax) — Polyphonic synthesis with arp_env and pitch_env
- [songs/spectrum-128/percussion-demo.bax](songs/spectrum-128/percussion-demo.bax) — Drum kit using noise mixing and vol_env
- [songs/spectrum-128/effects-showcase.bax](songs/spectrum-128/effects-showcase.bax) — All macros combined; demonstrates hardware constraints
- [songs/spectrum-128/amstrad-cpc-demo.bax](songs/spectrum-128/amstrad-cpc-demo.bax) — Platform-agnostic song with regional clock scaling
- [songs/spectrum-128/README.md](songs/spectrum-128/README.md) — Index, how to play, troubleshooting

### Test Songs

- [songs/spectrum-128/tests/smoke-test.bax](songs/spectrum-128/tests/smoke-test.bax) — Minimal regression gate (4 notes per channel)
- [songs/spectrum-128/tests/shared-envelope-test.bax](songs/spectrum-128/tests/shared-envelope-test.bax) — Envelope conflict detection
- [songs/spectrum-128/tests/noise-mixing-test.bax](songs/spectrum-128/tests/noise-mixing-test.bax) — Independent noise per channel
- [songs/spectrum-128/tests/all-macros.bax](songs/spectrum-128/tests/all-macros.bax) — All macro types in one song

### Implementation-Facing

- `src/*.ts` — Inline JSDoc comments on all public functions
- Test files — Clear test names describing behavior verified
- Sample songs — Inline comments explaining instruments, macros, and mixing strategies

---

## Future Enhancements

### Short-term

- **AY envelope shapes:** Implement all 16 AY hardware envelope curves per datasheet
- **Effects refinement:** Integrate with BeatBax effects system (cut, retrig, volslide, etc.)
- **Atari ST support:** Add clock profiles for Atari ST (2.0 MHz) as separate platform profile

### Mid-term

- **VGM export:** Integrate with VGM exporter backend (when multi-chip architecture lands)
- **PT3 export:** Native ProTracker 3 format export (Spectrum homebrew standard)
- **Arkos Tracker support:** Export to Arkos Tracker format

### Long-term

- **Debugger:** Visualize per-channel register state in web editor
- **Hardware simulation:** Accurate cycle-level register write timing
- **Multi-song format:** Support for linked modules (e.g. menu music + gameplay music)
