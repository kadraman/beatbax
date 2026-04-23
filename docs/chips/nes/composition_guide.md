# NES Ricoh 2A03 APU — Composition Guide

This guide covers compositional techniques, channel usage patterns, and creative strategies for writing music on the NES Ricoh 2A03 APU. It is intended for composers, arrangers, and anyone seeking to understand or emulate the musical style of classic NES soundtracks using BeatBax or similar tools.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The "Impossible Arrangement" Problem](#3-the-impossible-arrangement-problem)
4. [Why These Techniques Still Matter](#4-why-these-techniques-still-matter)

---

## 1. Composition Techniques

The following techniques were developed by NES composers to exploit the hardware's strengths and navigate its limitations. Many directly parallel Game Boy techniques but are adapted to the NES's 5-channel architecture.


### 1.1 Arpeggios — Extended Harmony

**The problem:** Five channels sound rich, but with bass, melody, counter-melody, percussion (noise), and optionally DMC samples, there are rarely spare channels for chord voicing.

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

### 1.2 Duty Cycle Modulation — Timbral Palette

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

### 1.3 Pulse + Triangle Layering — Bass Reinforcement

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

### 1.4 Sweep-Driven Sound Effects

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

### 1.5 Triangle as a Percussion Supplement

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

### 1.6 Melodic Use of the Triangle

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

### 1.7 Volume Envelope as Expression

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

### 1.8 Vibrato — Software LFO

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

### 1.9 Noise Channel Rhythm Programming

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

### 1.10 DMC for Bass Reinforcement

**The problem:** The triangle channel provides bass but has no attack transient — its volume cannot ramp up. Punchy bass requires a transient.

**The technique:** Using short, low-rate DMC samples — typically just 8–32 bytes — looped or triggered on every bass note to add a "boom" transient under the triangle's sustained fundamental. The DMC sample is often just a single period of a sine or sawtooth waveform at a very low playback rate, which produces a sub-bass "hit" that lasts 10–30 ms.

This was a standard technique in late-era NES game soundtracks (1991–1994) when developers became sophisticated enough to budget ROM space for DMC assets. Earlier titles (1985–1988) rarely used DMC for musical purposes.

**ROM cost:** A 32-byte DMC sample at rate index 7 (8363 Hz) lasts approximately 3.8 ms — barely perceptible as a transient. At rate index 0 (4182 Hz), 64 bytes produces about 12 ms of bass hit — more useful but still very short.

**Famous examples:**
- *Battletoads* — Stage themes: DMC bass samples reinforce triangle bass for a much more powerful low end than early-era NES titles
- *Ninja Gaiden III* — DMC kicks and bass hits give the soundtrack a weight not found in Ninja Gaiden I/II

---

### 1.11 The "Two-Square" Chord Technique

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

### 1.12 Repetition and Variation

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

### 1.13 Software Macros — Per-Frame Envelope Automation

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

**Demo songs:** See `songs/nes/*.bax` for a complete demonstration.

## 2. Channel Roles in Practice

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

## 3. The "Impossible Arrangement" Problem

With 5 channels (4 tonal + 1 noise), the NES has one more voice than the Game Boy but the fundamental problem remains: complex arrangements demand more than 4 simultaneous pitched events. Resolution strategies:

1. **Melodic reduction** — simplify harmony to a single sustained third or fifth on Pulse 2
2. **Alternating bass** — share bass duties between triangle and Pulse 2, alternating on alternating beats
3. **Percussion sacrifice** — drop noise channel drum pattern during dense melodic passages
4. **DMC as bass** — use DMC for bass samples, freeing triangle for a third melodic voice
5. **Arpeggio chords** — rapid cycling of a chord on Pulse 1 or 2 to imply 3-voice harmony from a single channel

## 4. Why These Techniques Still Matter

Every technique in this guide, like those from the Game Boy era, emerged from constraint. The Ricoh 2A03 cannot produce more than four simultaneous pitched voices (noise is unpitched; DMC is limited), cannot do reverb, cannot do velocity, cannot do arbitrary waveforms (triangle is fixed), and produces mono output. Those limits generated a compositional discipline that remains instructive:

- **Harmonic economy** — two pulse channels force the choice of exactly which interval most clearly communicates the intended harmony
- **Rhythmic drive from texture** — without dynamics or velocity, rhythm is communicated through envelope shape, note duration, and duty modulation
- **Bass as foundation** — the triangle's permanent presence in the non-linear mix encourages always maintaining a bass line; NES music is rarely "bass-less"
- **Timbral intention** — four duty settings, three noise modes, and one waveform. Every timbral choice is deliberate because there is no other option
- **Memory efficiency** — ROM constraints forced composers to think in loops, variations, and compressed representations — skills directly applicable to generative music, live coding, and algorithmic composition

The chiptune genre that emerged from the NES APU remains a major influence on indie game audio, lo-fi hip-hop, electronic music production, and sound design education. The 2A03 APU's constraint-driven aesthetic — energetic, immediate, rhythmically precise, and harmonically direct — continues to define what "retro game music" sounds like to most of the world.
