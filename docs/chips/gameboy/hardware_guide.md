# Game Boy DMG-01 APU — Hardware Guide

The original Nintendo Game Boy (1989) shipped with the DMG-01, a custom 8-bit CMOS SoC whose audio processing unit (APU) has only four sound channels. Despite those tight constraints — actually *because* of them — the composers who worked on it developed a distinctive vocabulary that defined an entire generation of game music and became the foundation of the chiptune genre.

This guide covers the DMG-01 APU in precise technical detail.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [Channel 1 — Pulse with Sweep](#2-channel-1--pulse-with-sweep)
3. [Channel 2 — Pulse](#3-channel-2--pulse)
4. [Channel 3 — Wave](#4-channel-3--wave)
5. [Channel 4 — Noise](#5-channel-4--noise)
6. [Volume and Mixing](#6-volume-and-mixing)
7. [Timing and Clocks](#7-timing-and-clocks)

---

## 1. Hardware Architecture

The DMG-01 APU is mapped into the CPU address space at `$FF10`–`$FF3F`. All four channels feed into a left/right stereo mixer (NR51) and a master volume register (NR50) before reaching the headphone jack.

```
CH1 (Pulse + Sweep) ──┐
CH2 (Pulse)         ──┤──► Left/Right Mixer (NR51) ──► Master Volume (NR50) ──► Output
CH3 (Wave)          ──┤
CH4 (Noise)         ──┘
```

**Global constraints:**

| Constraint | Value |
|-----------|-------|
| Channels | 4 |
| CPU clock | 4.194304 MHz |
| Timer base | Derived from the CPU clock (4.194304 MHz); see per-channel frequency formulas |
| Volume resolution | 4 bits (0–15 per channel) |
| Stereo | Yes — each channel can be routed to L, R, or both |
| Filters / reverb / delay | None |
| Sampled audio | None |

Sound effects in Game Boy games used the same 4 channels as the background music. Composers had to write arrangements sparse enough to survive SFX interruptions cleanly — a practical constraint that drove minimalism and melodic clarity.

---

## 2. Channel 1 — Pulse with Sweep

### 2.1 Register Map

| Register | Address | Name | Function |
|----------|---------|------|----------|
| NR10 | `$FF10` | Sweep | Time, direction, shift |
| NR11 | `$FF11` | Length/Duty | Pulse width, sound length |
| NR12 | `$FF12` | Envelope | Initial volume, direction, period |
| NR13 | `$FF13` | Frequency Lo | Low 8 bits of period |
| NR14 | `$FF14` | Frequency Hi / Trigger | High 3 bits of period, trigger bit |

### 2.2 Pulse Width (Duty Cycle)

NR11 bits 6–7 select the pulse duty:

| Bits 7–6 | Duty | Waveform | Acoustic character |
|----------|------|----------|--------------------|
| `00` | 12.5% | `_______-` | Thin, nasal, cutting — "closed wah" |
| `01` | 25% | `______--` | Classic hollow square timbre |
| `10` | 50% | `____----` | Balanced, full-bodied |
| `11` | 75% | `__------` | Warm, dark (same spectrum as 25%, phase-inverted) |

The 50% duty square wave contains only odd harmonics (1st, 3rd, 5th…) and has the fullest perceived tone. The 12.5% wave is harmonically rich in higher partials, which gives it its bright, cutting quality — ideal for arpeggios and high-register leads.

### 2.3 Volume Envelope

The envelope unit steps volume by 1/15 on each tick of an internal divider. Volume can only increase or decrease linearly — no ADSR curve, only a one-direction ramp.

| NR12 bits | Meaning |
|-----------|---------|
| 7–4 | Initial volume 0–15 |
| 3 | Direction: 0 = decrease, 1 = increase |
| 2–0 | Period (0 = no change; 1–7 = ticks per step) |

A period of `0` locks volume at the initial level for the duration of the note. This is how sustained tones are held at a fixed amplitude. Short periods (`1` or `2`) create percussive decays. Long periods (`5`–`7`) create slow fades.

### 2.4 Frequency Sweep (CH1 Only)

Channel 1 is the only channel with a hardware frequency sweep unit. It automatically adjusts the period register over time, creating pitch slides without any software intervention.

$$\text{period}_{n+1} = \text{period}_n \pm \frac{\text{period}_n}{2^{\text{shift}}}$$

| NR10 bits | Meaning |
|-----------|---------|
| 6–4 | Sweep time (0 = disabled; 1–7 = step rate) |
| 3 | Direction: 0 = increase frequency, 1 = decrease |
| 2–0 | Shift (0–7; exponent for the period division) |

A sweep with direction=increase will raise the pitch (decreasing the period). Direction=decrease lowers it. Large shift values move pitch more aggressively per step.

**Common uses:** downward sweep on bass notes for a natural "settling" tone, upward sweep on short attack notes for a chirp or zap effect.

**Limitation:** If the sweep calculation causes the period to overflow beyond `$7FF` (2047), the channel silences itself. This kills notes at the extremes of the frequency range — a real hardware quirk that GB composers worked around by keeping sweeping notes away from the register limits.

### 2.5 Audible Range

Period registers are 11 bits (0–2047). The frequency formula:

$$f = \frac{131072}{2048 - \text{period}}$$

The standard period table covers C2–B7 (MIDI notes 36–107). The lower the period value, the lower the pitch; period = 0 produces approximately 64 Hz. Period values below ~44 produce frequencies too low to be useful on the small Game Boy speaker.

---

## 3. Channel 2 — Pulse

Channel 2 is identical to Channel 1 in all respects **except** it has no frequency sweep unit (NR20 does not exist; the address space is unused). It shares the same duty cycle, envelope, and frequency mechanics.

| Register | Address | Name |
|----------|---------|------|
| NR21 | `$FF16` | Length/Duty |
| NR22 | `$FF17` | Envelope |
| NR23 | `$FF18` | Frequency Lo |
| NR24 | `$FF19` | Frequency Hi / Trigger |

Because CH2 has no sweep, it is the most "neutral" tone source — predictable, no automatic pitch movement, suitable for sustained harmony or counter-melody.

### Acoustic difference from CH1

In practice CH1 and CH2 sound identical when playing the same note and duty. Some emulators and the original hardware exhibit a slight phase difference between the two pulse channels when they play the same pitch at the same duty — a very minor interference effect. Composers often exploited this by tuning CH2 slightly flat or sharp of CH1 to create a "chorus" or detune effect.

---

## 4. Channel 3 — Wave

### 4.1 Overview

The wave channel plays back a custom 32-nibble (4-bit) waveform stored in Wave RAM (`$FF30`–`$FF3F`). This is the most tonally flexible channel — it can produce any waveform that fits in 32 samples at 4-bit resolution — but it has several significant quirks.

| Register | Address | Name |
|----------|---------|------|
| NR30 | `$FF1A` | Sound on/off |
| NR31 | `$FF1B` | Sound length |
| NR32 | `$FF1C` | Output volume |
| NR33 | `$FF1D` | Frequency Lo |
| NR34 | `$FF1E` | Frequency Hi / Trigger |
| `$FF30`–`$FF3F` | — | Wave RAM (32 × 4-bit = 16 bytes) |

### 4.2 Wave RAM

Wave RAM holds 32 4-bit samples (nibbles), stored as 16 bytes with the high nibble played first. Values range 0–15. The channel reads through all 32 samples per period cycle.

```
Byte $FF30: [sample 0 high nibble | sample 1 low nibble]
Byte $FF31: [sample 2 high nibble | sample 3 low nibble]
...
Byte $FF3F: [sample 30 high nibble | sample 31 low nibble]
```

Writing to Wave RAM while the channel is active (NR30 bit 7 = 1) causes corruption on real DMG hardware. Composers and developers write to Wave RAM only while the channel is off between notes.

### 4.3 Output Volume

NR32 bits 6–5 control the output level with only four possible values — far coarser than the 16-step envelope available to CH1/CH2/CH4:

| NR32 bits 6–5 | Volume |
|----------------|--------|
| `00` | Mute |
| `01` | 100% (full) |
| `10` | 50% |
| `11` | 25% |

There is no envelope unit on CH3. Volume cannot automatically fade in or out per note. A "decay" effect must be achieved by rapidly re-triggering with a lower volume setting or by using software timing to change NR32 between rows.

### 4.4 Frequency

The frequency formula for CH3 is:

$$f = \frac{65536}{2048 - \text{period}}$$

Note that CH3's formula uses **65536** in the numerator, not 131072 as for the pulse channels. This means CH3 plays **one octave lower** than CH1/CH2 at the same period register value. A period that produces C4 on a pulse channel produces C3 on the wave channel. Composers always compensated by writing wave channel parts one octave higher in the score.

### 4.5 The Wave Channel Pop

When CH3 is triggered, a hardware bug on the original DMG causes the first sample output to be corrupted by a stale value from the internal wave position counter. This manifests as a click or pop at the start of each note. The GBC (Game Boy Color) has a different but related artifact. Trackers and toolchains work around this by careful trigger timing, pre-conditioning the channel, or by designing waveforms that start near the DC midpoint (sample value ~7–8).

### 4.6 Waveform Design

Because the channel plays back any arbitrary 32-sample waveform, composers and sound designers hand-crafted wave shapes for specific tonal targets:

| Target sound | Waveform strategy |
|-------------|-------------------|
| Bass | Smooth, symmetric shapes (triangle-like) — low harmonic content |
| Pads | Mid-harmonic density, gentle asymmetry for warmth |
| Marimba / bell | Peaked shape with fast initial transient |
| Metallic / harsh | Asymmetric, high-harmonic content |

High-harmonic waveforms alias at high pitches, producing out-of-tune artifacts. Wave sounds used for melody or bass lines typically use smoother shapes to avoid audible aliasing.

---

## 5. Channel 4 — Noise

### 5.1 Register Map

| Register | Address | Name |
|----------|---------|------|
| NR41 | `$FF20` | Sound length |
| NR42 | `$FF21` | Envelope |
| NR43 | `$FF22` | Polynomial counter (LFSR) |
| NR44 | `$FF23` | Trigger / length enable |

### 5.2 LFSR Mechanism

CH4 generates pseudo-random noise by clocking a Linear Feedback Shift Register (LFSR). The XOR feedback path can be configured for two widths:

| LFSR width | NR43 bit 3 | Noise character |
|-----------|------------|-----------------|
| 15-bit | `0` | Long period, white-noise quality, continuous hiss |
| 7-bit | `1` | Short period, repeating — buzzy, more "pitched" tonality |

The LFSR is clocked at a rate controlled by NR43 bits 6–4 (shift clock frequency) and bits 2–0 (dividing ratio). Higher shift frequency = higher-pitched noise; lower = lower-pitched, rumbling noise.

### 5.3 Envelope

CH4 uses the same envelope mechanism as CH1/CH2 (NR42, same bit layout as NR12/NR22). This is the primary way to shape percussive sounds — a fast decaying envelope converts noise into snare hits, hi-hats, or kick-like thumps.

### 5.4 Emulating Drum Sounds

CH4 cannot produce pitched tones. All drum synthesis is achieved by combining LFSR width, shift frequency, and envelope decay time:

| Drum sound | LFSR | Volume level | Envelope period | Notes |
|-----------|------|-------------|-----------------|-------|
| Snare | 7-bit | 13–15 | 1 (fast) | Short burst of buzzy noise |
| Hi-hat (closed) | 15-bit | 6–8 | 1 | Very short white noise burst |
| Hi-hat (open) | 15-bit | 8–10 | 3–4 | Slightly longer decay |
| Kick illusion | 7-bit | 14–15 | 5–6 | Low shift freq, slow decay |
| Crash | 15-bit | 12–14 | 6–7 | Long white-noise decay |
| Rim / click | 7-bit | 10 | 1 | Very short buzzy transient |

---

## 6. Volume and Mixing

### 6.1 Per-Channel Panning (NR51)

Each channel can be routed independently to the left output, the right output, both, or neither:

| NR51 bit | Channel / Side |
|----------|----------------|
| 7 | CH4 → Left |
| 6 | CH3 → Left |
| 5 | CH2 → Left |
| 4 | CH1 → Left |
| 3 | CH4 → Right |
| 2 | CH3 → Right |
| 1 | CH2 → Right |
| 0 | CH1 → Right |

Composers used hard panning to give each channel its own space in the stereo field — melody hard right, harmony hard left, bass centre — to create perceived width from just 4 voices.

### 6.2 Master Volume (NR50)

NR50 bits 6–4 control right output volume and bits 2–0 control left output volume (each 0–7). Bits 7 and 3 enable Vin (external sound from cartridge hardware, rarely used). Effective master volume is applied after individual channel volumes.

### 6.3 Volume Coarseness

Each channel envelope has 16 levels (0–15). Mapped to a linear scale, the steps are audibly coarse. Composers compensated by:

- **Layering:** two channels at volume 7 sound subjectively "fuller" than one at 14
- **Envelope variation:** staggering envelope periods so channels don't all decay in sync, smoothing perceived dynamics
- **Rapid retriggering:** re-triggering a note at a lower volume level mid-note (software-enforced pseudo-envelope)

---

## 7. Timing and Clocks

### 7.1 Frame Sequencer

The APU frame sequencer runs at 512 Hz (every 8192 CPU cycles) and steps through an 8-step sequence (0–7). Per-cycle clocks are derived from this base rate:

- Length counter (256 Hz): clocked on steps 0, 2, 4, 6
- Sweep (CH1 only, 128 Hz): clocked on steps 2 and 6
- Envelope (64 Hz): clocked once per sequence on step 7

In sequence form (512 Hz steps):

| Step | Clocks |
|------|--------|
| 0 | Length |
| 1 | — |
| 2 | Length, Sweep |
| 3 | — |
| 4 | Length |
| 5 | — |
| 6 | Length, Sweep |
| 7 | Length, Envelope |

This means envelope updates happen at 64 Hz and sweep updates at 128 Hz — not at the sample rate. Envelope period values are multiples of 1/64 s (≈ 15.6 ms per step).

### 7.2 Note Frequency Resolution

Because the period register is only 11 bits wide, available frequencies do not fall exactly on equal-temperament pitches at all octaves. The deviation is small enough to be inaudible in most contexts, but at the lowest octave (C2–B2) the quantisation error between adjacent period values is large enough to cause noticeable detuning, especially on the pulse channels.

### 7.3 Sequencer Timing and BPM

The Game Boy has no hardware tempo unit. Tempo is entirely a software concern — the game's music driver decides how many CPU cycles (or vblank interrupts, typically 60 Hz) to wait between advancing the pattern sequencer. Most GB games based their music on the 59.73 Hz vblank interrupt, ticking the sequencer at integer multiples of that period.

Trackers like hUGETracker and LSDJ implement their own BPM-to-tick mapping on top of this. Because the vblank is fixed at ~60 Hz, BPM values that don't divide evenly into 60 (or 120) produce slight swing or tempo drift across bars — a subtle characteristic of authentic GB music.

---
