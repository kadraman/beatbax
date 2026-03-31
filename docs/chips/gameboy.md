# Game Boy DMG-01 APU — Hardware Reference and Composition Guide

The original Nintendo Game Boy (1989) shipped with the DMG-01, a custom 8-bit CMOS SoC whose audio processing unit (APU) has only four sound channels. Despite those tight constraints — actually *because* of them — the composers who worked on it developed a distinctive vocabulary that defined an entire generation of game music and became the foundation of the chiptune genre.

This guide covers the hardware in precise technical detail, the acoustic character of each channel, and the compositional techniques that emerged to work around its limitations.

---

## Contents

1. [Hardware Architecture](#1-hardware-architecture)
2. [Channel 1 — Pulse with Sweep](#2-channel-1--pulse-with-sweep)
3. [Channel 2 — Pulse](#3-channel-2--pulse)
4. [Channel 3 — Wave](#4-channel-3--wave)
5. [Channel 4 — Noise](#5-channel-4--noise)
6. [Volume and Mixing](#6-volume-and-mixing)
7. [Timing and Clocks](#7-timing-and-clocks)
8. [Composition Techniques](#8-composition-techniques)
9. [Channel Roles in Practice](#9-channel-roles-in-practice)
10. [Why These Techniques Still Matter](#10-why-these-techniques-still-matter)

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
| Sample rate (internal) | ~1 MHz (period register driven) |
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

The APU has an internal frame sequencer clocked at 512 Hz (every 8192 CPU cycles). This drives the envelope, sweep, and length counter units at sub-rates:

| Step | 256 Hz | 128 Hz | 64 Hz | Triggered units |
|------|--------|--------|-------|-----------------|
| 0 | ✓ | | | Length counter |
| 1 | ✓ | | | Length counter |
| 2 | ✓ | ✓ | | Length counter + Sweep |
| 3 | ✓ | | | Length counter |
| 4 | ✓ | | | Length counter |
| 5 | ✓ | | | Length counter |
| 6 | ✓ | ✓ | | Length counter + Sweep |
| 7 | ✓ | | ✓ | Length counter + Envelope |

This means envelope updates happen at 64 Hz and sweep updates at 128 Hz — not at the sample rate. Envelope period values are multiples of 1/64 s (≈ 15.6 ms per step).

### 7.2 Note Frequency Resolution

Because the period register is only 11 bits wide, available frequencies do not fall exactly on equal-temperament pitches at all octaves. The deviation is small enough to be inaudible in most contexts, but at the lowest octave (C2–B2) the quantisation error between adjacent period values is large enough to cause noticeable detuning, especially on the pulse channels.

### 7.3 Sequencer Timing and BPM

The Game Boy has no hardware tempo unit. Tempo is entirely a software concern — the game's music driver decides how many CPU cycles (or vblank interrupts, typically 60 Hz) to wait between advancing the pattern sequencer. Most GB games based their music on the 59.73 Hz vblank interrupt, ticking the sequencer at integer multiples of that period.

Trackers like hUGETracker and LSDJ implement their own BPM-to-tick mapping on top of this. Because the vblank is fixed at ~60 Hz, BPM values that don't divide evenly into 60 (or 120) produce slight swing or tempo drift across bars — a subtle characteristic of authentic GB music.

---

## 8. Composition Techniques

The following techniques were all invented by GB composers to work within the hardware constraints. Many are now considered defining characteristics of the chiptune genre.

---

### 8.1 Arpeggios — Fake Chords

**The problem:** Only 4 channels total. Chords with 3 or 4 simultaneous voices consume the entire APU, leaving nothing for bass or percussion.

**The technique:** Rapidly cycling through the notes of a chord on a single channel — fast enough (typically 1/16 or 1/32 note rate) that the ear fuses the sequence into perceived harmony. This is a direct application of auditory stream integration.

**Acoustic result:** The characteristic "rolling sparkle" of 8-bit chiptune — one of the most instantly recognisable sounds in game music history.

**Pattern variants used by composers:**

| Pattern | Interval | Sound character |
|---------|----------|-----------------|
| Root–3rd–5th–3rd | Major triad | Bright, upbeat |
| Root–♭3rd–5th–♭3rd | Minor triad | Darker, melancholic |
| Root–5th–octave–5th | Power chord | Driving, aggressive |
| Root–3rd–5th–7th | Major 7th | Jazz-inflected |
| Root–♭3rd–5th–♭7th | Minor 7th | Soulful |

**Famous examples:**
- *Pokémon Red/Blue* — Battle Theme: rapid 16th-note arpeggio on CH1 throughout the main theme
- *Super Mario Land* — Overworld Theme: C–E–G–E cycling arpeggio
- *Mega Man: Dr. Wily's Revenge* — Stage themes: aggressive power chord arpeggios

**Why it sounds "full" at high BPM:** The perceptual fusion threshold for pitch cycling is approximately 40–50 ms. At 160 BPM with 1/16 steps, each arpeggio step lasts ~93 ms — just above the threshold, creating a shimmering but still slightly audible cycling effect. At 200 BPM the steps (75 ms) push closer to fusion. Composers tuned BPM partly to achieve the right arpeggio character.

**Practical limits:** Arpeggios with more than 3 notes per cycle begin to outrun the ear's ability to fuse them at typical Game Boy tempos. Most GB arpeggios use 2 or 3 offsets.

---

### 8.2 Duty Cycle Modulation — Timbre as Expression

**The problem:** No filters, no FM synthesis, no sample playback. The only tonal variation on CH1/CH2 is the pulse width (duty cycle).

**The technique:** Switching between duty values at strategic points — between notes, within a phrase, or even mid-note — to animate the perceived timbre. Because the duty change takes immediate effect, it behaves like a bipolar tone filter.

**Acoustic analysis:**

A 50% duty square wave has harmonic content at odd multiples of the fundamental only (1f, 3f, 5f, 7f…). Reducing duty asymmetry introduces even harmonics. The 12.5% wave is much richer in upper harmonics and sounds comparably bright and "thin" — behaviorally similar to a high-pass filter boost.

**Compositional patterns:**

- **Per-note modulation:** each successive note uses a different duty — creates a "wah" effect on fast passages
- **Phrase contour:** thin duty (12.5%) on approach notes, wide duty (50%) on peak notes, warm duty (75%) on resolution — mimics the harmonic shape of acoustic phrasing
- **Register distinction:** CH1 (12.5%, nasal) reads as distinct from CH2 (50%, full) even when they play the same pitch — experienced composers used this to create stereo width and two perceived voices from two otherwise identical pulse channels

**Famous examples:**
- *The Legend of Zelda: Link's Awakening* — Overworld: duty shifts between phrases distinguish the melody from the counter-melody
- *Metroid II* — Main Theme: 12.5% nasal leads create the isolating, claustrophobic atmosphere

---

### 8.3 Pitch Slides and Portamento

**The problem:** Notes on the GB are quantised — the period register is 11 bits, so each note is a discrete jump. No glide between notes happens automatically.

**The technique:** Writing to the frequency registers at a rate faster than the note duration to slide the period value incrementally between target pitches. This is 100% software-driven — the hardware provides no portamento — and requires precise timing to achieve the right slide speed and character.

**Variants:**

| Style | Method | Character |
|-------|--------|-----------|
| Linear portamento | Constant-step period writes | Mechanical, even |
| Exponential | Larger steps early, smaller late | Natural, decelerating "settle" |
| Pitch bend up | Period decreasing over time | Rising rip, upward swoop |
| Pitch bend down | Period increasing over time | Bass drop, dive |

**Famous examples:**
- *Pokémon Red/Blue* — Lavender Town: slow downward bends on the lead give the theme its unsettled, eerie quality
- *Tetris* — Type A Theme: fast ascending runs on CH2 using stepped portamento
- *Dr. Mario* — Fever Theme: rising pitch bends on CH1 intros

**Practical constraint:** Very fast slides (writing the frequency register every CPU cycle) are barely distinguishable from the sweep unit effect. The sweep unit (CH1 only) does this in hardware at a defined rate — software slides on CH2/CH3 had to be implemented in the music driver tick routine.

---

### 8.4 Volume Envelopes — Articulation Without Dynamics

**The problem:** No velocity sensitivity, only 16 volume levels, no per-note dynamic control. All notes at the same volume unless the driver is written to change the envelope register between notes.

**The technique:** Using the hardware envelope unit aggressively. By configuring a short envelope period, the channel volume steps down (or up) on each 64 Hz frame sequencer tick — creating fast decays that give notes the percussive "pluck" or "thump" character of real instruments. A period of 0 freezes volume for sustained notes.

**Common envelope shapes and results:**

| Initial | Direction | Period | Sound |
|---------|-----------|--------|-------|
| 15 | down | 1 | Hard pluck — punchy, staccato |
| 12 | down | 2 | Moderate decay — natural-feeling |
| 10 | down | 5 | Slow fade — sustained-ish lead |
| 15 | down | 0 | No decay — organ-style hold |
| 0 | up | 3 | Swell — attack from silence |
| 8 | up | 1 | Reverse accent — unusual, percussive |

**Famous examples:**
- *Kirby's Dream Land* — Green Greens: classic plucky leads using fast down envelopes on CH1
- *Super Mario Land* — Underground Theme: short-decay bass on CH2 creates rhythmic drive

**Percussive articulation on melodic channels:** Composers sometimes applied very short-decay envelopes on CH1/CH2 melodic lines not because they wanted percussive notes, but because it prevented note tails from bleeding into rests — creating natural note separation at high BPM.

---

### 8.5 Vibrato — Adding Life to Static Waveforms

**The problem:** A sustained note on a pulse channel with a fixed period is completely static — no natural pitch variation, no acoustic bloom. Long notes sound cold and synthetic.

**The technique:** Periodically alternating the frequency register above and below the target pitch in a repeating pattern — a software-driven LFO. The frequency, depth, and waveform of the LFO are entirely programmer-controlled; the hardware provides no vibrato unit.

**Design parameters:**

| Parameter | Typical range | Effect |
|-----------|--------------|--------|
| Depth | ±1–4 period units | Subtle wobble vs. wide warble |
| Rate | 4–8 Hz | Slow (vocal) vs. fast (nervous) |
| Waveform | Sine, triangle | Sine = smooth; triangle = mechanical |
| Onset delay | 0–2 rows | Pre-delay before wobble starts — more natural feeling |

**Famous examples:**
- *Pokémon Red/Blue* — Trainer Battle Theme: vibrato on long melody notes anchors the sense of resolution
- *Final Fantasy Adventure* — Main Theme: wide vibrato on the wave channel gives the bassline an almost human quality

**Authentic GB practice:** Real GB composers applied vibrato only to held notes (quarter notes or longer). Faster notes were left unmodulated — less fatigue, and the vibrato registers more clearly as expressive when it appears selectively on important pitches.

---

### 8.6 Noise Channel Percussion Tricks

**The problem:** No drum samples. CH4 generates only noise — shaped by LFSR width, frequency divisor, and envelope.

**The technique:** Varying LFSR width and envelope decay parameters to emulate different drum sounds. Some composers changed the LFSR clock frequency on every hit to give each drum event a distinct tonal character — a technique analogous to pitch-tuning acoustic drums.

**Synthesis of common drum sounds:**

| Drum | LFSR | Clock freq | Envelope | Character |
|------|------|-----------|----------|-----------|
| Snare | 7-bit | Medium-high | Fast down | Buzzy, snappy |
| Hi-hat (closed) | 15-bit | High | Very fast down | White noise choke |
| Hi-hat (open) | 15-bit | Medium | Moderate down | White noise decay |
| Kick (illusion) | 7-bit | Low | Slow down | Low thump |
| Crash | 15-bit | Medium | Slow down | Long white noise |
| Tom | 7-bit | Variable | Medium down | Pitched buzz |

**Famous examples:**
- *Pokémon Red/Blue* — Battle themes: the snare is a 7-bit LFSR burst with a 1-period envelope
- *Castlevania: The Adventure* — aggressive pattern switching on CH4 to vary drum texture
- *DuckTales* (GB): some composers changed LFSR parameters between each hit within a single bar

**The kick illusion:** True kick drums have a pitched component (100–200 Hz) that descends rapidly. CH4 cannot produce true pitch. The "kick illusion" uses a very low LFSR frequency with a slow-decay envelope to create a low-frequency thump that the brain accepts as kick-like in context.

---

### 8.7 Wave Channel Bass

**The problem:** Both pulse channels have a nasal quality at low pitches. Low-frequency pulse bass occupies sonic space better suited to melody and harmony. Composers needed a way to have a true bass presence without consuming a pulse channel.

**The technique:** Dedicating CH3 exclusively to basslines. The wave channel's ability to play any arbitrary waveform meant it could produce rounded, smooth bass tones impossible on CH1/CH2. Triangle or "semi-sine" waveforms at low RMS produce a warm bass that sits naturally below the pulse channels.

**Waveform design for bass:**
- Centre the table symmetrically around 7–8 (DC midpoint) to avoid low-frequency bias
- Use smooth slopes with no sharp transitions to minimise aliasing
- Avoid very low peak amplitudes — ensure values reach near 0 and 15 to use full dynamic range

**Famous examples:**
- *Pokémon Red/Blue* — All battle themes: CH3 carries the bass exclusively across the entire soundtrack
- *Zelda: Link's Awakening* — Dungeons: CH3 bass with smooth waveform complements the two pulse melody channels
- *Metroid II* — Underground areas: slower wave bass paired with sparse CH1 melody creates the isolating atmosphere

**The octave offset:** Because CH3's frequency formula produces pitches one octave below CH1/CH2 at the same period value, bass parts were written one octave higher in tracker notation, which sounds correct on hardware. This is a frequent source of confusion when porting GB music.

---

### 8.8 Fast Tempos to Mask Limitations

**The problem:** At slow tempos, arpeggios are heard as individual notes, channel cycling is obvious, and the hardware limitations are exposed.

**The technique:** Raising BPM deliberately above what the music "needs" so that note cycling (arpeggios, duty modulation, fast melodic patterns) fuses perceptually — the ear integrates the rapid changes as richer, fuller texture.

**Famous examples:**
- *Tetris* — Type A (speed creates urgency; arpeggios fuse into chords)
- *Mega Man* GB games — CAPCOM's GB composers consistently used BPM 160–200
- *Castlevania* GB titles — high tempo amplifies the aggressive character of the metal-influenced compositions

**The BPM–arpeggio relationship:** As a rough rule, arpeggios begin to fuse between 40 and 60 ms per step. At 160 BPM with 1/16 steps:

$$\frac{60}{160} \times \frac{1}{4} = 93 \text{ ms per 1/16 step}$$

Still clearly audible as cycling. At 200 BPM: 75 ms — marginal. Many classic GB composers settled on 160–180 BPM where the arpeggio character is both perceptually rich *and* rhythmically articulate.

---

### 8.9 Repetition and Micro-Variation

**The problem:** ROM cartridges had severe space constraints. A 256 KB ROM had room for very short music loops. Longer compositions required streaming audio — infrastructure GB games did not have.

**The technique:** Short 4- or 8-bar loops with deliberate micro-variations inserted at predictable intervals — an extra fill pattern every 4 bars, a pitch shift every 8 bars, one beat of silence before a new section. These variations are cosmetically tiny but perceptually significant: the brain registers them as intention rather than error, and the loop feels designed rather than mechanical.

**Famous examples:**
- *Pokémon* route themes: 4-bar loops with a fill every 4th cycle — consistent across the entire Pokémon soundtrack
- *Kirby's Dream Land* — extra percussion hit added every 8th bar of the main loop
- *Super Mario Land* — overworld theme introduces a quick turn-around fill between each A section repeat

**ROM economics:** Some GB music drivers stored patterns as run-length encoded difference lists — storing only the notes that changed between adjacent rows, rather than full rows. This allowed a 4-bar pattern to occupy as few as 20–30 bytes.

---

### 8.10 Silence as an Effect

**The problem:** With no reverb or spatial depth, transitions between sections and moments of rest are abrupt. Long notes have no natural ambience or tail.

**The technique:** Treating silence intentionally — not as absence but as compositional material. Composers dropped channels entirely for bars at a time, inserted rests at unexpected rhythmic positions, and sparse arrangements created "breathing space" that made the notes that remained sound more significant.

**Famous examples:**
- *Lavender Town* (*Pokémon*): the sense of unease comes partly from what is absent — the sparse, offset melodic lines leaving large gaps that the imagination fills
- *Metroid II* — long ambient passages with only CH3 active; the silence of CH1 and CH2 creates isolation
- *Balloon Kid* — several sections feature only two channels with deliberate rests to create rhythmic tension

**Psychological mechanism:** In a context with no reverb, the ear expects more silence following sound events. Composers who understood this used silence to make the few notes they wrote land with greater emotional weight — the opposite strategy from maximally dense arrangements.

---

### 8.11 Channel Stealing and Note Prioritization

**The problem:** Sound effects in Game Boy games interrupted the current channel to play the SFX, then returned. Music drivers had to handle this gracefully.

**The technique:** Composing with the assumption that any channel could be silenced at any moment by a sound effect. This meant:
- **Melodies on CH1** — highest musical priority, sound effects often stole CH2 or CH4 first
- **Bass on CH3** — wave channel rarely stolen by SFX, so bass remained constant
- **No essential content on CH4** — percussion loss was acceptable; removing percussion mid-bar is less disruptive than removing melody

**Compositional consequence:** GB music arrangements are structurally resilient to single-channel loss. Remove any one channel and the essential melody is still audible. This forced composers toward simpler but more harmonically clear arrangements — a constraint that, in hindsight, produced music of unusual directness and memorability.

---

## 9. Channel Roles in Practice

The following roles emerged as a de facto standard across most professional GB soundtracks:

| Channel | Predominant role | Secondary role |
|---------|-----------------|----------------|
| CH1 — Pulse + Sweep | Lead melody | Arpeggios, pitch-bend effects |
| CH2 — Pulse | Harmony / counter-melody | Rhythmic chords, bass (if CH3 unavailable) |
| CH3 — Wave | Bass | Pads, bell tones, melody (rare) |
| CH4 — Noise | Percussion | White noise ambience |

Some composers inverted this arrangement. In *Metroid II*, CH3 carries the melody using metallic waveforms while CH1/CH2 provide sparse harmonic context — creating the alien, unsettling soundscape deliberately. In *Kirby's Dream Land*, CH3 bass is occasionally silent and CH1/CH2 share melody + rhythm, freeing the sonic spectrum for the bright, cheerful aesthetic.

### The "Impossible Arrangement" Problem

Occasionally a composition demands more voices than are available. Techniques used to navigate this:

1. **Melodic reduction** — simplify harmony to single sustained notes instead of active counter-melody
2. **Alternating voices** — rapid alternation between two melody lines on a single channel (essentially an arpeggio of melodic lines rather than a chord)
3. **Implied harmony** — a melodic line that outlines chord changes through stepwise motion, letting the listener's ear fill the harmony
4. **Sacrificing percussion** — dropping CH4 beats during dense melodic passages and re-introducing them during simpler sections

---

## 10. Why These Techniques Still Matter

Every technique in this guide emerged from constraint. The DMG-01 APU cannot do reverb, cannot do samples, cannot do filters, cannot do velocity, and can play only four notes at once. Those limits produced compositional disciplines that remain valuable in any musical context:

- **Melodic clarity** — 4 channels forces strong hooks over dense texture. Every melodic line had to work alone.
- **Economy** — no note was written without purpose. Rests have weight. Density is earned.
- **Rhythmic precision** — arpeggios and envelopes only work if timing is exact. Sloppy timing is audible.
- **Character through timbre** — when you cannot change volume, space, or texture freely, you learn to use the timbre you have with intension.
- **Resilience** — an arrangement that survives the loss of any single voice is a structurally sound arrangement by any standard.

Modern chiptune, lo-fi hip-hop, indie game audio, and even contemporary electronic production borrow these techniques because they are immediately legible and emotionally direct. The constraints of the DMG-01 turned out to be pedagogy.
