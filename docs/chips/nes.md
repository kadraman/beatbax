# NES Ricoh 2A03 APU — Hardware Reference and Composition Guide

The Nintendo Entertainment System (1983, North America 1985) used the Ricoh 2A03 CPU, a modified MOS 6502 with an integrated Audio Processing Unit (APU). With five channels — two pulse oscillators, a triangle wave, a noise generator, and a delta-modulation sampler — the 2A03 APU offered composers a richer palette than its contemporary rivals, yet remained tightly constrained by the hardware of its era. Those constraints produced some of the most recognisable music in video game history.

This guide covers the 2A03 APU in precise technical detail, the acoustic character of each channel, and the compositional techniques that emerged to exploit and work around its limitations — aligned with BeatBax instrument fields and song authoring conventions.

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
9. [Composition Techniques](#9-composition-techniques)
10. [Channel Roles in Practice](#10-channel-roles-in-practice)
11. [Why These Techniques Still Matter](#11-why-these-techniques-still-matter)

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
| Volume resolution | 4 bits (0–15 per channel) |
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

The linear counter is a short note duration counter clocked at 240 Hz (4× the envelope clock rate). Its primary purpose is to cut a note short after a specified number of 240 Hz ticks. This allows very short triangle "pings" useful for percussion imitation.

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

The NES APU frame sequencer can operate in two modes, selected by bit 7 of `$4017`:

**4-step mode (mode 0):**

| Step | Rate | Triggered units |
|------|------|-----------------|
| 1 | 240 Hz | Envelope, linear counter |
| 2 | 120 Hz | Envelope, linear counter, sweep, length counter |
| 3 | 240 Hz | Envelope, linear counter |
| 4 | 60 Hz | Envelope, linear counter, sweep, length counter + optional IRQ |

**5-step mode (mode 1):**

| Step | Rate | Triggered units |
|------|------|-----------------|
| 1 | 240 Hz | Envelope, linear counter |
| 2 | 120 Hz | Envelope, linear counter, sweep, length counter |
| 3 | 240 Hz | Envelope, linear counter |
| 4 | — | (no clock) |
| 5 | 96 Hz | Envelope, linear counter, sweep, length counter |

In 5-step mode, no IRQ is generated, and the sequence period is slightly longer (192 Hz fundamental vs 240 Hz). This mode was used when games needed the extra timing precision without frame IRQ interference.

Envelope clocks: **240 Hz** in 4-step, **192 Hz** effective in 5-step.
Sweep clocks: **120 Hz** in 4-step, **96 Hz** in 5-step.

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

## 9. Composition Techniques

The following techniques were developed by NES composers to exploit the hardware's strengths and navigate its limitations. Many directly parallel Game Boy techniques but are adapted to the NES's 5-channel architecture.

---

### 9.1 Arpeggios — Extended Harmony

**The problem:** 5 channels sounds rich, but with bass, melody, counter-melody, percussion (noise), and optionally DMC samples, there are rarely spare channels for chord voicing.

**The technique:** Rapid cycling of chord tones on a single pulse channel — identical in principle to the Game Boy arpeggio technique but with a subtly different acoustic character. NES pulse arpeggios at 50% duty have a warmer, slightly more rounded quality than GB pulse arpeggios, due to the non-linear mixer.

**Arpeggio timing:** At 150 BPM with 1/16 steps, each step is 100 ms. At 200 BPM it is 75 ms. Most NES composers used 2 or 3 arpeggio offsets; 4-note arpeggios are used for diminished seventh and sus4 chord patterns.

**Common patterns:**

| Pattern | Interval | Sound character |
|---------|----------|-----------------|
| Root–5th–root | Perfect fifth | Open, wide, driving |
| Root–3rd–5th | Major triad | Bright, classic NES |
| Root–♭3rd–5th | Minor triad | Darker, emotional |
| Root–5th–♭7th | Dominant 7th | Tense, unresolved |
| Root–3rd–5th–3rd | Major with return | Smooth, rocking |

**Famous examples:**
- *Mega Man 2* — Dr. Wily Stage 1: relentless 3-note arpeggios on Pulse 1 throughout the main theme
- *Castlevania* — Vampire Killer: power chord arpeggios on Pulse 1 paired with melodic counter-motion on Pulse 2
- *Ninja Gaiden* — Act 1-1: layered arpeggios on both pulse channels create a dense, energetic texture

---

### 9.2 Duty Cycle Modulation — Timbral Palette

**The problem:** No filters, no FM, no velocity sensitivity. The only timbral variation on the pulse channels is duty cycle selection.

**The technique:** Switching duty values between notes, phrases, or sections to animate the perceived timbre. This is more impactful on the NES than the Game Boy because the non-linear pulse mixer gives NES duty timbres a characteristic "punch" that the GB pulse channels lack.

**Timbral palette:**

| Duty | Register feel | Best use case |
|------|--------------|--------------|
| 12.5% | Thin, nasal, cutting | Attack transients, SFX-like leads, metallic stabs |
| 25% | Classic NES lead | Melody, arpeggios, most lead lines |
| 50% | Full, warm square | Sustained harmony, bass (if triangle occupied), pads |
| 75% | Similar to 25% with phase inversion | Rarely used intentionally |

**Per-phrase modulation:** Switching from 12.5% on rapid approach notes to 25% on the peak note and back mimics the harmonic "bloom" of acoustic instruments as they attack and sustain.

**Famous examples:**
- *Mega Man 3* — Title Theme: Pulse 1 alternates duty on each phrase boundary
- *Battletoads* — Level 1: duty cycling on Pulse 2 provides the "growl" character of the bass line

---

### 9.3 Pulse + Triangle Layering — Bass Reinforcement

**The problem:** The triangle channel has no volume control and a relatively low perceived level in the non-linear mix. Bass parts on the triangle alone can feel thin.

**The technique:** Doubling the triangle bass line on one of the pulse channels at a lower duty (50%) and higher octave, then mixing to taste. The pulse harmonic content adds brightness above the triangle's fundamental, giving bass notes more perceived definition and "snap".

**Implementation:**
- Triangle: note at target pitch, constant (no envelope)
- Pulse 2: same note one octave higher, 50% duty, fast decay envelope

This gives a "thump" from the pulse attack envelope while the triangle provides the sustained fundamental — combining the transient character of a plucked string with the warmth of a bowed bass.

**Famous examples:**
- *Contra* — Jungle Theme: triangle bass doubled by Pulse 2 at 1-octave offset gives the bass line its distinctive punch
- *Mega Man 2* — Flash Man Stage: triangle bass reinforced by Pulse 2 for fullness in the lower register

---

### 9.4 Sweep-Driven Sound Effects

**The problem:** The NES supports only two channels of pitch slides natively (both pulse channels have sweep units). Sound effects need quick pitch gestures without occupying the melody or harmony channels.

**The technique:** Using the hardware sweep unit on Pulse 1 or Pulse 2 to produce rapid descending pitch sweeps — the signature "laser" and "explosion" sounds of NES games. In music, sweep is used for:

- **Bass line drop:** steep downward sweep on a bass note to imply a falling gesture
- **Rising intro stab:** fast upward sweep on a short attack note before the main melody enters
- **Portamento:** very slow sweep to simulate note-to-note glide on melodic phrases

**Sweep parameter recipe:**

| Effect | Enable | Period | Negate | Shift |
|--------|--------|--------|--------|-------|
| Fast laser down | 1 | 2 | 0 (up, lowers pitch) | 3 |
| Slow bend down | 1 | 6 | 0 | 1 |
| Fast chirp up | 1 | 2 | 1 | 3 |
| Slow portamento | 1 | 7 | depends | 0 |

**Note on negate direction:** NES negate flag `0` means "add to period" which **raises** the period value, which **lowers** the pitch. This is counter-intuitive and a common source of confusion. In BeatBax, sweep direction is specified as `sweep_dir=up` or `sweep_dir=down` in natural terms.

---

### 9.5 Triangle as a Percussion Supplement

**The problem:** CH4 (noise) can only produce noise-based percussion. The NES has no hardware that naturally produces a pitched kick drum.

**The technique:** Using the triangle channel's linear counter to generate very short percussive "pings" or "thumps" that complement the noise channel percussion. A triangle note at C2 or D2 lasting 1–2 rows creates a low-pitched "thud" that reinforces a kick drum pattern — the defining bass drum technique of NES music.

**Kick reinforcement recipe:**
- Noise channel: period 12–14, fast decay envelope — white noise low-frequency thump
- Triangle: same beat, C2 (period ~681), length counter = 2 ticks

The combination is perceptually interpreted as a single kick event with both punch (noise) and pitch (triangle), approximating an acoustic kick drum. This was one of the most widely used drum synthesis techniques on the NES and is clearly audible in nearly every major NES game soundtrack.

**Famous examples:**
- *Mega Man 2* — Nearly all tracks: triangle+noise kick combination throughout
- *Super Mario Bros. 3* — Overworld Theme: triangle "taps" reinforce the noise kick drum
- *Castlevania III* — Beginning: low triangle notes on kick beats create the dramatic weight of the bass drum

---

### 9.6 Melodic Use of the Triangle

**The problem:** The triangle has no envelope and no volume control. Long notes are sustained at fixed volume; short notes can sound abrupt. Its lack of timbral flexibility would seem to limit it to pure bass utility.

**The technique:** Despite its constraints, the triangle channel's smooth harmonic profile makes it an effective melody instrument in specific contexts — particularly for:

- **Flute-like leads:** at mid-range pitches (C4–C6) the triangle's soft harmonics and quantisation noise produce a breathy, flute-ish quality not achievable with pulse channels
- **Bell-like attack sounds:** with software-gated short durations, the triangle produces a clean, metallic "ping" useful for celesta or xylophone imitation
- **Ambient pads:** the triangle sustains at fixed volume indefinitely when the length counter is halted — effective for long drone notes under melodic activity on the pulse channels

**Famous examples:**
- *The Legend of Zelda* — Dungeon Theme: triangle carries the main melody, creating the eerie, flute-like atmosphere
- *Metroid* — Kraid's Lair: triangle melody over noise-based percussion creates the alien, cold atmosphere
- *Final Fantasy* — Main Theme: triangle carries melody sections while pulse channels handle harmony

---

### 9.7 Volume Envelope as Expression

**The problem:** No velocity, no per-note dynamics, only 16 volume levels with linear decay only (no ADSR curve).

**The technique:** Programming distinct envelope shapes for each "instrument" type to give notes different articulation characters. On the NES, envelope variety creates the illusion of a wider instrumental palette:

| Envelope | Instrument character | Application |
|----------|---------------------|-------------|
| Constant volume 8–12 | Organ / sustained pad | Harmony, background chords |
| Period 2, initial 13 | Plucked string | Melody, arpeggios |
| Period 1, initial 15 | Staccato attack | Fast runs, rhythmic patterns |
| Period 5, initial 12 | Bowed string (approximation) | Slow melodic passages |
| Period 0, loop | Looped saw-shape LFO | Tremolo effect, wavering volume |

The envelope loop flag creates a repeating sawtooth volume envelope — the cheapest tremolo available on the hardware. At slow rates it creates a vibrato-like wobble; at fast rates it produces a "motorised" buzzing timbre.

**Famous examples:**
- *Mega Man 2* — Quick Man Stage: rapid envelope switching between notes creates the impression of legato phrasing on a 12.5% duty lead
- *Castlevania* — themes use carefully tuned envelope periods to distinguish "guitar" tones on Pulse 1 from "bass" tones on Pulse 2

---

### 9.8 Vibrato — Software LFO

**The problem:** Static sustained notes on pulse channels have no natural modulation. Long notes sound mechanical without expressive pitch variation.

**The technique:** Software-driven frequency register modulation — identical in principle to the Game Boy vibrato technique but adapted to the NES's 11-bit period register and 60 Hz (or 240 Hz) tick rate.

**Parameter ranges:**

| Parameter | Typical values | Effect |
|-----------|---------------|--------|
| Depth | ±1–6 period units | Subtle wobble to wide warble |
| Rate | 4–8 Hz | Slow vocal vibrato to fast mechanical tremolo |
| Waveform | Sine, triangle, square | Sine = natural; square = harsh; triangle = mechanical |
| Onset delay | 0–3 rows | Delayed vibrato sounds more vocal and expressive |

**NES-specific note:** The period register's non-linear pitch-to-period mapping means that equal period increments above and below the target pitch produce slightly asymmetric pitch deviation. For precise vibrato, NES music drivers look up pre-computed period-offset tables rather than doing arithmetic directly on the register value.

**Famous examples:**
- *Ninja Gaiden* — character themes: vibrato onset delay of ~2 rows on melody notes creates a singing quality
- *Contra* — Stage 1: vibrato on sustained pulse notes contrasts with the staccato drum patterns for dramatic dynamic

---

### 9.9 Noise Channel Rhythm Programming

**The problem:** The noise channel has 16 fixed "pitches" and one mode flag. Creating realistic drum patterns requires disciplined parameter switching.

**The technique:** Assigning specific noise period values to specific drum roles, then switching parameters on every hit to give each element a consistent identity across the track. Most NES composers established a small "drum kit" of 2–5 noise settings used consistently throughout the song.

**Common drum kit presets:**

| Kit element | Mode | Period | Envelope period | Initial volume |
|-------------|------|--------|-----------------|----------------|
| Kick (noise part) | 0 | 12 | 3 | 15 |
| Snare | 0 | 6 | 1 | 14 |
| Closed hi-hat | 0 | 3 | 0 | 8 |
| Open hi-hat | 0 | 4 | 4 | 8 |
| Crash | 0 | 3 | 8 | 12 |

Programming the noise channel requires thinking about the entire bar as a sequence of parameter writes, not just note triggers. The characteristic NES drum feel comes from the precise timing of these parameter changes relative to the envelope clock.

**Famous examples:**
- *Mega Man 2* — All stages: the iconic noise drum pattern uses period 6 snare and period 3 hi-hat with fast envelopes
- *Super Mario Bros. 3* — Overworld: noise parameters are changed on every 8th note to create the shuffling, live-sounding percussion

---

### 9.10 DMC for Bass Reinforcement

**The problem:** The triangle channel provides bass but has no attack transient — its volume cannot ramp up. Punchy bass requires a transient.

**The technique:** Using short, low-rate DMC samples — typically just 8–32 bytes — looped or triggered on every bass note to add a "boom" transient under the triangle's sustained fundamental. The DMC sample is often just a single period of a sine or sawtooth waveform at a very low playback rate, which produces a sub-bass "hit" that lasts 10–30 ms.

This was a standard technique in late-era NES game soundtracks (1991–1994) when developers became sophisticated enough to budget ROM space for DMC assets. Earlier titles (1985–1988) rarely used DMC for musical purposes.

**ROM cost:** A 32-byte DMC sample at rate index 7 (8363 Hz) lasts approximately 3.8 ms — barely perceptible as a transient. At rate index 0 (4182 Hz), 64 bytes produces about 12 ms of bass hit — more useful but still very short.

**Famous examples:**
- *Battletoads* — Stage themes: DMC bass samples reinforce triangle bass for a much more powerful low end than early-era NES titles
- *Ninja Gaiden III* — DMC kicks and bass hits give the soundtrack a weight not found in Ninja Gaiden I/II

---

### 9.11 The "Two-Square" Chord Technique

**The problem:** With two pulse channels carrying harmony, the maximum simultaneous chord density is an interval (two notes). Full three-voice chords require an arpeggio or the triangle.

**The technique:** Voicing two-note intervals for maximum harmonic richness. Intervals in order of harmonic weight on the NES non-linear mixer:

| Interval | Character | Use case |
|----------|-----------|---------|
| Octave | Strongest reinforcement | Unison bass + lead |
| Perfect fifth | Open, powerful | Power chord feel |
| Major third | Warm | Happy, bright themes |
| Minor third | Melancholic | Sad, dramatic themes |
| Major sixth | Airy, rich | Resolution, final chords |
| Minor seventh | Tense | Suspense, approach notes |
| Tritone | Maximum tension | Horror, urgency |

Because the NES mixer is non-linear, the perceived "loudness" of two-square voicings depends on both pitch and duty choice. Composers tuned voicings not only by interval but also by duty combination — Pulse 1 at 25% and Pulse 2 at 50% creates a notably different combined timbre than both at 25%.

**Famous examples:**
- *Mega Man 2* — Air Man Stage: perfect fifth voicing on Pulse 1/2 throughout main melody
- *Final Fantasy* — Battle Theme: major third and perfect fifth intervals drive the harmonic language

---

### 9.12 Repetition and Variation

**The problem:** NES cartridges had ROM constraints (32 KB to 1 MB). Music drivers consumed PRG-ROM space. Complex arrangements demanded large pattern tables.

**The technique:** Short 4–8 bar loops with structured variation — the same principle as the Game Boy, but the NES's 5-channel arrangement allowed subtler variation. Composers could vary one channel (e.g., change the harmony interval on Pulse 2) while leaving the other four unchanged, creating perceived variation without new patterns.

**ROM-efficient techniques:**

- **Transposition tables:** store one pattern, use a transposition offset per repetition
- **Pattern pointers:** reuse the same drum/bass pattern across multiple song sections
- **Channel-level flags:** enable/disable channels on a per-bar basis to create breakdowns and builds

**Famous examples:**
- *Tetris* — Type B: 8-bar loop with subtle pulse duty changes every 4 bars
- *Mega Man 2* — Dr. Wily Stage 2: the main 4-bar riff is repeated 16 times with single-bar variation inserts

---

### 9.13 Software Macros — Per-Frame Envelope Automation

**The context:** BeatBax implements FamiStudio/FamiTracker-style software macros — per-note frame-accurate envelope sequences that run at the NES frame rate (60 Hz NTSC). Unlike the hardware envelope (which uses a fixed-period decrement), software macros give you arbitrary, programmable sequences at full 60 Hz resolution.

Four macro types are available, declared as instrument properties:

| Macro | Applied to | Description |
|-------|------------|-------------|
| `vol_env` | pulse1, pulse2, noise | Volume level (0–15) per frame |
| `duty_env` | pulse1, pulse2 | Duty cycle index (0–3) per frame (0=12.5%, 1=25%, 2=50%, 3=75%) |
| `arp_env` | pulse1, pulse2, triangle | Semitone offset per frame (0 = root; higher = transposed up) |
| `pitch_env` | pulse1, pulse2, triangle | Absolute pitch offset in semitones per frame |

**Syntax:** Macros are declared as a bracketed comma-separated value list, optionally followed by a loop point using `|N`:

```
vol_env=[15,12,8,4,2,1]          ; play once, hold last value (no loop)
vol_env=[1,2,3,4,5,6,7,8,9,10|9] ; play to end, then loop from index 9 forever
arp_env=[0,4,7|0]                  ; C-E-G major triad cycling continuously
pitch_env=[5,4,3,2,1,0,0,0]       ; fall 5 semitones down to root on attack
duty_env=[2,2,2,2,0,0,0,0|0]      ; alternate between 50% (warm) and 12.5% (thin)
```

**Loop point:** The `|N` suffix sets the index to return to when the sequence ends. Index 0 = return to the beginning (infinite loop); any other index creates a partial loop (attack-then-sustain-loop pattern).

**Macro timing:** One frame = 1/60 second (~16.7 ms) on NTSC. A 10-frame `vol_env` decays over ~167 ms regardless of the BPM or `ticksPerStep` setting. Macros reset on every `noteOn`.

**Common patterns:**

```bax
; Attack-only pitch rip — each note "falls in" 5 semitones from above
inst i_rip  type=pulse1  duty=25  vol=10  pitch_env=[5,4,3,2,1,0,0,0]

; Percussion decay on noise kick (faster than hardware env allows)
inst kick   type=noise   noise_mode=normal  noise_period=12  vol_env=[15,12,8,4,2,1]

; Cycling major triad arpeggio at 60 Hz
inst arp    type=pulse2  duty=50  vol=10  arp_env=[0,4,7|0]

; Timbre wah — oscillate between 50% (warm) and 12.5% (thin) duty
inst wah    type=pulse1  duty=50  vol=10  duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0]

; Volume swell — slow attack from silence to full over 10 frames, then hold
inst swell  type=pulse1  duty=25  vol_env=[1,2,3,4,5,6,7,8,9,10|9]
```

**Interaction with hardware envelope:** Software macros (e.g. `vol_env`) and hardware envelope (`env` + `env_period`) are mutually exclusive — if `vol_env` is present on an instrument, it overrides the `env` decay. Use `vol` (constant) or `vol_env` for macro-driven volumes; use `env` + `env_period` for hardware-mapped envelope when not using macros.

**Demo song:** See `songs/nes/*.bax` for a complete demonstration.

---

## 10. Channel Roles in Practice

The following de facto standard emerged across professional NES soundtracks:

| Channel | Predominant role | Secondary role |
|---------|-----------------|----------------|
| Pulse 1 | Lead melody | Arpeggios, sweep effects |
| Pulse 2 | Counter-melody / harmony | Rhythmic chords, bass (rare) |
| Triangle | Bass | Kick reinforcement, melodic flute (rare) |
| Noise | Percussion (kick, snare, hi-hat) | White noise atmospherics |
| DMC | Bass reinforcement / drum samples | Voice clips, atmospheric textures |

### Variations by Genre

**Action / Platformer (Mega Man, Castlevania, Ninja Gaiden):**
- Pulse 1: aggressive lead melody, 25% duty, fast arpeggios
- Pulse 2: power chord harmony, fifth intervals, some sweeping
- Triangle: steady bass line, kick reinforcement
- Noise: driving drum pattern, emphasis on snare on beats 2 and 4
- DMC: rarely used in early titles; used for bass hits in later entries

**RPG / Adventure (Final Fantasy, Zelda, Dragon Quest):**
- Pulse 1: smooth melodic lead, 25–50% duty, moderate vibrato
- Pulse 2: sustained harmony, 50% duty, slow envelope
- Triangle: bass line + occasional melodic passages (Zelda dungeon theme)
- Noise: gentle percussion, sparse hi-hat
- DMC: ambient textures, string ensemble samples in late-era titles

**Horror / Atmospheric (Castlevania sections, Metroid):**
- Pulse 1: sparse, high-register melody, 12.5% duty (nasal, unsettling)
- Pulse 2: slow-moving harmony, often tritone or minor seventh intervals
- Triangle: drone or slow bass movement
- Noise: long, slow-decay crash atmospherics, no regular rhythm
- DMC: atmospheric drones, static textures

### The "Impossible Arrangement" Problem on NES

With 5 channels (4 tonal + 1 noise), the NES has one more voice than the Game Boy but the fundamental problem remains: complex arrangements demand more than 4 simultaneous pitched events. Resolution strategies:

1. **Melodic reduction** — simplify harmony to a single sustained third or fifth on Pulse 2
2. **Alternating bass** — share bass duties between triangle and Pulse 2, alternating on alternating beats
3. **Percussion sacrifice** — drop noise channel drum pattern during dense melodic passages
4. **DMC as bass** — use DMC for bass samples, freeing triangle for a third melodic voice
5. **Arpeggio chords** — rapid cycling of a chord on Pulse 1 or 2 to imply 3-voice harmony from a single channel

---

## 11. Why These Techniques Still Matter

Every technique in this guide, like those from the Game Boy era, emerged from constraint. The Ricoh 2A03 cannot do reverb, cannot do polyphony beyond 4 simultaneous pitches, cannot do velocity, cannot do arbitrary waveforms (triangle is fixed), and produces mono output. Those limits generated a compositional discipline that remains instructive:

- **Harmonic economy** — two pulse channels force the choice of exactly which interval most clearly communicates the intended harmony
- **Rhythmic drive from texture** — without dynamics or velocity, rhythm is communicated through envelope shape, note duration, and duty modulation
- **Bass as foundation** — the triangle's permanent presence in the non-linear mix encourages always maintaining a bass line; NES music is rarely "bass-less"
- **Timbral intention** — four duty settings, three noise modes, and one waveform. Every timbral choice is deliberate because there is no other option
- **Memory efficiency** — ROM constraints forced composers to think in loops, variations, and compressed representations — skills directly applicable to generative music, live coding, and algorithmic composition

The chiptune genre that emerged from the NES APU remains a major influence on indie game audio, lo-fi hip-hop, electronic music production, and sound design education. The 2A03 APU's constraint-driven aesthetic — energetic, immediate, rhythmically precise, and harmonically direct — continues to define what "retro game music" sounds like to most of the world.

---

## Appendix A — NTSC Period Table (A4 = 440 Hz)

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

## Appendix B — BeatBax NES Instrument Field Reference

When composing for the NES chip in BeatBax (`chip nes`), use the following instrument parameters:

### Pulse 1 and Pulse 2

```
inst lead type=pulse1 duty=25 env=12,down vol=12
inst harm type=pulse2 duty=50 env=8,down vol=10
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `pulse1`, `pulse2` | Channel assignment |
| `duty` | `12`, `25`, `50`, `75` | Pulse duty as a percentage |
| `env` | `N,up\|down` | Initial volume (0–15), envelope direction |
| `env_period` | `0`–`15` | Envelope decay period (0 = fastest) |
| `env_loop` | `true\|false` | Loop envelope (repeating sawtooth volume LFO) |
| `vol` | `0`–`15` | Constant volume (disables envelope decay) |
| `vol_env` | `[v0,v1,…\|loop]` | Software volume macro: per-frame levels 0–15; optional `\|N` loop point |
| `arp_env` | `[0,s1,s2,…\|loop]` | Software arpeggio macro: per-frame semitone offsets (0 = root); looping for chords |
| `pitch_env` | `[s0,s1,…\|loop]` | Software pitch macro: per-frame absolute semitone offset from root |
| `duty_env` | `[d0,d1,…\|loop]` | Software duty macro: per-frame duty index (0=12.5%, 1=25%, 2=50%, 3=75%) |
| `note` | note name (e.g. `C5`) | Default pitch when instrument name is used as a pattern token |
| `sweep_en` | `true\|false` | Enable hardware sweep unit |
| `sweep_period` | `1`–`7` | Sweep divider period |
| `sweep_dir` | `up\|down` | Sweep pitch direction (up = higher pitch, down = lower) |
| `sweep_shift` | `0`–`7` | Sweep shift count (exponent) |

### Triangle

```
inst bass type=triangle
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `triangle` | Channel assignment |
| `vol` | `0` or omitted | Software gate only — `vol=0` silences the channel (software mute, not hardware-authentic); any other value, including omitting `vol`, produces full amplitude. Triangle has no hardware volume control. |
| `linear` | `1`–`127` | Linear counter duration in ticks |

### Noise

```
inst kick  type=noise noise_mode=normal noise_period=12 env=15,down env_period=3
inst snare type=noise noise_mode=normal noise_period=6  env=14,down env_period=1
inst hihat type=noise noise_mode=normal noise_period=3  env=8,down  env_period=0
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `noise` | Channel assignment |
| `noise_mode` | `normal`, `loop` | LFSR feedback mode (normal = 15-bit, loop = short LFSR) |
| `noise_period` | `0`–`15` | Noise frequency preset (see period table in §5.2) |
| `env` | `N,up\|down` | Initial volume and envelope direction |
| `env_period` | `0`–`15` | Envelope decay rate |
| `vol_env` | `[v0,v1,…\|loop]` | Software volume macro: per-frame levels 0–15; overrides `env` when present |
| `note` | note name (e.g. `C5`) | Default pitch when instrument name is used as a pattern token (noise pitch is timbral, not tonal) |

### DMC

```
inst bass_hit type=dmc dmc_rate=7 dmc_loop=false dmc_sample="bass_c2.dmc"
```

| Field | Values | Description |
|-------|--------|-------------|
| `type` | `dmc` | Channel assignment |
| `dmc_rate` | `0`–`15` | Playback rate index (see §6.3) |
| `dmc_loop` | `true\|false` | Loop sample continuously |
| `dmc_level` | `0`–`127` | Initial DAC level |
| `dmc_sample` | `"@nes/<name>"`, `"local:<path>"`, `"https://…"`, `"github:owner/repo/path"` | Sample reference: bundled library, local file (CLI only), remote URL, or GitHub shorthand |

---

## Appendix C — BeatBax NES Song Example

The example below shows a complete NES song using hardware envelopes, software macros (`vol_env`, `arp_env`), named instrument tokens, and sectioned sequences:

```bax
chip nes
bpm 150

; ── Instruments ──────────────────────────────────────────────
; Pulse lead with pitch-rip macro on every note attack
inst lead   type=pulse1  duty=25  vol=10  pitch_env=[3,2,1,0,0,0,0,0]
; Pulse harmony with cycling major-triad arpeggio
inst harm   type=pulse2  duty=50  vol=8   arp_env=[0,4,7|0]
; Triangle bass (no volume envelope)
inst bass   type=triangle
; Noise drum kit — named tokens using note= for shorthand triggers
inst kick   type=noise  noise_mode=normal  noise_period=12  vol_env=[15,12,8,4,2,1]  note=C5
inst snare  type=noise  noise_mode=normal  noise_period=6   vol_env=[14,10,6,3,1]    note=C5
inst hihat  type=noise  noise_mode=normal  noise_period=3   env=8,down  env_period=0 note=C5

; ── Patterns ─────────────────────────────────────────────────
pat melody   = C5 . E5 . G5 . E5 .
pat counter  = G4 A4 B4 . G4 . F#4 .
pat bassline = C3 . G2 . C3 . G2 .
; Drum pattern using named instrument tokens (note= on each drum handles the pitch)
pat beat     = kick . snare . kick . hihat hihat

; ── Sectioned sequences ──────────────────────────────────────
seq lead_main   = melody melody counter melody
seq harm_intro  = counter:inst(harm)
seq harm_main   = counter melody counter melody
seq bass_main   = bassline bassline bassline bassline
seq drum_main   = beat beat beat beat

; ── Channels ─────────────────────────────────────────────────
channel 1 => inst lead   seq harm_intro lead_main
channel 2 => inst harm   seq harm_intro harm_main
channel 3 => inst bass   seq bass_main
channel 4 => inst kick   seq drum_main

play
```

---

*This document is part of the BeatBax hardware reference library. For the Game Boy DMG-01 APU, see [`gameboy.md`](gameboy.md). For the chip plugin architecture, see [`/docs/features/plugin-system.md`](../features/plugin-system.md).*
