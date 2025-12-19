---
title: Stereo Panning Support
status: proposed
authors: ["kadraman", "copilot"]
created: 2025-12-19
---

## Summary

Add support for hard-left, hard-right, and center panning for all four Game Boy channels. This maps to the hardware's terminal selection capabilities (NR51 register).

## Motivation

- **Stereo Imaging**: Enhance the depth of compositions by placing instruments in the stereo field.
- **Hardware Accuracy**: Every Game Boy game uses panning for sound separation.
- **UGE Compatibility**: hUGETracker supports panning; maintaining this is vital for high-quality exports.

## Proposed Syntax

### Inline Panning
```bax
# Syntax: note<pan:L|R|C>
pat A = C4<pan:L> E4<pan:R> G4<pan:C>
```

### Instrument Default
```bax
# Set a default panning for an instrument
inst lead type=pulse1 pan=L
```

## Hardware Mapping

The Game Boy's `NR51` register allows each of the 4 channels to be toggled for the Left and Right terminals.

| Bax Pan | NR51 Left Bit | NR51 Right Bit | Result |
|---------|---------------|----------------|--------|
| `L`     | 1             | 0              | Left Only |
| `R`     | 0             | 1              | Right Only |
| `C`     | 1             | 1              | Center (Both) |

## Implementation Checklist

- [ ] Update `NoteToken` and `InstrumentNode` AST to include `pan`.
- [ ] Update parser to handle `pan:L|R|C` and `pan=` parameters.
- [ ] Implement `PannerNode` or equivalent logic in the Web Audio backend.
- [ ] Add panning support to the UGE exporter.
- [ ] Add unit tests for panning syntax.
