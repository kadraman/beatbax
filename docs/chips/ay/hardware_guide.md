# AY-3-8910 / YM2149 PSG - Hardware Guide

The AY-3-8910 (General Instrument) and its near-identical sibling the YM2149 (Yamaha) are 3-channel Programmable Sound Generators that powered some of the most beloved home computers and arcade hardware of the late 1970s and 1980s. Their shared register model, envelope hardware, and noise mixer make them one of the most consistent PSG families in chiptune history.

This guide covers the AY-3-8910 / YM2149 in practical technical detail for composers, emulator authors, and BeatBax implementers.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [Tone Channels (A, B, C)](#2-tone-channels-a-b-c)
3. [Noise Generator](#3-noise-generator)
4. [Hardware Envelope Generator](#4-hardware-envelope-generator)
5. [Mixer Register](#5-mixer-register)
6. [Volume Control](#6-volume-control)
7. [Timing and Clocks](#7-timing-and-clocks)
8. [Stereo and I/O Ports](#8-stereo-and-io-ports)
9. [Chip Variants and Platform Differences](#9-chip-variants-and-platform-differences)

---

## 1. Hardware Architecture

The AY-3-8910 / YM2149 exposes 16 registers (R0–R15) controlling three tone oscillators, a shared noise generator, a shared hardware envelope generator, and a mixer that routes noise and tone signals to each channel independently.

```
Tone A  ---\
Tone B  ----> Mixer (tone enable + noise enable per channel) --> Volume (env or fixed) --> DAC
Tone C  ---/
Noise   ----/
Envelope gen (shared, one at a time)
```

Global characteristics:

| Constraint | Value |
|-----------|-------|
| Tone channels | 3 (A, B, C) — 12-bit period dividers |
| Noise channel | 1 shared LFSR (5-bit period divider) |
| Envelope generator | 1 shared (16-bit period, 8 shape patterns) |
| Volume per channel | 4-bit (0–15 fixed) or envelope-driven |
| Mixer control | Per-channel tone enable + noise enable (independent) |
| I/O ports | 2 (IOA, IOB — general purpose, platform-specific use) |
| Stereo | Not native; platform-specific via output routing (ABC, ACB, mono) |

The AY-3-8910 and YM2149 are register-compatible. Differences are primarily electrical (voltage levels, clock divider factor of 2 on the YM2149 internally — effectively the YM2149 needs double the input clock to match AY pitch).

---

## 2. Tone Channels (A, B, C)

### 2.1 Register Map

Each tone channel uses two 8-bit registers to encode a 12-bit period divider:

| Register | Contents |
|---------|---------|
| R0 (A fine) | Low 8 bits of channel A period |
| R1 (A coarse) | High 4 bits of channel A period |
| R2 (B fine) | Low 8 bits of channel B period |
| R3 (B coarse) | High 4 bits of channel B period |
| R4 (C fine) | Low 8 bits of channel C period |
| R5 (C coarse) | High 4 bits of channel C period |

### 2.2 Tone Waveform

All three tone channels output a fixed 50% duty square wave. There is no hardware duty-cycle control.

Unlike the SN76489's 10-bit timer, the AY uses a 12-bit divider, giving it a wider frequency range and finer low-frequency resolution.

### 2.3 Frequency Formula

$$
f_{tone} = \frac{f_{clock}}{16 \times N}
$$

Where:
- $f_{clock}$ is the chip input clock (see platform table below)
- $N$ is the 12-bit period value (1–4095); $N=0$ behaves as $N=1$ on most implementations

Note: the YM2149 internally divides its input clock by 2 before the tone dividers, so the effective formula matches the AY if the input clock is doubled. Platform clock tables below list the **effective** frequency driving the tone dividers.

### 2.4 Frequency Range

With an effective 1 MHz clock and 12-bit divider:

| Period N | Frequency |
|----------|-----------|
| 1 | 62,500 Hz (above hearing) |
| ~28 | ~2,232 Hz (≈ C7) |
| ~3,822 | ~16 Hz (below hearing threshold) |

Practical musical range spans roughly C1–C8 at typical platform clock rates, giving the AY a significantly wider bass range than the SN76489.

---

## 3. Noise Generator

### 3.1 Register

| Register | Contents |
|---------|---------|
| R6 (Noise period) | Low 5 bits — noise period divider (0–31) |

### 3.2 Noise Character

The AY noise generator uses a 17-bit LFSR producing pseudo-random noise. The period register controls the noise clock rate: lower values give higher-pitched, brighter noise; higher values give lower, more bass-like rumble.

Unlike the SN76489, the AY noise generator is **shared** — all three channels can mix the same noise signal simultaneously (controlled by the mixer register). This is both a limitation (one noise colour at a time) and a compositional tool (noise can appear across multiple channels simultaneously for richer texture effects).

### 3.3 Noise as Percussion

Noise-based percussion on the AY is shaped by:
- Noise period (timbre/colour)
- Mixer enable/disable timing (gate the noise per channel)
- Volume register or envelope for decay shape
- The hardware envelope generator for fast transients

---

## 4. Hardware Envelope Generator

The hardware envelope generator is one of the AY's most distinctive features and separates it from the SN76489.

### 4.1 Registers

| Register | Contents |
|---------|---------|
| R11 (Env fine) | Low 8 bits of envelope period |
| R12 (Env coarse) | High 8 bits of envelope period |
| R13 (Env shape) | Envelope shape selector (0–15) |

### 4.2 Envelope Shapes

R13 selects from 8 distinct hardware envelope shapes (the lower 4 patterns alias to the first four):

| Shape value | Pattern | Description |
|-------------|---------|-------------|
| 0–3 | `\___` | Single downward ramp then silence |
| 4–7 | `/___` | Wait, then single upward ramp, then silence |
| 8 | `\\\\` | Continuously repeating downward sawtooth |
| 9 | `\___` | Single decay |
| 10 | `\/\/` | Triangle wave (down-up-down-up…) |
| 11 | `\‾‾‾` | Decay to floor, then hold at max |
| 12 | `////` | Continuously repeating upward sawtooth |
| 13 | `/‾‾‾` | Single ramp up, hold at max |
| 14 | `/\/\` | Triangle wave (up-down-up-down…) |
| 15 | `/___` | Single ramp up then silence |

### 4.3 Using the Envelope

A channel uses the hardware envelope instead of its fixed 4-bit volume when bit 4 of its volume register (R8, R9, or R10) is set:

```
R8 = 0b00010000  → Channel A uses envelope generator
R8 = 0b00001010  → Channel A uses fixed volume = 10
```

Only **one** envelope generator exists. If multiple channels use envelope mode, they all follow the same envelope period and shape — though this is sometimes exploited compositionally.

### 4.4 Envelope Period and Pitch Relationship

The envelope period is on the same clock as the tone dividers. This means fast envelopes (short periods) can create timbres resembling FM-like buzzing. At very short periods the envelope frequency can enter audible range, creating the distinctive "buzzy" AY bass sound beloved in ZX Spectrum and Atari ST music.

---

## 5. Mixer Register

### 5.1 Register

| Register | Contents |
|---------|---------|
| R7 (Mixer) | Enable bits for tone and noise per channel, plus I/O port direction |

### 5.2 Bit Layout

```
Bit:  7    6    5    4    3    2    1    0
     IOB  IOA  ~NC  ~NB  ~NA  ~TC  ~TB  ~TA
```

Where `~` means **active-low**: a `0` enables the signal, a `1` disables it.

- `~TA`, `~TB`, `~TC`: tone enable for channels A, B, C
- `~NA`, `~NB`, `~NC`: noise enable for channels A, B, C
- `IOA`, `IOB`: I/O port directions (0 = input, 1 = output)

A channel can have:
- Tone only
- Noise only
- Tone + Noise mixed (both enabled simultaneously — adds a gritty texture)
- Neither (silence, regardless of volume register)

---

## 6. Volume Control

### 6.1 Registers

| Register | Contents |
|---------|---------|
| R8 (Vol A) | Bits 0–3: fixed level (0–15); bit 4: envelope mode |
| R9 (Vol B) | Same for channel B |
| R10 (Vol C) | Same for channel C |

### 6.2 Fixed Volume

4-bit value 0–15. Unlike the SN76489's attenuation model (0 = loudest, 15 = mute), the AY uses a **direct level** model: 0 = silent, 15 = loudest.

This is a critical difference from SN76489 — **higher numbers are louder** on the AY.

### 6.3 Approximate Level Response

The AY volume response approximates a logarithmic scale (each step ≈ 3 dB):

| Level | Relative loudness |
|-------|------------------|
| 0 | Silent |
| 4 | ~−33 dB (very soft) |
| 8 | ~−21 dB (background) |
| 12 | ~−9 dB (loud) |
| 15 | 0 dB (maximum) |

---

## 7. Timing and Clocks

The AY/YM clock varies by platform. The tone, noise, and envelope dividers all run from the same input clock.

### 7.1 Common Platform Clocks

| Platform | Chip | Effective clock | Notes |
|---------|------|----------------|-------|
| ZX Spectrum 48K/128K | AY-3-8910 | 1,773,400 Hz | 3.546800 MHz ÷ 2 |
| Atari ST | YM2149 | 2,000,000 Hz | 8 MHz ÷ 4 (YM2149 internal ÷2) |
| Amstrad CPC | AY-3-8912 | 1,000,000 Hz | 4 MHz ÷ 4 |
| MSX (most) | AY-3-8910 / YM2149 | 1,789,772 Hz | 3.579545 MHz ÷ 2 |
| Oric | AY-3-8912 | 1,000,000 Hz | 1 MHz |
| Vectrex | AY-3-8912 | 1,500,000 Hz | 6 MHz ÷ 4 |
| Intellivision | AY-3-8914 | 894,886 Hz | NTSC-derived |
| Arcade (various) | AY-3-8910 | 1,500,000–2,000,000 Hz | Varies per board |

Pitch and envelope speed will vary between platforms at equal register values. Songs tuned on one platform need clock-corrected period tables to sound correct on another.

### 7.2 Note on YM2149 Clock Factor

The YM2149 contains an internal clock divider of 2. A YM2149 driven at 4 MHz effectively processes tones at 2 MHz. The formulas in this guide use the **effective** post-divider frequency to keep period calculations consistent across chip variants.

---

## 8. Stereo and I/O Ports

### 8.1 Native Output

The AY-3-8910 / YM2149 produces three separate analog output channels (channel A, B, C). The chip itself has no stereo routing register — stereo is a platform/circuit decision.

### 8.2 Platform Stereo Configurations

| Config name | Routing | Platforms |
|-------------|---------|----------|
| ABC | A=left, B=centre, C=right | ZX Spectrum 128K default |
| ACB | A=left, C=centre, B=right | Alternative Spectrum wiring |
| Mono | A+B+C mixed to one output | Amstrad CPC, Atari ST (mono mode) |
| Hard stereo | A=left, C=right, B=both | Common in Atari ST tracker convention |

On platforms with two AY chips (e.g., Atari ST in YM2149 stereo mode), each chip feeds one output channel for true left/right separation with 6 voices total.

### 8.3 I/O Ports

The AY-3-8910 has two 8-bit bidirectional I/O ports (IOA and IOB). These are used for keyboard scanning, joystick reading, and other platform-specific I/O — not audio. The AY-3-8912 omits IOB; the AY-3-8914 is a pin-compatible variant used in the Intellivision.

---

## 9. Chip Variants and Platform Differences

| Chip | Differences from AY-3-8910 |
|------|--------------------------|
| YM2149 (Yamaha) | Electrically different (lower voltage, higher clock ÷2); register-compatible |
| AY-3-8912 | Missing IOB port; otherwise identical |
| AY-3-8914 (Intellivision) | Volume register layout differs (upper/lower nibble swapped); envelope behaviour differs slightly |
| YM3439 | CMOS version of YM2149; same register model |
| AY-3-8913 | Surface-mount version of AY-3-8912 |

For BeatBax purposes, the AY-3-8910 and YM2149 are treated as a single target with a clock-rate parameter. The AY-3-8914 Intellivision variant is out of scope for v1.

---

## Why This Chip Still Matters

The AY-3-8910 / YM2149 is one of the most widely emulated and loved PSGs in history. Its combination of three independent tone channels, a shared noise generator, a hardware envelope unit, and flexible mixer routing gives it a richer palette than the SN76489 while remaining approachable for both composers and implementers.

Its sound defined an era across multiple continents simultaneously — the ZX Spectrum in the UK, the Atari ST in Europe, the MSX in Japan and beyond — making it a genuinely global chiptune language.
