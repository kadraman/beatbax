# Interesting Facts About the Sega Master System / Game Gear Sound Chip

The Sega Master System and Sega Game Gear are built around an SN76489-compatible PSG. It is one of the most direct and disciplined sound chips of the 8-bit era: simple signal generation, very fast control, and almost all musical expression handled in software.

---

## 1. It Is a Four-Channel Chip, But Really Two Families of Sound

The PSG has:

1. Three tone channels (fixed square waves)
2. One noise channel (LFSR)

So while people call it a four-channel chip, composition is usually "three pitched voices plus percussion/texture."

---

## 2. All Tone Channels Share the Same Waveform

Unlike chips with selectable duty cycles or custom wavetable memory, SMS/Game Gear tone channels are fixed square waves.

That forced composers to rely on:

- Register automation
- Rhythm
- Layering and octave strategy

Timbre variety came from writing, not from oscillator options.

---

## 3. Volume Is Attenuation-Based, Not Musical Velocity

Each channel uses 16 attenuation steps, where `0` is loudest and `15` is mute.

This made software envelopes essential. Many iconic SMS melodies are really careful sequences of small volume writes.

---

## 4. The Noise Channel Can Be Clocked from Tone 3

One noise-rate setting derives behavior from Tone 3 timing.

This enables pseudo-tuned noise effects such as:

- Metallic percussion tied to pitch movement
- Buzzier tom-like accents
- Drum fills that follow melodic contour

It is one of the chip's most useful "advanced" tricks.

---

## 5. There Is No Hardware ADSR Envelope Unit

No built-in attack/decay/sustain/release behavior exists on the PSG.

Everything expressive is done through timed register writes, which is why classic engines invested heavily in macro systems and instrument scripts.

---

## 6. The Base Master System Path Is Mono

Standard SMS playback is effectively mono for core PSG output.

Any perception of space must come from arrangement decisions (register separation, rhythmic contrast, line density), not true stereo imaging.

---

## 7. Game Gear Adds Real Per-Channel Stereo Routing

Game Gear introduces left/right routing bits for each PSG channel.

That means each voice can be:

- Left only
- Right only
- Center (both)

This is discrete routing, not continuous panning, but it dramatically changes arranging possibilities.

---

## 8. Region Clock Differences Still Matter

NTSC and PAL systems run slightly different clock rates.

If a driver assumes one timing model, pitch and tempo can drift on another region unless compensated. This is a classic portability issue in 8-bit engines.

---

## 9. It Influenced More Than Sega Music

The same PSG family and close relatives appear across multiple systems and arcade boards. Its sound language became a broader 8-bit vocabulary, not just an SMS identity.

---

## 10. Constraint-Driven Writing Is Why It Still Sounds Strong Today

The PSG does not hide weak writing behind effects.

Because channels are limited and timbre control is minimal, strong SMS/Game Gear tracks tend to have:

- Memorable hooks
- Clear rhythmic hierarchy
- Tight note economy

That directness is exactly why the chip remains relevant for modern chiptune and retro-inspired scoring.

---

## Why It Still Matters for BeatBax

SMS/Game Gear support expands BeatBax into another foundational 8-bit sound world while staying aligned with the project's plugin architecture and deterministic design goals:

- Clear, bounded hardware model
- Strong exporter potential (JSON/MIDI first, native formats later)
- Excellent pedagogical value for composition-through-constraints
