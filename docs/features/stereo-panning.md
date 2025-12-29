---
title: Stereo Panning Support
status: proposed
authors: ["kadraman", "copilot"]
created: 2025-12-19
---

## Summary

Introduce a generic `pan` attribute (usable across chips/backends) for hard-left, hard-right, and center panning plus an optional numeric panning form. Provide a Game Boy–specific override `gb:pan` that maps explicitly to NR51 hardware bits when strict hardware semantics are required.

Short rationale: panning is a common musical concept useful across targets; keeping a single AST property increases reuse and future extensibility, while `gb:pan` gives guaranteed GB hardware mapping for exporters like the UGE exporter.

## Motivation

- **Stereo Imaging**: Enhance the depth of compositions by placing instruments in the stereo field.
- **Hardware Accuracy**: Many Game Boy compositions rely on NR51 terminal selection; some users need exact hardware behavior.
- **Reusability**: A generic `pan` attribute avoids duplicating syntax and parsing across multiple chip backends.
- **Compatibility**: hUGETracker and UGE exports benefit from explicit GB mapping when desired.

## Design decision

- Provide a generic `pan` attribute in the AST that all backends may read and interpret.
- Provide a chip-scoped override form `gb:pan` to mean "interpret this value with exact Game Boy NR51 semantics"; other chip namespaces may be added later (e.g. `sfx:pan`).
- Allow `pan` to accept either an enum (L, R, C) for discrete hardware-like panning or a numeric value in [-1.0, 1.0] for software/backends that support continuous stereo positioning.
- Backends/exporters are responsible for mapping generic or numeric pans to target-specific capabilities and must document or log any snapping or loss of precision.

## Proposed Syntax

### Inline Panning (generic)
```bax
# Enum form (discrete): note-level
pat A = C4<pan:L> E4<pan:R> G4<pan:C>

# Numeric form (continuous): -1 left, 0 center, +1 right
pat B = C4<pan=-1.0> E4<pan=0.0> G4<pan=1.0>
```

### Inline Game Boy–specific
```bax
# Force Game Boy NR51 semantics for this token
pat A = C4<gb:pan:L> D4<gb:pan:R>
```

### Instrument Default
```bax
# Generic instrument default
inst lead type=pulse1 pan=L

# Numeric instrument default for software targets
inst pad type=wave pan=0.25

# Game Boy specific default (maps exactly to NR51 bits)
inst lead type=pulse1 gb:pan=L
```

Notes on syntax:
- Accept both inline token-style (e.g. `<pan:L>` or `<pan=-0.5>`) and parameter-style for instrument declarations (e.g. `pan=L` or `pan=0.5`).
- The namespace prefix `gb:` applies the explicit Game Boy mapping semantics; if omitted, `pan` is treated generically and backends decide how to map it.

## Hardware Mapping (Game Boy)

The Game Boy `NR51` register provides per-channel left/right toggles. For the GB exporter, enum values map exactly to bits:

| Bax Pan | NR51 Left Bit | NR51 Right Bit | Result |
|---------|---------------|----------------|--------|
| `L`     | 1             | 0              | Left Only |
| `R`     | 0             | 1              | Right Only |
| `C`     | 1             | 1              | Center (Both) |

Numeric-to-GB mapping guidance for exporters:
- If `gb:pan` is used with a numeric value, exporters SHOULD either reject it (error) or snap deterministically to the nearest enum (recommended snap thresholds e.g. pan < -0.33 -> L, pan > 0.33 -> R, otherwise C). Use a warning or a strict-export flag to control rejection vs snapping.
- If generic `pan` is numeric and the GB exporter receives it, snap with deterministic thresholds and emit a warning about loss of precision.

## Backends and semantics

- WebAudio/Browser: Prefer continuous numeric pan using StereoPannerNode where supported. Accept enum forms and map `L` -> -1, `C` -> 0, `R` -> +1.
- Game Boy (UGE exporter): Honor `gb:pan` exactly (map to NR51 bits). For generic `pan` values, map enum forms exactly; map numeric by snapping (document and warn). Provide an option (e.g. `--strict-gb-pan`) to fail on non-enum numeric pans when strict hardware accuracy is required.
- Other chip exporters: Map `pan` to their native primitives or provide a best-effort mapping. If a target cannot represent panning, exporter should ignore with a warning or implement a software stereo post-process.

## AST / Parser changes

- Add optional property `pan` to AST nodes where relevant:
  - NoteToken.pan: union type { enum: 'L'|'R'|'C' } | { value: number } and optional `sourceNamespace?: string` to record `"gb"` when `gb:pan` is used.
  - InstrumentNode.pan: same union type as NoteToken.pan.
- Parser responsibilities:
  - Accept `pan` and namespaced `gb:pan` in both inline and instrument parameter forms.
  - Parse enum (`L|R|C`) or numeric values in [-1.0, 1.0].
  - Set `sourceNamespace` when a namespace prefix is present (e.g. `gb:`).
  - Validate and emit helpful parse errors or warnings for out-of-range numeric values.

## Implementation Checklist

- [ ] Update AST: add `NoteToken.pan` and `InstrumentNode.pan` (union type) and optional `sourceNamespace` tracking.
- [ ] Update parser: support `pan` and `gb:pan` in inline and parameter forms; support enum and numeric values; validate ranges.
- [ ] Update docs: this file (done) and add quick reference in syntax guide for `pan` and `gb:pan`.
- [ ] WebAudio backend: implement `PannerNode`/StereoPanner mapping for numeric pan and enum mapping for discrete values.
- [ ] UGE exporter (Game Boy): implement NR51 mapping for `gb:pan`; deterministic snapping for numeric `pan` with warnings; provide strict mode option.
- [ ] Add unit tests: parser tests for enum/numeric and namespaced forms; exporter tests verifying NR51 bit outputs for `gb:pan` and snapping behavior for numeric inputs.
- [ ] Add integration/smoke tests and sample songs demonstrating `pan` and `gb:pan`.

## Examples

1) Generic pan used across targets:
```bax
inst lead type=pulse1 pan=L
pat A = C4<pan:L> E4<pan:-0.5> G4<pan=0.5>
```

2) Force Game Boy hardware NR51 semantics:
```bax
inst lead type=pulse1 gb:pan=L
pat A = C4<gb:pan:C> D4<gb:pan:R>
```

## Testing and warnings

- Exporters MUST document how they map generic `pan` values to target capabilities.
- Exporters SHOULD emit warnings when a requested pan cannot be represented exactly and is being snapped.
- Provide an option to treat such mismatches as errors when the user requires strict hardware fidelity.

## Rationale (brief)

Making `pan` generic increases reuse and avoids duplicated syntax. The `gb:pan` namespaced override maintains the ability to express exact Game Boy NR51 semantics for accuracy-sensitive exports (hUGETracker/UGE workflows).


## History

- 2025-12-19: initial proposal
