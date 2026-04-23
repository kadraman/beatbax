# Game Boy DMG-01 APU — Composition Guide

This guide covers compositional techniques, channel usage patterns, and creative strategies for writing music on the Nintendo Game Boy (DMG-01) APU. It is intended for composers, arrangers, and anyone seeking to understand or emulate the musical style of classic Game Boy soundtracks using BeatBax or similar tools.

---

## Contents

1. [Composition Techniques](#1-composition-techniques)
2. [Channel Roles in Practice](#2-channel-roles-in-practice)
3. [The "Impossible Arrangement" Problem](#3-the-impossible-arrangement-problem)
4. [Why These Techniques Still Matter](#4-why-these-techniques-still-matter)

---

## 1. Composition Techniques

The following techniques were all invented by GB composers to work within the hardware constraints. Many are now considered defining characteristics of the chiptune genre.

---

### 1.1 Arpeggios — Fake Chords

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

### 1.2 Duty Cycle Modulation — Timbre as Expression

**The problem:** No filters, no FM synthesis, no sample playback. The only tonal variation on CH1/CH2 is the pulse width (duty cycle).

**The technique:** Switching between duty values at strategic points — between notes, within a phrase, or even mid-note — to animate the perceived timbre. Because the duty change takes immediate effect, it behaves like a bipolar tone filter.

**Acoustic analysis:**

A 50% duty square wave has harmonic content at odd multiples of the fundamental only (1f, 3f, 5f, 7f…). Reducing duty asymmetry introduces even harmonics. The 12.5% wave is much richer in upper harmonics and sounds comparably bright and 'thin' — analogous to a high-pass filter boost.

**Compositional patterns:**

- **Per-note modulation:** each successive note uses a different duty — creates a "wah" effect on fast passages
- **Phrase contour:** thin duty (12.5%) on approach notes, wide duty (50%) on peak notes, warm duty (75%) on resolution — mimics the harmonic shape of acoustic phrasing
- **Register distinction:** CH1 (12.5%, nasal) reads as distinct from CH2 (50%, full) even when they play the same pitch — experienced composers used this to create stereo width and two perceived voices from two otherwise identical pulse channels

**Famous examples:**
- *The Legend of Zelda: Link's Awakening* — Overworld: duty shifts between phrases distinguish the melody from the counter-melody
- *Metroid II* — Main Theme: 12.5% nasal leads create the isolating, claustrophobic atmosphere

---

### 1.3 Pitch Slides and Portamento

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

### 1.4 Volume Envelopes — Articulation Without Dynamics

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

### 1.5 Vibrato — Adding Life to Static Waveforms

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

### 1.6 Noise Channel Percussion Tricks

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

### 1.7 Wave Channel Bass

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

**The octave offset:** Because CH3's frequency formula produces pitches one octave below CH1/CH2 at the same period value, bass parts were written one octave higher in tracker notation, which sounds correct on hardware. This is a frequent source of confusion when porting GB music, as the tracker notation does not match the actual sounding pitch.

---

### 1.8 Fast Tempos to Mask Limitations

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

### 1.9 Repetition and Micro-Variation

**The problem:** ROM cartridges had severe space constraints. A 256 KB ROM had room for very short music loops. Longer compositions required streaming audio — infrastructure GB games did not have.

**The technique:** Short 4- or 8-bar loops with deliberate micro-variations inserted at predictable intervals — an extra fill pattern every 4 bars, a pitch shift every 8 bars, one beat of silence before a new section. These variations are cosmetically tiny but perceptually significant: the brain registers them as intention rather than error, and the loop feels designed rather than mechanical.

**Famous examples:**
- *Pokémon* route themes: 4-bar loops with a fill every 4th cycle — consistent across the entire Pokémon soundtrack
- *Kirby's Dream Land* — extra percussion hit added every 8th bar of the main loop
- *Super Mario Land* — overworld theme introduces a quick turn-around fill between each A section repeat

**ROM economics:** Some GB music drivers stored patterns as run-length encoded difference lists — storing only the notes that changed between adjacent rows, rather than full rows. This allowed a 4-bar pattern to occupy as few as 20–30 bytes.

---

### 1.10 Silence as an Effect

**The problem:** With no reverb or spatial depth, transitions between sections and moments of rest are abrupt. Long notes have no natural ambience or tail.

**The technique:** Treating silence intentionally — not as absence but as compositional material. Composers dropped channels entirely for bars at a time, inserted rests at unexpected rhythmic positions, and sparse arrangements created "breathing space" that made the notes that remained sound more significant.

**Famous examples:**
- *Lavender Town* (*Pokémon*): the sense of unease comes partly from what is absent — the sparse, offset melodic lines leaving large gaps that the imagination fills
- *Metroid II* — long ambient passages with only CH3 active; the silence of CH1 and CH2 creates isolation
- *Balloon Kid* — several sections feature only two channels with deliberate rests to create rhythmic tension

**Psychological mechanism:** In a context with no reverb, the ear expects more silence following sound events. Composers who understood this used silence to make the few notes they wrote land with greater emotional weight — the opposite strategy from maximally dense arrangements.

---

### 1.11 Channel Stealing and Note Prioritization

**The problem:** Sound effects in Game Boy games interrupted the current channel to play the SFX, then returned. Music drivers had to handle this gracefully.

**The technique:** Composing with the assumption that any channel could be silenced at any moment by a sound effect. This meant:
- **Melodies on CH1** — highest musical priority, sound effects often stole CH2 or CH4 first
- **Bass on CH3** — wave channel rarely stolen by SFX, so bass remained constant
- **No essential content on CH4** — percussion loss was acceptable; removing percussion mid-bar is less disruptive than removing melody

**Compositional consequence:** GB music arrangements are structurally resilient to single-channel loss. Remove any one channel and the essential melody is still audible. This forced composers toward simpler but more harmonically clear arrangements — a constraint that, in hindsight, produced music of unusual directness and memorability.

---

## 2. Channel Roles in Practice

The following roles emerged as a de facto standard across most professional GB soundtracks:

| Channel | Predominant role | Secondary role |
|---------|-----------------|----------------|
| CH1 — Pulse + Sweep | Lead melody | Arpeggios, pitch-bend effects |
| CH2 — Pulse | Harmony / counter-melody | Rhythmic chords, bass (if CH3 unavailable) |
| CH3 — Wave | Bass | Pads, bell tones, melody (rare) |
| CH4 — Noise | Percussion | White noise ambience |

Some composers inverted this arrangement. In *Metroid II*, CH3 carries the melody using metallic waveforms while CH1/CH2 provide sparse harmonic context — creating the alien, unsettling soundscape deliberately. In *Kirby's Dream Land*, CH3 bass is occasionally silent and CH1/CH2 share melody + rhythm, freeing the sonic spectrum for the bright, cheerful aesthetic.

### 3. The "Impossible Arrangement" Problem

Occasionally a composition demands more voices than are available. Techniques used to navigate this:

1. **Melodic reduction** — simplify harmony to single sustained notes instead of active counter-melody
2. **Alternating voices** — rapid alternation between two melody lines on a single channel (essentially an arpeggio of melodic lines rather than a chord)
3. **Implied harmony** — a melodic line that outlines chord changes through stepwise motion, letting the listener's ear fill the harmony
4. **Sacrificing percussion** — dropping CH4 beats during dense melodic passages and re-introducing them during simpler sections

---

## 4. Why These Techniques Still Matter

Every technique in this guide emerged from constraint. The DMG-01 APU cannot do reverb, cannot do samples, cannot do filters, cannot do velocity, and can play only four notes at once. Those limits produced compositional disciplines that remain valuable in any musical context:

- **Melodic clarity** — 4 channels forces strong hooks over dense texture. Every melodic line had to work alone.
- **Economy** — no note was written without purpose. Rests have weight. Density is earned.
- **Rhythmic precision** — arpeggios and envelopes only work if timing is exact. Sloppy timing is audible.
- **Character through timbre** — when you cannot change volume, space, or texture freely, you learn to use the timbre you have with intention.
- **Resilience** — an arrangement that survives the loss of any single voice is a structurally sound arrangement by any standard.

Modern chiptune, lo-fi hip-hop, indie game audio, and even contemporary electronic production borrow these techniques because they are immediately legible and emotionally direct. The constraints of the DMG-01 turned out to be pedagogy.
