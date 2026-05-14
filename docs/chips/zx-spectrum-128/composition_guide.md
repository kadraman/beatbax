# ZX Spectrum 128 Composition Guide

This guide focuses on practical arrangement for the ZX Spectrum 128 AY-compatible PSG target.

## Core Constraints

- Three melodic channels only.
- One shared noise generator.
- One shared envelope generator.
- Shared mixer register.

These constraints define almost every successful Spectrum arrangement pattern.

## Practical Channel Strategy

Common role split:

- Channel A: lead melody
- Channel B: arpeggio/harmony support
- Channel C: bass (often envelope-driven buzz bass)

Then borrow channel time for percussion by brief noise gating on one channel.

## Envelope Bass Technique

The classic Spectrum buzz bass uses repeating envelope shapes at short envelope periods.

Compute envelope period from note target:

$$
N_{env} = \left\lfloor \frac{f_{clock}}{256 \times f_{note}} \right\rfloor
$$

Set channel volume to envelope mode and select a repeating shape for sustained bass tone.

## Tone + Noise Texture

For metallic plucks and crunchy transients, enable both tone and noise on the same channel briefly.

Typical usage:

- Attack: tone+noise for 1-2 frames
- Sustain: tone only

This creates audible detail without requiring a dedicated drum channel.

## Noise Percussion Workflow

Because noise period is global, prioritize a drum palette that works with one period range per phrase.

Suggested starting points:

- Closed hat: low period (bright)
- Snare: mid period
- Kick transient: high period (dark)

If multiple drums overlap, remember the latest write to R6 wins.

## Arpeggios as Harmony Compression

Use fast arpeggios to imply chords while preserving channels for bass and melody.

Typical patterns:

- Root-5th-octave
- Root-3rd-5th
- Root-flat3-5th

At frame-rate stepping, these fuse into stable harmonic color on real hardware and emulators.

## Spectrum-Specific Export Intent

When composing for this plugin, prioritize export paths that match common Spectrum/homebrew workflows:

- Tracker-oriented: PT3 and Arkos formats where supported
- Register-stream: VGM or raw register streams

Use rendered WAV/OGG as preview artifacts, not as hardware-native outputs.
