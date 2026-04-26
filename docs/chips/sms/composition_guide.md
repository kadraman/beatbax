# Sega Master System / Game Gear PSG - Composition Guide

This guide covers practical composition techniques for the Sega Master System and Sega Game Gear PSG sound architecture. It is written for composers and arrangers working in BeatBax or any PSG-first workflow.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The Impossible Arrangement Problem](#3-the-impossible-arrangement-problem)
4. [Why These Techniques Still Matter](#4-why-these-techniques-still-matter)

---

## 1. Composition Techniques

The SMS/Game Gear PSG provides three fixed square channels plus one noise channel. There are no hardware envelopes, no hardware vibrato, and no filter stage. Most expression comes from software timing and arrangement choices.

---

### 1.1 Arpeggios for Harmonic Density

The problem: three tonal voices are not enough for full chords plus bass and melody.

The technique: cycle chord tones quickly on one channel so the ear fuses them into implied harmony.

Common patterns:

| Pattern | Character |
|---------|-----------|
| Root-5th-octave | Open and energetic |
| Root-3rd-5th | Bright triad shimmer |
| Root-flat3-5th | Darker minor color |
| Root-5th-flat7th | Driving dominant feel |

Because all tone channels share the same fixed square timbre, interval choice and rhythm carry most of the harmonic identity.

---

### 1.2 Octave Layering to Simulate Weight

The problem: the PSG low end can feel thin compared with chips that have dedicated low-frequency channels.

The technique: double important bass notes one octave up on a second tone channel at lower level. The low note provides foundation while the upper octave adds audible definition.

Typical layout:

- Tone 3: bass root line
- Tone 2: occasional octave reinforcement on strong beats
- Tone 1: melody remains free

This is one of the most common ways to make SMS/Game Gear arrangements feel fuller without adding channels.

---

### 1.3 Software Envelopes for Articulation

The problem: no hardware ADSR.

The technique: write volume changes per row/tick to create envelope shapes.

Useful envelope patterns:

| Shape | Write pattern | Sound |
|------|---------------|-------|
| Pluck | 2-4 fast downward steps | Punchy and short |
| Sustain-ish | Hold then small step-down | Stable lead |
| Swell | Start quiet then step up | Soft attack pad-like behavior |
| Gate | Alternate high/mute quickly | Chopped rhythmic pulse |

On this chip, instrument design is mostly a data-sequencing problem, not oscillator configuration.

---

### 1.4 Vibrato and Pitch Slides by Register Writes

The problem: no dedicated vibrato/portamento hardware.

The technique: periodically rewrite tone period values.

Common vibrato parameters:

| Parameter | Typical range |
|-----------|----------------|
| Depth | +/-1 to +/-4 period units |
| Rate | 4-8 Hz equivalent |
| Delay | 0-2 rows before onset |

Fast stepped slides and short bends are especially effective on this PSG because pitch changes are immediate and bright.

---

### 1.5 Noise Channel Drum Design

The problem: no PCM drum path in the base PSG workflow.

The technique: build a small synthetic drum kit from noise mode, noise rate, and volume-decay timing.

Starter kit:

| Drum role | Mode | Rate | Envelope style |
|-----------|------|------|----------------|
| Snare | White | Medium | Fast decay |
| Closed hat | White | High | Very fast decay |
| Open hat | White | High/Medium | Moderate decay |
| Metal click | Periodic | High | Very short gate |
| Low thump illusion | Periodic or white | Low | Slower decay |

Switching rate/mode per hit yields more realistic percussion than static settings.

---

### 1.6 Tone-3-Coupled Noise Tricks

The problem: pure noise percussion can feel untuned.

The technique: use the noise setting that derives timing from Tone 3, then modulate Tone 3 to move the perceived drum color.

Results:

- Tuned snare-like tones
- Metallic tom-like effects
- Animated fills that track harmonic movement

This is a signature PSG trick that rewards careful sequencing.

---

### 1.7 Game Gear Stereo Arrangement

The Game Gear stereo router allows each channel to be assigned L, R, or both.

Practical usage:

- Melody slightly isolated (L or R)
- Counter-line opposite side
- Bass centered (both)
- Noise often centered for groove stability

Since routing is discrete (not continuous pan), abrupt switches can sound dramatic. Use them deliberately at phrase boundaries rather than every row.

---

### 1.8 Fast Tempos to Mask Channel Limits

The problem: slower tempos expose single-voice compromises and obvious channel reuse.

The technique: moderate-to-fast tempos help arpeggios fuse and make voice handoffs feel intentional.

At BPM $160$, a 1/16 step is:

$$
\frac{60}{160} \times \frac{1}{4} = 93.75\text{ ms}
$$

That is fast enough for harmonic shimmer but still rhythmic enough for groove clarity.

---

### 1.9 Repetition with Micro-Variation

The problem: short loop forms can feel mechanical.

The technique: keep loops compact, but vary one tiny detail every 4 or 8 bars.

Reliable micro-variations:

- One extra noise hit before loop reset
- One-note lead pickup
- Temporary stereo swap on Game Gear
- One-bar octave reinforcement in bass

These small changes dramatically improve perceived musical intent.

---

### 1.10 Compose for Channel Loss During SFX

The problem: gameplay sound effects may temporarily steal channels.

The technique: keep musical priority clear:

- Melody must survive if one support channel drops
- Bass motion should still read if noise/percussion disappears
- Avoid placing essential harmonic information only in one fragile layer

Resilient arrangements are easier to integrate into real games.

---

## 2. Channel Roles in Practice

A common SMS/Game Gear role map:

| Channel | Primary role | Secondary role |
|---------|--------------|----------------|
| Tone 1 | Lead melody | Fast arpeggio line |
| Tone 2 | Harmony/counter-melody | Octave support |
| Tone 3 | Bass/foundation | Arpeggio anchor / noise-coupling source |
| Noise | Percussion | Texture and FX bursts |

On Game Gear, these roles are often combined with side routing for separation, but arrangement should still work when collapsed to mono.

---

## 3. The Impossible Arrangement Problem

You will frequently need more voices than available channels.

Common solutions:

1. Harmonic reduction: play roots and guide tones, omit less critical chord tones.
2. Time-division voicing: alternate two lines rapidly on one channel.
3. Percussion dropout: drop noise in dense melodic passages and re-enter later.
4. Register separation: keep melody, harmony, and bass in distinct octaves to maximize clarity.
5. Stereo-as-structure (Game Gear): route competing lines to opposite sides to reduce masking.

---

## 4. Why These Techniques Still Matter

The SMS/Game Gear PSG teaches core composition discipline:

- Strong melody first
- Rhythmic precision over texture clutter
- Intentional note economy
- Arrangement resilience under constraints

Those are durable skills, whether you are writing strict chiptune, retro game audio, or modern hybrid electronic music.
