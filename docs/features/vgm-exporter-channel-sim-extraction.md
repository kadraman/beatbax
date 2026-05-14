---
title: "VGM Exporter — Extract Shared Channel Simulation Module"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-10
issue: "https://github.com/kadraman/beatbax/issues/105"
---

## Summary

Extract the chip-agnostic effects engine embedded in `packages/plugins/export-vgm/src/backends/sms.ts` into a new shared module `backends/channelSim.ts`. This gives future chip backends (AY-3-8910, YM2413, etc.) access to the full effects engine — vibrato, portamento, arp, tremolo, bend, volslide, cut, retrig, and all macro types — without code duplication.

---

## Problem Statement

The `sms.ts` backend is the first chip implementation to follow the new `VgmBackend` interface introduced in the multi-chip architecture refactor. It contains a substantial per-channel effects simulation engine (~750 lines) that is architecturally chip-agnostic but is currently private to the SMS backend.

When the AY-3-8910 backend (`ay.ts`) is fully implemented, it will need identical logic for:

- Pitch conversion (note name → MIDI → Hz)
- Macro parsing and advancement (`vol_env`, `arp_env`, `pitch_env` arrays)
- Per-channel effect state (vibrato, portamento, arp, tremolo, bend, volslide, cut, retrig)
- Per-frame 60 Hz effect advancement loop
- Effect parsing from ISM event objects (`vib`, `port`, `arp`, `bend`, `trem`, etc.)
- Instrument resolution (merging base instrument + inline `instProps`)

Duplicating this code in `ay.ts` (and again for future YM2413, YM2612 backends) would:

- Create a large maintenance burden — bug fixes and effect improvements must be applied to every backend independently
- Diverge silently — subtle behavioural differences between backends would be hard to detect
- Inflate the codebase unnecessarily

---

## Proposed Solution

### Summary

Create `packages/plugins/export-vgm/src/backends/channelSim.ts` containing all chip-agnostic simulation primitives. Chip backends import and compose these primitives; they add only their own chip-specific register-write logic, frequency formula, and hardware-specific state fields.

The SMS backend is refactored to consume `channelSim.ts` instead of defining its own private copies. Its byte output must remain bit-for-bit identical after the refactor.

---

### What Goes into `channelSim.ts`

#### Pitch Utilities

```typescript
export const NOTE_SEMITONES: Record<string, number>;
export function noteToMidi(note: string): number | null;
export function midiToFreq(midi: number): number;
export function midiToFreqForNote(noteName: string): number;
```

These are universal equal-temperament conversions independent of any chip. Each backend still provides its own `freqToPeriod(freq, clock)` because the register formula differs per chip:

| Chip | Period formula | Bits |
|---|---|---|
| SN76489 (SMS) | `clock / (32 × freq)` | 10-bit (0–1023) |
| AY-3-8910 | `clock / (16 × freq)` | 12-bit (0–4095) |
| YM2149 | Same as AY-3-8910 | 12-bit |

#### Macro System

```typescript
export interface MacroState { index: number; done: boolean; }
export interface ParsedMacro { values: number[]; loopPoint: number; }
export function parseMacro(raw: unknown): ParsedMacro | null;
export function macroValue(macro: ParsedMacro, state: MacroState): number;
export function advanceMacro(macro: ParsedMacro, state: MacroState): void;
export function makeMacroState(): MacroState;
```

The macro format (`[v1,v2,v3|loopPoint]`) and semantics are already defined in the BeatBax language spec and are chip-agnostic.

#### Base Channel Simulation State

```typescript
export interface BaseChannelSimState {
  // Lifecycle
  active: boolean;
  freq: number;
  baseFreq: number;
  lastNoteFreq: number;
  noteFrames: number;
  noteFrame: number;

  // Volume
  attenuation: number;
  cutDone: boolean;

  // Generic macros
  volEnvMacro:   ParsedMacro | null;
  arpEnvMacro:   ParsedMacro | null;
  pitchEnvMacro: ParsedMacro | null;
  volEnvState:   MacroState;
  arpEnvState:   MacroState;
  pitchEnvState: MacroState;

  // Vibrato
  vibPhase: number;
  vibDepth: number;
  vibRate:  number;
  vibDelay: number;
  vibFrame: number;

  // Portamento
  portTarget:   number;
  portStart:    number;
  portFrame:    number;
  portDuration: number;
  portActive:   boolean;

  // Tremolo
  tremoloPhase:    number;
  tremoloDepth:    number;
  tremoloRate:     number;
  tremoloDelay:    number;
  tremoloDuration: number;
  tremoloFrame:    number;

  // Cut / retrig
  cutTick:        number;
  retrigInterval: number;
  retrigTick:     number;

  // Bend
  bendStart:     number;
  bendSemitones: number;
  bendCurve:     string;
  bendDelay:     number;
  bendFrame:     number;
  bendDuration:  number;
  bendActive:    boolean;

  // Volume slide
  volSlideDelta: number;
  volSlideSteps: number;
}

export function makeBaseChannelState(mutedAttenuation: number): BaseChannelSimState;
```

Chip backends define their own `ChannelSimState` that extends `BaseChannelSimState` with chip-specific fields. For example:

```typescript
// In sms.ts
interface ChannelSimState extends BaseChannelSimState {
  noiseIsWhite:        boolean;
  noiseRate:           number;       // 0–3 SN76489 noise rate
  ggPanBits:           number;       // 2-bit GG pan mask
  noiseRateEnvMacro:   ParsedMacro | null;
  noiseRateEnvState:   MacroState;
}

// In ay.ts (future)
interface ChannelSimState extends BaseChannelSimState {
  envelopeShape:    number;    // AY register 0x0D bits 0–3 (16 shapes)
  useEnvelope:      boolean;   // true → volume controlled by envelope generator
  noiseMixEnabled:  boolean;   // AY mixer bit
  toneMixEnabled:   boolean;   // AY mixer bit
  noiseRate:        number;    // 0–31 AY noise period register (0x06)
  envelopeActive:   boolean;
  envelopeCounter:  number;
}
```

#### Instrument Resolution

```typescript
export function resolveInstrument(
  event: { instrument?: string; instProps?: Record<string, unknown> },
  insts: Record<string, InstrumentNode>,
  channelDefault: string | undefined,
): InstrumentNode | null;
```

Chip-agnostic property merge. Unchanged from the current `sms.ts` private implementation.

#### Generic Effect Parsing

```typescript
export interface Effect {
  type: string;
  params: Array<string | number>;
  delaySec?: number;
  durationSec?: number;
}

export function parseGenericEffectsOnNoteOn(
  effects: Effect[],
  state: BaseChannelSimState,
  noteName: string,
  tickSeconds: number,
  framesPerTick: number,
): void;
```

Handles all chip-agnostic effects: `vib`, `port`, `arp`, `volslide`, `trem`, `cut`, `retrig`, `bend`, `pitch_env`.

Does **not** handle `noise_rate_env` — that is SMS-specific (AY uses a different noise model). Each backend calls `parseGenericEffectsOnNoteOn` first and then handles its own chip-specific effects.

#### Generic Frame Advancement

```typescript
export function advanceGenericFrames(
  state: BaseChannelSimState,
  frames: number,
): { periodChanged: boolean; volumeChanged: boolean };
```

Advances the 60 Hz simulation for: `vol_env`, `arp_env`, `pitch_env`, vibrato, tremolo, volslide, portamento, bend. Does not advance chip-specific macros (e.g. `noiseRateEnvMacro` for SMS, `envelopeCounter` for AY). Backends call this first, then advance their own chip-specific state.

#### Tremolo Attenuation Helper

```typescript
export function calcTremoloAttenuation(
  state: BaseChannelSimState,
  baseAttenuation: number,
  invertScale: boolean,
): number;
```

`invertScale` handles the SN76489 vs. AY volume direction difference:

- SN76489: 0 = loudest, 15 = mute → `invertScale = false`
- AY-3-8910: 0 = mute, 15 = loudest → `invertScale = true`

---

### What Stays in Each Backend

#### `sms.ts` — SMS-specific

| Code | Reason stays in `sms.ts` |
|---|---|
| `freqToPeriod(freq, clock)` | Formula: `clock / (32 × freq)`, 10-bit clamp |
| `ChannelSimState` extension | `noiseIsWhite`, `noiseRate` (0–3), `ggPanBits`, `noiseRateEnvMacro` |
| `makeChannelState()` | Sets SMS-specific defaults (`noiseIsWhite=true`, `noiseRate=2`) |
| `isNoiseChannel(psgCh)` | SN76489 channel-index convention (ch 3 = noise) |
| `channelIdToPsg(id)` | 1-based ISM id → 0-based PSG index |
| `readGgPan()`, `readGenericPan()` | GG-only hardware feature |
| `buildGgStereoByte()` | GG stereo register encoding |
| `noteOn()` | Sets SMS noise fields; calls `makeChannelState` baseline |
| `noiseRateEnvMacro` advancement | In `advanceFrames`, SMS-specific block |
| `emitChannelTickFinalWrites()` | SN76489 PSG write commands |
| GD3 `systemName` | `"Sega Master System"` / `"Sega Game Gear"` |

#### `ay.ts` — AY-specific (future)

| Code | Reason stays in `ay.ts` |
|---|---|
| `freqToPeriod(freq, clock)` | Formula: `clock / (16 × freq)`, 12-bit clamp |
| `ChannelSimState` extension | `envelopeShape`, `useEnvelope`, `noiseMixEnabled`, `toneMixEnabled`, `noiseRate` (0–31), `envelopeCounter` |
| `makeChannelState()` | Sets AY-specific defaults |
| `noteOn()` | Sets AY envelope, mixer, noise fields |
| `envelopeCounter` advancement | 16-shape AY envelope state machine |
| `emitChannelTickFinalWrites()` | AY register writes (address latch + data I/O) |
| Clock resolution from `chipRegion` | Atari ST: 2.0 MHz; MSX: 1.79 MHz; Amstrad CPC: 1.0 MHz |
| GD3 `systemName` | `"Atari ST"` / `"MSX"` / `"Amstrad CPC"` etc. |

---

## Implementation Plan

### Phase 1 — Create `channelSim.ts` with all shared exports

- Create `packages/plugins/export-vgm/src/backends/channelSim.ts`
- Copy and export: `NOTE_SEMITONES`, `noteToMidi`, `midiToFreq`, `midiToFreqForNote`
- Copy and export: `MacroState`, `ParsedMacro`, `parseMacro`, `macroValue`, `advanceMacro`, `makeMacroState`
- Define and export `BaseChannelSimState` interface (all generic effect fields from current `ChannelSimState`)
- Export `makeBaseChannelState(mutedAttenuation: number): BaseChannelSimState`
- Export `resolveInstrument()`
- Export `parseGenericEffectsOnNoteOn()` (all effect handlers except `noise_rate_env`)
- Export `advanceGenericFrames()` (all frame advancement except `noise_rate_env` and chip-specific blocks)
- Export `calcTremoloAttenuation()` with `invertScale` parameter

### Phase 2 — Refactor `sms.ts` to consume `channelSim.ts`

- Import all shared exports from `./channelSim.js`
- Remove private copies of all extracted functions and types
- Change `ChannelSimState` to extend `BaseChannelSimState`; add only SMS-specific fields
- Update `makeChannelState()` to call `makeBaseChannelState(ATTENUATION_MUTE)` and add SMS fields
- Update `noteOn()` to call shared pitch and macro helpers; add SMS-specific noise setup
- Update `advanceFrames()` to call `advanceGenericFrames()` then add `noiseRateEnvMacro` block
- Update `calcEffectiveAttenuation()` to call `calcTremoloAttenuation()` with `invertScale=false`
- Verify no `noteToPeriod` export signature changes (it is exported from `sms.ts` and used in tests)

### Phase 3 — Regression gate

- Run full test suite: `npm test`
- Export a known SMS song to VGM and compare SHA-256 hash of output to pre-refactor baseline
- Confirm all existing VGM exporter tests pass without modification

### Phase 4 — Update `ay.ts` to consume `channelSim.ts` (when implementing AY backend)

- Import all shared exports from `./channelSim.js`
- Define `ChannelSimState extends BaseChannelSimState` with AY-specific fields
- Implement AY-specific `freqToPeriod()`, `noteOn()`, envelope state machine, register writes

---

## File Structure After Refactor

```
packages/plugins/export-vgm/src/backends/
├── channelSim.ts    ← NEW: shared pitch utils, macro engine, base state, effect engine
├── types.ts         ← unchanged: VgmBackend interface, SongLike, VgmTranslateResult
├── psgState.ts      ← unchanged: SN76489 shadow register tracker
├── sms.ts           ← slimmed: imports channelSim; adds SMS period formula, noise, GG writes
└── ay.ts            ← stub now; consumes channelSim when fully implemented
```

---

## Testing Strategy

### Unit Tests

No new behaviour is introduced. The test strategy is a regression gate only.

| Test | What to verify |
|---|---|
| Existing `vgm-exporter.test.ts` | All SMS export tests pass unchanged |
| Existing `vgmWriter.test.ts` | VGM header byte output unchanged |
| SHA-256 hash comparison | VGM byte output for `songs/sms/battle_field.bax` is bit-for-bit identical before/after |

### Regression Gate Procedure

```powershell
# 1. Export SMS song before refactor and hash
npm run build-all
node bin/beatbax export vgm songs/sms/battle_field.bax --output tmp/before.vgm

# 2. Apply refactor

# 3. Export again and compare
npm run build-all
node bin/beatbax export vgm songs/sms/battle_field.bax --output tmp/after.vgm

# 4. Hash comparison (must match)
Get-FileHash tmp/before.vgm -Algorithm SHA256
Get-FileHash tmp/after.vgm -Algorithm SHA256
```

---

## Migration Path

This is an internal refactor with no user-facing changes. No BeatBax language syntax, ISM semantics, or CLI/Web UI behaviour changes. The exporter `id` remains `"vgm"`. The only observable difference to external code would be if tests imported private symbols from `sms.ts` — those would need updating to import from `channelSim.ts` instead.

---

## Implementation Checklist

- [ ] Create `src/backends/channelSim.ts`
  - [ ] Export pitch utilities (`NOTE_SEMITONES`, `noteToMidi`, `midiToFreq`, `midiToFreqForNote`)
  - [ ] Export macro system (`MacroState`, `ParsedMacro`, `parseMacro`, `macroValue`, `advanceMacro`, `makeMacroState`)
  - [ ] Export `BaseChannelSimState` interface
  - [ ] Export `makeBaseChannelState(mutedAttenuation: number)`
  - [ ] Export `resolveInstrument()`
  - [ ] Export `parseGenericEffectsOnNoteOn()`
  - [ ] Export `advanceGenericFrames()`
  - [ ] Export `calcTremoloAttenuation(state, baseAttenuation, invertScale)`
- [ ] Refactor `src/backends/sms.ts`
  - [ ] Import shared exports from `./channelSim.js`
  - [ ] Remove private copies of all extracted symbols
  - [ ] `ChannelSimState` extends `BaseChannelSimState` with SMS-specific fields only
  - [ ] `makeChannelState()` delegates to `makeBaseChannelState()`
  - [ ] `noteOn()` uses shared helpers
  - [ ] `advanceFrames()` calls `advanceGenericFrames()` then `noiseRateEnvMacro` block
  - [ ] `calcEffectiveAttenuation()` calls `calcTremoloAttenuation()` with `invertScale=false`
- [ ] Run regression gate: SHA-256 hash of SMS VGM output matches pre-refactor baseline
- [ ] All existing VGM exporter tests pass
- [ ] No TypeScript errors (`npm run build-all` clean)

---

## Future Enhancements

- When `ay.ts` is fully implemented, `parseGenericEffectsOnNoteOn` may need a `chipHints` parameter to allow chip-specific effect overrides while still sharing the main dispatch loop
- If a third chip backend is added (YM2413), evaluate whether the `noteOn()` entry point can also be partially shared (note lifecycle and macro init are identical across chips)
- Consider exposing `channelSim.ts` exports at the package level if other plugins (e.g. a future WAV renderer) need the same effect engine

---

## References

- Current SMS backend: `packages/plugins/export-vgm/src/backends/sms.ts`
- AY backend stub: `packages/plugins/export-vgm/src/backends/ay.ts`
- VGM backend interface: `packages/plugins/export-vgm/src/backends/types.ts`
- Multi-chip architecture spec: `docs/features/vgm-exporter-multi-chip-architecture.md`
- ZX Spectrum 128 chip plugin spec: `docs/features/zx-spectrum-128-chip-plugin.md`
- ZX Spectrum 128 hardware guide: `docs/chips/zx-spectrum-128/hardware_guide.md`
