---
title: "NES Ricoh 2A03 APU Chip Plugin"
status: proposed
authors: ["kadraman"]
created: 2026-04-09
issue: "https://github.com/kadraman/beatbax/issues/83"
---

## Summary

Implement the Nintendo Entertainment System Ricoh 2A03 APU as a BeatBax chip plugin (`@beatbax/plugin-chip-nes`). The plugin exposes five channels — two pulse oscillators, a triangle wave, a noise generator, and a DMC (Delta Modulation Channel) sampler — through the standard `ChipPlugin` interface defined in `plugin-system.md`. Users select the backend with `chip nes` at the top of their `.bax` file.

The NES APU is the richest built-in audio architecture in BeatBax's planned chip roster. Compared with the Game Boy, it adds a fixed-waveform triangle channel, hardware sweep units on both pulse channels, a 15-bit noise LFSR, and sample playback via the DMC — all summed through a characteristic non-linear mixer that gives NES music its warm, slightly compressed sound.

---

## Problem Statement

BeatBax currently supports only the Game Boy DMG-01 APU. Composers who want to author music in the NES style — the most recognisable chiptune palette in the world — have no supported path. The plugin architecture in `plugin-system.md` establishes the contract for adding new chips; the NES plugin is the first external chip and the proof-of-concept for that system. Without it, the plugin API has no real-world validation and NES-style composition is unavailable.

---

## Proposed Solution

### Summary

Create `packages/plugins/chip-nes/` as a standalone npm package (`@beatbax/plugin-chip-nes`) that:

- Implements the `ChipPlugin` interface from `packages/engine/src/chips/types.ts`
- Provides five channel backends: `pulse.ts` (×2), `triangle.ts`, `noise.ts`, `dmc.ts`
- Ships an NTSC period table (`periodTables.ts`) covering C2–C7 (61 notes, MIDI 36–96) for pulse channels and C2–C7 (61 notes, MIDI 36–96) for triangle
- Validates NES-specific instrument fields (duty, sweep, noise mode/period, DMC rate/sample)
- Renders audio using the WebAudio API, approximating the hardware's non-linear mixer with a linear weighted-sum `GainNode` network (see §3.6), plus hardware sweep units and LFSR noise
- (Optional, post-v1) exports to `.nsf` (NES Sound Format), FamiTracker `.ftm`, or FamiStudio `.fms` via `exportToNative()`

### Package Structure

```
packages/plugins/chip-nes/
├── package.json             # @beatbax/plugin-chip-nes, peerDep: @beatbax/engine ^1.0.0
├── tsconfig.json
├── src/
│   ├── index.ts             # ChipPlugin entry point, registers all channel factories
│   ├── pulse.ts             # NES pulse channel backend (duty, envelope, hardware sweep)
│   ├── triangle.ts          # NES triangle channel backend (fixed waveform, linear counter)
│   ├── noise.ts             # NES noise channel backend (15-bit LFSR, two modes)
│   ├── dmc.ts               # NES DMC channel backend (sample trigger, loop, rate)
│   ├── mixer.ts             # Non-linear mixer approximation
│   └── periodTables.ts      # NTSC pulse and triangle period tables (A4 = 440 Hz)
├── tests/
│   ├── pulse.test.ts
│   ├── triangle.test.ts
│   ├── noise.test.ts
│   ├── dmc.test.ts
│   ├── mixer.test.ts
│   └── nes-plugin.test.ts   # Integration: full plugin registration and playback
└── README.md
```

### Example Syntax

#### Instrument Definitions

```bax
chip nes
bpm 150

; ── Pulse channels ──────────────────────────────────────────
inst lead   type=pulse1  duty=25  env=13,down  env_period=2
inst harm   type=pulse2  duty=50  env=10,down  env_period=4

; sweep on lead (downward pitch slide on attack)
inst sweep_lead  type=pulse1  duty=25  env=13,down  env_period=2
                 sweep_en=true  sweep_period=3  sweep_dir=down  sweep_shift=2

; ── Triangle ────────────────────────────────────────────────
; Triangle has no hardware volume control — it is always at full amplitude when gated on.
; `vol=15` is a software gate convenience (same as omitting vol); any other value silences the channel.
inst bass   type=triangle

; short percussive triangle ping (kick reinforcement)
inst tri_kick  type=triangle  linear=4

; ── Noise ───────────────────────────────────────────────────
inst kick   type=noise  noise_mode=normal  noise_period=12  env=15,down  env_period=3
inst snare  type=noise  noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat  type=noise  noise_mode=normal  noise_period=3   env=8,down   env_period=0
inst crash  type=noise  noise_mode=normal  noise_period=3   env=12,down  env_period=8
inst metal  type=noise  noise_mode=loop    noise_period=5   vol=10

; ── DMC ─────────────────────────────────────────────────────
; Named sample from the plugin's built-in sample library (works in all environments)
inst bass_hit  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="@nes/bass_c2"
inst kick_dmc  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="@nes/kick"

; URL-based loading (CLI and browser)
inst bass_url  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="https://example.com/samples/bass.dmc"

; Local file import (CLI only — blocked in browser for security)
inst bass_file type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="local:samples/bass_c2.dmc"
```

#### Channel Routing

```bax
channel 1 => inst lead   seq main          ; Pulse 1 — lead melody
channel 2 => inst harm   seq counter       ; Pulse 2 — harmony / counter-melody
channel 3 => inst bass   seq bassline      ; Triangle — bass line
channel 4 => inst kick   seq drums         ; Noise    — percussion
channel 5 => inst bass_hit  seq bass_hits  ; DMC      — bass reinforcement
```

> **Note:** BeatBax maps `channel 1–5` to NES channels in hardware order:
> 1 → Pulse 1, 2 → Pulse 2, 3 → Triangle, 4 → Noise, 5 → DMC.

---

## Implementation Plan

### Phase 1 — Plugin System Prerequisites

Before implementing the NES plugin, the core plugin infrastructure from `plugin-system.md` must be in place:

1. Define `ChipPlugin` and `ChipChannelBackend` interfaces in `packages/engine/src/chips/types.ts`
2. Create `ChipRegistry` class in `packages/engine/src/chips/registry.ts`
3. Refactor the existing Game Boy chip to implement `ChipPlugin` internally (no API change externally)
4. Update `BeatBaxEngine` to use the registry for chip selection and validate `chip` directive at compile time
5. Update the parser/validator to support 5-channel songs when `chip nes` is declared

### Phase 2 — AST and Parser Changes

New instrument fields required by the NES chip that do not exist in the Game Boy instrument model:

| Field | Type | Description |
|-------|------|-------------|
| `env_period` | `0`–`15` | Envelope decay period (Game Boy uses combined `env=vol,dir`) |
| `env_loop` | `boolean` | Envelope loops (repeating sawtooth LFO) |
| `sweep_en` | `boolean` | Enable hardware pitch sweep |
| `sweep_period` | `1`–`7` | Sweep divider period |
| `sweep_dir` | `"up"│"down"` | Sweep direction (natural terminology, not hardware negate) |
| `sweep_shift` | `0`–`7` | Sweep exponent (shift count) |
| `noise_mode` | `"normal"│"loop"` | LFSR feedback mode |
| `noise_period` | `0`–`15` | Noise frequency preset index |
| `linear` | `1`–`127` | Triangle linear counter duration |
| `dmc_rate` | `0`–`15` | DMC playback rate index |
| `dmc_loop` | `boolean` | DMC sample loops |
| `dmc_level` | `0`–`127` | Initial DAC level |
| `dmc_sample` | `string` | Sample reference: `"@nes/<name>"` for bundled library, `"local:<path>"` for CLI file, `"https://..."` for URL |

**Parser changes:**
- Add the above fields to the instrument definition grammar (Peggy grammar file)
- Validate NES-specific fields are only present when `chip nes` is active
- Validate `channel` count ≤ 5 for NES songs
- Report friendly errors for out-of-range values (`noise_period` must be 0–15, etc.)

**AST changes:**
- `InstrumentDef` node: add optional NES fields (all `undefined` for Game Boy instruments)
- No structural changes to `ChannelNode`, `PatternNode`, or `SeqNode` — channels 1–5 continue to work as-is

### Phase 3 — NES Channel Backends

#### 3.1 `periodTables.ts`

Pre-computed NTSC period values for MIDI 36–96 (61 notes, C2–C7). Two tables:

```typescript
// Pulse period: f = 1789773 / (16 × (period + 1))
export const PULSE_PERIOD: Record<number, number> = { /* MIDI 36–96, 61 entries */ };

// Triangle period: f = 1789773 / (32 × (period + 1))
// Because triangle divides by 32 (vs 16 for pulse), it needs HALF the period register
// value to produce the same frequency as pulse:
//   TRIANGLE_PERIOD[n] ≈ PULSE_PERIOD[n] / 2   ← triangle period is SMALLER, not larger
// Cross-check: this equals the period pulse uses one octave HIGHER (n+12), because going
// up one octave on pulse doubles the frequency and therefore halves the period value:
//   TRIANGLE_PERIOD[n] ≈ PULSE_PERIOD[n + 12]  (same register number, different pitches:
//                                                triangle plays note n; pulse plays note n+12)
export const TRIANGLE_PERIOD: Record<number, number> = { /* MIDI 36–96, 61 entries */ };
```

Values are taken directly from `docs/chips/nes.md` Appendix A. Both tables are keyed by MIDI note number.

#### 3.2 `pulse.ts` — Pulse Channel Backend

Implements `ChipChannelBackend` for `type=pulse1` and `type=pulse2`.

Key behaviours:

- **Duty cycle:** Map `duty=12|25|50|75` to a WebAudio `PeriodicWave` with the correct harmonic spectrum for each 8-step duty sequence
- **Volume envelope:** Implement as a `GainNode` automation curve; envelope period → automation rate; `env_loop=true` creates a repeating sawtooth on `GainNode.gain`
- **Hardware sweep:** Schedule period changes via `OscillatorNode.frequency` automation starting at note-on; direction and shift compute the target period per hardware formula:
  ```
  target = current + (current >> shift)   ; sweep up (negate=0, adds to period → lowers pitch)
  target = current - (current >> shift)   ; sweep down (negate=1)
  ```
  Enforce muting conditions: silence if `period < 8` or `target > 2047`
- **Constant volume mode:** When `vol` is specified, bypass envelope and set `GainNode.gain` to `vol / 15`

> **Pulse 1 vs Pulse 2 sweep negate:** Hardware difference (one's complement vs two's complement) produces nearly identical results in practice; model both accurately but this distinction is transparent to the composer using `sweep_dir`.

#### 3.3 `triangle.ts` — Triangle Channel Backend

Implements `ChipChannelBackend` for `type=triangle`.

Key behaviours:

- **Fixed waveform:** Generate a 32-step quantised triangle wave as a `PeriodicWave` (odd harmonics only, amplitudes fall as 1/n²). The waveform is computed once and reused across all notes.
- **No hardware volume envelope:** Triangle has no hardware amplitude control. `GainNode.gain` is always 1.0 when the channel is active.
- **Software gate via `vol`:** `vol=0` silences the channel (software mute, not hardware-authentic); any other `vol` value is treated as full amplitude and is otherwise ignored. This is not a continuous gain: values 1–15 all produce the same full-amplitude output.
- **Linear counter:** `linear` field specifies duration in ticks at 240 Hz; schedule note-off via `GainNode.gain.setValueAtTime(0, noteOnTime + linearDuration)`
- **Frequency formula:** Use `TRIANGLE_PERIOD` table (period = 32-step equivalent, plays one octave lower than pulse at same period value)
- **Pop prevention:** Ramp `GainNode.gain` to 0 over 1 ms on note-off to prevent DC offset click

#### 3.4 `noise.ts` — Noise Channel Backend

Implements `ChipChannelBackend` for `type=noise`.

Key behaviours:

- **LFSR simulation (preferred — pre-generated buffers):** At plugin initialisation, generate two buffers using the 15-bit LFSR algorithm in JavaScript (not on the audio thread):
  - `noise_mode=normal`: feedback from bits 1 and 0 → long period (32,767 samples), white noise character
  - `noise_mode=loop`: feedback from bits 6 and 0 → short period (93 samples), metallic/tonal character
  Pre-load each buffer into an `AudioBufferSourceNode` with `loop=true`. This approach works in all environments (browser and Node.js), requires no worklet packaging, and has negligible runtime overhead.
- **Noise period:** `noise_period` indexes into the 16-entry NTSC timer table to set the LFSR clock rate; map to `AudioBufferSourceNode.playbackRate` relative to `audioContext.sampleRate`.
- **Volume envelope:** Same envelope model as pulse channels; `GainNode` automation driven by `env_period` and `env_loop`.
- **Constant volume mode:** `vol` field sets `GainNode.gain` directly.

> **Real-time LFSR via `AudioWorkletNode` (accuracy validation only):** An `AudioWorkletProcessor` that runs the LFSR shift register sample-by-sample on the audio thread is more hardware-accurate but adds packaging complexity and message-passing overhead. Implement this path only when bit-exact LFSR output is required for hardware verification tests — not as the default rendering path.
>
> **Do not use `ScriptProcessorNode`:** This API is deprecated in the WebAudio specification, produces main-thread audio callbacks with unpredictable latency, and is being removed from browsers. It must not be used in any BeatBax audio backend implementation.

#### 3.5 `dmc.ts` — DMC Channel Backend

Implements `ChipChannelBackend` for `type=dmc`.

Key behaviours:

- **Sample resolution (multi-environment):** `dmc_sample` supports three reference schemes:
  - `"@nes/<name>"` — resolves from the plugin's built-in sample library (works in all environments: browser, Node.js, CLI)
  - `"local:<path>"` — resolves from the local file system via the path-traversal guard (CLI/Node.js only; blocked in browser, matching the existing import security model in `docs/language/import-security.md`)
  - `"https://..."` — fetches remotely via `fetch()` (works in browser and Node.js 18+)
- **Sample decoding:** Decode the loaded `.dmc` content (1-bit delta-encoded, standard NES format) into a `Float32Array` for WebAudio playback
- **Playback rate:** Map `dmc_rate` index to NTSC sample rate (16 values, 4181–33144 Hz); pass as `AudioBufferSourceNode.playbackRate` relative to `audioContext.sampleRate`
- **Loop mode:** `dmc_loop=true` sets `AudioBufferSourceNode.loop = true`
- **Initial level:** `dmc_level` sets a DC offset on `ConstantSourceNode` to initialise the DAC counter simulation
- **Trigger on note-on:** DMC is a sample trigger, not a pitched synthesiser; note pitch is ignored; the sample plays from its start address on each note-on event
- **Security:** `local:` paths pass through the same path-traversal guard as instrument imports; browser environments block local paths automatically

#### 3.6 `mixer.ts` — Mixer (Linear Weighted-Sum Approximation)

The NES hardware mixer is genuinely non-linear: pulse channels are summed through a dedicated DAC lookup table, and triangle/noise/DMC through a second table, producing a warm soft-clip characteristic at high volumes. WebAudio has no equivalent; the implementation uses a **linear weighted-sum** `GainNode` network whose weights are derived from the first-order approximation of each table's slope near mid-range. The gain constants below are taken from the standard NESDev linear-approximation formulae:

```typescript
// Linear approximation of the NES non-linear mixer gain weights.
// On real hardware, pulse channels are summed via a dedicated lookup table and
// triangle/noise/DMC via a second table. This linear approximation captures the
// relative channel weighting without a full lookup-table simulation.
export function nesMix(p1: number, p2: number, tri: number, noise: number, dmc: number): number {
  const pulse = 0.00752 * (p1 + p2);
  const tnd = 0.00851 * tri + 0.00494 * noise + 0.00335 * dmc;
  return pulse + tnd;
}
```

In WebAudio, wire all five channel outputs through `GainNode` nodes with the gain constants above and sum them into the master output. This is a **linear** approximation — it preserves the relative perceived loudness of each channel group but does not reproduce the hardware's soft-clip compression at high volumes. An `AudioWorkletNode` with a lookup-table processor could model the non-linearity more faithfully but adds significant complexity; the linear approximation is acceptable for DAW-style preview use.

### Phase 4 — Plugin Entry Point

```typescript
// packages/plugins/chip-nes/src/index.ts
import { ChipPlugin } from '@beatbax/engine';
import { createPulseChannel } from './pulse.js';
import { createTriangleChannel } from './triangle.js';
import { createNoiseChannel } from './noise.js';
import { createDmcChannel } from './dmc.js';
import { validateNesInstrument } from './validate.js';

const nesPlugin: ChipPlugin = {
  name: 'nes',
  version: '1.0.0',
  channels: 5,

  validateInstrument(inst) {
    return validateNesInstrument(inst);
  },

  createChannel(channelIndex, audioContext) {
    switch (channelIndex) {
      case 0: return createPulseChannel(audioContext, 'pulse1');
      case 1: return createPulseChannel(audioContext, 'pulse2');
      case 2: return createTriangleChannel(audioContext);
      case 3: return createNoiseChannel(audioContext);
      case 4: return createDmcChannel(audioContext);
      default: throw new Error(`NES plugin: invalid channel index ${channelIndex}`);
    }
  },
};

export default nesPlugin;
```

### Phase 5 — CLI and Engine Integration

- Register `nesPlugin` via CLI auto-discovery (see `plugin-system.md` Phase 4)
- Ensure `beatbax verify song.bax` reports NES-specific validation errors (e.g., too many channels, invalid `noise_period`)
- Add `--chip nes` hint in CLI help text once NES is available
- Export from `packages/engine/src/index.ts` the 5-channel channel count constant so the scheduler allocates 5 channel slots for NES songs

### Phase 6 — Native Format Exports (Optional / Post-v1)

Three NES-native export formats are targeted, in order of priority:

#### NSF (NES Sound Format)
Standard way to play NES music in emulators and on original hardware. NSF export requires:

- 6502 assembly player stub (init/play routines at fixed ROM locations)
- APU register write stream generated from the ISM event list
- NSF header: magic bytes `NESM\x1a`, version, total songs, starting song, load/init/play addresses, title, artist, copyright, speed, bankswitch info

This is significantly more complex than binary ISM export and is deferred to a post-v1 phase.

#### FamiTracker `.ftm`
FamiTracker is the most widely used NES music tracker for homebrew game development. Its native `.ftm` format is a structured binary containing:

- Song header (title, author, copyright, speed/tempo)
- Instrument table (pulse, triangle, noise, DPCM instruments with envelope sequences)
- Pattern table (64-row patterns with note, instrument, volume, and effect columns)
- Frame order (pattern sequence per channel)

The ISM → FamiTracker mapping is more direct than NSF because FamiTracker uses a tracker-style representation (patterns, frames, instruments) that aligns closely with BeatBax's `pat`/`seq`/`inst` model. FamiTracker also natively supports DPCM samples referenced by filename or embedded data, making it the preferred target for songs that use the DMC channel.

#### FamiStudio `.fms`
FamiStudio is a more modern NES music tool popular for its clean UI and EPSM expansion support. Its `.fms` format is JSON-based, making it the easiest to target programmatically. FamiStudio's effect model (note attacks, slide notes, vibrato speed/depth, volume envelopes) maps cleanly to BeatBax's effect system.

FamiStudio is the recommended first implementation target for native export, because its JSON format can be generated without 6502 assembly stubs and the mapping from BeatBax's ISM is straightforward.

**Priority order for implementation:** FamiStudio `.fms` → FamiTracker `.ftm` → NSF

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `pulse.test.ts` | Duty cycle waveform generation, envelope automation curves, sweep muting conditions (period < 8, target > 2047), sweep negate difference between Pulse 1 and Pulse 2 |
| `triangle.test.ts` | Fixed 32-step waveform correctness, linear counter scheduling, no-envelope behaviour, frequency formula vs pulse formula |
| `noise.test.ts` | LFSR output for both modes, all 16 period values map to expected rates, envelope loop behaviour |
| `dmc.test.ts` | `.dmc` content decoding (test vector with known decoded output), all 16 rate indices, loop flag, `@nes/` bundled library resolution, security rejection of `local:` paths in browser, remote URL loading |
| `mixer.test.ts` | Linear approximation matches expected output levels for known input combinations; pulse channels weighted higher than triangle/noise/DMC |
| `periodTables.test.ts` | All 61 MIDI notes from MIDI 36–96 inclusive in PULSE_PERIOD and TRIANGLE_PERIOD are within ±0.5 cents of equal-temperament A4=440 Hz |
| `nes-plugin.test.ts` | Full plugin registration via `ChipRegistry`; `chip nes` directive resolves to NES plugin; all 5 channels created without error; mock `AudioContext` used for headless test |

### Integration Tests

- Parse and expand a full NES `.bax` song (see Example Songs below) through to ISM without errors
- Verify that all 5 channels are populated in the ISM for a song using all channel types
- Verify that a song with `channel 6` produces a validation error (NES has only 5 channels)
- Export the ISM to JSON and confirm all NES-specific instrument fields are round-tripped correctly
- Export to MIDI: confirm 5 tracks produced, channels mapped in order, DMC channel represented as MIDI channel 10 (percussion)
- CLI: `verify` command exits 0 for valid NES songs and non-zero for invalid ones

### Hardware Accuracy Tests

- NTSC period table values verified against the hardware formula `f = 1,789,773 / (16 × (period + 1))` for pulse and `f = 1,789,773 / (32 × (period + 1))` for triangle
- Pulse frequency for A4 (MIDI 69, period 253) = 440.0 ± 0.5 Hz
- Triangle frequency for A4 (MIDI 69, period 126) = 440.0 ± 0.5 Hz (triangle uses ÷32 formula; period values compensate so both tables produce concert pitch)
- Sweep muting: `period=7` silences pulse channel (period < 8 rule)
- Sweep muting: target period > 2047 silences pulse channel

---

## Example Songs

### 1. Action Platformer — "Wily's Fortress" (fast arpeggios, driving bass)

Demonstrates: pulse arpeggios, triangle kick-reinforcement, noise drum kit, 150 BPM action feel.

```bax
chip nes
bpm 150

; ── Instruments ──────────────────────────────────────────────
inst lead   type=pulse1  duty=25   env=13,down  env_period=2
inst harm   type=pulse2  duty=50   env=10,down  env_period=4
inst bass   type=triangle
inst kick   type=noise   noise_mode=normal  noise_period=12  env=15,down  env_period=3
inst snare  type=noise   noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat  type=noise   noise_mode=normal  noise_period=3   env=8,down   env_period=0
inst tkick  type=triangle  linear=3

; ── Patterns ─────────────────────────────────────────────────
; Melody — arpeggiated Am power chord
pat mel_a  = C5 E5 G5 E5 C5 E5 G5 E5
pat mel_b  = D5 F5 A5 F5 D5 F5 A5 F5
pat mel_c  = B4 D5 F5 D5 B4 D5 F5 D5

; Counter-melody — sustained fifth intervals
pat ctr_a  = G4 . . . E4 . . .
pat ctr_b  = A4 . . . F4 . . .

; Bass — root-fifth walking bass
pat bass_a = C3 . G2 . C3 . E2 .
pat bass_b = D3 . A2 . D3 . F2 .

; Drums — kick on 1&3, snare on 2&4, hihat every 8th
pat beat   = inst kick C3 inst hihat C3 inst snare C3 inst hihat C3
           inst kick C3 inst hihat C3 inst snare C3 inst hihat C3

; Triangle kick reinforcement
pat tkick_pat = inst tkick C2 . . . inst tkick C2 . . .

; ── Sequences ────────────────────────────────────────────────
seq main   = mel_a mel_b mel_a mel_c
seq ctr    = ctr_a ctr_b ctr_a ctr_b
seq low    = bass_a bass_b bass_a bass_b
seq groove = beat beat beat beat

; ── Channels ─────────────────────────────────────────────────
channel 1 => inst lead   seq main
channel 2 => inst harm   seq ctr
channel 3 => inst bass   seq low
channel 4 => inst kick   seq groove
channel 5 => inst tkick  seq tkick_pat

play
```

---

### 2. RPG Adventure — "The Kingdom's Hall" (smooth melody, vibrato, sustained harmony)

Demonstrates: 50% duty harmony, triangle bass with kick reinforcement, gentle noise hi-hat, 110 BPM RPG feel.

```bax
chip nes
bpm 110

; ── Instruments ──────────────────────────────────────────────
inst melody type=pulse1  duty=25   env=12,down  env_period=5
inst chord  type=pulse2  duty=50   vol=9
inst bass   type=triangle
inst perc   type=noise   noise_mode=normal  noise_period=6   env=10,down  env_period=2
inst tick   type=noise   noise_mode=normal  noise_period=3   env=6,down   env_period=0
inst tkick  type=triangle  linear=3

; ── Patterns ─────────────────────────────────────────────────
pat theme_a  = C5 D5 E5 G5 E5 D5 C5 .
pat theme_b  = A4 B4 C5 E5 D5 C5 B4 .
pat theme_c  = G4 A4 B4 D5 C5 B4 A4 G4

pat chd_a    = G4 . . . E4 . . .
pat chd_b    = F4 . . . D4 . . .

pat walk_a   = C3 . E3 . G3 . E3 .
pat walk_b   = A2 . C3 . E3 . C3 .

pat light_beat = inst perc C3 . inst tick C3 . inst perc C3 . inst tick C3 .
pat kick_beat  = inst tkick C2 . . . inst tkick C2 . . .

; ── Sequences ────────────────────────────────────────────────
seq main_theme = theme_a theme_b theme_a theme_c
seq harmony    = chd_a chd_b chd_a chd_b
seq bass_line  = walk_a walk_b walk_a walk_b
seq drums      = light_beat light_beat light_beat light_beat

; ── Channels ─────────────────────────────────────────────────
channel 1 => inst melody  seq main_theme
channel 2 => inst chord   seq harmony
channel 3 => inst bass    seq bass_line
channel 4 => inst perc    seq drums
channel 5 => inst tkick   seq kick_beat

play
```

---

### 3. Atmospheric Horror — "The Dungeon Below" (sparse, tritone, long noise decay)

Demonstrates: 12.5% duty nasal lead, tritone harmony, slow-decay noise atmospherics, triangle drone, 75 BPM horror feel.

```bax
chip nes
bpm 75

; ── Instruments ──────────────────────────────────────────────
inst eerie  type=pulse1  duty=12  env=10,down  env_period=6
inst drone  type=pulse2  duty=50  vol=7
inst deep   type=triangle
inst atmos  type=noise   noise_mode=normal  noise_period=4   env=12,down  env_period=10
inst clank  type=noise   noise_mode=loop    noise_period=5   vol=6

; ── Patterns ─────────────────────────────────────────────────
; Sparse tritone melody — note: F# is a tritone above C
pat scare_a  = C5 . . . F#5 . . .
pat scare_b  = D5 . . . G#4 . . .
pat scare_c  = . . . . C5 . . .

; Tritone harmony under the lead
pat tri_h_a  = F#4 . . . C5 . . .
pat tri_h_b  = G#3 . . . D4 . . .

; Bass drone — low C stays grounded
pat bass_drn = C2 . . . . . . .

; Atmospheric noise hits — crash on downbeat, silence otherwise
pat noise_a  = inst atmos C3 . . . . . . .
pat noise_b  = . . . inst clank C3 . . . .

; ── Sequences ────────────────────────────────────────────────
seq spook  = scare_a scare_b scare_c scare_a
seq hm     = tri_h_a tri_h_b tri_h_a tri_h_b
seq bass_d = bass_drn bass_drn bass_drn bass_drn
seq amb    = noise_a noise_b noise_a noise_b

; ── Channels ─────────────────────────────────────────────────
channel 1 => inst eerie  seq spook
channel 2 => inst drone  seq hm
channel 3 => inst deep   seq bass_d
channel 4 => inst atmos  seq amb

play
```

---

### 4. DMC Bass Reinforcement Demo — "Late-Era Thunder"

Demonstrates: DMC channel for bass hit reinforcement, full 5-channel NES arrangement, late-era power sound.

```bax
chip nes
bpm 160

; ── Instruments ──────────────────────────────────────────────
inst lead      type=pulse1  duty=25  env=14,down  env_period=1
inst bass_sq   type=pulse2  duty=50  env=11,down  env_period=4
inst tri       type=triangle
inst snare     type=noise   noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat     type=noise   noise_mode=normal  noise_period=3   env=7,down   env_period=0
; Use builtin sample reference — works in browser and CLI
inst bass_hit  type=dmc     dmc_rate=7  dmc_loop=false  dmc_sample="@nes/bass_c2"

; ── Patterns ─────────────────────────────────────────────────
pat riff_a  = E5 G5 A5 . E5 G5 A5 B5
pat riff_b  = D5 F5 G5 . D5 F5 G5 A5
pat bass_a  = A2 . E3 . A2 . D3 .
pat tri_a   = A2 . E2 . A2 . D2 .
pat drums   = inst snare C3 inst hihat C3 inst snare C3 inst hihat C3
            inst snare C3 inst hihat C3 inst snare C3 inst hihat C3
pat dmc_hit = inst bass_hit C3 . . . inst bass_hit C3 . . .

; ── Sequences ────────────────────────────────────────────────
seq lead_seq  = riff_a riff_b riff_a riff_b
seq bass_seq  = bass_a bass_a bass_a bass_a
seq tri_seq   = tri_a tri_a tri_a tri_a
seq drum_seq  = drums drums drums drums
seq dmc_seq   = dmc_hit dmc_hit dmc_hit dmc_hit

; ── Channels ─────────────────────────────────────────────────
channel 1 => inst lead      seq lead_seq
channel 2 => inst bass_sq   seq bass_seq
channel 3 => inst tri       seq tri_seq
channel 4 => inst snare     seq drum_seq
channel 5 => inst bass_hit  seq dmc_seq

play
```

---

## Effects Support

This section documents how BeatBax's existing effect system applies to the NES chip and what additional effects the NES APU enables.

### Effects Available on NES (Carried Over from Game Boy)

All of BeatBax's software effects work on the NES because they operate on the event stream before hardware rendering. The table below lists each effect, its NES behaviour, and export support across NES-native formats.

| Effect | Syntax | NES behaviour | MIDI | JSON | FamiStudio `.fms` | FamiTracker `.ftm` | NSF |
|--------|--------|--------------|------|------|-------------------|-------------------|-----|
| **Arpeggio** | `arp:x,y[,z…]` | Rapid period cycling on pulse or triangle — same as GB | ✅ | ✅ | ✅ `0xy` effect | ✅ `0xy` effect | ✅ via period writes |
| **Vibrato** | `vib:d,r[,shape[,dur[,delay]]]` | Software period LFO on all channels (no hardware support) | ✅ CC1 | ✅ | ✅ speed/depth fields | ✅ `4xy` effect | ✅ via period writes |
| **Tremolo** | `trem:d,r[,shape]` | Software gain LFO via envelope automation | ✅ CC7 | ✅ | ✅ volume envelope | ✅ `7xy` effect | ✅ via volume writes |
| **Portamento** | `port:speed` | Software glide via period interpolation | ✅ CC65 | ✅ | ✅ slide notes | ✅ `3xx` effect | ✅ via period writes |
| **Duty cycle modulation** | `inst` switch | Change pulse duty per note using multiple instruments | ✅ | ✅ | ✅ duty sequence | ✅ duty sequence | ✅ |
| **Volume slide** | `vol_slide:rate` | Envelope ramp via gain automation | ✅ CC11 | ✅ | ✅ | ✅ `Axy` effect | ✅ |
| **Note cut** | `notecut:ticks` | Trigger note-off after N ticks | ✅ | ✅ | ✅ | ✅ `Sxx` effect | ✅ |
| **Retrigger** | `retrig:rate` | Periodic re-trigger of note-on event | ✅ | ✅ | ✅ | ✅ `Exx` effect | ✅ via period writes |
| **Echo** | `echo:delay,decay` | Software delay line on rendered audio | ✅ | ✅ | ❌ no native equivalent | ❌ | ❌ |
| **Pitch bend** | `bend:semitones,rate` | Software period sweep (not hardware sweep) | ✅ | ✅ | ✅ slide notes | ✅ `3xx`/`1xx`/`2xx` | ✅ |

### NES-Specific Effects

The NES APU adds hardware features beyond the Game Boy's capabilities:

#### Hardware Sweep (Pulse 1 and Pulse 2)

Unlike the Game Boy where hardware sweep is only available on Pulse 1, the NES provides hardware sweep on **both** pulse channels. This is the defining effect for NES "laser", "falling bomb", and "rising riser" sounds.

**Instrument-level sweep** (BeatBax syntax):
```bax
inst laser  type=pulse1  duty=50  env=15,flat  sweep_en=true  sweep_period=4  sweep_dir=down  sweep_shift=7
inst riser  type=pulse2  duty=25  env=14,flat  sweep_en=true  sweep_period=7  sweep_dir=up    sweep_shift=3
```

**Inline sweep effect** (per-note override):
```bax
; Hardware sweep as an inline effect on pulse channels
pat lasers = C5<sweep:4,down,7>:8 . E5<sweep:2,down,5>:8 . G5<sweep:4,down,6>:8 .
```

> **Export note:** Instrument-level sweep exports directly to hardware registers in NSF, FamiTracker `Hxx`/`Ixx` effects, and FamiStudio's sweep fields. Inline sweep is approximated as a pitch-bend curve in FamiTracker and FamiStudio.

#### Noise LFSR Mode Switch

Switching between `noise_mode=normal` and `noise_mode=loop` mid-song creates dramatic timbral contrasts — the "metal" loop mode produces a pitched, metallic percussive sound distinct from the white-noise `normal` mode.

```bax
; Mode switch mid-pattern (use multiple instruments)
inst snare  type=noise  noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst metal  type=noise  noise_mode=loop    noise_period=5   vol=10

pat perc_fill = inst snare C3 . . . inst metal C3 inst metal C3 . .
```

#### Triangle Linear Counter

The triangle's `linear` counter provides a hardware-accurate note gate that stops the channel after a fixed duration at 240 Hz. This is used for short, percussive triangle pings (kick reinforcement).

```bax
; Short triangle ping — gate cuts off after 4 × (1/240s) ≈ 16 ms
inst tkick  type=triangle  linear=4

; Longer triangle bass note with controlled decay (not looping)
inst tbass  type=triangle  linear=60   ; ~250 ms before gate cuts
```

### Famous NES Effects — Illustrated Examples

The following patterns demonstrate effects used in iconic NES compositions. These serve as test cases for the NES plugin implementation.

#### 1. Dr. Wily Stage 1 Arpeggio (Mega Man 2 — Manami Matsumae, Takashi Tateishi)
Fast minor arpeggio cycling that creates a dense, aggressive harmonic texture. Pairs a 3-voice chord arpeggio on Pulse 1 with a parallel fifth on Pulse 2.

```bax
chip nes
bpm 160

inst lead   type=pulse1  duty=25   env=14,down  env_period=1
inst harm   type=pulse2  duty=25   env=11,down  env_period=3
inst bass   type=triangle

effect minArp  = arp:3,7   ; minor triad (m3 + P5)
effect majArp  = arp:4,7   ; major triad (M3 + P5)

; Arpeggiated riff — 3-note chord implied from single channel
pat wily_riff = C5<minArp>:4 G5<minArp>:4 Bb4<minArp>:4 F5<minArp>:4
pat wily_harm = C4:8 . G4:8 .
pat wily_bass = C3 . G2 . Bb2 . F2 .

seq main = wily_riff wily_riff wily_harm wily_harm

channel 1 => inst lead  seq main
channel 2 => inst harm  seq main:oct(-1)
channel 3 => inst bass  seq wily_bass

play
```

#### 2. Vampire Killer Sweep (Castlevania — Kinuyo Yamashita)
Hardware sweep with downward pitch on attack for a powerful, punchy bass hit. Classic Castlevania technique for adding "weight" to sustained bass notes.

```bax
chip nes
bpm 160

; Sweep-bass on Pulse 2 — downward sweep on attack note
inst sweep_bass  type=pulse2  duty=50  env=14,down  env_period=2
                 sweep_en=true  sweep_period=3  sweep_dir=down  sweep_shift=3

inst melody      type=pulse1  duty=25  env=13,down  env_period=2
inst tri         type=triangle

pat castlevania_bass = inst sweep_bass C3:8 . G2:8 . F2:8 . G2:8 .

channel 2 => inst sweep_bass  seq castlevania_bass

play
```

#### 3. Zelda Dungeon Vibrato (The Legend of Zelda — Koji Kondo)
Slow vibrato with onset delay on the triangle channel, used as a flute/ocarina melody voice. The `linear` counter provides the note gate; the delayed vibrato creates the authentic "live" feel.

```bax
chip nes
bpm 90

inst tri_flute  type=triangle  linear=96   ; ~400 ms gate

effect flute_vib = vib:3,4,sine,0,2   ; depth=3, rate=4 Hz, sine, 2-row onset delay

pat zelda_dungeon = D5<flute_vib>:8 . F5<flute_vib>:8 . D5<flute_vib>:4 . A4:4 .

channel 3 => inst tri_flute  seq zelda_dungeon

play
```

#### 4. Ninja Gaiden Duty Cycle Modulation (Ninja Gaiden — Keiji Yamagishi)
Thin (12.5%) duty on approach notes, switching to 25% on accented beats. Creates the nasal, urgent melodic style characteristic of Ninja Gaiden's action cues.

```bax
chip nes
bpm 150

inst thin   type=pulse1  duty=12  env=13,down  env_period=2   ; nasal, cutting
inst bright type=pulse1  duty=25  env=14,down  env_period=1   ; punchy, accented

; DCM: alternate duty per phrase for dynamic interest
pat ng_riff_a = inst thin   B4:4 C5:4 D5:4 E5:2 D5:2
pat ng_riff_b = inst bright E5:4 D5:4 C5:4 B4:8 .

seq ng_main = ng_riff_a ng_riff_b ng_riff_a ng_riff_b

channel 1 => inst thin  seq ng_main

play
```

#### 5. Metroid Kraid LFSR Metal Effect (Metroid — Hirokazu Tanaka)
Slow-decay loop-mode LFSR noise combined with a triangle drone. The `noise_mode=loop` produces a pitched, industrial metallic tone; paired with `env_period=12` gives a long fade.

```bax
chip nes
bpm 60

inst drone   type=triangle
inst metal   type=noise  noise_mode=loop    noise_period=5   env=12,down  env_period=12

; Sparse, unsettling industrial soundscape
pat metal_hit  = inst metal C3 . . . . . . .
pat drone_line = C2 . . . . . . .

channel 3 => inst drone  seq drone_line
channel 4 => inst metal  seq metal_hit

play
```

### Effects Export Compatibility Summary

| Export format | arp | vib | trem | sweep | duty modulation | vol slide | noise mode |
|--------------|-----|-----|------|-------|-----------------|-----------|-----------|
| **JSON (ISM)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **MIDI** | ✅ | ✅ CC1 | ✅ CC7 | ✅ pitch bend | ✅ program change | ✅ CC11 | ✅ (map to GM perc) |
| **FamiStudio `.fms`** | ✅ `0xy` | ✅ speed/depth | ✅ vol env | ✅ native fields | ✅ duty sequence | ✅ | ✅ |
| **FamiTracker `.ftm`** | ✅ `0xy` | ✅ `4xy` | ✅ `7xy` | ✅ `Hxx`/`Ixx` | ✅ duty sequence | ✅ `Axy` | ✅ |
| **NSF** | ✅ | ✅ period writes | ✅ envelope | ✅ hardware regs | ✅ | ✅ | ✅ |

> **Echo effect on NES native formats:** The `echo` effect is a software delay line applied to the rendered audio buffer. It has no NES hardware equivalent and cannot be exported to NSF, FamiTracker, or FamiStudio. In those exports, echo is silently dropped with a warning.

---

## Implementation Checklist

### Phase 1 — Plugin Infrastructure (Engine)
- [ ] Define `ChipPlugin` and `ChipChannelBackend` interfaces in `packages/engine/src/chips/types.ts`
- [ ] Create `ChipRegistry` class in `packages/engine/src/chips/registry.ts`
- [ ] Register Game Boy chip as the default built-in plugin
- [ ] Update `BeatBaxEngine` to route `chip` directive through registry
- [ ] Update parser/validator to check chip name against registry at compile time
- [ ] Add friendly error: `Chip 'nes' not available. Install @beatbax/plugin-chip-nes`
- [ ] Support 5-channel allocation in scheduler when NES is active

### Phase 2 — AST and Parser Changes
- [ ] Add NES instrument fields to `InstrumentDef` AST node (all optional, typed)
- [ ] Update Peggy grammar to parse `env_period`, `env_loop`, `sweep_en`, `sweep_period`, `sweep_dir`, `sweep_shift`
- [ ] Update Peggy grammar to parse `noise_mode`, `noise_period`
- [ ] Update Peggy grammar to parse `linear` (triangle linear counter)
- [ ] Update Peggy grammar to parse `dmc_rate`, `dmc_loop`, `dmc_level`, `dmc_sample`
- [ ] Add validation: NES fields only valid with `chip nes`; Game Boy fields only valid with `chip gameboy`
- [ ] Add validation: `channel` index ≤ 5 for NES songs
- [ ] Update AST schema documentation in `docs/formats/ast-schema.md`

### Phase 3 — NES Period Tables
- [ ] Create `packages/plugins/chip-nes/src/periodTables.ts`
- [ ] Populate `PULSE_PERIOD` table (MIDI 36–96, 61 entries) from the hardware formula, verified against Appendix A in `docs/chips/nes.md`
- [ ] Populate `TRIANGLE_PERIOD` table (MIDI 36–96, 61 entries) from the hardware formula
- [ ] Unit test: all period values within ±0.5 cents of A4=440 Hz equal temperament
- [ ] Unit test: `TRIANGLE_PERIOD[n]` ≈ `PULSE_PERIOD[n] / 2` for all n — triangle period is **half** the pulse period for the same MIDI note (÷32 requires half the timer value of ÷16 to produce equal frequency); equivalently `TRIANGLE_PERIOD[n]` ≈ `PULSE_PERIOD[n + 12]` because one octave up on pulse also halves its period value (note: same register number, different pitches — triangle produces note n; pulse at that same value would produce note n+12)

### Phase 4 — Pulse Channel Backend
- [ ] Create `packages/plugins/chip-nes/src/pulse.ts`
- [ ] Implement 4 duty cycle `PeriodicWave` presets (12.5%, 25%, 50%, 75%)
- [ ] Implement volume envelope (`GainNode` automation, envelope period scaling)
- [ ] Implement envelope loop mode (repeating sawtooth LFO on gain)
- [ ] Implement constant volume mode (`vol` field bypasses envelope)
- [ ] Implement hardware sweep: compute target period per step, schedule `OscillatorNode.frequency` automation
- [ ] Implement sweep muting: silence when `period < 8` or `target > 2047`
- [ ] Model Pulse 1 / Pulse 2 sweep negate difference (one's complement vs two's complement)
- [ ] Unit tests for all of the above

### Phase 5 — Triangle Channel Backend
- [ ] Create `packages/plugins/chip-nes/src/triangle.ts`
- [ ] Pre-compute fixed 32-step triangle `PeriodicWave` (odd harmonics, 1/n² amplitudes)
- [ ] Implement linear counter: schedule `GainNode` note-off at `linear × (1/240)` seconds after note-on
- [ ] Implement no-envelope behaviour (gain always 1.0 when on)
- [ ] Add DC-offset pop prevention (1 ms gain ramp to 0 on note-off)
- [ ] Unit tests including linear counter timing precision

### Phase 6 — Noise Channel Backend
- [ ] Create `packages/plugins/chip-nes/src/noise.ts`
- [ ] Pre-generate long-mode noise buffer (32,767 samples from 15-bit LFSR, taps 1,0)
- [ ] Pre-generate loop-mode noise buffer (93 samples from 15-bit LFSR, taps 6,0)
- [ ] Map all 16 `noise_period` indices to correct `AudioBufferSourceNode.playbackRate` values
- [ ] Implement envelope (same model as pulse — `GainNode` automation)
- [ ] Implement envelope loop and constant volume modes
- [ ] Unit tests for LFSR output correctness (reference vector from hardware specs)

### Phase 7 — DMC Channel Backend
- [ ] Create `packages/plugins/chip-nes/src/dmc.ts`
- [ ] Ship minimal built-in sample library (`@nes/kick`, `@nes/snare`, `@nes/bass_c2`, `@nes/hihat`) embedded as base64 in `src/samples/index.ts`
- [ ] Implement `"@nes/<name>"` resolution from the built-in library (works in all environments)
- [ ] Implement `"local:<path>"` resolution for CLI/Node.js using the existing import security guard; throw a descriptive error in browser contexts
- [ ] Implement `"https://..."` resolution via `fetch()` for both browser and Node.js 18+
- [ ] Implement `.dmc` content decoder (1-bit delta encoding → `Float32Array`)
- [ ] Map all 16 `dmc_rate` indices to NTSC sample rates
- [ ] Implement `dmc_loop` using `AudioBufferSourceNode.loop`
- [ ] Implement `dmc_level` as DC offset initialisation
- [ ] Unit tests: bundled library resolution, `local:` browser rejection, URL loading, decoder correctness (reference test vector)

### Phase 8 — Mixer
- [ ] Create `packages/plugins/chip-nes/src/mixer.ts`
- [ ] Implement linear approximation of non-linear NES mixer gain weights
- [ ] Wire all 5 channel outputs through `GainNode` network per mixer weights
- [ ] Unit tests for expected output levels

### Phase 9 — Plugin Entry Point and Package
- [ ] Create `packages/plugins/chip-nes/src/index.ts` (plugin manifest, channel factory)
- [ ] Create `packages/plugins/chip-nes/package.json` (ESM-first, `peerDep: @beatbax/engine ^1.0.0`)
- [ ] Create `packages/plugins/chip-nes/tsconfig.json`
- [ ] Create `packages/plugins/chip-nes/README.md` with quick-start and instrument reference
- [ ] Add to monorepo workspace in root `package.json`
- [ ] Create integration test: register plugin, parse NES song, verify ISM

### Phase 10 — CLI Integration
- [ ] CLI auto-discovers `@beatbax/plugin-chip-nes` if installed (see `plugin-system.md`)
- [ ] `beatbax verify` reports NES-specific validation errors correctly
- [ ] `beatbax --list-chips` shows `nes` when plugin is installed
- [ ] Add NES example songs to `songs/` directory (`wily_fortress.bax`, `kingdom_hall.bax`, `dungeon_below.bax`, `late_era_thunder.bax`)

### Phase 11 — Export Updates
- [ ] Update JSON (ISM) export to include NES-specific instrument fields
- [ ] Update MIDI export: 5 tracks for NES; map channel 5 (DMC) to MIDI channel 10 (percussion)
- [ ] Confirm UGE export gracefully rejects NES songs with a clear error (UGE is Game Boy only)
- [ ] (Post-v1) Implement FamiStudio `.fms` JSON export via `exportToNative()` (first native format — simplest to implement)
- [ ] (Post-v1) Implement FamiTracker `.ftm` binary export via `exportToNative()`
- [ ] (Post-v1) Implement NSF export via `exportToNative()` (requires 6502 player stub)

### Phase 12 — Documentation
- [ ] Create `docs/chips/nes-instrument-reference.md` (quick-start instrument field table)
- [ ] Add NES section to `docs/language/instruments.md`
- [ ] Update `docs/formats/ast-schema.md` with new NES instrument fields
- [ ] Document NES effects support in `docs/language/effects.md` (which effects carry over from Game Boy, which are NES-specific, export support per format)
- [ ] Add NES examples to `TUTORIAL.md`
- [ ] Update `ROADMAP.md` to mark NES plugin as in-progress → complete

---

## Migration Path

The NES plugin introduces no breaking changes to existing Game Boy songs. The migration path is:

1. **Phase 1** — Plugin infrastructure is added to the engine (Game Boy songs are unaffected)
2. **Phase 2** — New AST fields are all optional with `undefined` defaults; Game Boy parser paths are unchanged
3. **Phase 3–9** — NES plugin lives in a separate package; no changes to `@beatbax/engine` public API
4. **Phase 10** — CLI auto-discovery is additive; `beatbax play song.bax` defaults to Game Boy if no plugin installed
5. Game Boy songs continue to work exactly as before throughout all phases

---

## Future Enhancements

- **FamiStudio Export (`.fms`):** JSON-based format for the popular FamiStudio NES composition tool. First recommended native export target due to its clean JSON structure and effect model that aligns well with BeatBax's ISM.
- **FamiTracker Export (`.ftm`):** Binary tracker format for the widely used FamiTracker homebrew tool. Enables round-tripping BeatBax compositions into the standard homebrew NES development toolchain.
- **NSF Export (`.nsf`):** Generate `.nsf` (NES Sound Format) files playable in emulators and on original hardware, requiring a 6502 player stub and APU register write stream. Most complex format — deferred post-FamiStudio/FamiTracker.
- **Famicom Expansion Audio:** Support mapper-specific extra channels (VRC6 adds 2 extra pulse + sawtooth; N163 adds up to 8 wavetable channels). These would be separate sub-plugins or options within the NES plugin.
- **PAL Mode:** Add `nes_region=pal` instrument/song parameter to use PAL clock (1.662607 MHz) and adjust all period tables accordingly.
- **Hardware Verification:** Cross-reference audio output against a cycle-accurate emulator (Mesen, Nintendulator) to confirm period table accuracy and envelope timing.
- **Web UI Integration:** Add NES channel type icons and `noise_period` visual selector to the Web UI instrument editor panel.
- **Software Vibrato:** Implement software vibrato (period register modulation) as a built-in BeatBax effect available on all NES channels, matching the LFO depth/rate parameters of the existing `vib:` effect.

---

## Open Questions

- **Q:** Should the NES plugin ship a pre-built `.dmc` sample library (kick, snare, etc.) or leave sample loading entirely to the user?
  **A:** Yes — ship a minimal bundled library (`@nes/kick`, `@nes/snare`, `@nes/bass_c2`, `@nes/hihat`, `@nes/crash`) embedded as base64 in `src/samples/index.ts`. This makes the plugin immediately useful in browser environments without requiring users to host samples externally. Additional samples can be provided via `local:` (CLI) or `https://` (browser+CLI).

- **Q:** Should NSF export be in v1 of the plugin or strictly post-v1?
  **A:** Post-v1. NSF requires a 6502 player stub and substantially more work than JSON/MIDI export. FamiStudio `.fms` export is the recommended first native format due to its simpler JSON structure.

- **Q:** How should the non-linear mixer be handled in the Web UI preview (which uses WebAudio and has no hardware lookup tables)?
  **A:** Use the linear approximation from `mixer.ts` (§3.6). The perceptual difference is minor and acceptable for a DAW-style preview.

- **Q:** Should `channel 5` (DMC) be mandatory in NES songs or optional?
  **A:** Optional. Songs without a DMC channel are valid NES songs (most early-era titles didn't use DMC musically).

- **Q:** For FamiTracker/FamiStudio export, how should BeatBax effects map to tracker effect columns?
  **A:** TBD during implementation. The primary mappings are: `arp:x,y` → FamiTracker `0xy` effect; `vib:d,r` → FamiTracker `4xy` effect; hardware sweep → FamiTracker `Hxx`/`Ixx` effects; `vol` → FamiTracker volume column. Effects with no direct tracker equivalent (e.g., complex portamento curves) are approximated.

---

## References

- `docs/chips/nes.md` — BeatBax NES hardware reference and composition guide (primary source)
- `docs/features/plugin-system.md` — Plugin architecture specification
- [NESDev Wiki — APU](https://www.nesdev.org/wiki/APU) — Community hardware reference
- [NESDev Wiki — APU Pulse](https://www.nesdev.org/wiki/APU_Pulse)
- [NESDev Wiki — APU Triangle](https://www.nesdev.org/wiki/APU_Triangle)
- [NESDev Wiki — APU Noise](https://www.nesdev.org/wiki/APU_Noise)
- [NESDev Wiki — APU DMC](https://www.nesdev.org/wiki/APU_DMC)
- [NSF Format Specification](https://www.nesdev.org/wiki/NSF) — For future NSF export
- [Ricoh 2A03 Datasheet (reconstructed)](https://www.nesdev.org/2A03%20technical%20reference.txt)
- Mega Man 2 OST (Manami Matsumae, Takashi Tateishi) — Reference composition for action-style NES techniques
- The Legend of Zelda OST (Koji Kondo) — Reference for triangle melody and atmospheric composition
- [FamiStudio Documentation](https://famistudio.org/doc/) — Reference for FamiStudio `.fms` format
- [FamiTracker Documentation](http://famitracker.com/documentation.php) — Reference for FamiTracker `.ftm` format

---

## Additional Notes

- The NES APU has no hardware stereo. BeatBax may optionally offer a software stereo spread as a convenience feature (e.g., `panning` field on channel declarations), but this should be clearly documented as non-authentic NES behaviour.
- The Pulse 1 vs Pulse 2 sweep negate difference (one's complement vs two's complement) is rarely audible in practice. It must be modelled correctly for hardware accuracy but composers need not understand the distinction; `sweep_dir=up|down` abstracts it away.
- When `chip nes` is active and a user references `export uge`, the CLI should emit a clear error: `UGE export is only supported for chip gameboy`.
- The NES plugin is the first validation of the `ChipPlugin` interface in production. Any gaps discovered during implementation should be fed back to `plugin-system.md` and the engine interface definition.
- The `@nes/` bundled sample prefix is reserved for the built-in library shipped with `@beatbax/plugin-chip-nes`. Custom sample sets should use a different prefix (e.g., `@myproject/`) to avoid naming collisions if a sample registration mechanism is added later.
