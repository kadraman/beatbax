# Sega Master System / Game Gear PSG - Hardware Guide

The Sega Master System (SMS) and Sega Game Gear both use a Texas Instruments SN76489-compatible Programmable Sound Generator (PSG) for core music and sound effects. The chip is simple, fast, and highly deterministic: three tone channels, one noise channel, and direct register writes with no hidden voice allocation.

This guide covers the SMS/Game Gear PSG in practical technical detail for composers, emulator authors, and BeatBax implementers.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [Tone Channels (CH1-CH3)](#2-tone-channels-ch1-ch3)
3. [Noise Channel (CH4)](#3-noise-channel-ch4)
4. [Volume and Mixing](#4-volume-and-mixing)
5. [Timing and Clocks](#5-timing-and-clocks)
6. [Game Gear Stereo Support](#6-game-gear-stereo-support)
7. [Optional FM Expansion on Some SMS Models](#7-optional-fm-expansion-on-some-sms-models)

---

## 1. Hardware Architecture

The SMS/Game Gear PSG is SN76489-compatible and exposed through write-only I/O. Audio is generated from four channels:

1. Tone 1 (square wave)
2. Tone 2 (square wave)
3. Tone 3 (square wave)
4. Noise (LFSR-based)

```
Tone 1  ---\
Tone 2  ----> PSG mixer ---> (SMS mono out) / (Game Gear stereo router) ---> DAC/amp
Tone 3  ---/
Noise   ---
```

Global characteristics:

| Constraint | Value |
|-----------|-------|
| Core channels | 4 |
| Tonal channels | 3 fixed-duty square waves |
| Noise channels | 1 LFSR channel |
| Envelope hardware | None (software-driven only) |
| Tone period width | 10 bits |
| Per-channel volume | 4-bit attenuation (16 steps, 15 = mute) |
| Master output on SMS | Mono |
| Game Gear extension | Per-channel L/R stereo routing |

Unlike chips with frame-sequencer envelope and sweep units, this PSG performs exactly what software writes. That makes it straightforward to emulate and predictable to compose for, but pushes articulation work (envelopes, vibrato, slides, pseudo-macros) into the music driver.

---

## 2. Tone Channels (CH1-CH3)

### 2.1 Register Model

The PSG exposes latched/data writes. A latch byte selects the target register and writes low bits; a follow-up data byte writes high bits (for tone periods) or updates the same register.

Core register groups:

- Tone 1 period (10-bit)
- Tone 2 period (10-bit)
- Tone 3 period (10-bit)
- Noise control
- Volume for Tone 1
- Volume for Tone 2
- Volume for Tone 3
- Volume for Noise

Because the interface is write-only, software typically mirrors the full PSG register state in RAM before writing changes.

### 2.2 Tone Waveform

All three tone channels output a fixed 50% duty square wave. There is no hardware duty-cycle modulation.

Practical consequence:

- Timbre differences come mainly from pitch, volume programming style, and channel layering.
- Instrument identity is created in software (volume macros, pitch macros, rapid retriggering), not by changing oscillator shape.

### 2.3 Frequency Formula

Tone frequency is controlled by a 10-bit divider N:

$$
f_{tone} = \frac{f_{clock}}{32 \times N}
$$

Where:

- $f_{clock}$ is the PSG input clock
- $N$ is usually treated as 1..1023 (N=0 is treated as a special case by implementations; many emulators map it to 1 to avoid divide-by-zero behavior)

Typical clocks:

| Region | Typical PSG clock |
|--------|--------------------|
| NTSC systems | 3.579545 MHz |
| PAL systems | 3.546895 MHz |

At a fixed divider, PAL and NTSC will differ slightly in pitch and tempo if a song is driven by frame-based timing.

### 2.4 Musical Range Notes

With a 10-bit divider, very low bass is limited compared with chips that have wider timers or dedicated low-frequency channels. Classic SMS/Game Gear arrangements often use:

- Octave reinforcement
- Fast note alternation for implied bass motion
- Noise-layered kick transients to increase low-end perception

---

## 3. Noise Channel (CH4)

The noise channel uses an LFSR and a compact control register to select mode and rate.

### 3.1 Modes

| Mode | Character | Typical use |
|------|-----------|-------------|
| Periodic noise | Tonal/buzzy repeating texture | Metallic percussion, special effects |
| White noise | Broadband hiss-like texture | Snares, hats, crashes, wind-like effects |

### 3.2 Rate Selection

Noise rate select typically provides four options:

| Rate Select | Effective source |
|-------------|------------------|
| `0` | PSG clock / 512 |
| `1` | PSG clock / 1024 |
| `2` | PSG clock / 2048 |
| `3` | Tone 3-derived clock |

The tone-3-derived option is musically important: by tying noise pitch behavior to Tone 3, composers can create tuned-noise percussion and hybrid drum timbres.

### 3.3 Noise as Percussion

Without PCM drums in the base PSG path, percussion is synthesized from:

- Noise mode selection
- Noise rate selection
- Fast software volume stepping
- Retrigger rhythm

This is the source of the classic SMS drum identity: crisp hats, bright snare bursts, and buzzy low-frequency thumps.

---

## 4. Volume and Mixing

Each channel has a 4-bit attenuation register:

- `0` = loudest
- `15` = mute

The response is attenuation-style (approximately logarithmic in perceived loudness), not linear gain.

Approximate attenuation intuition:

| Attenuation step | Relative level trend |
|------------------|----------------------|
| 0-3 | Loud and forward |
| 4-7 | Medium body |
| 8-11 | Background/support |
| 12-14 | Very soft |
| 15 | Silent |

Because all channels are digitally mixed from limited waveforms, arranging space between channels is critical. If all three tone channels sit in the same octave at high volume, masking is immediate.

---

## 5. Timing and Clocks

The PSG itself does not provide a tracker-like tempo engine. Timing is entirely host-driven.

Practical timing facts:

- Register writes take effect immediately at the chip level.
- Musical rows/ticks are driver abstractions.
- Vibrato, tremolo-like effects, and software envelopes are implemented by periodic writes from the music engine.

System timing differences matter:

- NTSC VBlank is approximately 59.92 Hz.
- PAL VBlank is approximately 49.70 Hz.
- A music engine tied directly to VBlank must compensate to keep songs in tune and in time across regions.

---

## 6. Game Gear Stereo Support

The Game Gear adds a stereo routing register (commonly referenced at I/O port `0x06`) that controls whether each PSG channel is sent to left, right, or both outputs.

Bit layout (common convention):

- Bits 0-3: right enable for Tone1, Tone2, Tone3, Noise
- Bits 4-7: left enable for Tone1, Tone2, Tone3, Noise

Routing options per channel:

- Left only
- Right only
- Center (both)
- Muted (neither)

This is not continuous panning; it is per-side on/off routing, conceptually similar to terminal routing on other classic chips.

Compatibility note:

- Master System output is mono in typical usage.
- Game Gear stereo intent should degrade deterministically to mono for SMS-style playback/export.

---

## 7. Optional FM Expansion on Some SMS Models

Some Sega Mark III / Japanese Master System configurations support a YM2413 FM unit in addition to the PSG. That FM path is optional hardware and not universal across regions or models.

For a portable baseline, most cross-platform tooling treats SMS/Game Gear PSG as the core guaranteed target and treats FM as a separate optional backend.

---

## Why This Chip Still Matters

The SMS/Game Gear PSG is one of the clearest examples of composition-through-constraints:

- Minimal channel count
- No hardware envelopes
- No filter/fx chain
- Immediate, deterministic control

Its limitations encourage clean melody writing, strong rhythm design, and disciplined arrangement. Those same skills transfer directly to modern chip-inspired production.
