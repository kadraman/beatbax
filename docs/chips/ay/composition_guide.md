# AY-3-8910 / YM2149 PSG - Composition Guide

This guide covers practical composition techniques for the AY-3-8910 and YM2149 PSG. It is written for composers and arrangers working in BeatBax or any AY-first workflow.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The Impossible Arrangement Problem](#3-the-impossible-arrangement-problem)
4. [Platform-Specific Considerations](#4-platform-specific-considerations)
5. [Why These Techniques Still Matter](#5-why-these-techniques-still-matter)

---

## 1. Composition Techniques

The AY-3-8910 / YM2149 provides three fixed square-wave tone channels, a shared noise generator, a shared hardware envelope generator, and a flexible per-channel mixer. Expression comes from envelope shaping, mixer gating, and the envelope generator's unique ability to produce audible-frequency waveforms.

---

### 1.1 The Hardware Envelope as a Bass Voice

The AY's most distinctive feature is its hardware envelope generator. At short periods, the envelope runs fast enough to enter the audible frequency range, creating a buzzy, harmonically rich tone.

Key technique: set the envelope period to produce a desired bass pitch, enable envelope mode on one channel, select a repeating envelope shape (shapes 8–15), and let the envelope generator drive the amplitude at audio rate.

Common envelope shapes for bass:

| Shape (R13) | Pattern | Typical use |
|-------------|---------|-------------|
| 8 | `\\\\` (repeating downward saw) | Classic buzzy AY bass |
| 10 | `\/\/` (triangle) | Warmer, slightly rounder tone |
| 12 | `////` (repeating upward saw) | Brighter edge, slightly different timbre |
| 14 | `/\/\` (triangle, upward phase) | Similar to 10, slightly different harmonic balance |

The envelope-driven bass is the single most recognisable AY sound. ZX Spectrum composers used it extensively because it provides a low-frequency foundation that the chip's square-wave tone channels alone struggle to deliver.

**Pitch calculation for envelope bass:**

$$
N_{env} = \frac{f_{clock}}{256 \times f_{bass}}
$$

Note the `256` divisor (not `16` as for tone channels) — envelope periods are much longer for the same pitch.

---

### 1.2 Tone + Noise Mixing for Timbral Texture

Unlike the SN76489, the AY mixer allows a channel to carry **both tone and noise simultaneously**. This is done by enabling both the tone bit and the noise bit for the same channel in the mixer register.

Tone + noise combinations:

| Mix | Character | Use case |
|-----|-----------|----------|
| Tone only | Clean square wave | Melody, bass, harmony |
| Noise only | Broadband hiss | Hats, snare body, wind effects |
| Tone + noise | Gritty, buzzy texture | Metal pluck attack, organ breath, hi-hat with pitch |
| Neither | Silent | Channel available for register-only envelope tricks |

The tone+noise combination is particularly effective for:
- **Plucked string attacks**: brief period of tone+noise at note onset, then cut noise after 1–2 frames
- **Metallic percussion**: periodic noise gated with a short tone at a harmonic pitch
- **Breath/reed texture on leads**: light noise mixed into a sustained melody note for organic quality

---

### 1.3 Software Envelopes vs Hardware Envelope

The AY supports both a **hardware envelope** (shared, one shape at a time) and **software envelopes** (per-channel, driven by timed register writes).

**Use the hardware envelope when:**
- You need a continuously cycling waveform (buzzy bass, sawtooth sweep)
- You want a precise single attack-decay without per-tick CPU cost
- You need the unique "envelope-as-oscillator" bass sound

**Use software envelopes (per-tick volume writes) when:**
- You need different envelope shapes on multiple channels simultaneously
- You need ADSR-style behaviour (hardware gives no sustain phase)
- The hardware envelope period conflicts with your bass pitch needs

Typical software envelope patterns:

| Shape | Volume sequence | Sound |
|-------|----------------|-------|
| Pluck | 15, 12, 9, 6, 3, 0 | Short bright decay |
| Organ | 15, 15, 15, 15, … | Flat sustain, gate off at note end |
| Pad swell | 3, 6, 9, 12, 15, 15, … | Slow attack |
| Stab | 15, 10, 5, 0 | Fast punchy release |

Note: AY volume is **direct level** (0 = silent, 15 = loudest) — the opposite convention from the SN76489. A "fade out" decrements from 15 toward 0.

---

### 1.4 Noise-Based Drum Design

The AY noise generator is shared across all channels but can be gated independently per channel via the mixer register. Drum design involves:

1. Set the noise period (R6) for the desired noise colour
2. Enable noise on the target channel via the mixer
3. Shape the volume decay with a software envelope (hardware envelope may conflict with a sustained bass note using envelope mode)
4. Disable noise in the mixer after the drum event

Common noise periods by drum role:

| Drum | Noise period (approx) | Character |
|------|-----------------------|-----------|
| Snare | 8–16 | Mid-range crunch |
| Hi-hat closed | 1–4 | Bright, tight |
| Hi-hat open | 1–4 (longer decay) | Same colour, longer tail |
| Crash | 16–28 | Broader, lower noise |
| Kick transient | 24–31 | Thuddy, dark |

Because only one noise period is active at a time, rapid drum sequences must choose a noise period that works acceptably for both snare and hi-hat, or accept a brief period collision on simultaneous hits.

---

### 1.5 Arpeggios for Harmonic Density

Three tone channels cannot cover full chords plus bass and melody. The classic solution is rapid arpeggio cycling on one channel.

Typical arp patterns:

| Pattern | Notes | Character |
|---------|-------|-----------|
| Root-5th-octave | E.g., A3-E4-A4 | Open, energetic |
| Root-3rd-5th | E.g., A3-C#4-E4 | Bright triad shimmer |
| Root-flat3-5th | Minor triad | Darker colour |
| Shell-voice | Root-7th | Jazz/dark tension |

At 50–60 Hz arpeggio speed (one frame per step), three notes fuse convincingly into an implied chord. At lower speeds the arpeggiation becomes an audible motif.

---

### 1.6 Channel-Role Splitting: Melody, Bass, Chord

A common AY arrangement strategy is strict role separation:

- **Channel A**: lead melody (software envelope, fixed volume)
- **Channel B**: arpeggio / chord layer (rapid cycling, possibly with tone+noise texture on attacks)
- **Channel C**: bass (hardware envelope at low period for buzzy bass, or software-enveloped notes)
- **Noise gating**: routed to channel B or a spare channel for drum transients

When a drum hit occurs, briefly enable noise on the chord channel (B) while silencing the chord momentarily. This is the classic AY "drum without a dedicated channel" trick.

---

### 1.7 Vibrato and Pitch Slides by Register Writes

Like the SN76489, the AY has no hardware vibrato or portamento. These must be implemented as timed tone period writes.

Vibrato parameters:

| Parameter | Typical range |
|-----------|---------------|
| Depth | ±1–4 period units |
| Rate | 4–8 Hz |
| Delay before onset | 2–4 rows |

Because the AY has a 12-bit period and most platforms run at 1–2 MHz effective clock, vibrato depth in period units maps to smaller pitch deviations at low frequencies than at high. Calibrate depth per octave range.

Pitch slides are effective for:
- Bass portamento
- Lead glides between notes
- Short upward "scoop" on note attacks

---

### 1.8 Octave Layering for Fullness

If two channels are momentarily free of other duties, doubling a melody at the octave adds warmth. Because all AY channels are the same fixed-duty square wave, unison doublings and octave doublings are the primary thickness tools short of envelope buzzing.

Typical octave layering plan:

- Main melody: channel A, target octave
- Octave double: channel B, one octave below, at ~3–6 dB lower volume (e.g., vol = 9 vs 15)
- Release channel B when harmony or arp re-enters

---

### 1.9 Fast Tempos and Tight Note Economy

Higher BPMs help arpeggios fuse and make channel-sharing handoffs feel intentional rather than compromised.

At 160 BPM, a 1/16 step is approximately 94 ms — fast enough for harmonic shimmer from a 3-note arp.

At slower tempos, rely more on:
- Longer note holds with hardware envelope sustain
- Percussion fills to maintain motion
- Counter-melody lines rather than arpeggios

---

### 1.10 Stereo Arrangement (Platform-Dependent)

Stereo output on the AY is circuit-level, not register-level. However, arrangement should account for the likely stereo wiring of the target platform:

**ABC stereo (ZX Spectrum 128K default):**

| Channel | Output |
|---------|--------|
| A | Left |
| B | Centre (both) |
| C | Right |

Arrangement advice for ABC:
- Place melody in A or C for definition at one side
- Place bass or arp in B (centre) for stereo stability
- Use A/C opposition for call-and-response lines

**ACB stereo (alternative Spectrum, some tracker conventions):**

| Channel | Output |
|---------|--------|
| A | Left |
| C | Centre |
| B | Right |

Assign roles accordingly. The centre channel (C in ACB) should carry the element most critical to mono compatibility.

**Mono (Amstrad CPC):**

All three channels are summed. No stereo considerations; focus on frequency separation and volume balance to avoid masking.

---

## 2. Channel Roles in Practice

A common AY role map for a three-voice arrangement:

| Channel | Primary role | Secondary role |
|---------|--------------|----------------|
| A | Lead melody | Arp / chord layer |
| B | Bass / harmony | Drum noise gating |
| C | Countermelody | Buzzy envelope bass |

For a percussion-forward arrangement:

| Channel | Primary role | Notes |
|---------|--------------|-------|
| A | Lead melody | Software envelope, no noise |
| B | Chord/arp | Noise-gated for snare/hat hits |
| C | Bass | Hardware envelope buzzy bass; released on kick downbeat |

---

## 3. The Impossible Arrangement Problem

Three tone channels with a shared noise source will always feel constrained for full arrangements. Common solutions:

1. **Envelope bass frees a channel**: by using envelope mode for a sustained bass voice, the tone register of that channel is free to step through melody notes while the envelope maintains its own pitch.
2. **Noise + tone gating rhythm**: route noise to a melody channel briefly for snare transients; the tone momentarily disappears but the hit is heard.
3. **Arp as implicit chord**: a rapid three-note arp on one channel removes the need for a separate chord voice.
4. **Counterpoint over harmony**: rather than explicit chords, write two independent melodic lines that imply harmony through their interval relationships.
5. **Rest placement as percussion opportunity**: a silent melody beat is an opportunity to gate noise onto that channel for a drum hit without voice stealing.

---

## 4. Platform-Specific Considerations

### 4.1 ZX Spectrum 128K

- Clock: 1,773,400 Hz effective
- Stereo: ABC (A=left, B=centre, C=right) in hardware; some interfaces and software re-wire to ACB
- Culture: fast-paced arpeggiated leads, buzzy envelope bass, hard-gated drum technique; strong demo scene identity

### 4.2 Atari ST

- Chip: YM2149 driven at 8 MHz → effective 2 MHz (internal ÷2 × external ÷2)
- Stereo: convention-dependent; A=left, C=right, B=both is common in tracker scene; some use mono summing
- Culture: more melodic and mid-tempo than Spectrum; strong demo scene and tracker (YM/SNDH formats) culture; composers pushed envelope-bass and noise-drum techniques furthest on this platform

### 4.3 Amstrad CPC

- Clock: 1,000,000 Hz effective
- Stereo: mono (all channels summed)
- Culture: upbeat, melodically driven; heavy use of fast arpeggios; distinct sound from Spectrum despite same chip family due to lower clock (lower pitch register values for the same note)

### 4.4 MSX

- Clock: 1,789,772 Hz effective (NTSC MSX) or 1,773,400 Hz (PAL MSX)
- Stereo: mono on most models; some expansion modules add stereo routing
- Culture: overlapping with FM (MSX2+ added YM2413 FM); AY on MSX is often the rhythm/texture layer when FM is available

### 4.5 Cross-Platform Note

Because platform clocks differ, period lookup tables must be generated per platform. A song authored for Spectrum at 1.77 MHz will play slightly sharp on Amstrad CPC at 1.00 MHz if period values are shared without correction. BeatBax period tables should be clock-parameterised.

---

## 5. Why These Techniques Still Matter

The AY-3-8910 / YM2149 teaches compositional skills that transfer directly to modern contexts:

- **Envelope thinking**: designing sounds as time-varying processes rather than static timbres
- **Mixer logic**: thinking in signal routing and enabling/disabling paths per beat
- **Voice economy**: achieving full harmonic texture with three oscillators through arp, octave layering, and role-sharing
- **Constraint-driven creativity**: the shared noise generator and single envelope force decisions that often produce more distinctive results than an unconstrained palette

These are durable skills for chip composition, synthesis design, and minimalist electronic music in any genre.
