---
title: "ZX Spectrum 128 Improved Noise, Percussion, and Envelope Modelling"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-14
issue: ""
---

## Summary

This feature refines the Spectrum 128 plugin implementation to model AY-compatible shared hardware behavior accurately for noise, envelope, and mixer interactions.

Focus areas:

- Shared chip-level noise/envelope state
- Hardware-accurate tone+noise mixer semantics
- Envelope-as-oscillator bass workflows
- Deterministic PCM and WebAudio behavior

## Why This Exists

Per-channel independent oscillators do not match the hardware model used by Spectrum 128 workflows. Accurate composition and export require one shared noise generator, one shared envelope generator, and deterministic register ownership behavior.

## Planned Improvements

1. Central shared emulator state across all three channels.
2. Hardware-accurate formulas for tone/noise/envelope timing.
3. Explicit validation for shared-resource collisions and incompatible instrument settings.
4. Better percussion defaults for Spectrum-style arrangement patterns.
5. Deterministic render tests across channel ordering.

## Export Alignment

Changes in this feature must preserve exporter contracts and improve fidelity for:

- PT3/Arkos-oriented workflows where supported
- VGM/register-stream outputs

## Test Matrix

- Shared-noise correctness under overlapping channel triggers.
- Shared-envelope correctness under overlapping envelope writes.
- Tone+noise mixed timbre behavior vs tone-only/noise-only baselines.
- Deterministic output across repeated renders and different channel render orders.

## Related Docs

- `docs/features/zx-spectrum-128-chip-plugin.md`
- `docs/chips/zx-spectrum-128/hardware_guide.md`
- `docs/chips/zx-spectrum-128/composition_guide.md`
