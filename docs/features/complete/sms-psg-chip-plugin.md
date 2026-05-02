---
title: "Sega Master System / Game Gear PSG Chip Plugin"
status: complete
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
# SMS attenuation semantics: vol / vol_env values are SN76489 attenuation levels.
# 0 = loudest, 15 = mute. A decay envelope counts UP toward 15.

chip sms ntsc        ; optional region qualifier: ntsc (default) or pal
bpm 154

; Tone channels
inst lead   type=tone1  vol=2  vib=2,6  pitch_env=[-1,0,1,0|-1]   ; vibrato via pitch macro
inst harm   type=tone2  vol=5
inst bass   type=tone3  vol=4  arp_env=[0,12|0]
inst stab   type=tone1  vol_env=[0,3,6,9,12,15]  pitch_env=[4,2,0]   ; punchy decay with pitch fall

; Noise channel
inst kick   type=noise  noise_mode=white     noise_rate=2   vol_env=[0,4,8,12,15]
inst hat    type=noise  noise_mode=white     noise_rate=0   vol_env=[3,9,15]
inst snare  type=noise  noise_mode=white     noise_rate=1   vol_env=[0,5,10,15]  noise_rate_env=[1,2|1]
inst metal  type=noise  noise_mode=periodic  noise_rate=tone3  vol=8
inst sweep  type=noise  noise_mode=white     noise_rate=3   noise_rate_env=[0,1,2,3]  vol_env=[3,6,9,12,15]

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
- `chip sms ntsc` / `chip sms pal` — optional region qualifier. Selects the SN76489 clock rate used for tone period and frequency calculations. `ntsc` (3,579,545 Hz) matches North American and Japanese hardware; `pal` (3,546,895 Hz) matches European hardware. Defaults to `ntsc` when omitted. The qualifier is only valid for `chip sms`; using it with any other chip name is a parser error.
- Channel count is fixed at 4.
- `type=tone1|tone2|tone3|noise` maps directly to hardware voices.
- `gg:pan=L|C|R` is interpreted as Game Gear routing intent and degrades deterministically to mono on SMS output targets.
- **`vol` / `vol_env` attenuation semantics:** Values are raw SN76489 attenuation levels. `0` = loudest; `15` = mute. A decay envelope counts **upward** toward `15` (for example `vol_env=[0,4,8,12,15]`). This matches the hardware register convention and differs from chips where `vol=0` means silent.
- **`volSlide` direction:** positive `delta` = louder (attenuation decreases); negative `delta` = quieter (attenuation increases). This is consistent with BeatBax's cross-chip convention where `volSlide:+N` always means "get louder".

### Effects Support

The SN76489 has **no hardware LFO, no hardware envelopes, and no hardware sweep unit**. All effects are implemented in software by writing registers at sub-frame resolution (per-tick period/volume writes). This means effects are generally achievable but with coarser fidelity than chips with dedicated hardware support.

Because VGM is a register-stream format, any effect that resolves to per-tick register writes exports transparently to VGM — there is no secondary mapping step required. The VGM exporter consumes the expanded ISM event stream directly.

| Effect | SMS Support | Mechanism | VGM Export | Notes |
|--------|-------------|-----------|------------|-------|
| `pan` / `gg:pan` | ✅ Supported (`gg:pan` only) | Game Gear stereo register (discrete L/C/R per channel) | ✅ `0x4F` stereo command (VGM ≥ 1.61) | SMS (mono) target ignores routing intent deterministically. Generic `pan` numeric values are snapped to `L`/`C`/`R`. |
| `vib` | ⚠️ Approximate | Per-tick period register writes simulating a pitch LFO | ✅ Bakes into `0x50` PSG write stream | Frequency resolution is coarse at high pitches (large period = fine steps; small period = coarse steps). Fine vibrato depth may be unachievable at some pitches. Can also be expressed via looping `pitch_env` macro. |
| `port` | ⚠️ Approximate | Stepped period writes per tick toward target pitch | ✅ Bakes into `0x50` PSG write stream | Step size is non-uniform across the frequency range; slides are perceptibly coarser at lower pitches. Non-linear curves (exp, log) are quantised to period steps. |
| `arp` | ⚠️ Approximate | Rapid per-tick period writes cycling through offsets | ✅ Bakes into `0x50` PSG write stream | Classic SMS technique. Can also be expressed via looping `arp_env` macro. Fidelity is good given the chip's square-wave character. |
| `volSlide` | ⚠️ Approximate | Per-tick volume attenuation register writes | ✅ Bakes into volume `0x50` write stream | 4-bit attenuation (16 steps, 0 = loudest, 15 = mute) means slides are quantised. Smooth fade curves will step visibly. Can also be expressed via `vol_env` macro. |
| `trem` | ⚠️ Approximate | Periodic per-tick volume writes simulating amplitude LFO | ✅ Bakes into volume `0x50` write stream | Same 4-bit quantisation as `volSlide`. Tremolo depth is limited to ≤16 distinct levels. Fast rate combined with coarse resolution can produce audible stairstepping. |
| `cut` | ✅ Supported | Set volume attenuation to `15` (mute) after N ticks | ✅ Emits a single volume `0x50` write at tick N | Exact and reliable. No waveform restart side-effect. |
| `retrig` | ⚠️ Approximate | Re-write period register to force waveform restart | ⚠️ Register writes emitted; phase-reset fidelity depends on VGM player SN76489 implementation | The SN76489 does not have an explicit key-on trigger. Phase reset on period rewrite is implementation-defined. Results may differ between emulators and real hardware. Use with caution. |
| `bend` | ⚠️ Approximate | Stepped period writes toward target pitch with optional curve | ✅ Bakes into `0x50` PSG write stream | Non-linear curves (exp, log, sine) are quantised to the 10-bit period register. Fidelity is similar to `port`. |
| `sweep` | ❌ Not supported | N/A — Game Boy NR10 hardware only | ❌ | The SN76489 has no hardware sweep unit. Using `sweep` under `chip sms` is a validation error. Use `pitch_env` or `bend` instead for equivalent pitch-ramp effects. |
| `echo` | ❌ Not supported | N/A — no delay buffer; insufficient spare channels | ❌ | The SN76489 has 4 channels total. No spare voices exist to dedicate to echo repeats. Using `echo` under `chip sms` is a validation error with a diagnostic. |

**Effect export summary for VGM:**
- ✅ 9 of 11 effects export correctly to VGM via the register write stream.
- ⚠️ `retrig` exports register writes but phase-reset is player-dependent.
- ❌ `sweep` and `echo` are rejected at validation time and never reach the export stage.

---

## Implementation Plan

### AST Changes

Prefer additive, optional fields on existing instrument/effect nodes (no structural AST redesign).

#### SMS-specific hardware fields

| Field | Type | Description |
|-------|------|-------------|
| `noise_mode` | `"white" \| "periodic"` | LFSR feedback mode |
| `noise_rate` | `0 \| 1 \| 2 \| "tone3"` | Noise clock source (0–2 = fixed dividers, `"tone3"` = derived from Tone 3 period) |
| `gg:pan` | `"L" \| "C" \| "R"` | Discrete Game Gear stereo routing; collapses deterministically to mono on SMS targets |

#### Software macro fields (new for SMS — no hardware envelope support)

The SN76489 has no hardware envelope or LFO units. All articulation is software-driven via per-tick register writes. The following macro fields are required to achieve any meaningful instrument expressiveness on this chip:

| Field | Type | Description |
|-------|------|-------------|
| `vol_env` | `[v0,v1,…\|N]` | Software volume macro: per-tick attenuation levels 0–15; optional `\|N` loop point. `0` = loudest, `15` = mute (hardware attenuation convention). |
| `arp_env` | `[0,s1,s2,…\|N]` | Software arpeggio macro: per-tick semitone offsets from root note, looping for continuous chord shimmer. |
| `pitch_env` | `[s0,s1,…\|N]` | Software pitch macro: per-tick semitone offset from root note. Use for pitch slides, vibrato emulation, fall-off, and bend-in effects. |
| `noise_rate_env` | `[r0,r1,…\|N]` | **SMS-specific.** Per-tick noise rate index sequence (0–2 or `3` for tone3-derived). Enables animated percussion timbres and tuned-noise sweep effects. Overrides `noise_rate` when present. |

> `duty_env` does not apply to SMS tone channels — the SN76489 outputs a fixed 50% duty square wave with no hardware duty modulation.

Leverage existing generic fields where possible:

- `vol`, `pan`

### Parser Changes

- Accept `chip sms` directive (with optional `ntsc` / `pal` region qualifier).
- Validate exactly 4 channels for SMS songs.
- Allow SMS instrument types: `tone1`, `tone2`, `tone3`, `noise`.
- Parse `noise_mode`, `noise_rate`, and `gg:pan`.
- Parse SMS software macro fields (`vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`).
- Reject NES/GB-only fields when `chip sms` is active (clear diagnostics).
- Reject `sweep` effect under `chip sms` with a clear error: "hardware pitch sweep is a Game Boy NR10 feature; use `pitch_env` or `bend` instead".
- Reject `echo` effect under `chip sms` with a clear error: "echo/delay requires spare channels; the SN76489 has no delay buffer and no spare voices".
- Emit a diagnostic warning for `retrig` under `chip sms`: "note retriggering on SN76489 is emulation-dependent; phase-reset behaviour may differ between targets".

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

- **VGM export:** A dedicated `@beatbax/plugin-exporter-vgm` exporter plugin is specified separately in `docs/features/vgm-exporter-plugin.md`. Because VGM is a register-stream format, instrument macros (`vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`) expand transparently into the SN76489 register write sequence — no special macro-to-VGM mapping is needed beyond tick-level state tracking. The SMS chip plugin will declare the VGM exporter in its `exporterPlugins` field once available. Game Gear stereo routing (`gg:pan`) maps to VGM `0x4F` stereo commands (requires VGM version ≥ 1.61).
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
- [ ] Add parser support for SMS-specific hardware fields (`noise_mode`, `noise_rate`, `gg:pan`)
- [ ] Add parser support for SMS software macro fields (`vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`)
- [ ] Validate `noise_rate_env` values are in range 0–3 (reject out-of-range values with clear diagnostics)
- [ ] Reject `duty_env` under `chip sms` (clear error: fixed 50% duty, no hardware duty modulation)
- [ ] Reject `sweep` effect under `chip sms` (clear error with `pitch_env`/`bend` alternative suggestion)
- [ ] Reject `echo` effect under `chip sms` (clear error: no delay buffer, no spare channels)
- [ ] Emit diagnostic warning for `retrig` under `chip sms` (phase-reset is emulation-dependent)
- [ ] Add scheduler/channel-count validation for SMS
- [ ] Register plugin in engine/CLI loading path
- [ ] Add web UI language tokens and chip metadata
- [ ] Add unit + integration + regression tests
- [ ] Add examples under `songs/features/sms/`
- [ ] Document edge cases (region clock behavior, mono fold-down, tone3-noise coupling)

---

## Future Enhancements

- YM2413 FM extension plugin (`chip sms_fm` or `chip sega_fm`) as separate backend.
- Native VGM export with accurate register event timing — see `docs/features/vgm-exporter-plugin.md` for the full specification.
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
- `docs/features/complete/effects-system.md`
- `docs/features/vgm-exporter-plugin.md`
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
