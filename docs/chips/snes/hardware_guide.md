# SNES SPC700 / S-DSP — Hardware Reference Guide

The Super Nintendo Entertainment System (1990, Japan 1990 as Super Famicom) uses a dedicated sound subsystem built around the Sony SPC700 8-bit CPU and the S-DSP (often called the S-SMP DSP). With eight simultaneous BRR sample voices, hardware ADSR envelopes, per-voice stereo volume, Gaussian-interpolated playback, and a built-in echo buffer, the S-DSP offered composers a dramatic leap beyond 8-bit PSG chips — yet remains tightly constrained by 64 KB of audio RAM and a fixed 32 kHz output rate.

This guide covers the SPC700 / S-DSP subsystem in precise technical detail for composers, emulator authors, and BeatBax implementers.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [S-DSP Voice Model](#2-s-dsp-voice-model)
3. [BRR Sample Format](#3-brr-sample-format)
4. [ADSR Envelope](#4-adsr-envelope)
5. [Per-Voice Volume and Stereo](#5-per-voice-volume-and-stereo)
6. [Global Echo](#6-global-echo)
7. [Noise Generator](#7-noise-generator)
8. [Timing and Clocks](#8-timing-and-clocks)
9. [BeatBax Targeting Notes](#9-beatbax-targeting-notes)
10. [Appendix A — BRR Block Layout](#10-appendix-a--brr-block-layout)
11. [Appendix B — ADSR Rate Tables](#11-appendix-b--adsr-rate-tables)

---

## 1. Hardware Architecture

The SNES sound subsystem is a semi-autonomous coprocessor on the main board. The main 65C816 CPU uploads data and programs to the SPC700 via four I/O registers at `$2140`–`$2143`. The SPC700 runs its own 64 KB address space (including 64 KB of audio RAM — ARAM) and programs the S-DSP registers to produce audio.

```
Main CPU (65C816)  ──I/O ports──►  SPC700 (8-bit, 1.024 MHz)
                                        │
                                        ▼
                                   S-DSP (8 voices)
                                        │
                                        ▼
                              Echo buffer (in ARAM)
                                        │
                                        ▼
                              Stereo DAC (32 kHz)
```

**Global constraints:**

| Constraint | Value |
|-----------|-------|
| Voices | 8 simultaneous |
| Audio RAM (ARAM) | 64 KB (shared by samples, echo buffer, SPC700 program) |
| Output sample rate | 32,000 Hz (fixed) |
| Output channels | Stereo (L/R) |
| Sample format | BRR (Bit Rate Reduction) — ~9:1 compression |
| Envelope | Hardware ADSR per voice (4 nibbles, 0–15 each) |
| Interpolation | Gaussian (512-entry table) |
| Echo | Global FIR-filtered delay buffer in ARAM |
| CPU | SPC700 (Sony variant of 65C816, 8-bit data bus) |

The SPC700 is responsible for uploading samples to ARAM, writing S-DSP registers each sample period, and managing the echo buffer. In real SNES games, the SPC700 runs a music driver program (often written in 6502-family assembly). BeatBax v1 drives the S-DSP directly without requiring composers to author SPC700 programs.

---

## 2. S-DSP Voice Model

Each of the 8 voices is an independent BRR sample playback channel. Voices are numbered 0–7 in hardware; BeatBax maps them to channels 1–8.

### 2.1 Voice Registers

Each voice has a set of S-DSP registers (addresses `$x0`–`$x8` per voice, where x = voice number × $10):

| Register | Name | Function |
|----------|------|----------|
| `$x0` | VOL(L) | Left channel volume (0–127) |
| `$x1` | VOL(R) | Right channel volume (0–127) |
| `$x2` | PITCH(L) | Pitch low byte |
| `$x3` | PITCH(H) | Pitch high nibble (4 bits) + source number |
| `$x4` | SRCN | Sample source number (0–255, index into sample directory) |
| `$x5` | ADSR(0) | Attack rate (high nibble) + decay rate (low nibble) |
| `$x6` | ADSR(1) | Sustain level (high nibble) + release rate (low nibble) |
| `$x7` | GAIN | Direct gain mode (alternative to ADSR; not used in BeatBax v1) |
| `$x8` | ENVX | Current envelope level (read-only output) |

### 2.2 Key On / Key Off

Voice activation is controlled by the KON (Key ON) and KOFF (Key OFF) registers:

- **KON** (`$4C`): Writing a bit mask triggers key-on for the corresponding voices. Key-on resets the envelope to attack, resets pitch fraction, and begins BRR sample playback from the sample's start address.
- **KOFF** (`$5C`): Writing a bit mask triggers key-off for the corresponding voices. Key-off transitions the envelope from sustain to release.

### 2.3 Pitch

Pitch is a 14-bit value written across PITCH(L) and PITCH(H):

$$f_{voice} = \frac{P \times f_{sample}}{4096}$$

Where:
- $P$ = 14-bit pitch value (0–16383)
- $f_{sample}$ = BRR sample base sample rate (typically 32000 Hz for samples recorded at native rate)
- Output frequency $f_{voice}$ is the playback rate in Hz

A pitch value of 4096 ($1000 hex) plays the sample at its original recorded rate. Higher values increase pitch; lower values decrease it.

### 2.4 Source Number and Sample Directory

The SRCN register (0–255) indexes into a sample directory table in ARAM. Each directory entry is a 4-byte pointer (16-bit start address + 16-bit loop address) to a BRR sample block in ARAM. BeatBax manages this directory automatically when resolving `brr_sample` references.

---

## 3. BRR Sample Format

BRR (Bit Rate Reduction) is the native sample format of the S-DSP. It compresses 16-bit PCM to approximately 9 bits per sample using differential encoding and adaptive filtering.

### 3.1 Block Structure

BRR data is organised in 9-byte blocks, each containing 16 decoded samples:

| Byte | Content |
|------|---------|
| 0 | Header: filter mode (bits 2–3) + loop/end flags (bits 0–1) |
| 1–8 | 16 packed 4-bit nibbles (two samples per byte) |

**Header flags:**

| Bits | Flag | Meaning |
|------|------|---------|
| 0 | End | This is the last block of the sample |
| 1 | Loop | After this block, jump to the loop address |
| 2–3 | Filter | Prediction filter mode (0–3) |

**Filter modes:**

| Mode | Name | Description |
|------|------|-------------|
| 0 | Direct | No filtering; nibbles are absolute sample values |
| 1 | Predict 1 | First-order prediction using previous sample |
| 2 | Predict 2 | Second-order prediction using two previous samples |
| 3 | Predict 3 | Third-order prediction using three previous samples |

### 3.2 Decoding

Each 4-bit nibble is sign-extended to a range of −8 to +7. The prediction filter then computes the output sample:

$$\hat{s}_n = \text{nibble}_n + \sum_{k=1}^{M} c_k \cdot s_{n-k}$$

Where $c_k$ are filter coefficients determined by the filter mode and the previous samples $s_{n-k}$. The result is clamped to the 16-bit signed range (−32768 to 32767).

### 3.3 Loop Points

BRR samples support loop points via the loop flag in the block header. When a block with the loop flag set finishes playing, the voice jumps to the loop address specified in the sample directory entry. Loop design is critical for sustained instruments (strings, pads, choir) and is a major compositional consideration.

### 3.4 Sample Rate and Size

- Each BRR block decodes to 16 samples.
- At 32 kHz output, one block lasts 0.5 ms.
- A 1-second sample at 32 kHz requires approximately 2000 BRR blocks (18 KB uncompressed BRR data).
- ARAM budget is 64 KB total (shared with echo buffer and SPC700 program), so sample selection and echo buffer size are zero-sum.

---

## 4. ADSR Envelope

Each voice has a hardware ADSR envelope generator controlled by two registers (ADSR(0) and ADSR(1)). BeatBax exposes these as `adsr=a,d,s,r` with each value a nibble (0–15).

### 4.1 Envelope Stages

```
Key On ──► Attack ──► Decay ──► Sustain ──► (hold) ──► Key Off ──► Release ──► Silence
```

| Stage | Register | Range | Behaviour |
|-------|----------|-------|-----------|
| Attack | ADSR(0) high nibble | 0–15 | Exponential rise from 0 to 127 |
| Decay | ADSR(0) low nibble | 0–15 | Exponential fall from 127 to sustain level |
| Sustain | ADSR(1) high nibble | 0–15 | Target level (0 = silence, 15 = full) |
| Release | ADSR(1) low nibble | 0–15 | Exponential fall from current level to 0 |

### 4.2 Envelope Rates

Each nibble value indexes into a rate table that determines how quickly the envelope changes per sample period (32 kHz). Lower values are faster; higher values are slower. The envelope level is 7-bit (0–127) internally.

**Typical settings:**

| Use case | ADSR | Character |
|----------|------|-----------|
| Percussive hit | `0,0,15,2` | Instant attack, immediate decay, short release |
| Plucked string | `2,3,12,8` | Quick attack, moderate decay, medium release |
| Sustained pad | `8,4,10,6` | Slow attack, gentle decay, long release |
| Organ (no decay) | `0,15,15,4` | Instant attack, no decay (sustain at max), medium release |

### 4.3 GAIN Mode (Alternative)

The GAIN register (`$x7`) provides a direct-gain mode as an alternative to ADSR. In direct gain mode, the envelope level is set directly without attack/decay/sustain/release stages. BeatBax v1 uses ADSR exclusively; GAIN mode is not exposed.

---

## 5. Per-Voice Volume and Stereo

### 5.1 Volume Registers

Each voice has independent left and right volume registers (VOL(L) and VOL(R)), each 7-bit (0–127). These multiply the envelope-scaled sample output before mixing.

$$output_L = sample \times \frac{ENVX}{128} \times \frac{VOL(L)}{127}$$

$$output_R = sample \times \frac{ENVX}{128} \times \frac{VOL(R)}{127}$$

### 5.2 Stereo Placement

The S-DSP has **no pan pot**. Stereo positioning is achieved entirely through independent L/R volume levels. Common patterns:

| Placement | VOL(L) | VOL(R) | Effect |
|-----------|--------|--------|--------|
| Centre | 127 | 127 | Full mono image |
| Hard left | 127 | 0 | Left speaker only |
| Hard right | 0 | 127 | Right speaker only |
| Wide | 100 | 60 | Slight left bias |
| Narrow | 90 | 90 | Slightly reduced, centred |

Because volume and pan are the same control, reducing stereo width also reduces perceived loudness. Composers often compensate by using fewer simultaneous voices on one side.

---

## 6. Global Echo

The S-DSP includes a hardware echo (delay) effect implemented as a circular buffer in ARAM with an FIR (Finite Impulse Response) filter.

### 6.1 Echo Registers

| Register | Address | Name | Function |
|----------|---------|------|----------|
| EFB | `$2D` | Echo feedback | Feedback amount (0–127) |
| EDL | `$7D` | Echo delay | Delay length in 2048-byte units (0–15) |
| EVOL(L) | `$2C` | Echo volume L | Left echo return volume (0–127) |
| EVOL(R) | `$3C` | Echo volume R | Right echo return volume (0–127) |
| ESA | `$6D` | Echo start | Echo buffer start address in ARAM |
| FIR | `$0F`–`$1F` | FIR coefficients | 8 signed 7-bit FIR filter coefficients |
| EC | `$0D` | Echo enable | Master echo on/off |
| DIR | `$4D` | Echo disable | Per-voice bit mask to exclude voices from echo |

### 6.2 Echo Signal Flow

```
Voice output ──► Main mix (dry) ──► DAC output
      │
      └──► Echo buffer (ARAM) ──► FIR filter ──► Echo return (wet) ──► DAC output
                ▲                        │
                └──── Feedback (EFB) ────┘
```

### 6.3 Echo Buffer Size

The echo buffer size is determined by EDL (Echo Delay Length):

$$buffer\_size = EDL \times 2048 \text{ bytes}$$

| EDL | Buffer size | Delay time at 32 kHz |
|-----|------------|---------------------|
| 1 | 2,048 bytes | ~32 ms |
| 2 | 4,096 bytes | ~64 ms |
| 4 | 8,192 bytes | ~128 ms |
| 8 | 16,384 bytes | ~256 ms |
| 15 | 30,720 bytes | ~480 ms |

Larger EDL values consume more ARAM, leaving less room for samples. EDL = 4 (8 KB, ~128 ms) is a common default for game music.

### 6.4 Per-Voice Echo Disable

The DIR register allows individual voices to be excluded from the echo buffer. Voices with DIR set pass only to the dry (main) mix. BeatBax exposes this as `echo_off=true` on an instrument.

### 6.5 FIR Filter

The default FIR coefficients (used by most SNES games) produce a gentle low-pass characteristic that softens the echo repeats. BeatBax v1 uses the standard coefficient set:

```
+0, +0, +0, +0, +0, +0, +0, +0  (identity — no filtering)
```

Custom FIR authoring is deferred to a future enhancement.

---

## 7. Noise Generator

The S-DSP includes a noise generator clocked independently of the voices. The noise clock rate is controlled by the FLG register (`$6C`, bits 4–0).

### 7.1 Noise as Pitch Modulation

On the real hardware, the noise generator's output can be used as a pitch modulation source for voice 3 (the fourth voice, index 3). This creates a "pitch noise" effect used sparingly in some games for percussion or special effects.

BeatBax v1 does not expose noise pitch modulation. The noise generator is documented here for completeness and future enhancement.

---

## 8. Timing and Clocks

### 8.1 SPC700 Clock

The SPC700 runs at 1.024 MHz (derived from the 24.576 MHz master crystal divided by 24). The SPC700 has 64 timers available, typically used by music drivers for tempo and sequencing.

### 8.2 S-DSP Sample Rate

The S-DSP outputs audio at a fixed **32,000 Hz** sample rate. All voice playback, ADSR rates, echo delay, and Gaussian interpolation operate at this rate. There is no PAL/NTSC variant for the S-DSP — all SNES hardware worldwide uses the same 32 kHz output.

### 8.3 ADSR Rate Calculation

ADSR rate values index into lookup tables that specify how many 32 kHz sample periods each envelope step takes. The attack phase has 32 internal steps (0–127 envelope range); decay and release phases use exponential curves with varying step counts depending on the rate nibble.

### 8.4 Sequencer Timing and BPM

Like other BeatBax chips, the S-DSP has no hardware tempo unit. BPM is managed by the music driver (BeatBax scheduler). Common SNES BPM ranges:

| Genre / game style | Typical BPM |
|-------------------|------------|
| Action / platformer | 130–170 |
| RPG / adventure | 90–130 |
| Atmospheric / ambient | 60–90 |
| Boss battle / intense | 150–190 |
| Puzzle / casual | 100–130 |

---

## 9. BeatBax Targeting Notes

BeatBax implements the SNES S-DSP as a built-in chip. Select it with `chip snes` at the top of a `.bax` file.

### 9.1 Chip Directive

```bax
chip snes
```

No region qualifier is needed (32 kHz is universal). Channel count is fixed at 8.

### 9.2 Instrument Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `voice` | S-DSP voice instrument (channel determines voice number) |
| `brr_sample` | string | BRR sample reference: `@snes/*`, URL, or `local:` path |
| `adsr` | `a,d,s,r` | Hardware ADSR nibbles (0–15 each) |
| `vol_l` | 0–127 | Left channel volume |
| `vol_r` | 0–127 | Right channel volume |
| `echo_off` | boolean | Disable echo for this voice (DIR bit) |
| `vol_env` | `[v0,v1,…\|N]` | Software volume macro (supplements ADSR) |
| `pitch_env` | `[s0,s1,…\|N]` | Software pitch macro (semitone offsets) |

### 9.3 Song-Level Echo Directive

```bax
echo on  fb=50  edl=4  evol_l=80  evol_r=80
```

| Field | Range | Default | Description |
|-------|-------|---------|-------------|
| `echo on/off` | — | `off` | Master echo enable |
| `fb` | 0–127 | 0 | Echo feedback |
| `edl` | 0–15 | 0 | Echo delay length (× 2048 bytes) |
| `evol_l` | 0–127 | 0 | Echo volume left |
| `evol_r` | 0–127 | 0 | Echo volume right |
| `esa` | 0–65535 | auto | Echo buffer start address (advanced) |

### 9.4 Bundled Samples

BeatBax ships a built-in `@snes/*` sample library (similar to `@nes/*` DMC samples):

```
@snes/strings_c4    — sustained string ensemble
@snes/brass_g3      — brass section
@snes/choir_c4      — choir pad
@snes/flute_c5      — solo flute
@snes/piano_c4      — piano
@snes/kick          — bass drum
@snes/snare         — snare drum
@snes/hihat         — hi-hat
@snes/timpani       — timpani
```

### 9.5 CLI Sample Preparation

Convert PCM audio to BRR format:

```bash
beatbax convert wav2brr input.wav output.brr
```

Options:
- `--loop-start <sample>` — set BRR loop point
- `--filter <0-3>` — preferred filter mode (auto-selected by default)

### 9.6 Channel Mapping

| BeatBax channel | S-DSP voice | UI label |
|----------------|-------------|----------|
| 1 | Voice 0 | Voice 1 |
| 2 | Voice 1 | Voice 2 |
| 3 | Voice 2 | Voice 3 |
| 4 | Voice 3 | Voice 4 |
| 5 | Voice 4 | Voice 5 |
| 6 | Voice 5 | Voice 6 |
| 7 | Voice 6 | Voice 7 |
| 8 | Voice 7 | Voice 8 |

---

## 10. Appendix A — BRR Block Layout

```
Byte 0:  [ filter_mode(2) | 0 | loop(1) | end(1) ]
Byte 1:  [ nibble_1(4) | nibble_0(4) ]
Byte 2:  [ nibble_3(4) | nibble_2(4) ]
...
Byte 8:  [ nibble_15(4) | nibble_14(4) ]
```

Each nibble is a signed 4-bit value (−8 to +7). The filter mode determines how the nibble is combined with previous sample history to produce the final 16-bit output sample. A complete BRR sample consists of one or more consecutive 9-byte blocks, terminated by a block with the end flag set.

---

## 11. Appendix B — ADSR Rate Tables

ADSR rate nibbles (0–15) map to envelope step durations at 32 kHz. Approximate times for common settings:

**Attack (0 = fastest, 15 = slowest):**

| Rate | Approximate time to reach 127 |
|------|-------------------------------|
| 0 | ~4 ms |
| 2 | ~25 ms |
| 5 | ~100 ms |
| 8 | ~400 ms |
| 12 | ~1.6 s |
| 15 | ~6.4 s |

**Decay / Release (0 = fastest, 15 = slowest):**

| Rate | Approximate time (127 → 0) |
|------|---------------------------|
| 0 | ~3 ms |
| 2 | ~20 ms |
| 5 | ~80 ms |
| 8 | ~300 ms |
| 12 | ~1.2 s |
| 15 | ~5 s |

Sustain level (0–15) maps linearly to envelope height: sustain 15 = 127 (full), sustain 8 ≈ 64 (half), sustain 0 = silence.

*Note: Exact rate tables are defined by the S-DSP hardware and implemented in BeatBax's `adsr.ts` module. Values above are approximations for compositional planning.*

---
