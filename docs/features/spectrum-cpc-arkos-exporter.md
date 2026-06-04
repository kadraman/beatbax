---
title: "Spectrum-128 / Amstrad CPC Arkos Exporter"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-06-04
issue: "https://github.com/kadraman/beatbax/issues/130"
---

## Summary

Implement an Arkos Tracker exporter plugin for Spectrum-128 / Amstrad CPC songs so BeatBax can produce tracker-native `.AKS` and `.AKI` artifacts for AY workflows.

This feature is separate from the Spectrum chip plugin itself and focuses only on exporter behavior.

## Problem Statement

The Spectrum/CPC chip plugin is implemented, but Arkos export is still missing. Users targeting Arkos Tracker workflows need a deterministic, documented mapping from BeatBax song semantics to Arkos file formats.

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
bpm 138

inst lead type=tone1 vol=12 arp_env=[0,4,7|0]
inst bass type=tone2 vol=14
inst drum type=tone3 tone_mix=true noise_rate=8 vol=11

pat a = C4 E4 G4 C5 B4 G4 E4 .
pat b = C2 . . . G1 . . .
pat d = drum . . drum . drum . .

seq lead = a a a a
seq bass = b b b b
seq beat = d d d d

channel 1 => inst lead seq lead
channel 2 => inst bass seq bass
channel 3 => inst drum seq beat

play
```

Example CLI intent (final command shape may differ):

```bash
beatbax export arkos songs/spectrum-128/instruments/ay_macro_arp_pitch.bax --out build/arkos/
```

### Example Usage

Expected outputs for a successful export:

- `songname.aks`
- `songname.aki`

Both files should be deterministic for identical song content and exporter options.

## Implementation Plan

### AST Changes

No AST schema changes are required for v1.

### Parser Changes

No parser changes are required for v1.

### CLI Changes

- Register Arkos exporter format in CLI exporter registry.
- Add output naming conventions for `.AKS` / `.AKI`.
- Add diagnostics for unsupported mappings and invalid target-chip usage.

### Web UI Changes

- Optional: expose Arkos export option in Web UI export panel once CLI/plugin path is stable.
- Keep UX messaging consistent with CLI diagnostics.

### Export Changes

Create package:

```text
packages/plugins/export-arkos/
```

Core modules:

- `index.ts`: plugin entry and capability declaration
- `validate-export.ts`: preflight checks and unsupported mapping diagnostics
- `arkos-lowering.ts`: BeatBax-to-Arkos intermediate mapping
- `arkos-patterns.ts`: row and pattern conversion
- `arkos-orders.ts`: sequence/order conversion
- `arkos-instruments.ts`: instrument conversion to Arkos-compatible model
- `arkos-serialize-aks.ts`: `.AKS` writer
- `arkos-serialize-aki.ts`: `.AKI` writer

Design requirements:

1. Deterministic serialization.
2. No silent lossy conversion for unsupported semantics.
3. Explicit chip validation (`spectrum-128`, `cpc`, `amstrad-cpc`).
4. Stable intermediate model for snapshot testing.

### Documentation Updates

- Add exporter README under `packages/plugins/export-arkos/README.md`.
- Update roadmap/export references once implementation lands.
- Cross-link from Spectrum chip docs and feature references.

## Testing Strategy

### Unit Tests

- Pattern conversion: note/rest/order handling and row packing
- Instrument conversion: valid representable mappings and rejection cases
- Serializer determinism: repeated runs produce identical bytes
- Validation diagnostics: unsupported effects/macros/edge cases are clear

### Integration Tests

- Export representative Spectrum/CPC sample songs to `.AKS` / `.AKI`
- Snapshot outputs and compare against baselines
- Validate behavior for both `chip spectrum-128` and `chip cpc`

## Migration Path

No migration required for existing songs. This is additive exporter functionality.

## Implementation Checklist

- [ ] Create `@beatbax/plugin-exporter-arkos` package
- [ ] Define v1 representable subset and diagnostics contract
- [ ] Implement intermediate lowering pipeline
- [ ] Implement `.AKS` serializer
- [ ] Implement `.AKI` serializer
- [ ] Wire CLI export format registration
- [ ] Add unit and integration tests with deterministic snapshots
- [ ] Document supported subset and known limitations

## Future Enhancements

- Broader mapping support for additional effect and macro combinations
- Optional profile modes for stricter vs permissive export behavior
- Potential import/round-trip validation tooling for Arkos workflows

## Open Questions

1. Which BeatBax effects/macros are in-scope for v1 Arkos mapping?
2. Should v1 fail hard on all lossy mappings, or allow an explicit opt-in compatibility mode?
3. Are there version-specific Arkos format constraints that must be pinned in v1?

## References

- `docs/features/zx-spectrum-128-chip-plugin.md`
- `docs/chips/zx-spectrum-128/composition_guide.md`
- `.github/ISSUES/spectrum-cpc-arkos-export.md`
- `ROADMAP.md`

## Additional Notes

The user request referenced `@beatbax/spectrum-128`. In repository conventions, the chip plugin package is `@beatbax/plugin-chip-spectrum-128`; this feature targets export for that chip target and its CPC aliases.
