# ZX Spectrum 128 (AY-3-8912) Hardware Guide

This guide documents the ZX Spectrum 128 audio target in BeatBax. The platform uses an AY-compatible PSG (AY-3-8912), with three tone channels, shared noise, and a shared hardware envelope generator.

BeatBax treats this as a Spectrum-focused target, while retaining compatibility with closely related AY platforms where explicitly supported.

## Hardware Summary

| Property | Value |
|---|---|
| Chip | AY-3-8912 (AY family variant) |
| Tone channels | 3 (A, B, C) |
| Noise generator | 1 shared |
| Envelope generator | 1 shared |
| Register count | 16 (R0-R15), AY-3-8912 variant omits one I/O port compared to AY-3-8910 |
| Typical clock | 1,773,400 Hz effective |
| Typical frame rate | 50 Hz (PAL Spectrum workflows) |

## Register Ownership Rules (Important)

Spectrum AY-style composition is constrained by shared hardware resources:

- R6 (noise period) is global and last-writer-wins.
- R11-R13 (envelope period + shape) are global and last-writer-wins.
- R7 mixer bits are shared state (per-channel enable bits packed into one register).

This is why percussion, buzzy envelope bass, and overlapping envelopes must be arranged deliberately.

## Frequency Formulas

Tone frequency:

$$
f_{tone} = \frac{f_{clock}}{16 \times \max(1, N)}
$$

Envelope-as-oscillator frequency (buzz bass workflows):

$$
f_{env} = \frac{f_{clock}}{256 \times \max(1, N_{env})}
$$

Where $f_{clock}$ is the Spectrum target clock and $N$/$N_{env}$ are register periods.

## Mixer Semantics

R7 uses active-low enable bits:

- Tone enable bits for channels A/B/C
- Noise enable bits for channels A/B/C

A channel can be tone-only, noise-only, tone+noise, or silent.

## Volume and Envelope

- Fixed channel volume is 4-bit (0-15).
- Setting envelope mode on a channel routes amplitude from the shared hardware envelope.
- Repeating envelope shapes can be used as audible bass oscillators at short periods.

## Stereo Notes

Spectrum 128 playback commonly follows ABC wiring conventions in many tools and playback setups:

- A left
- B center (or mixed)
- C right

Routing is platform/circuit dependent, not chip-register controlled.

## BeatBax Targeting Notes

For the Spectrum 128 plugin:

- Prefer Spectrum timing defaults and tracker expectations.
- Keep exports aligned with common Spectrum/homebrew workflows (PT3/Arkos where applicable), plus register-stream exports such as VGM.
- Preserve deterministic register ordering and timing across renderers.
