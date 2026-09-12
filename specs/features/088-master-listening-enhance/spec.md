---
title: "Optional master listening enhancement (compression + EQ)"
id: 88
slug: "master-listening-enhance"
status: "in-progress"
authors:
  - "cursor-agent"
created: "2026-09-12"
updated: "2026-09-12"
issue: ""
area: "engine"
related:
  - "specs/complete/004-daw-channel-mixer/spec.md"
  - "specs/complete/077-web-audio-loudness-and-meter-display/spec.md"
  - "specs/complete/064-vgm-exporter-plugin/spec.md"
---
## Summary

Add an **optional, preview-only** master listening bus with gentle glue compression, make-up gain, and presence EQ so Web/Desktop playback can sound fuller against typical native/web players — without changing hardware-faithful chip gains or export loudness.

## Problem

Live preview routes `channel buses → masterGain → DynamicsCompressor (soft limiter) → destination`. Chip gains stay deliberately conservative (headroom for dense mixes). The existing compressor is a **clipping safety net** (threshold −6 dB, ratio 12) with **no make-up gain**, so average/RMS loudness stays low and thin square/pulse content can feel weak next to EQ’d/limited commercial players (~−14 LUFS).

Retro authenticity does not forbid optional modern mixing on the listening path (precedent: `NES_LISTENING_GAIN`, display-only meter gain). Hardware exports must remain dry ([064](../../complete/064-vgm-exporter-plugin/spec.md)).

## User scenarios

### User Story 1 — Stronger preview by default (Priority: P1)

**Why this priority**: Addresses weak Web/Desktop loudness without reopening chip-gain clipping regressions from 077.

**Independent test**: Play a sparse NES and dense GB song with Mild; switch to Off and confirm quieter/thinner dry mix; exports unchanged.

**Acceptance scenarios**:

1. **Given** a new user with no stored preference, **When** live playback starts, **Then** listening enhance mode is **Mild**.
2. **Given** Mild or Strong, **When** audio plays through a live `AudioContext`, **Then** the graph is `masterGain → presence EQ → [optional low shelf] → glue compressor → make-up gain → soft limiter → destination`.
3. **Given** Off, **When** audio plays, **Then** the graph is `masterGain → soft limiter → destination` (077 behaviour).
4. **Given** an `OfflineAudioContext` / export render, **When** enhance is Mild/Strong in UI storage, **Then** the Player still wires the **dry** chain (effective Off).

### User Story 2 — Mixer control (Priority: P1)

**Why this priority**: Channel Mixer is the natural place for master listening controls (004 deferred EQ; this is master-only).

**Acceptance scenarios**:

1. **Given** the Channel Mixer master strip, **When** the user selects Off / Mild / Strong, **Then** playback rewires immediately and the choice persists in localStorage.
2. **Given** the control, **When** the user hovers/focuses it, **Then** a tooltip clarifies listening-only (does not affect exports).

### Edge cases

- Missing `createBiquadFilter` / second compressor: fall back to dry limiter chain.
- Mode changes while playing: rewire without blanket `masterGain.disconnect()` (preserve analyser taps).
- Strong mode adds a mild low-shelf cut; Mild does not.

## Requirements

### Functional requirements

- **FR-001**: Engine MUST support `ListeningEnhanceMode = 'off' | 'mild' | 'strong'` via `Player.setListeningEnhance(mode)`.
- **FR-002**: Live preview MUST keep the existing soft limiter as the final stage before destination.
- **FR-003**: Offline/export contexts MUST force effective Off regardless of requested mode.
- **FR-004**: Chip mix constants MUST NOT change.
- **FR-005**: Default WAV/VGM/UGE (and PCM parity) paths MUST remain dry.
- **FR-006**: Desktop and web-lite Channel Mixer master strips MUST expose Off/Mild/Strong with persistence.

### Non-goals

- Per-channel EQ / compressors / sends
- LUFS metering or automatic LUFS targeting
- Replacing the soft limiter
- Baking enhancement into hardware exports

## Success criteria

- **SC-001**: Mild raises perceived loudness/presence vs Off without harsh pumping on dense GB mixes.
- **SC-002**: Soft limiter still prevents brick-wall clipping at 100% master.
- **SC-003**: Unit tests cover Off vs Mild/Strong wiring and OfflineAudioContext dry force.
- **SC-004**: Analyser taps on `masterGain` survive rewiring.

## Assumptions

- Web Audio `BiquadFilterNode` + second `DynamicsCompressorNode` + make-up `GainNode` are sufficient (no AudioWorklet).
- Default Mild is acceptable for listening; authenticity users can choose Off.

## Open questions

- None for this pass (CLI `--listening-enhance` deferred).

## References

- [004 DAW channel mixer](../../complete/004-daw-channel-mixer/spec.md) — EQ was future/out of scope
- [077 loudness / limiter](../../complete/077-web-audio-loudness-and-meter-display/spec.md) — protective master compressor
- [064 VGM loudness policy](../../complete/064-vgm-exporter-plugin/spec.md) — no export boost
