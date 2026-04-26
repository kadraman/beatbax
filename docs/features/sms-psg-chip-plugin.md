---
title: "Sega Master System / Game Gear PSG Chip Plugin"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-04-26
issue: "https://github.com/kadraman/beatbax/issues/98"
---

## Summary

Implement Sega Master System / Game Gear PSG support as a BeatBax chip plugin, tentatively named `@beatbax/plugin-chip-sms`.

Scope for v1:

- SN76489-compatible PSG core (3 tone channels + 1 noise channel)
- Deterministic playback in engine/web/CLI
- SMS baseline behavior (mono)
- Game Gear stereo routing semantics (discrete per-channel L/R routing)

Out of scope for v1:

- Optional YM2413 FM extension used by some Sega Mark III/Japanese SMS configurations
- Native VGM export (can be added post-v1)

---

## Problem Statement

BeatBax currently has mature Game Boy and NES coverage, but no Sega PSG backend. This leaves a major 8-bit composition target unsupported and prevents users from writing authentic SMS/Game Gear style music in BeatBax.

A dedicated SMS/Game Gear plugin also provides a strong validation case for plugin architecture reuse across chips with:

- Fixed waveforms
- Driver-defined articulation
- Region-dependent timing subtleties
- Optional stereo-routing capability (Game Gear)

---

## Proposed Solution

### Summary

Create a standalone chip plugin package that:

- Implements the standard `ChipPlugin` interface
- Exposes four channels in hardware order: Tone1, Tone2, Tone3, Noise
- Validates SMS/Game Gear-specific instrument fields
- Renders deterministic PSG output with software-controlled envelopes/macros
- Supports Game Gear-style discrete stereo routing when playback target supports stereo

### Example Syntax

```bax
chip sms
bpm 154

; Tone channels
inst lead   type=tone1  vol=2  vib=2,6
inst harm   type=tone2  vol=5
inst bass   type=tone3  vol=4  arp_env=[0,12|0]

; Noise channel
inst kick   type=noise  noise_mode=white     noise_rate=2   vol_env=[2,4,7,10,13,15]
inst hat    type=noise  noise_mode=white     noise_rate=0   vol_env=[5,9,13,15]
inst metal  type=noise  noise_mode=periodic  noise_rate=tone3  vol=8

; Optional Game Gear terminal-style panning/routing
inst lead_gg type=tone1 vol=2 gg:pan=R
inst harm_gg type=tone2 vol=5 gg:pan=L
inst bass_gg type=tone3 vol=4 gg:pan=C

channel 1 => inst lead seq melody
channel 2 => inst harm seq counter
channel 3 => inst bass seq lowline
channel 4 => inst kick seq drums

play
```

### Example Usage

- `chip sms` selects the SMS/Game Gear PSG backend.
- Channel count is fixed at 4.
- `type=tone1|tone2|tone3|noise` maps directly to hardware voices.
- `gg:pan=L|C|R` is interpreted as Game Gear routing intent and degrades deterministically to mono on SMS output targets.

---

## Implementation Plan

### AST Changes

Prefer additive, optional fields on existing instrument/effect nodes (no structural AST redesign):

- `noise_mode`: `"white" | "periodic"`
- `noise_rate`: `0 | 1 | 2 | "tone3"`
- `gg:pan`: `"L" | "C" | "R"` (discrete Game Gear routing)

Leverage existing generic fields where possible:

- `vol`, `vol_env`, `arp_env`, `pitch_env`, `pan`

### Parser Changes

- Accept `chip sms` directive.
- Validate exactly 4 channels for SMS songs.
- Allow SMS instrument types: `tone1`, `tone2`, `tone3`, `noise`.
- Parse `noise_mode`, `noise_rate`, and `gg:pan`.
- Reject NES/GB-only fields when `chip sms` is active (clear diagnostics).

### CLI Changes

- Auto-discover and register the SMS plugin.
- `beatbax verify` should emit SMS-specific validation errors (invalid channel count, invalid noise fields, invalid pan enum).
- Include SMS in chip selection/help listings.

### Web UI Changes

- Add `sms` to chip selector and syntax hints.
- Ensure editor highlighting includes `tone1|tone2|tone3|noise`, `noise_mode`, `noise_rate`, `gg:pan`.
- Add concise chip quick-help tooltip for SMS/Game Gear channel model.

### Export Changes

v1 export behavior:

- JSON/ISM export: full SMS semantics preserved.
- MIDI export: map pitch events normally, map `gg:pan`/`pan` to CC#10 deterministically.
- WAV preview/export: stereo render supported in engine; SMS mode can collapse to mono.

Post-v1 native export candidates:

- VGM writer path for PSG register stream export.
- Optional chip-specific text export for debugging register writes.

### Documentation Updates

Add and maintain:

- `docs/chips/sms/hardware_guide.md`
- `docs/chips/sms/composition_guide.md`
- `docs/chips/sms/interesting_facts.md`
- This feature document

---

## Testing Strategy

### Unit Tests

- PSG tone period calculation and clamping behavior.
- Noise generator deterministic output for both modes.
- Noise rate mapping (including `tone3`-derived mode).
- Volume attenuation table behavior.
- `gg:pan` routing map to L/R bitmasks.

### Integration Tests

- Parse -> resolve -> schedule -> render determinism snapshots for representative SMS songs.
- Validate stereo/mono parity rules:
  - Game Gear pan intent in stereo playback
  - deterministic mono collapse
- Verify unsupported field diagnostics under `chip sms`.

### Regression Tests

- Ensure no behavioral changes to Game Boy/NES backends.
- Ensure plugin loading order does not affect selected chip behavior.
- Ensure ISM stability: same input yields same scheduled events/output hashes.

---

## Migration Path

No migration required for existing songs.

Adoption path:

1. Add `chip sms` at top of new songs.
2. Use `type=tone1|tone2|tone3|noise` instrument definitions.
3. Optionally add `gg:pan` for Game Gear-aware stereo intent.

---

## Implementation Checklist

- [ ] Create `packages/plugins/chip-sms/` package scaffold
- [ ] Implement plugin entrypoint with 4 channel factories
- [ ] Implement tone backend (shared logic for tone1-3)
- [ ] Implement noise backend (white/periodic + rate modes)
- [ ] Add SMS instrument validator
- [ ] Add parser support for SMS-specific fields
- [ ] Add scheduler/channel-count validation for SMS
- [ ] Register plugin in engine/CLI loading path
- [ ] Add web UI language tokens and chip metadata
- [ ] Add unit + integration + regression tests
- [ ] Add examples under `songs/features/sms/`
- [ ] Document edge cases (region clock behavior, mono fold-down, tone3-noise coupling)

---

## Future Enhancements

- YM2413 FM extension plugin (`chip sms_fm` or `chip sega_fm`) as separate backend.
- Native VGM export with accurate register event timing.
- Optional per-target strictness modes:
  - strict SMS mono mode (reject stereo-only directives)
  - strict Game Gear routing mode (require discrete `gg:pan` values)

---

## Open Questions

1. Should v1 expose `type=tone` + channel binding, or explicit `tone1|tone2|tone3` types only?
2. Should `noise_rate=tone3` be accepted as alias values (for example `3`), or only symbolic form?
3. Should generic `pan` numeric values be auto-snapped for Game Gear export, or require explicit `gg:pan` under strict mode?
4. Should PAL/NTSC timing profile be a plugin option in v1, or deferred to exporter/runtime settings?

---

## References

- `docs/features/plugin-system.md`
- `docs/features/complete/nes-apu-chip-plugin.md`
- `docs/chips/sms/hardware_guide.md`
- `docs/chips/sms/composition_guide.md`
- `docs/chips/sms/interesting_facts.md`

---

## Additional Notes

This feature should preserve BeatBax core contracts:

- Deterministic parse -> AST -> ISM -> schedule pipeline
- No chip-specific mutations to core AST semantics
- Plugin-isolated backend behavior
- Loud, explicit validation for unsupported/ambiguous fields
