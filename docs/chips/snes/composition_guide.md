# SNES S-DSP — Composition Guide

This guide covers compositional techniques, channel usage patterns, and creative strategies for writing music on the SNES S-DSP. It is intended for composers, arrangers, and anyone seeking to understand or emulate the musical style of classic SNES soundtracks using BeatBax or similar tools.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The "Impossible Arrangement" Problem](#3-the-impossible-arrangement-problem)
4. [Why These Techniques Still Matter](#4-why-these-techniques-still-matter)
5. [BeatBax SNES Patterns](#5-beatbax-snes-patterns)

---

## 1. Composition Techniques

The following techniques were developed by SNES composers to exploit the S-DSP's strengths and navigate its limitations. Unlike 8-bit PSG chips where waveforms are synthesised in real time, SNES composition is fundamentally about **sample selection, layering, and spatial design**.

### 1.1 Layered BRR Ensembles — Orchestral Depth

**The problem:** Eight voices sounds generous compared to the NES's five, but a full orchestral score might call for dozens of simultaneous instruments.

**The technique:** Layer complementary BRR samples across multiple voices to build composite timbres. A string section on voice 1, brass on voice 2, and a choir pad on voice 3 create a three-layer ensemble that reads as a full orchestra section.

**Implementation in BeatBax:**

```bax
inst strings  type=voice  brr_sample="@snes/strings_c4"  adsr=8,4,10,6  vol_l=100  vol_r=100
inst brass    type=voice  brr_sample="@snes/brass_g3"    adsr=2,3,12,8  vol_l=90   vol_r=70
inst choir    type=voice  brr_sample="@snes/choir_c4"    adsr=6,5,12,7  vol_l=80   vol_r=80
```

**Famous examples:**
- *Final Fantasy VI* — "Dancing Mad": massive multi-layered orchestral stacks across all 8 voices
- *Chrono Trigger* — "Corridors of Time": layered strings and woodwinds creating ambient depth
- *Super Metroid* — "Brinstar": sparse but effective layering of atmospheric samples

---

### 1.2 ADSR Sculpting — Articulation and Expression

**The problem:** BRR samples play back as recorded; without envelope shaping, every note has the same attack and decay character.

**The technique:** Use hardware ADSR to sculpt each instrument's articulation. Percussive sounds need fast attack and short release; sustained pads need slow attack and long release.

**Common ADSR recipes:**

| Instrument type | ADSR | Character |
|----------------|------|-----------|
| Kick drum | `0,0,15,2` | Instant hit, immediate cut |
| Snare | `0,0,15,3` | Sharp attack, brief tail |
| Plucked bass | `1,2,14,6` | Quick attack, moderate sustain |
| Sustained strings | `8,4,10,6` | Slow swell, gentle decay |
| Brass stab | `0,3,12,4` | Punchy attack, medium release |
| Flute melody | `2,3,14,5` | Breath-like attack, flowing sustain |
| Organ / pad | `0,15,15,4` | Instant on, no decay, held |

**Famous examples:**
- *Donkey Kong Country* — David Wise's bass lines use tight ADSR for rhythmic punch
- *Secret of Mana* — Hiroki Kikuta's string writing relies on slow attack for expressive swells

---

### 1.3 Stereo Width via vol_l / vol_r

**The problem:** The S-DSP has no pan pot. All stereo positioning is done through independent left and right volume registers.

**The technique:** Assign different `vol_l` and `vol_r` values to create spatial placement. Because volume and pan are coupled, wide stereo spreads reduce perceived loudness — compensate with fewer voices on the opposite side.

**Stereo placement patterns:**

| Pattern | vol_l | vol_r | Use case |
|---------|-------|-------|----------|
| Centre | 127 | 127 | Lead melody, bass |
| Wide left | 127 | 40 | Counter-melody, left field |
| Wide right | 40 | 127 | Harmony, right field |
| Narrow | 90 | 90 | Background pad, reduced presence |
| Hard left | 127 | 0 | Percussion, SFX |
| Hard right | 0 | 127 | Percussion, SFX |

**Famous examples:**
- *F-Zero* — Heavy use of hard L/R percussion placement for rhythmic drive
- *Super Mario World* — Koji Kondo's melodies centred with wide-panned harmony voices

---

### 1.4 Echo as Arrangement Glue

**The problem:** With only 8 voices and no reverb plugin, mixes can sound dry and flat.

**The technique:** The S-DSP's built-in echo buffer acts as a global reverb/delay. A moderate echo (EDL = 4, ~128 ms) adds spatial depth that makes sparse arrangements feel fuller.

**Echo presets for BeatBax:**

```bax
; Cathedral — long, wet
echo on  fb=60  edl=8  evol_l=90  evol_r=90

; Cave — medium delay, moderate feedback
echo on  fb=40  edl=4  evol_l=70  evol_r=70

; Hall — short, subtle
echo on  fb=25  edl=2  evol_l=50  evol_r=50

; Dry — no echo
echo off
```

Use `echo_off=true` on lead instruments to keep them crisp and forward in the mix while echo fills the background.

**Famous examples:**
- *Super Metroid* — Extensive echo on atmospheric tracks (Brinstar, Maridia)
- *Chrono Trigger* — Echo on "Wind Scene" and other ambient pieces
- *Secret of Mana* — Cathedral-like echo on outdoor area themes

---

### 1.5 Sample Choice Over Synthesis

**The problem:** Unlike PSG chips where duty cycle and envelope create timbral variety, the S-DSP plays back fixed BRR samples. Timbre is chosen at sample-selection time, not performance time.

**The technique:** Invest effort in selecting or preparing the right BRR sample for each role. A single high-quality string sample looped with good ADSR can sustain an entire track; a poor sample choice cannot be rescued by envelope or effects.

**Sample role guidelines:**

| Role | Sample characteristics | ADSR tendency |
|------|----------------------|---------------|
| Lead melody | Bright attack, clear pitch | Medium attack, long sustain |
| Bass | Strong low end, short decay | Fast attack, short release |
| Pad / atmosphere | Smooth loop, no transients | Slow attack, long sustain |
| Percussion | Sharp transient, no loop | Instant attack, fast release |
| SFX / stab | Distinctive timbre, short | Fast attack, medium release |

---

### 1.6 Channel Budgeting Across 8 Voices

**The problem:** Full scores routinely need more than 8 simultaneous parts. SNES composers developed strict voice allocation discipline.

**The technique:** Assign fixed roles to voices and accept that not every part plays simultaneously. Typical allocation:

| Voices | Role |
|--------|------|
| 1–2 | Lead melody + counter-melody |
| 3 | Bass |
| 4–5 | Harmony / pad layers |
| 6–7 | Percussion (kick + snare/hat) |
| 8 | SFX / accent / spare |

When a section needs more layers, mute the least important voice (usually percussion or a pad) to free a channel for a new part.

---

### 1.7 Loop-Point Design in BRR Samples

**The problem:** Sustained instruments (strings, pads, choir) must loop seamlessly. A bad loop point produces audible clicks or timbral shifts.

**The technique:** Design BRR samples with loop points at zero-crossings or at points where the waveform phase aligns. Use `beatbax convert wav2brr --loop-start <sample>` to set loop points during sample preparation.

**Loop design tips:**
- Prefer loops in the sustain portion, not the attack transient
- Keep loop lengths under 0.5 seconds for smooth repetition
- Test loops at multiple pitches (loop artifacts worsen at extreme pitch values)
- Filter mode 1 (first-order prediction) often produces smoother loops than mode 0 (direct)

---

### 1.8 Percussion One-Shots vs Sustained Pads

**The problem:** Percussion and sustained instruments compete for the same voices but have opposite envelope needs.

**The technique:** Use fast ADSR (`0,0,15,1–3`) for percussion one-shots that release quickly, freeing the voice for the next hit. Sustained pads use slow attack and long sustain, occupying a voice for the entire phrase.

```bax
; Percussion — fast release, voice frees quickly
inst kick   type=voice  brr_sample="@snes/kick"   adsr=0,0,15,2  vol_l=127  vol_r=127
inst snare  type=voice  brr_sample="@snes/snare"  adsr=0,0,15,3  vol_l=110  vol_r=90

; Pad — slow attack, holds the voice
inst strings type=voice  brr_sample="@snes/strings_c4"  adsr=8,4,10,6  vol_l=80  vol_r=80
```

---

### 1.9 Arpeggios for Chord Simulation

**The problem:** No spare voices for chord voicing when melody, bass, percussion, and pads occupy most channels.

**The technique:** Rapid pitch cycling on a single voice to simulate chord tones — the same principle as NES/GB arpeggios but with BRR samples providing richer timbre.

```bax
inst arp_strings  type=voice  brr_sample="@snes/strings_c4"
                  adsr=4,3,12,5  pitch_env=[0,4,7,4|0]
```

At 120 BPM with 1/16 steps, each arpeggio step is ~125 ms. Three-note arpeggios (root–3rd–5th) are the most common; four-note patterns work for diminished and sus4 chords.

**Famous examples:**
- *Final Fantasy VI* — Arpeggiated string patterns in battle themes
- *Terranigma* — Arpeggiated harp-like textures in town themes

---

### 1.10 Dynamic Arrangement Through Voice Muting

**The problem:** Intro, verse, chorus, and bridge sections need different instrument combinations, but voices cannot be dynamically added mid-song without key-on/key-off management.

**The technique:** Write separate channel sequences for each section, muting and unmuting voices by starting and stopping channel playback. The S-DSP's key-off release tail provides natural transitions when voices are freed.

---

### 1.11 Echo-Dry Layering

**The problem:** Global echo affects all voices, muddying lead lines and percussion.

**The technique:** Set `echo_off=true` on lead melody and percussion instruments while leaving echo enabled on pad and harmony voices. This creates a natural front-to-back depth: dry foreground, wet background.

```bax
echo on  fb=50  edl=4  evol_l=80  evol_r=80

inst lead   type=voice  brr_sample="@snes/flute_c5"     adsr=2,3,14,5  echo_off=true
inst pad    type=voice  brr_sample="@snes/choir_c4"     adsr=8,5,12,7
inst kick   type=voice  brr_sample="@snes/kick"         adsr=0,0,15,2  echo_off=true
```

---

### 1.12 Timbral Variety Through Sample Switching

**The problem:** A single BRR sample has a fixed timbre. Unlike PSG duty-cycle modulation, you cannot reshape the waveform at runtime.

**The technique:** Define multiple instruments using different BRR samples for the same musical role, and switch between them across sections or phrases. A flute sample for the A-section melody and a brass sample for the B-section creates timbral contrast without needing spare voices for both simultaneously.

---

## 2. Channel Roles in Practice

| Channel | Typical role | Sample type | ADSR tendency | Echo |
|---------|-------------|-------------|---------------|------|
| 1 (Voice 0) | Lead melody | Bright, clear (flute, trumpet) | Medium attack, long sustain | Off |
| 2 (Voice 1) | Counter-melody / harmony | Complementary timbre | Medium attack, medium release | Off or on |
| 3 (Voice 2) | Bass | Strong low end | Fast attack, short release | Off |
| 4 (Voice 3) | Harmony / pad layer | Strings, choir | Slow attack, long sustain | On |
| 5 (Voice 4) | Secondary pad / texture | Atmospheric, soft | Slow attack, long sustain | On |
| 6 (Voice 5) | Kick / low percussion | Sharp transient | Instant, fast release | Off |
| 7 (Voice 6) | Snare / hi-hat | Sharp transient | Instant, fast release | Off |
| 8 (Voice 7) | SFX / accent / spare | Variable | Fast attack, short release | Off |

### Variations by Genre

| Genre | Voice 1–2 | Voice 3 | Voice 4–5 | Voice 6–8 |
|-------|-----------|---------|-------------|-----------|
| Orchestral RPG | Melody + counter | Cello/bass | String/brass pads | Timpani + percussion |
| Action platformer | Lead + harmony | Bass | Sparse or muted | Full drum kit |
| Atmospheric | Pad + texture | Sub-bass drone | Ambient layers | Minimal percussion |
| Boss battle | Aggressive lead | Driving bass | Brass stabs | Heavy percussion |
| Puzzle / casual | Light melody | Soft bass | Gentle pad | Light percussion |

---

## 3. The "Impossible Arrangement" Problem

The central tension in SNES composition is the gap between what a full orchestral score demands and what 8 voices can deliver.

**Strategies SNES composers used:**

1. **Prioritise ruthlessly.** Not every part plays at once. Melody and bass are sacred; harmony and percussion rotate.
2. **Let echo fill space.** A single pad voice with heavy echo sounds like two or three voices in a reverberant space.
3. **Use ADSR gating.** Percussion voices free themselves quickly; sustained voices hold. Timing note durations to voice availability is essential.
4. **Accept mono moments.** Many iconic SNES tracks have sections where only 3–4 voices play, creating intimacy before a full 8-voice climax.
5. **Layer by section, not by bar.** Verse uses 4 voices; chorus adds 4 more. The arrangement breathes.
6. **Arpeggios replace chords.** One voice cycling chord tones sounds like three voices playing harmony.

**What does not work:**
- Attempting to play 8 sustained pads simultaneously with no echo — sounds flat and static
- Using the same BRR sample on multiple voices at the same pitch — phase cancellation and monotony
- Ignoring ARAM budget — too many large samples plus a big echo buffer exceeds 64 KB

---

## 4. Why These Techniques Still Matter

The SNES sound is not merely nostalgic. Its constraints produced a distinctive aesthetic:

- **Warmth and depth** from BRR samples and Gaussian interpolation, impossible on raw square waves
- **Spatial design** from stereo volume and global echo, teaching composers to think in width and depth
- **Economy of means** from the 8-voice limit, producing arrangements where every voice earns its place
- **Sample craft** from the dependence on BRR quality, elevating sound design to a compositional skill

Modern chiptune artists working with SNES hardware or emulation continue these techniques. BeatBax makes the S-DSP accessible without requiring SPC700 programming, sample ripping, or tracker-specific tooling.

---

## 5. BeatBax SNES Patterns

### 5.1 Starter Song Template

```bax
chip snes
bpm 120

echo on  fb=40  edl=4  evol_l=70  evol_r=70

inst melody  type=voice  brr_sample="@snes/flute_c5"     adsr=2,3,14,5  vol_l=110  vol_r=110  echo_off=true
inst bass    type=voice  brr_sample="@snes/strings_c3"   adsr=1,2,14,6  vol_l=100  vol_r=100  echo_off=true
inst pad     type=voice  brr_sample="@snes/choir_c4"     adsr=8,5,12,7  vol_l=70   vol_r=70
inst kick    type=voice  brr_sample="@snes/kick"         adsr=0,0,15,2  vol_l=127  vol_r=127  echo_off=true
inst snare   type=voice  brr_sample="@snes/snare"        adsr=0,0,15,3  vol_l=100  vol_r=80   echo_off=true

channel 1 => inst melody  seq melody
channel 2 => inst pad     seq pad
channel 3 => inst bass    seq bassline
channel 4 => inst kick    seq kick
channel 5 => inst snare   seq snare
```

### 5.2 Echo Preset Macros

| Preset | Directive | Character |
|--------|-----------|-----------|
| Cathedral | `echo on fb=60 edl=8 evol_l=90 evol_r=90` | Long, lush, wet |
| Cave | `echo on fb=40 edl=4 evol_l=70 evol_r=70` | Medium, atmospheric |
| Hall | `echo on fb=25 edl=2 evol_l=50 evol_r=50` | Short, subtle depth |
| Dry | `echo off` | No spatial processing |

### 5.3 Software Macro Patterns

```bax
; Vibrato via pitch_env
inst lead  type=voice  brr_sample="@snes/flute_c5"
           adsr=2,3,14,5  pitch_env=[0,1,0,-1|0]

; Volume swell via vol_env
inst pad   type=voice  brr_sample="@snes/choir_c4"
           adsr=0,15,15,6  vol_env=[0,20,40,60,80,100|5]

; Pitch fall (dive bomb)
inst sfx   type=voice  brr_sample="@snes/brass_g4"
           adsr=0,0,15,2  pitch_env=[0,-2,-4,-6,-8,-12]
```

### 5.4 Sample Preparation Workflow

1. Record or source a WAV sample at 32 kHz (or resample to 32 kHz).
2. Trim silence and set loop points in an audio editor.
3. Convert: `beatbax convert wav2brr mysample.wav mysample.brr --loop-start 8000`
4. Reference in BeatBax: `brr_sample="local:mysample.brr"` (CLI) or upload via web UI.
5. Test at multiple pitches and adjust ADSR for the intended role.

---
