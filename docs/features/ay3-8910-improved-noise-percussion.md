---
title: "AY-3-8910 Improved Noise, Percussion & Instrument Modelling"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-13
issue: ""
---

## Summary

This feature improves the existing `@beatbax/plugin-chip-ay3-8910` plugin to accurately model the AY-3-8910 / YM2149 hardware. The current implementation creates independent tone, noise, and envelope oscillators per channel, which makes accurate percussion, envelope-as-oscillator bass, and tone+noise mixing impossible. This feature introduces a shared chip emulator (`emulator.ts`), a hardware-accurate `AudioWorkletProcessor`, new instrument fields (`env_pitch`, `env_period`, `type=tone_noise`), four additional hardware envelope shapes, non-linear DAC amplitude tables, and corrected noise frequency derivation from chip clock.

---

## Problem Statement

The AY-3-8910 has **one** shared noise generator and **one** shared hardware envelope generator. The current plugin creates independent objects per channel, leading to the following inaccuracies:

1. **Noise frequency approximation** — noise period is calculated via an empirical formula (`hz = 120 + (3400 / rate)`) rather than chip-clock-derived periods (`f_noise = f_clock / (16 × max(1, period))`).
2. **Per-channel envelope generator** — the envelope is modelled independently per channel; on hardware it is a single shared resource.
3. **Tone+noise averaging** — tone and noise signals are averaged together rather than OR-mixed, which is incorrect per the hardware architecture.
4. **Envelope bass not supported** — the iconic "buzz bass" (hardware envelope running at audio frequency) is not supported; `env_pitch` and `env_period` instrument fields do not exist.
5. **Incomplete envelope shapes** — the plugin defines 9 custom envelope names; 4 hardware shapes are missing (`decay_hold_max`, `attack_hold_max`, `triangle_down_up`, `triangle_up_down`). Level sequences use 4-bit (0–15) values instead of the 5-bit (0–31) hardware range.
6. **OscillatorNode / AudioBufferSourceNode per note** — the WebAudio render path creates per-note nodes that cannot model shared emulator state. A persistent `AudioWorkletProcessor` is required.
7. **Linear DAC** — the current code uses a linear gain scale. The AY-3-8910 and YM2149 have different non-linear DAC amplitude tables (AY: 16-level repeated; YM: 32 true levels). Hardcoded gain constants (`0.22`, `0.18`, `0.20`) are not normalised to either table.

---

## Proposed Solution

### Summary

The improvement is delivered in six phases:

| Phase | Scope |
|---|---|
| 1 | Shared chip emulator (`emulator.ts`), render coordination, delete `oscillator.ts` |
| 2 | Envelope shape additions (4 new shapes, 5-bit levels) |
| 3 | Tone+noise mixing (`type=tone_noise`), corrected noise formula, percussion presets |
| 4 | Envelope bass instrument fields (`env_pitch`, `env_period`) |
| 5 | `AudioWorkletProcessor` replacing per-note WebAudio nodes |
| 6 | Non-linear DAC tables (`dac.ts`), remove hardcoded gain constants |

---

### Phase 1 — Shared Chip Emulator

Port `lib/aym-js/js/aym-emulator.js` (the reference AY3 WebAudio implementation in this repo) to TypeScript as `packages/plugins/chip-ay3-8910/src/emulator.ts`.

#### Classes

| Class | Description |
|---|---|
| `AyToneGen` (×3) | 12-bit period counter, phase toggle — replaces `oscillator.ts` |
| `AyNoiseGen` | 17-bit LFSR with taps at bits 0 & 3 XOR; 5-bit R6 period |
| `AyEnvelopeGen` | 16-bit period, all 16 hardware shapes from R13, 5-bit level 0–31 |
| `AyMixer` | R7 active-low tone/noise enable bits per channel A/B/C |
| `AyDac` | Selectable `AY_DAC` or `YM_DAC` 32-entry lookup tables |
| `AyChipEmulator` | `writeRegister(r, v)`, `clock()`, `getChannelSample(ch: 0\|1\|2): number` |

#### Hardware Accuracy Rules

- **Clock division**: master tick ÷ 8 drives all generators
- **Channel output**: Boolean OR of `tone_phase` and `noise_phase`, then multiplied by `dac[level]` — **not** averaging
- **Noise period formula**: `f_noise = f_clock / (16 × max(1, period))` — chip-clock accurate

#### Shared Context & Render Coordination

The plugin creates **one** `AyChipEmulator` instance held in a shared `chipContext`, passed to all three channel backends. The chip context also holds `sampleCache[3]: Float32Array[]` (sized to `PCM_PLUGIN_CHUNK = 512`) and a monotonically-advancing `emulatorCursor: number` (total samples the emulator has produced).

There are two consumers of `render()`:

**PCM path (CLI / WAV export)**

`packages/engine/src/audio/pcmRenderer.ts` calls `backend.noteOn → render (chunks) → noteOff` independently per channel, in arbitrary order. Render coordination works as follows:

- Each `render(buffer, sampleRate)` call on any channel computes how many samples the emulator still needs to produce to satisfy the request.
- If `emulatorCursor` is behind the required range, **the calling channel drives the emulator**: it advances the clock for the missing samples, populates `sampleCache[0..2]`, and advances `emulatorCursor`.
- If `emulatorCursor` has already covered the requested range (another channel rendered it first), the calling channel reads its output directly from `sampleCache[channelIndex]`.
- There is no fixed "master channel". The **first caller for any sample range** drives the emulator for that range.

The `sampleCache` is a rolling window of size `PCM_PLUGIN_CHUNK`. Since `pcmRenderer.ts` renders channels in non-overlapping chunks of that size, the window is always sufficient. The `emulatorCursor` is reset to 0 when `noteOn()` is called on channel 0 (the emulator is reset for a new song render pass).

**WebAudio path (Web UI)**

With the `AudioWorkletProcessor` (Phase 5), the worklet owns the emulator entirely. The `sampleCache` and `emulatorCursor` coordination described above are used only in the PCM/CLI path. In the WebAudio path, `render()` is not called — `createPlaybackNodes()` posts register-patch messages to the worklet.

`oscillator.ts` is deleted once `emulator.ts` is complete.

---

### Phase 2 — Envelope Shape Additions

Keep the 9 existing BeatBax envelope names unchanged. Add the 4 genuinely missing hardware shapes:

| New BeatBax name | R13 value | Pattern | Description |
|---|---|---|---|
| `decay_hold_max` | 11 | `\‾‾‾` | Single decay then hold at maximum level |
| `attack_hold_max` | 13 | `/‾‾‾` | Single attack then hold at maximum level |
| `triangle_down_up` | 10 | `\/\/` | Continuously repeating triangle, down-first |
| `triangle_up_down` | 14 | `/\/\` | Continuously repeating triangle, up-first |

All `SHAPE_SEQUENCE` entries are updated from 4-bit (0–15) to 5-bit (0–31) levels, normalised as `/31` in audio output.

---

### Phase 3 — Tone+Noise Mixing & Percussion

#### New Instrument Type

Add `type=tone_noise` as a valid instrument type — enables both tone AND noise on one channel simultaneously. The existing `type=tone noise=on` remains valid as an equivalent.

#### Corrected Noise Calibration

Replace the empirical formula with the chip-clock-accurate derivation:

$$f_{noise} = \frac{f_{clock}}{16 \times \max(1, \text{period})}$$

`configureForSong()` resolves the correct `f_clock` per chip alias:

| Platform alias | f_clock |
|---|---|
| `zx-spectrum-128` | 1.7734 MHz |
| `msx`, `msx2` | 1.7897 MHz |
| `atari-st`, `ym2149` | 2.0 MHz |
| `amstrad-cpc` | 1.0 MHz |
| `vectrex` | 1.5 MHz |
| default | 1.7734 MHz |

#### Percussion Presets

`songWizard.ts` is updated with improved percussion presets: `kick`, `snare`, `hat_closed`, `hat_open`, `crash`, and a `tone_noise` metallic pluck example.

---

### Phase 4 — Envelope Bass (Envelope-as-Oscillator)

The AY's most distinctive sound: the hardware envelope running at audio frequency, producing a harmonically-rich buzz bass. The envelope period is set short enough that the envelope generator oscillates in the audible frequency range.

#### Pitch Formula

$$N_{env} = \frac{f_{clock}}{256 \times f_{note}}$$

#### New Instrument Fields

| Field | Type | Description |
|---|---|---|
| `env_pitch` | note string | e.g. `A2` — auto-calculates `env_period` from chip clock |
| `env_period` | int 0–65535 | Raw 16-bit hardware register value for R11+R12 (expert override) |

**Validation rules:**
- `env_pitch` and `env_period` cannot be set simultaneously — a validation error is emitted.
- `env_period` or `env_pitch` set without a repeating envelope shape (`env=none`) → validation error.

The envelope period is a **shared hardware resource** — the last `noteOn()` to write R11/R12 wins. This is hardware-accurate behaviour and is documented in the `ui-contributions.ts` hover help.

---

### Phase 5 — AudioWorkletProcessor

Replace the per-note `OscillatorNode` / `AudioBufferSourceNode` approach with a persistent `AudioWorkletProcessor` that owns the `AyChipEmulator` and runs at sample rate in the audio thread.

#### New File: `ay3-worklet-processor.ts`

- Extends `AudioWorkletProcessor`
- Owns `AyChipEmulator`, chip clock accumulator, and sorted pending-event queue
- Message protocol (via `this.port.onmessage`):

| Message type | Payload |
|---|---|
| `noteOn` | `{ channel: 0\|1\|2, registers: RegisterPatch[], scheduledTime: number }` |
| `noteOff` | `{ channel: 0\|1\|2, scheduledTime: number }` |
| `reset` | _(no payload)_ |

  where `RegisterPatch = { r: number; v: number }`.

- `process()`: drains pending events by `scheduledTime`, clocks the emulator per sample using a fractional accumulator, outputs stereo with ABC panning (A: 75%L/25%R, B: 50%/50%, C: 25%L/75%R)
- Compiled as a self-contained ES module via Vite `new URL('./ay3-worklet-processor.js', import.meta.url)` pattern

#### Changes to `index.ts`

- `configureForSong()` calls `audioContext.audioWorklet.addModule(workletUrl)` once per context.
- Creates one shared `AudioWorkletNode` with `{ numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] }`.
- Connects to destination via shared gain node.

#### Changes to `channels.ts` — `createPlaybackNodes()`

- Computes `RegisterPatch[]` for R0–R13 and posts `noteOn` with `scheduledTime = start`.
- Pre-posts `noteOff` with `scheduledTime = start + dur`.
- Returns `[]` — the worklet is already wired to destination.
- The engine must handle an empty node array gracefully. If not, the `AudioWorkletNode` itself may be returned as a sentinel with a flag to prevent double-connection.

---

### Phase 6 — DAC Non-Linearity

#### New File: `dac.ts`

| Export | Description |
|---|---|
| `AY_DAC: Float32Array` | 32-entry table (16 physical levels, each repeated twice — AY hardware behaviour) |
| `YM_DAC: Float32Array` | 32-entry table (32 true distinct levels — YM2149 5-bit resolution) |

Both tables are normalised 0.0–1.0, taken verbatim from `lib/aym-js/js/aym-emulator.js`.

`dacMode` resolved from chip alias in `configureForSong()`:

| Alias | DAC mode |
|---|---|
| `ym2149`, `atari-st` | `'ym'` |
| All other aliases | `'ay'` |

Hardcoded gain constants (`0.22`, `0.18`, `0.20`) are removed — the normalised DAC tables replace them.

---

### Register Ownership

| Register(s) | Owner | Shared? |
|---|---|---|
| R0–R1 (ch A period) | Channel 0 | No |
| R2–R3 (ch B period) | Channel 1 | No |
| R4–R5 (ch C period) | Channel 2 | No |
| R6 (noise period) | Last writer wins | Yes |
| R7 (mixer) | Each channel writes its own bits (read-modify-write) | Yes |
| R8–R10 (amplitude) | Each channel owns its register | No |
| R11–R12 (env period) | Last writer wins | Yes |
| R13 (env shape) | Last writer wins | Yes |

---

### New Instrument Fields Summary

| Field | Type | Values | Description |
|---|---|---|---|
| `type` | enum | `tone` \| `noise` \| `tone_noise` | `tone_noise` is new; enables both simultaneously |
| `env` | enum | ...existing 9 + `decay_hold_max` \| `attack_hold_max` \| `triangle_down_up` \| `triangle_up_down` | +4 new hardware-accurate shapes |
| `env_pitch` | note string | e.g. `A2` | Sets envelope period by pitch for buzz bass |
| `env_period` | int | 0–65535 | Raw R11+R12 value; expert override |

All other existing fields (`vol`, `noise_rate`, `noise`, `vol_env`, `arp_env`, `pitch_env`, `noise_rate_env`) are unchanged.

---

### Example Syntax

```bax
# Tone+noise mixed — new type
inst pluck type=tone_noise noise_rate=4 vol_env=[15,12,9,6,3,0]

# Envelope bass — auto-pitch from note name
inst buzzbass type=tone env=triangle_down_up vol=use_envelope env_pitch=A2

# Envelope bass — raw period (expert)
inst buzzbass2 type=tone env=decay_repeat vol=use_envelope env_period=35

# Lead with envelope running at audio frequency
inst buzzlead type=tone env=triangle_down_up vol=use_envelope env_pitch=D4

# Percussion using new envelope shapes
inst snare type=noise noise_rate=12 env=decay_only vol_env=[14,11,8,5,2,0] note=D3
inst hat   type=noise noise_rate=2  vol_env=[8,5,3,1,0] note=C5
inst kick  type=tone_noise noise_rate=28 env=decay_only vol=14 note=C2
inst crash type=noise noise_rate=1 vol_env=[15,13,10,7,4,2,0] note=A4
```

---

## Implementation Plan

### Files to Change

| File | Action | Notes |
|---|---|---|
| `src/emulator.ts` | CREATE | Shared chip emulator — TypeScript port of `lib/aym-js/js/aym-emulator.js` |
| `src/dac.ts` | CREATE | `AY_DAC` and `YM_DAC` lookup tables |
| `src/ay3-worklet-processor.ts` | CREATE | `AudioWorkletProcessor` with register-patch message protocol |
| `src/oscillator.ts` | DELETE | Replaced by `emulator.ts` |
| `src/channels.ts` | MODIFY | Emulator wiring, worklet messaging, render coordination (`sampleCache`) |
| `src/envelope.ts` | MODIFY | Add 4 shapes; upgrade level sequences to 5-bit (0–31) |
| `src/validate.ts` | MODIFY | Accept `type=tone_noise`, `env_period`, `env_pitch`, 4 new shape names |
| `src/instrument.ts` | MODIFY | `shouldUseEnvelope()` updated to handle `env_period` / `env_pitch` |
| `src/index.ts` | MODIFY | Shared chip context, worklet init, `configureForSong()` f_clock + dacMode resolution |
| `src/songWizard.ts` | MODIFY | Improved percussion presets + envelope bass examples |
| `tests/ay-plugin.test.ts` | MODIFY | Emulator, shape, tone_noise, env_pitch, DAC tests |
| `docs/chips/ay/hardware_guide.md` | MODIFY | All 16 shapes table, `env_period` formula, shared resource notes |

### Parser Changes

No changes to the Peggy grammar are required. `env_pitch`, `env_period`, and `type=tone_noise` are parsed via the existing generic instrument field parser. Validation is added to `src/validate.ts` within the plugin.

### AST Changes

No changes to `schema/ast.schema.json` or the core engine AST are required. The new fields are plugin-scoped instrument fields, consistent with how existing AY fields (`env`, `noise_rate`, `noise`) are handled.

### CLI Changes

The CLI's WAV export uses `packages/engine/src/audio/pcmRenderer.ts`, which calls `backend.render(buffer, sampleRate)` directly — no WebAudio dependency. **No changes are required to `pcmRenderer.ts` itself.** The coordination logic (first-caller drives the emulator, `sampleCache` for subsequent callers) is entirely internal to `channels.ts`.

Effective improvements for the CLI after this feature:
- WAV export of AY songs gains hardware-accurate noise (17-bit LFSR at chip-clock-derived frequency)
- Envelope shapes produce correct 5-bit level sequences in rendered PCM
- `type=tone_noise` instruments render with Boolean OR-mixed tone+noise, not averaged
- Envelope bass (`env_pitch` / `env_period`) produces audible low-frequency buzz in WAV output
- Non-linear DAC amplitude curves (AY or YM) apply to all PCM output (Phase 6)
- The three channels of a song share a single emulator state — noise LFSR and hardware envelope are coherent across channels in WAV export

### Web UI Changes

- `ui-contributions.ts` hover help updated to document `env_pitch`, `env_period`, `type=tone_noise`, and the four new envelope shapes.
- Shared-resource warning added: "The envelope period (R11/R12) is a shared hardware resource. When multiple channels play simultaneously, the last noteOn to write this register wins."

### Export Changes

No changes to VGM or MIDI exporters. Both consume validated ISM; the hardware emulator changes are internal to the plugin's render path.

### Documentation Updates

- `docs/chips/ay/hardware_guide.md` — full 16-shape table with R13 values and waveform patterns; `env_period` formula section; shared-register behaviour notes.
- `docs/chips/ay/composition_guide.md` — envelope bass technique section; tone+noise percussion examples.

---

## Testing Strategy

### Unit Tests

1. **Emulator LFSR** — known initial seed produces a known sequence of noise bits for `rate=8`.
2. **Emulator envelope shape `triangle_down_up`** (R13=10) — cycles 31→0→31→0 continuously.
3. **OR-mixer** — `type=tone_noise` channel output amplitude ≥ tone-only output for same note.
4. **Envelope bass period** — `env_pitch=A2` with MSX clock (1,789,772 Hz) yields `floor(1789772 / (256 × 110)) = 63`.
5. **DAC table — AY mode** — level 15 (5-bit index 30) maps to `AY_DAC[30]`; value differs from `15/31`.
6. **DAC table — YM mode** — level 15 (5-bit index 30) maps to `YM_DAC[30] ≈ 0.879`.
7. **`decay_hold_max`** — sequence holds at level 31 after single decay.
8. **`attack_hold_max`** — sequence holds at level 31 after single attack.
9. **Validation — simultaneous `env_pitch` + `env_period`** — emits validation error.
10. **Validation — `env_period` with `env=none`** — emits validation error.
11. **Noise formula** — for `noise_rate=8` on `atari-st` (2.0 MHz): `f_noise = 2,000,000 / (16 × 8) = 15,625 Hz`.

### Integration Tests

1. **PCM 3-channel clock coordination** — three-channel song rendered via `renderSongToPCM()`; all three channel output buffers are non-zero and coherent (channels rendered in both natural and reversed order produce identical output).
2. **PCM first-caller coordination** — render channel 2 before channel 0; emulator advances correctly and channel 0's subsequent render reads from cache without re-advancing the clock.
3. **PCM envelope bass spectral peak** — `env_pitch=A2` on MSX clock; WAV PCM waveform has spectral peak near 110 Hz.
4. **PCM `type=tone_noise` richness** — WAV export output RMS higher than noise-only equivalent for the same instrument.
5. **PCM WAV export determinism** — the same AY song rendered twice with `renderSongToPCM()` produces byte-for-byte identical output.
6. **PCM WAV export regression** — existing AY fixture songs produce identical WAV output before and after Phase 1 (emulator swap); any change must be intentional and documented.
7. **WebAudio worklet buzz bass** — audible sawtooth bass character in browser playback.
8. **VGM exporter unchanged** — AY VGM output byte-for-byte identical before and after (ISM-only consumer).
9. **All existing `ay-plugin.test.ts` tests pass** — no regressions in any phase.

---

## Migration Path

No breaking changes are introduced.

- All existing instrument syntax remains valid.
- The 9 existing envelope shape names are unchanged.
- `type=tone noise=on` continues to work identically to `type=tone_noise`.
- `env_pitch` and `env_period` are optional; omitting both preserves existing behaviour exactly.
- The DAC non-linearity change (Phase 6) alters rendered audio amplitude curves to be hardware-accurate. This is intentional.

---

## Implementation Checklist

- [ ] Phase 1: `emulator.ts` (`AyChipEmulator`, `AyToneGen`, `AyNoiseGen`, `AyEnvelopeGen`, `AyMixer`)
- [ ] Phase 1: Shared chip context wiring in `index.ts` and `channels.ts`
- [ ] Phase 1: Render coordination — first-caller-drives pattern: `emulatorCursor` + `sampleCache[3][PCM_PLUGIN_CHUNK]` in chip context; any channel can advance the emulator; subsequent callers for the same range read from cache
- [ ] Phase 1: `emulatorCursor` reset on channel 0 `noteOn()` (new song render pass)
- [ ] Phase 1: Delete `oscillator.ts`
- [ ] Phase 2: Add 4 envelope shapes in `envelope.ts`
- [ ] Phase 2: Upgrade all `SHAPE_SEQUENCE` entries from 4-bit to 5-bit (0–31) levels
- [ ] Phase 2: `validate.ts` updated to accept new shape names
- [ ] Phase 3: `type=tone_noise` in `validate.ts` and `channels.ts` noteOn mixer writes
- [ ] Phase 3: Noise frequency formula updated to chip-clock-accurate; `configureForSong()` resolves `f_clock` per alias
- [ ] Phase 3: Percussion presets updated in `songWizard.ts`
- [ ] Phase 4: `env_pitch` and `env_period` fields in `validate.ts` with mutual-exclusion and shape-check rules
- [ ] Phase 4: `env_pitch` → R11/R12 period computation in `channels.ts`
- [ ] Phase 4: `shouldUseEnvelope()` updated in `instrument.ts`
- [ ] Phase 4: Buzz bass + envelope lead examples added to `songWizard.ts`
- [ ] Phase 5: `ay3-worklet-processor.ts` (AudioWorkletProcessor, register-patch protocol, fractional clock, ABC stereo panning)
- [ ] Phase 5: Worklet `addModule()` init in `index.ts` `configureForSong()`
- [ ] Phase 5: `createPlaybackNodes()` updated in `channels.ts` to post register-patch messages; returns `[]`
- [ ] Phase 6: `dac.ts` (`AY_DAC` + `YM_DAC` normalised tables from aym-js)
- [ ] Phase 6: `AyDac` wired into `AyChipEmulator`; `dacMode` resolved from chip alias
- [ ] Phase 6: Remove hardcoded gain constants (`0.22`, `0.18`, `0.20`)
- [ ] Unit and integration tests for all phases
- [ ] `docs/chips/ay/hardware_guide.md` updated
- [ ] `docs/chips/ay/composition_guide.md` updated
- [ ] `ui-contributions.ts` hover docs updated for new fields and shared-resource warning

---

## Future Enhancements

1. **Per-platform noise rate presets** — curated `noise_rate` values for common percussion sounds per platform clock, selectable in the Song Wizard.
2. **Envelope bass tuning visualiser** — real-time display in the Web UI showing the computed `env_period` for the entered `env_pitch` note.
3. **Stereo panning control** — allow per-channel ABC panning to be overridden by the composer.
4. **Live register monitor** — Web UI panel displaying R0–R13 values in real time during playback.
5. **Envelope shape preview** — waveform thumbnail in the instrument editor for the selected envelope shape.

---

## Open Questions

_(none — all resolved during planning)_

---

## References

- `lib/aym-js/js/aym-emulator.js` — reference AY3 register-level emulator in this repo; source of DAC tables and LFSR implementation
- `docs/chips/ay/hardware_guide.md` — AY-3-8910 hardware register map and envelope shape reference
- `docs/chips/ay/composition_guide.md` — composition techniques including envelope bass and tone+noise mixing
- AY-3-8910 datasheet — register layout, LFSR polynomial (`x^17 + x^14 + 1`), envelope shape table

---

## Additional Notes

- The envelope period (R11/R12) and noise period (R6) are **shared hardware resources**. When multiple channels play simultaneously, the last `noteOn()` to write these registers wins. This is hardware-accurate behaviour and must be noted in `ui-contributions.ts` hover docs.
- The `AudioWorkletProcessor` module (`ay3-worklet-processor.ts`) must be **self-contained** — no package imports at worklet load time. Vite's `new URL('./ay3-worklet-processor.js', import.meta.url)` pattern bundles dependencies into the worklet chunk. This must be verified against the Vite build configuration before Phase 5 begins.
- `createPlaybackNodes()` returning `[]` must be handled gracefully by the engine. If the engine requires at least one returned node, the worklet `AudioWorkletNode` itself can be returned as a sentinel with a flag to prevent double-connection to the destination.
- The DAC table values in `dac.ts` must be taken verbatim from `lib/aym-js/js/aym-emulator.js` to maintain consistency with the reference implementation. Do not re-derive from scratch.
