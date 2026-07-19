---
title: "Spectrum-128 / Amstrad CPC Arkos Exporter"
status: complete
authors: ["kadraman", "GitHub Copilot"]
created: 2026-06-04
completed: 2026-07-19
issue: "https://github.com/kadraman/beatbax/issues/130"
---

## Completion Status

**v1 (experimental) is complete and shippable.**

`@beatbax/plugin-exporter-arkos` exports simple Spectrum-128 / CPC songs to Arkos Tracker 3 `.aks` (and optional `.aki` instrument banks). Validated from CLI and desktop/browser: sample songs open cleanly in Arkos Tracker 3.5.x.

**v1 representable subset:** notes / rests / sustains, `vol`, `noise_rate`, `tone_mix`, `tone`, up to 3 tone channels. Unsupported macros and inline effects fail hard with diagnostics.

**Follow-up:** full compatibility (macros, buzz bass, effects, richer AT3 mapping) is tracked in `docs/features/spectrum-cpc-arkos-exporter-phase-2.md` and `.github/ISSUES/spectrum-cpc-arkos-export-phase-2.md`.

## Summary

Implement an Arkos Tracker exporter plugin for Spectrum-128 / Amstrad CPC songs so BeatBax can produce tracker-native `.AKS` and `.AKI` artifacts for AY workflows.

This feature is separate from the Spectrum chip plugin itself and focuses only on exporter behavior.

## Problem Statement

The Spectrum/CPC chip plugin is implemented, but Arkos export was missing. Users targeting Arkos Tracker workflows need a deterministic, documented mapping from BeatBax song semantics to Arkos file formats.

Without this exporter, Spectrum/CPC authoring in BeatBax lacks a direct integration path into many homebrew pipelines.

## Proposed Solution

### Summary

Create `@beatbax/plugin-exporter-arkos` as a standalone exporter plugin package that:

- Consumes validated song data for Spectrum/CPC targets
- Lowers BeatBax structure to Arkos-compatible intermediate data
- Emits `.AKS` (song/pattern/order data) and `.AKI` (instrument data)
- Enforces deterministic output for reproducible builds
- Emits explicit diagnostics when a mapping is unsupported

### Example Syntax

```bax
chip spectrum-128
bpm 120
stepsPerBar 4

inst tone1 type=tone1 vol=10
inst tone2 type=tone2 vol=10
inst tone3 type=tone3 vol=10

pat riff_a = C4 D4 E4 F4
pat riff_b = C3 D3 E3 F3
pat riff_c = C2 D2 E2 F2

seq main_a = riff_a riff_a riff_a riff_a
seq main_b = riff_b riff_b riff_b riff_b
seq main_c = riff_c riff_c riff_c riff_c

channel 1 => inst tone1 seq main_a
channel 2 => inst tone2 seq main_b
channel 3 => inst tone3 seq main_c

play
```

### Example Usage

```bash
# Full song (.aks) — CLI and desktop (same behaviour)
beatbax export arkos songs/spectrum-128/instruments/ay_synth_channels.bax

# Instrument bank only (.aki) — CLI opt-in
beatbax export arkos songs/spectrum-128/instruments/ay_synth_channels.bax --instruments
```

Default song export writes `songname.aks` (instruments embedded). Optional `--instruments` writes `songname.aki` only.

## What shipped (v1)

- Package `@beatbax/plugin-exporter-arkos` with lowering, serializers, validation
- AT3 plain XML `formatVersion` 3.0 (opens in Arkos Tracker 3.5.x)
- CLI + desktop/browser export of `.aks`
- CLI `--instruments` for `.aki` bank extract
- MIDI→Arkos note mapping (`midi − 12`; BeatBax `C4` → Arkos `C-4` / note 48)
- Looping single-cell instruments for BeatBax constant-`vol` sustain
- Fail-hard diagnostics for unsupported macros/effects
- Unit tests + README / feature documentation

## Implementation Checklist

- [x] Create `@beatbax/plugin-exporter-arkos` package
- [x] Define v1 representable subset and diagnostics contract
- [x] Implement intermediate lowering pipeline
- [x] Implement `.AKS` serializer
- [x] Implement `.AKI` serializer
- [x] Wire CLI export format registration
- [x] Wire desktop/browser exporter registry
- [x] Add unit and integration tests
- [x] Document supported subset and known limitations
- [x] Validate sample `.aks` files open cleanly in Arkos Tracker 3 (CLI + UI)
- [x] Desktop/browser export smoke-test

## Known v1 limitations

Intentionally unsupported (fail-hard):

- `arp_env`, `pitch_env`, `vol_env`, `env_bass`, `env_shape`
- `noise_frames`, `tone_frames`
- Inline pattern effects (e.g. `volSlide`)

These are the primary phase-2 targets.

## Migration Path

No migration required. Additive exporter functionality.

## Future Enhancements

See phase 2: `docs/features/spectrum-cpc-arkos-exporter-phase-2.md`.

## References

- `docs/features/complete/zx-spectrum-128-chip-plugin.md`
- `docs/features/spectrum-cpc-arkos-exporter-phase-2.md`
- `.github/ISSUES/spectrum-cpc-arkos-export.md` (v1)
- `.github/ISSUES/spectrum-cpc-arkos-export-phase-2.md`
- `packages/plugins/export-arkos/README.md`
- `ROADMAP.md`
