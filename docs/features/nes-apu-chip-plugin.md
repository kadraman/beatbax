---
title: "NES Ricoh 2A03 APU Chip Plugin"
status: proposed
authors: ["kadraman"]
created: 2026-04-09
issue: "https://github.com/kadraman/beatbax/issues/TBD"
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
- Ships an NTSC period table (`periodTables.ts`) covering C2–C7 for pulse channels and C2–C7 for triangle
- Validates NES-specific instrument fields (duty, sweep, noise mode/period, DMC rate/sample)
- Renders audio using the WebAudio API, faithfully modelling the non-linear mixer, hardware sweep units, and LFSR noise
- (Optional, post-v1) exports to `.nsf` (NES Sound Format) via `exportToNative()`

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
inst bass   type=triangle  vol=15

; short percussive triangle ping (kick reinforcement)
inst tri_kick  type=triangle  linear=4

; ── Noise ───────────────────────────────────────────────────
inst kick   type=noise  noise_mode=normal  noise_period=12  env=15,down  env_period=3
inst snare  type=noise  noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat  type=noise  noise_mode=normal  noise_period=3   env=8,down   env_period=0
inst crash  type=noise  noise_mode=normal  noise_period=3   env=12,down  env_period=8
inst metal  type=noise  noise_mode=loop    noise_period=5   vol=10

; ── DMC ─────────────────────────────────────────────────────
inst bass_hit  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="bass_c2.dmc"
inst kick_dmc  type=dmc  dmc_rate=7  dmc_loop=false  dmc_sample="kick.dmc"
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
| `dmc_sample` | `string` | Path to `.dmc` delta-encoded sample file |

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

Pre-computed NTSC period values for C2–C7 (72 notes). Two tables:

```typescript
// Pulse period: f = 1789773 / (16 × (period + 1))
export const PULSE_PERIOD: Record<number, number> = { /* MIDI 36–96 */ };

// Triangle period: f = 1789773 / (32 × (period + 1))
// Triangle plays one octave lower than pulse at same period
export const TRIANGLE_PERIOD: Record<number, number> = { /* MIDI 36–96 */ };
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
- **No volume envelope:** Triangle has no amplitude control; `GainNode.gain` is always 1.0 when active, 0 when gated off
- **Linear counter:** `linear` field specifies duration in ticks at 240 Hz; schedule note-off via `GainNode.gain.setValueAtTime(0, noteOnTime + linearDuration)`
- **Frequency formula:** Use `TRIANGLE_PERIOD` table (period = 32-step equivalent, plays one octave lower than pulse at same period value)
- **Pop prevention:** Ramp `GainNode.gain` to 0 over 1 ms on note-off to prevent DC offset click

#### 3.4 `noise.ts` — Noise Channel Backend

Implements `ChipChannelBackend` for `type=noise`.

Key behaviours:

- **LFSR simulation:** Implement the 15-bit LFSR using a `ScriptProcessorNode` or `AudioWorkletNode`:
  - `noise_mode=normal`: feedback from bits 1 and 0 → long period (32,767 steps), white noise character
  - `noise_mode=loop`: feedback from bits 6 and 0 → short period (93 or 31 steps), metallic/tonal character
- **Noise period:** `noise_period` indexes into the 16-entry NTSC timer table to set the LFSR clock rate (maps to `BufferSourceNode.playbackRate` scaling if using a pre-generated noise buffer per mode)
- **Volume envelope:** Same envelope model as pulse channels; `GainNode` automation driven by `env_period` and `env_loop`
- **Constant volume mode:** `vol` field sets `GainNode.gain` directly

> **Implementation note:** For performance, pre-generate one long-period buffer and one short-period buffer per noise mode at startup; vary playback rate to approximate the 16 timer periods. This avoids `AudioWorkletNode` overhead for the common case.

#### 3.5 `dmc.ts` — DMC Channel Backend

Implements `ChipChannelBackend` for `type=dmc`.

Key behaviours:

- **Sample decoding:** Read `.dmc` files (1-bit delta-encoded, standard NES format); decode into a `Float32Array` for WebAudio playback
- **Playback rate:** Map `dmc_rate` index to NTSC sample rate (16 values, 4181–33144 Hz); pass as `AudioBufferSourceNode.playbackRate` relative to `audioContext.sampleRate`
- **Loop mode:** `dmc_loop=true` sets `AudioBufferSourceNode.loop = true`
- **Initial level:** `dmc_level` sets a DC offset on `ConstantSourceNode` to initialise the DAC counter simulation
- **Trigger on note-on:** DMC is a sample trigger, not a pitched synthesiser; note pitch is ignored; the sample plays from its start address on each note-on event
- **Security:** Validate `dmc_sample` path against the path-traversal guard documented in `docs/language/import-security.md` before loading

#### 3.6 `mixer.ts` — Non-Linear Mixer

Approximate the NES non-linear mixing formula:

```typescript
// Linear approximation of the NES non-linear mixer
// Pulse channels use pulse lookup table; tri/noise/DMC use tnd table
export function nesMix(p1: number, p2: number, tri: number, noise: number, dmc: number): number {
  const pulse = 0.00752 * (p1 + p2);
  const tnd = 0.00851 * tri + 0.00494 * noise + 0.00335 * dmc;
  return pulse + tnd;
}
```

In WebAudio, model the mixer as a `GainNode` network with channel-specific gain weights. This approximates the non-linear summing without requiring a lookup-table-based custom processor.

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

### Phase 6 — NSF Export (Optional / Post-v1)

The NES Sound Format (`.nsf`) is a standard way to play NES music in emulators and on original hardware. NSF export requires:

- 6502 assembly player stub (init/play routines at fixed ROM locations)
- APU register write stream generated from the ISM event list
- NSF header: magic bytes `NESM\x1a`, version, total songs, starting song, load/init/play addresses, title, artist, copyright, speed, bankswitch info

This is significantly more complex than binary ISM export and is deferred to a post-v1 phase. The `exportToNative()` slot in the `ChipPlugin` interface reserves the extension point.

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `pulse.test.ts` | Duty cycle waveform generation, envelope automation curves, sweep muting conditions (period < 8, target > 2047), sweep negate difference between Pulse 1 and Pulse 2 |
| `triangle.test.ts` | Fixed 32-step waveform correctness, linear counter scheduling, no-envelope behaviour, frequency formula vs pulse formula |
| `noise.test.ts` | LFSR output for both modes, all 16 period values map to expected rates, envelope loop behaviour |
| `dmc.test.ts` | `.dmc` file decoding (test vector with known decoded output), all 16 rate indices, loop flag, security rejection of path-traversal sample paths |
| `mixer.test.ts` | Linear approximation matches expected output levels for known input combinations; pulse channels weighted higher than triangle/noise/DMC |
| `periodTables.test.ts` | All 72 MIDI notes in PULSE_PERIOD and TRIANGLE_PERIOD are within ±0.5 cents of equal-temperament A4=440 Hz |
| `nes-plugin.test.ts` | Full plugin registration via `ChipRegistry`; `chip nes` directive resolves to NES plugin; all 5 channels created without error; mock `AudioContext` used for headless test |

### Integration Tests

- Parse and expand a full NES `.bax` song (see Example Songs below) through to ISM without errors
- Verify that all 5 channels are populated in the ISM for a song using all channel types
- Verify that a song with `channel 6` produces a validation error (NES has only 5 channels)
- Export the ISM to JSON and confirm all NES-specific instrument fields are round-tripped correctly
- Export to MIDI: confirm 5 tracks produced, channels mapped in order, DMC channel represented as MIDI channel 10 (percussion)
- CLI: `verify` command exits 0 for valid NES songs and non-zero for invalid ones

### Hardware Accuracy Tests

- NTSC period table values match the reference table in `docs/chips/nes.md` Appendix A exactly (bit-for-bit)
- Pulse frequency for A4 (MIDI 69, period 294) = 440.0 ± 0.5 Hz
- Triangle frequency for A4 (MIDI 69, period 588) = 220.0 ± 0.5 Hz (one octave lower than pulse at same period)
- Sweep muting: `period=7` silences pulse channel (period < 8 rule)
- Sweep muting: target period > 2047 silences pulse channel

---

## Example Songs

### 1. Action Platformer — "Wily's Fortress" (fast arpeggios, driving bass)

Demonstrates: pulse arpeggios, triangle kick-reinforcement, noise drum kit, 150 BPM action feel.

```bax
chip nes
bpm 150
time 4

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

export json  "wily_fortress.json"
export midi  "wily_fortress.mid"
```

---

### 2. RPG Adventure — "The Kingdom's Hall" (smooth melody, vibrato, sustained harmony)

Demonstrates: 50% duty harmony, triangle bass with kick reinforcement, gentle noise hi-hat, 110 BPM RPG feel.

```bax
chip nes
bpm 110
time 4

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

export json "kingdom_hall.json"
export midi "kingdom_hall.mid"
```

---

### 3. Atmospheric Horror — "The Dungeon Below" (sparse, tritone, long noise decay)

Demonstrates: 12.5% duty nasal lead, tritone harmony, slow-decay noise atmospherics, triangle drone, 75 BPM horror feel.

```bax
chip nes
bpm 75
time 4

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

export json "dungeon_below.json"
export midi "dungeon_below.mid"
```

---

### 4. DMC Bass Reinforcement Demo — "Late-Era Thunder"

Demonstrates: DMC channel for bass hit reinforcement, full 5-channel NES arrangement, late-era power sound.

```bax
chip nes
bpm 160
time 4

; ── Instruments ──────────────────────────────────────────────
inst lead      type=pulse1  duty=25  env=14,down  env_period=1
inst bass_sq   type=pulse2  duty=50  env=11,down  env_period=4
inst tri       type=triangle
inst snare     type=noise   noise_mode=normal  noise_period=6   env=14,down  env_period=1
inst hihat     type=noise   noise_mode=normal  noise_period=3   env=7,down   env_period=0
inst bass_hit  type=dmc     dmc_rate=7  dmc_loop=false  dmc_sample="bass_c2.dmc"

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

export json  "late_era_thunder.json"
export midi  "late_era_thunder.mid"
```

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
- [ ] Populate `PULSE_PERIOD` table (MIDI 36–96) from Appendix A in `docs/chips/nes.md`
- [ ] Populate `TRIANGLE_PERIOD` table (MIDI 36–96) from Appendix A in `docs/chips/nes.md`
- [ ] Unit test: all period values within ±0.5 cents of A4=440 Hz equal temperament
- [ ] Unit test: triangle period = 2 × pulse period at same MIDI note (one-octave offset)

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
- [ ] Implement `.dmc` file decoder (1-bit delta encoding → `Float32Array`)
- [ ] Map all 16 `dmc_rate` indices to NTSC sample rates
- [ ] Implement `dmc_loop` using `AudioBufferSourceNode.loop`
- [ ] Implement `dmc_level` as DC offset initialisation
- [ ] Validate `dmc_sample` path against import security guard (`docs/language/import-security.md`)
- [ ] Unit tests including path-traversal rejection test vector

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
- [ ] (Post-v1) Implement NSF export via `exportToNative()` method on plugin

### Phase 12 — Documentation
- [ ] Create `docs/chips/nes-instrument-reference.md` (quick-start instrument field table)
- [ ] Add NES section to `docs/language/instruments.md`
- [ ] Update `docs/formats/ast-schema.md` with new NES instrument fields
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

- **NSF Export:** Generate `.nsf` (NES Sound Format) files playable in emulators and on hardware, requiring a 6502 player stub and APU register write stream
- **Famicom Expansion Audio:** Support mapper-specific extra channels (VRC6 adds 2 extra pulse + sawtooth; N163 adds up to 8 wavetable channels). These would be separate sub-plugins or options within the NES plugin
- **PAL Mode:** Add `nes_region=pal` instrument/song parameter to use PAL clock (1.662607 MHz) and adjust all period tables accordingly
- **Hardware Verification:** Cross-reference audio output against a cycle-accurate emulator (Mesen, Nintendulator) to confirm period table accuracy and envelope timing
- **Web UI Integration:** Add NES channel type icons and `noise_period` visual selector to the Web UI instrument editor panel
- **Vibrato LFO:** Implement software vibrato (period register modulation) as a built-in transform or instrument parameter

---

## Open Questions

- **Q:** Should the NES plugin ship a pre-built `.dmc` sample library (kick, snare, etc.) or leave sample loading entirely to the user?  
  **A:** TBD. A minimal bundled sample set (< 2 KB) would lower the barrier for new users; security review needed.

- **Q:** Should NSF export be in v1 of the plugin or strictly post-v1?  
  **A:** Post-v1. NSF requires a 6502 player stub and substantially more work than JSON/MIDI export.

- **Q:** How should the non-linear mixer be handled in the Web UI preview (which uses WebAudio and has no hardware lookup tables)?  
  **A:** Use the linear approximation from `mixer.ts` (§3.6). The perceptual difference is minor and acceptable for a DAW-style preview.

- **Q:** Should `channel 5` (DMC) be mandatory in NES songs or optional?  
  **A:** Optional. Songs without a DMC channel are valid NES songs (most early-era titles didn't use DMC musically).

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

---

## Additional Notes

- The NES APU has no hardware stereo. BeatBax may optionally offer a software stereo spread as a convenience feature (e.g., `panning` field on channel declarations), but this should be clearly documented as non-authentic NES behaviour.
- The Pulse 1 vs Pulse 2 sweep negate difference (one's complement vs two's complement) is rarely audible in practice. It must be modelled correctly for hardware accuracy but composers need not understand the distinction; `sweep_dir=up|down` abstracts it away.
- When `chip nes` is active and a user references `export uge`, the CLI should emit a clear error: `UGE export is only supported for chip gameboy`.
- The NES plugin is the first validation of the `ChipPlugin` interface in production. Any gaps discovered during implementation should be fed back to `plugin-system.md` and the engine interface definition.
