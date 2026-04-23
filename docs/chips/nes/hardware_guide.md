# NES Ricoh 2A03 APU — Hardware Reference Guide

The Nintendo Entertainment System (1983, North America 1985) used the Ricoh 2A03 CPU, a modified MOS 6502 with an integrated Audio Processing Unit (APU). With five channels — two pulse oscillators, a triangle wave, a noise generator, and a delta-modulation sampler — the 2A03 APU offered composers a richer palette than its contemporary rivals, yet remained tightly constrained by the hardware of its era. Those constraints produced some of the most recognisable music in video game history.

This guide covers the 2A03 APU in precise technical detail.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [Channel 1 — Pulse 1](#2-channel-1--pulse-1)
3. [Channel 2 — Pulse 2](#3-channel-2--pulse-2)
4. [Channel 3 — Triangle](#4-channel-3--triangle)
5. [Channel 4 — Noise](#5-channel-4--noise)
6. [Channel 5 — DMC (Delta Modulation Channel)](#6-channel-5--dmc-delta-modulation-channel)
7. [Volume and Mixing](#7-volume-and-mixing)
8. [Timing and Clocks](#8-timing-and-clocks)
9. [Appendix A — NTSC Period Table](#9-appendix-a--ntsc-period-table)

---

## 1. Hardware Architecture

The 2A03 APU is integrated directly into the CPU die, mapped into the CPU address space at `$4000`–`$4017`. All five channels are summed through a non-linear mixer before reaching the audio output pin. The NES outputs mono audio (stereo was never implemented in the original hardware; the Famicom had a separate audio expansion bus for mapper chips).

```
CH1 (Pulse 1)    ──┐
CH2 (Pulse 2)    ──┤──► Non-linear mixer ──► Low-pass filter ──► Audio output
CH3 (Triangle)   ──┤
CH4 (Noise)      ──┤
CH5 (DMC)        ──┘
```

**Global constraints:**

| Constraint | Value |
|-----------|-------|
| Channels | 5 (Pulse 1, Pulse 2, Triangle, Noise, DMC) |
| CPU clock (NTSC) | 1.789773 MHz |
| CPU clock (PAL) | 1.662607 MHz |
| Volume resolution | 4 bits (0–15 for pulse/triangle/noise channels; DMC uses 7-bit output) |
| Stereo | No — mono output (stereo via aftermarket/mapper only) |
| Mixer type | Non-linear (pulse channels summed separately from triangle/noise/DMC) |
| Sampled audio | Yes — DMC channel plays 1-bit delta-encoded samples |

The non-linear mixer is a defining characteristic of the NES sound. Because the pulse channels are combined using a lookup table rather than simple addition, two pulse channels at maximum volume sound quieter than twice a single pulse. This gives the NES its characteristic "soft clipping" warmth at high volumes — a behaviour emulators must replicate carefully to match the authentic sound.

The 2A03 also omits the 6502's binary decimal (BCD) mode, freeing transistor area for the APU circuitry.

---

## 2. Channel 1 — Pulse 1

### 2.1 Register Map

| Register | Address | Name | Function |
|----------|---------|------|----------|
| `$4000` | — | Control | Duty, envelope loop, constant volume, volume/envelope |
| `$4001` | — | Sweep | Enable, period, direction, shift |
| `$4002` | — | Timer Lo | Low 8 bits of timer |
| `$4003` | — | Timer Hi / Length | High 3 bits of timer, length counter load |

### 2.2 Pulse Width (Duty Cycle)

Bits 7–6 of `$4000` select the pulse duty. The NES pulse channels use the same four duty settings as many other chips of the era, but the NES waveforms are distinctly flavoured by the non-linear mixer summing them:

| Bits 7–6 | Duty | Sequence (8 steps) | Acoustic character |
|----------|------|--------------------|--------------------|
| `00` | 12.5% | `0 1 0 0 0 0 0 0` | Very thin, buzzy, cutting — almost percussive |
| `01` | 25% | `0 1 1 0 0 0 0 0` | Hollow, classic NES "lead" tone |
| `10` | 50% | `0 1 1 1 1 0 0 0` | Full, warm square — backbone of NES harmony |
| `11` | 75% | `1 0 0 1 1 1 1 1` | Same spectrum as 25% (phase-inverted); slightly warmer feel |

The 25% and 50% duties are by far the most commonly used in NES music. The 12.5% duty is reserved for bright SFX lead-ins or stabs; the 75% is rarely used because its timbre is nearly indistinguishable from 25%.

### 2.3 Volume Envelope

The envelope unit on both pulse channels provides either a constant volume or a decaying envelope:

| Bit | Meaning |
|-----|---------|
| 4 | Envelope loop / length counter halt |
| 5 | Constant volume flag — `1` = constant volume; `0` = decay envelope |
| 3–0 | Volume (if constant) / envelope period (if decaying) |

When the constant volume flag is clear, the channel volume starts at 15 and decrements by 1 on each envelope clock. The envelope period (bits 3–0) sets the rate: `0` gives the fastest decay (~240 Hz), `15` gives the slowest. When the envelope loop flag is set and constant volume is clear, the envelope wraps from 0 back to 15 — enabling a repeating sawtooth-shaped volume LFO.

| Envelope period | Decay character |
|-----------------|----------------|
| 0 | Extremely fast — short tick/click |
| 1–2 | Punchy pluck — staccato feel |
| 3–5 | Natural decay — "plucked string" quality |
| 6–10 | Slow fade — sustained notes |
| 15 | Very slow decay — nearly held at full volume |

### 2.4 Hardware Sweep Unit (Pulse 1 and Pulse 2)

Both NES pulse channels have a hardware sweep unit, unlike the Game Boy where only CH1 has sweep. This is a significant difference — NES composers could apply pitch sweeps simultaneously on both pulse channels.

| Bit | Meaning |
|-----|---------|
| 7 | Enable |
| 6–4 | Period (divider reload value) |
| 3 | Negate flag — `0` = sweep up (lower period = higher pitch), `1` = sweep down |
| 2–0 | Shift count |

$$\text{target period} = \text{current period} + \left(\frac{\text{current period}}{2^{\text{shift}}}\right)$$

When the negate flag is set, the target period is subtracted instead of added. A critical hardware difference: on Pulse 1, negation uses one's complement; on Pulse 2, it uses two's complement. This means identical sweep parameters produce very slightly different results on the two channels — a subtle quirk that affects emulation accuracy.

**Muting conditions:** The sweep unit silences the channel if the current period is less than 8 (too high in pitch) or if the target period exceeds `$7FF` (2047, too low). These muting rules must be enforced for accurate emulation.

**Common uses:** Downward sweeps on bass notes, upward sweeps on attack transients, explosion-like downward sweeps on percussion-substitute patterns.

### 2.5 Audible Range

The NES pulse timer is 11 bits (0–2047), but the effective usable range is period values 8–`$7FF`. The frequency formula:

$$f = \frac{1789773}{16 \times (\text{period} + 1)}$$

(NTSC values; PAL uses 1662607 in the numerator.)

Standard usable range: approximately A1 (55 Hz) at period 2036 to approximately C8 (4186 Hz) at period 26. The lower boundary is set by the sweep muting rule; the upper boundary is limited by aliasing and the non-linear mixer behaviour at very short periods.

---

## 3. Channel 2 — Pulse 2

Channel 2 is functionally identical to Channel 1 with two minor differences:

1. The negate flag in the sweep unit uses two's complement arithmetic (one's complement on Pulse 1).
2. Register addresses are `$4004`–`$4007` instead of `$4000`–`$4003`.

| Register | Address | Name |
|----------|---------|------|
| `$4004` | — | Control |
| `$4005` | — | Sweep |
| `$4006` | — | Timer Lo |
| `$4007` | — | Timer Hi / Length |

In practice, NES composers treated the two pulse channels as interchangeable tonal sources that could be layered for unison chord effects or separated for melody + counter-melody. The subtle sweep negate difference is audible only under very specific sweep parameter conditions and is rarely exploited deliberately.

### Layered Unison Technique

One common NES compositional technique not available on the Game Boy: both pulse channels playing the same pitch at slightly different duty cycles. Pulse 1 at 25% and Pulse 2 at 50% playing the same note creates a richer combined harmonic profile than either duty alone — an effect similar to mixing sawtooth and square waves in analogue synthesis.

---

## 4. Channel 3 — Triangle

### 4.1 Overview

The triangle channel generates a 32-step quantised triangle waveform at a fixed volume. It has no volume envelope and no duty control — only pitch and a length counter/linear counter for controlling note duration. Despite these limitations, it produces the most "musical" and natural-sounding bass tones on the NES.

| Register | Address | Name | Function |
|----------|---------|------|----------|
| `$4008` | — | Linear counter / halt | Linear counter reload value, control flag |
| `$400A` | — | Timer Lo | Low 8 bits of timer |
| `$400B` | — | Timer Hi / Length | High 3 bits of timer, length counter load |

### 4.2 The Triangle Waveform

The triangle channel generates a 32-step quantised triangle wave (16 steps ascending, 16 descending) with 4-bit amplitude steps. The waveform is fixed — unlike the Game Boy's wave channel, there is no wave RAM to customise. This gives the triangle a distinctive "staircase" quality at higher pitches due to 4-bit quantisation noise.

```
Amplitude (0–15):
15 │    *
   │   * *
   │  *   *
   │ *     *
 0 │*       *  ← repeats
```

The triangle waveform contains only odd harmonics, like a square wave, but their amplitudes fall off as 1/n² (rather than 1/n for a square wave), giving it a softer, flute-like quality.

### 4.3 Volume and Amplitude

The triangle channel **has no volume control**. It is always output at full amplitude when active. This is the channel's most significant limitation. NES composers compensated by:

- Using the triangle exclusively for bass — its soft harmonic content sits naturally below the louder pulse channels without competing
- Rapidly enabling/disabling the channel to simulate volume changes (software-gated amplitude at the music driver tick rate)
- Using the linear counter to set very short note durations, giving staccato bass lines without note tails bleeding into rests

### 4.4 Frequency

The triangle channel frequency formula:

$$f = \frac{1789773}{32 \times (\text{period} + 1)}$$

The factor of 32 (versus 16 for pulse channels) means the triangle plays **one octave lower** than a pulse channel at the same period register value. BeatBax compensates by using **half** the period register value for triangle compared to pulse at the same MIDI note — `TRIANGLE_PERIOD[n] ≈ PULSE_PERIOD[n] / 2`. Do not double the period to compensate; that would produce a frequency one-quarter of the target (two octaves below). Bass parts on the triangle are written at the pitch they should sound; the period table handles the compensation automatically.

**Practical note range:** The triangle channel is most useful from approximately C2 to C5. At very high pitches (short period values), the 32-step quantisation becomes audible as a raspy, buzzy artefact — a characteristic of the NES sound in the upper registers.

### 4.5 Linear Counter

The linear counter is clocked by the frame sequencer's quarter-frame clock (240 Hz in 4-step mode; 192 Hz in 5-step mode). Its primary purpose is to cut a note short after a specified number of quarter-frame ticks. This allows very short triangle "pings" useful for percussion imitation.

When the control flag (`$4008` bit 7) is set, the linear counter is halted and the note plays at full duration (length counter only governs duration). Most composers leave the control flag set and use the length counter for note length.

### 4.6 The Triangle "Pop" and Low-Frequency Quirk

At very low pitches (period values near 2047), the triangle channel's step waveform produces audible quantisation artefacts — a buzzy, rough quality rather than smooth bass. The same 32-step waveform sounds smooth at C3 but buzzy at C1. Composers generally kept the triangle at C2 and above.

Rapid toggling of the triangle channel (enabling/disabling at audio rate) produces a popping artefact similar to the Game Boy wave channel pop — caused by the sudden DC offset jump when the waveform freezes mid-cycle.

---

## 5. Channel 4 — Noise

### 5.1 Register Map

| Register | Address | Name | Function |
|----------|---------|------|----------|
| `$400C` | — | Control | Envelope loop, constant volume, volume/period |
| `$400E` | — | Mode / Period | Mode flag, noise period |
| `$400F` | — | Length counter | Length counter load |

### 5.2 LFSR Mechanism

Like the Game Boy's noise channel, the NES noise generator uses a Linear Feedback Shift Register (LFSR). The NES LFSR is 15 bits wide, with two feedback modes:

| Mode flag (`$400E` bit 7) | Feedback taps | Noise character |
|--------------------------|---------------|-----------------|
| `0` | Bits 1 and 0 | Long period (32,767 steps) — white noise, hiss |
| `1` | Bits 6 and 0 | Short period (93 or 31 steps) — buzzy, "metallic", more tonal |

The period register (`$400E` bits 3–0) selects from 16 predefined timer periods, providing 16 noise "pitches" ranging from very high frequency hiss to low-frequency rumble:

| Period value | Timer value | Approximate frequency | Character |
|--------------|-------------|----------------------|-----------|
| 0 | 4 | ~112.5 kHz | Ultra-high, barely perceptible |
| 1 | 8 | ~56.3 kHz | High hiss |
| 2 | 16 | ~28.2 kHz | Bright hiss |
| 3 | 32 | ~14.1 kHz | Hi-hat range |
| 4 | 64 | ~7.0 kHz | Open hi-hat |
| 5 | 96 | ~4.7 kHz | Snare range |
| 6 | 128 | ~3.5 kHz | Mid snare |
| 7 | 160 | ~2.8 kHz | Low snare |
| 8 | 202 | ~2.2 kHz | High tom |
| 9 | 254 | ~1.8 kHz | Mid tom |
| 10 | 380 | ~1.2 kHz | Low tom |
| 11 | 508 | ~887 Hz | Low noise |
| 12 | 762 | ~590 Hz | Kick range |
| 13 | 1016 | ~442 Hz | Low kick |
| 14 | 2034 | ~221 Hz | Sub-bass noise |
| 15 | 4068 | ~111 Hz | Very low rumble |

### 5.3 Volume Envelope

The noise channel uses the same envelope mechanism as the pulse channels (`$400C`, same bit layout as `$4000`/`$4004`). Fast-decay envelopes are the primary shaping tool for percussion synthesis.

### 5.4 Emulating Drum Sounds

| Drum sound | Mode | Period value | Envelope | Notes |
|-----------|------|-------------|----------|-------|
| Snare | Normal (0) | 5–7 | Fast down (period 1–2) | Mid-frequency white noise burst |
| Hi-hat (closed) | Normal (0) | 3–4 | Very fast (period 0–1) | Short high-frequency choke |
| Hi-hat (open) | Normal (0) | 3–5 | Moderate (period 3–4) | Longer white-noise decay |
| Kick | Normal (0) | 12–14 | Moderate (period 3–5) | Low-frequency thump |
| Crash cymbal | Normal (0) | 3–5 | Slow (period 7–10) | Long high-frequency decay |
| Tom | Normal (0) | 8–11 | Medium (period 2–4) | Mid-frequency burst |
| Metallic buzz | Loop (1) | 3–6 | Constant volume | Buzzy, "robotic" ring modulation character |

The NES noise channel has 16 fixed "pitches" rather than the continuous range of the Game Boy's LFSR, giving it a more discrete, tunable character. NES composers frequently switched period values between hits within a bar to give each drum event a distinct tonal identity.

---

## 6. Channel 5 — DMC (Delta Modulation Channel)

### 6.1 Overview

The DMC channel is the NES's most powerful and unusual audio feature. It plays back pre-stored delta-encoded (1-bit difference) audio samples from PRG-ROM, enabling a primitive but effective form of sample playback unavailable on the Game Boy or most contemporaries.

| Register | Address | Name | Function |
|----------|---------|------|----------|
| `$4010` | — | Control | IRQ enable, loop, rate index |
| `$4011` | — | Direct load | Direct output level (7 bits) |
| `$4012` | — | Sample address | Starting address (`$C000` + value × `$40`) |
| `$4013` | — | Sample length | Sample byte count (value × `$10` + 1 bytes) |

### 6.2 Delta Modulation Format

The DMC uses 1-bit delta encoding: each bit in the sample stream either increments or decrements a 7-bit counter by 2. The counter value directly drives the DAC output. This produces 7-bit (128-level) audio with significant quantisation noise, but at reasonable sample rates it is perceptually useful for:

- Bass reinforcement (deep bass hits that the triangle cannot produce)
- Drum samples (kicks, snares with real acoustic character)
- Voice clips and speech effects
- Orchestral hits and atmospheric sound beds

### 6.3 Sample Rate

The rate register (`$4010` bits 3–0) selects from 16 predefined rates (NTSC values):

| Rate index | Rate (Hz) | Typical use |
|-----------|-----------|-------------|
| 0 | 4181.71 | Very low quality — bass rumbles only |
| 1 | 4709.93 | — |
| 2 | 5264.04 | — |
| 3 | 5593.04 | — |
| 4 | 6257.95 | — |
| 5 | 7046.35 | — |
| 6 | 7918.63 | — |
| 7 | 8363.42 | Kick drums |
| 8 | 9419.86 | — |
| 9 | 11186.08 | Snare samples |
| 10 | 12604.03 | — |
| 11 | 13968.63 | — |
| 12 | 16884.65 | Voice / melodic samples |
| 13 | 21306.82 | — |
| 14 | 24858.25 | — |
| 15 | 33143.94 | Highest quality, shortest maximum length |

### 6.4 CPU Stalls (The DMC DMA Problem)

When the DMC needs to fetch a new byte from ROM, it hijacks the CPU bus for 1–4 CPU cycles. This causes the CPU to stall for a brief period, and if this happens during a controller read (`$4016`/`$4017`), it can corrupt controller input. More critically for audio, the stall slightly delays the PPU (graphics processor), causing a timing desynchronisation that game developers had to account for.

In BeatBax, DMC samples are treated as a pre-baked resource — the DMC channel is orchestrated as a fixed sample trigger rather than a real-time synthesis target, consistent with how it was used in commercial NES development.

### 6.5 DMC Playback Loop

When the loop flag (`$4010` bit 6) is set, the DMC sample repeats indefinitely from the start address. This was used for continuous bass drones or repeating drum loops. The IRQ flag (`$4010` bit 7) enables an interrupt when the sample finishes, allowing the music driver to schedule the next event precisely.

### 6.6 Mixing with Other Channels

The DMC channel feeds the non-pulse mixer alongside the triangle and noise channels. Its 7-bit output range means it can substantially dominate the mix when loud. NES composers often attenuated other channels during DMC sample events to prevent the mix from clipping.

---

## 7. Volume and Mixing

### 7.1 The Non-Linear Mixer

The NES APU uses a non-linear mixing scheme. The pulse channels are combined first using a lookup table, then mixed with the triangle, noise, and DMC channels through a second lookup table. The overall formula (approximated linearly) is:

$$\text{output} \approx 0.00752 \times (p_1 + p_2) + 0.00851 \times \text{tri} + 0.00494 \times \text{noise} + 0.00335 \times \text{dmc}$$

where values range 0–15 for pulse/noise, 0–15 for triangle, and 0–127 for DMC.

The key consequence: the triangle and DMC channels are weighted **lower** in the mix than the pulse channels at equivalent volume settings. Composers compensated by keeping the triangle active nearly all the time (bass is always present) and using the pulse channels more sparingly to avoid overwhelming it.

### 7.2 No Per-Channel Panning

The NES has no hardware panning. All channels are summed to a single mono output. Some cartridges used the Famicom's audio expansion port to add extra audio channels (Konami VRC6, Namco N163, etc.), but these are mapper-specific extensions outside the base 2A03 APU.

Software-side stereo effects were impossible on the base hardware. Emulators and BeatBax can simulate panning as a software convenience, but it is not authentic NES behaviour.

### 7.3 APU Status Register

The APU status register at `$4015` controls channel enable/disable:

| Bit | Channel |
|-----|---------|
| 0 | Pulse 1 |
| 1 | Pulse 2 |
| 2 | Triangle |
| 3 | Noise |
| 4 | DMC |

Reading `$4015` returns the status (length counter active for each channel, DMC active, DMC IRQ, frame IRQ). Writing `$4015` enables or disables channels — a disabled channel is immediately silenced and its length counter is cleared.

---

## 8. Timing and Clocks

### 8.1 Frame Sequencer

The APU frame sequencer runs in two modes (bit 7 of `$4017`) and generates the periodic "quarter-frame" and "half-frame" clocks used by the envelope unit, the linear counter, sweep units, and length counters. The timing differs between modes:

- 4-step mode (mode 0): quarter-frame = 240 Hz (envelope, linear counter), half-frame = 120 Hz (sweep, length counter), full-frame = 60 Hz (optional IRQ). Sequence: quarter → half → quarter → full (IRQ).
- 5-step mode (mode 1): quarter-frame = 192 Hz, half-frame = 96 Hz; the sequencer runs a longer period and does not generate an IRQ. Quarter-frame clocks update envelopes and the linear counter; half-frame clocks update sweep and length counters.

Summary:
- Quarter-frame (envelope + linear counter): 240 Hz (4-step) / 192 Hz (5-step)
- Half-frame (sweep + length counter): 120 Hz (4-step) / 96 Hz (5-step)
- Full-frame (optional IRQ): 60 Hz (4-step) / no IRQ (5-step)

### 8.2 NTSC vs PAL Timing

The NES was released in both NTSC (60 Hz vblank) and PAL (50 Hz vblank) versions. The APU clock rate differs:

| Region | CPU clock | Frame rate |
|--------|-----------|-----------|
| NTSC | 1.789773 MHz | 60.0988 Hz |
| PAL | 1.662607 MHz | 50.0070 Hz |

NES music drivers typically based their tempo on the vblank interrupt (PPU NMI). On NTSC, a 120 BPM song at 1/16-note resolution uses 2 vblank frames per tick. On PAL, the same code runs ~17% slower, causing music to play flat and at reduced tempo — the infamous "PAL slowdown" that affected nearly every imported NES title.

### 8.3 Sequencer Timing and BPM

Like the Game Boy, the NES has no hardware tempo unit. BPM is entirely managed by the game's music driver, which counts vblank intervals or frame counter IRQ firings to advance the pattern sequencer. Common NES BPM ranges:

| Genre / game style | Typical BPM |
|-------------------|------------|
| Fast action / platformer | 150–210 |
| RPG / adventure | 100–140 |
| Puzzle | 80–120 |
| Ambient / atmospheric | 60–90 |

The NES's 60 Hz vblank rate and 240 Hz envelope clock support tempo resolutions of 60/N BPM for integer N, but music drivers with sub-frame timing used the frame counter IRQ for finer resolution.

### 8.4 Note Frequency Resolution

The 11-bit timer register gives frequencies that do not fall exactly on equal-temperament pitches at all octaves. The deviation is:

- Small and inaudible in the middle octaves (C3–C6)
- Noticeable at the lowest octaves (C1–C2) where adjacent period values span large frequency gaps
- The triangle channel, using a 32-step period, has twice the pitch quantisation error of the pulse channels at the same octave

Period tables used by NES composers compensate by rounding to the nearest available period value. BeatBax uses a pre-computed NTSC period table from A4 = 440 Hz.

---

## Appendix A — NTSC Period Table

Reference period values for standard chromatic pitches on NTSC hardware. These are the values BeatBax uses internally for pulse and triangle channel note-to-period mapping. The table covers **61 notes, MIDI 36–96 (C2–C7 inclusive)**. Note: C2–C7 spans 5 complete octaves plus the endpoint C7, giving 61 semitones — not 6 × 12 = 72.

| Note | MIDI | Pulse Period | Triangle Period |
|------|------|-------------|----------------|
| C2 | 36 | 1709 | 854 |
| C#2 | 37 | 1613 | 806 |
| D2 | 38 | 1523 | 761 |
| D#2 | 39 | 1437 | 718 |
| E2 | 40 | 1356 | 678 |
| F2 | 41 | 1280 | 640 |
| F#2 | 42 | 1208 | 604 |
| G2 | 43 | 1140 | 570 |
| G#2 | 44 | 1076 | 538 |
| A2 | 45 | 1016 | 507 |
| A#2 | 46 | 959 | 479 |
| B2 | 47 | 905 | 452 |
| C3 | 48 | 854 | 427 |
| C#3 | 49 | 806 | 403 |
| D3 | 50 | 761 | 380 |
| D#3 | 51 | 718 | 359 |
| E3 | 52 | 678 | 338 |
| F3 | 53 | 640 | 319 |
| F#3 | 54 | 604 | 301 |
| G3 | 55 | 570 | 284 |
| G#3 | 56 | 538 | 268 |
| A3 | 57 | 507 | 253 |
| A#3 | 58 | 479 | 239 |
| B3 | 59 | 452 | 225 |
| C4 | 60 | 427 | 213 |
| C#4 | 61 | 403 | 201 |
| D4 | 62 | 380 | 189 |
| D#4 | 63 | 359 | 179 |
| E4 | 64 | 338 | 169 |
| F4 | 65 | 319 | 159 |
| F#4 | 66 | 301 | 150 |
| G4 | 67 | 284 | 142 |
| G#4 | 68 | 268 | 134 |
| A4 | 69 | 253 | 126 |
| A#4 | 70 | 239 | 119 |
| B4 | 71 | 225 | 112 |
| C5 | 72 | 213 | 106 |
| C#5 | 73 | 201 | 100 |
| D5 | 74 | 189 | 94 |
| D#5 | 75 | 179 | 89 |
| E5 | 76 | 169 | 84 |
| F5 | 77 | 159 | 79 |
| F#5 | 78 | 150 | 75 |
| G5 | 79 | 142 | 70 |
| G#5 | 80 | 134 | 66 |
| A5 | 81 | 126 | 63 |
| A#5 | 82 | 119 | 59 |
| B5 | 83 | 112 | 56 |
| C6 | 84 | 106 | 52 |
| C#6 | 85 | 100 | 49 |
| D6 | 86 | 94 | 47 |
| D#6 | 87 | 89 | 44 |
| E6 | 88 | 84 | 41 |
| F6 | 89 | 79 | 39 |
| F#6 | 90 | 75 | 37 |
| G6 | 91 | 70 | 35 |
| G#6 | 92 | 66 | 33 |
| A6 | 93 | 63 | 31 |
| A#6 | 94 | 59 | 29 |
| B6 | 95 | 56 | 27 |
| C7 | 96 | 52 | 26 |

*Note: Values are NTSC 11-bit timer reload values (t) written to APU registers; hardware divides by (t+1). Derived from `t = round(f_CPU / (16 × f)) − 1` for pulse and `t = round(f_CPU / (32 × f)) − 1` for triangle, with f_CPU = 1,789,773 Hz and A4 = 440 Hz. Pulse periods below 8 are silenced by the hardware sweep unit. All values in this table are within the valid 11-bit range (0–2047).*

---
