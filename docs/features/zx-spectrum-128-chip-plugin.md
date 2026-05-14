---
title: "ZX Spectrum 128 Chip Plugin"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-14
issue: ""
---

## Summary

Implement `@beatbax/plugin-chip-spectrum-128` as the primary AY-compatible PSG target in BeatBax. The plugin is Spectrum-first and also covers Amstrad CPC due to close hardware similarity.

Primary export intent:

- Tracker-based formats: PT3 (ProTracker), Arkos Tracker (where supported)
- Register-stream formats: VGM and raw register dumps
- Homebrew-focused output path: prioritize the most common format per target workflow (typically PT3/Arkos or register stream)

## Problem Statement

A generic AY-wide plugin creates ambiguity across platforms with different clocking, tooling, and homebrew expectations. BeatBax needs explicit platform-scoped plugins so behavior, defaults, and export choices are clear and deterministic.

For this scope, Spectrum 128 is the prioritized AY-compatible target, with Amstrad CPC included as a close sibling profile.

## Scope

Included:

- Spectrum 128 default timing and channel behavior
- Amstrad CPC compatibility profile
- Shared AY-compatible PSG semantics (3 channels, shared noise, shared envelope)
- Export integration for PT3/Arkos/VGM/register stream outputs

Excluded:

- Atari ST specifics (covered by a separate plugin scope)
- Broad multi-platform AY abstraction as a first-class user target

## Technical Notes

- Shared-resource behavior is hardware-accurate and must be explicit in docs and validation.
- Deterministic ordering of register writes is required across render/export paths.
- Plugin-scoped validation should reject conflicting instrument settings around shared envelope/noise ownership.

## Implementation Outline

1. Define plugin package and platform profiles (`zx-spectrum-128` default, `amstrad-cpc` compatibility).
2. Wire channel backend with shared AY-compatible emulator behavior.
3. Add and validate Spectrum-focused song templates.
4. Implement/export adapter contracts for PT3/Arkos/VGM/register streams.
5. Add deterministic regression tests for playback and export.

## Testing Requirements

- Deterministic playback across repeated renders.
- Shared-resource conflict tests (noise/envelope writes) across channels.
- Export snapshot tests for Spectrum default profile.
- Compatibility tests for Amstrad CPC profile.

## Documentation Requirements

- Chip docs live under `docs/chips/zx-spectrum-128/`.
- Feature references should point to this spec rather than AY-named docs.
- Roadmap must remain aligned with Spectrum 128 + Atari ST split.
