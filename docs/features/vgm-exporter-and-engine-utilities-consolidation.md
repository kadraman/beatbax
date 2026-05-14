---
title: "VGM Exporter Refactoring & Engine Utilities Consolidation"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-10
issue: "https://github.com/kadraman/beatbax/issues/105"
---

## Summary

This is a three-part architectural refactoring:

1. **Multi-Chip VGM Backend Architecture** — Refactor `@beatbax/plugin-exporter-vgm` from a hardcoded SMS-only exporter into a dispatcher that routes to chip-specific VGM backends via a `VgmBackend` interface.

2. **Centralize Engine Utilities** — Consolidate 20+ scattered copies of `noteToMidi()`, `midiToFreq()`, and macro parsing utilities into a single authoritative module in `@beatbax/engine`.

3. **Extract Channel Simulation Module** — Extract the ~750-line chip-agnostic effects engine from the VGM SMS backend into a shared `channelSim.ts` module that all chip backends can reuse.

Together, these changes:
- Eliminate widespread code duplication
- Set up clean architecture for adding new chip backends (AY-3-8910, YM2413, YM2612, etc.)
- Reduce maintenance burden
- Preserve SMS byte-for-byte output (determinism gate)
- Maintain backward compatibility with the engine API

---

## Problem Statement

### Current Issues

#### 1. Massive Utility Duplication

Pitch and macro utilities are defined in 5–7 different locations:

```
Duplication Map:
┌─────────────────────────────────────────────────────────────────┐
│ Duplicated across codebase                                       │
├─────────────────────────────────────────────────────────────────┤
│ noteToMidi()       → 7 copies (expand, SMS, NES, VGM, Web UI...) │
│ midiToNote()       → 2 copies (expand, VGM)                      │
│ NOTE_SEMITONES     → 5 copies (expand, SMS, NES, VGM, FT)        │
│ midiToFreq()       → 4 versions (GB, SMS, NES, VGM)              │
│ parseMacro()       → 3 copies (SMS, NES, VGM)                    │
│ macro system       → 3 copies (SMS, NES, VGM)                    │
└─────────────────────────────────────────────────────────────────┘
```

**Risks:** Inconsistent implementations, silent bugs, difficult maintenance.

#### 2. VGM Exporter SMS-Only Architecture

The VGM exporter is hardcoded for SMS. Adding AY-3-8910 support would require:
- Duplicating the validate/export/GD3 flow
- Growing `index.ts` into an untestable monolith
- Increasing the risk of regressing SMS output

#### 3. Effects Engine Code Bloat

The VGM SMS backend (`sms.ts`) contains ~1000 lines total, with ~750 lines of chip-agnostic effects simulation (vibrato, portamento, arp, tremolo, bend, volslide, etc.). When implementing the AY-3-8910 backend, this code would be duplicated verbatim, creating a severe maintenance burden.

---

## Proposed Solution

### Part 1: Multi-Chip VGM Backend Architecture

#### Objective

Introduce an internal `VgmBackend` interface that lets the VGM exporter dispatcher route to chip-specific backends. New chips (AY, YM2413, etc.) can be added as additional backends without touching the engine API or the SMS backend.

#### Backend Interface

```typescript
// packages/plugins/export-vgm/src/backends/types.ts

export interface VgmBackend {
  /** Chip aliases this backend handles (lowercase, no spaces). */
  readonly chipAliases: readonly string[];

  /** Validate the song ISM for this chip. Returns error strings or []. */
  validate(song: SongLike): string[];

  /** Translate the ISM to a VGM data byte stream. */
  translate(song: SongLike): VgmTranslateResult;

  /** Build GD3 metadata fields for this chip. */
  buildGd3Fields(song: SongLike, translateResult: VgmTranslateResult): Gd3Fields;

  /** Return VGM header clock and rate params for this chip. */
  headerParams(song: SongLike, translateResult: VgmTranslateResult): VgmHeaderParams;
}

export interface VgmTranslateResult {
  dataBytes: Uint8Array;
  totalSamples: number;
  hasRetrig: boolean;
  clock: number;
  isGameGear?: boolean;
}

export interface VgmHeaderParams {
  sn76489Clock?:  number;   // 0x0C — SN76489 (SMS/GG/Genesis)
  ym2413Clock?:   number;   // 0x10 — YM2413 (OPLL/MSX/PC-88)
  ay8910Clock?:   number;   // 0xA0 — AY-3-8910 / YM2149
  rate:           number;   // 0x24 — Frame rate hint (60 NTSC / 50 PAL)
}
```

#### Dispatcher Flow

```
exportVgm(song):
  chip = normalise(song.chip)
  backend = backendRegistry.get(chip)       // → Sn76489VgmBackend | Ay38910VgmBackend | ...
  if !backend → throw "No VGM backend for chip=X. Available: [sms, ...]"

  errors = backend.validate(song)
  if errors.length > 0 → throw

  result = backend.translate(song)
  gd3    = backend.buildGd3Fields(song, result)
  params = backend.headerParams(song, result)

  return assembleVgm(params, result.dataBytes, buildGd3(gd3), result.totalSamples)
```

#### Package Structure After Refactor

```
packages/plugins/export-vgm/src/
├── index.ts                  # Dispatcher: ExporterPlugin entry point
├── backendRegistry.ts        # Backend registration and chip alias resolution
├── vgmWriter.ts              # VGM binary builder (header + data + GD3 assembly)
├── gd3.ts                    # GD3 tag encoder (UTF-16LE)
├── constants.ts              # Expanded: all chip header offsets + clock constants
├── version.ts                # Package version string
└── backends/
    ├── types.ts              # VgmBackend interface + VgmTranslateResult type
    ├── channelSim.ts         # Shared chip-agnostic effects engine
    ├── sn76489.ts            # Canonical SN76489 backend (SMS/Game Gear aliases)
    ├── sn76489State.ts       # SN76489 shadow state tracker
    ├── ay38910.ts            # Canonical AY-3-8910 / YM2149 backend module
    ├── sms.ts                # Compatibility shim re-exporting from sn76489.ts
    ├── psgState.ts           # Compatibility shim re-exporting from sn76489State.ts
    └── ay.ts                 # Compatibility shim re-exporting from ay38910.ts
```

---

### Part 2: Centralize Engine Utilities

#### Objective

Create `packages/engine/src/util/music.ts` as the single source of truth for:
- MIDI ↔ note name conversions
- MIDI → frequency conversion (equal temperament)
- Macro parsing and state management

Export from `@beatbax/engine` for all consumers (plugins, exporters, Web UI).

#### Implementation: `packages/engine/src/util/music.ts`

```typescript
/**
 * Centralized pitch and macro utilities for BeatBax.
 *
 * Provides common MIDI/note conversion and macro parsing functions
 * shared across the engine, chip plugins, and exporters.
 *
 * IMPORTANT:
 * - noteToMidi() and midiToNote() use standard MIDI numbering (C4 = 60)
 * - midiToFreq() uses equal temperament (A4 = 440 Hz)
 * - Chip plugins may override midiToFreq with hardware-accurate versions
 * - Macro system is chip-agnostic and standardized across all backends
 */

export const NOTE_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3,
  E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8,
  A: 9, 'A#': 10, BB: 10, B: 11,
};

/**
 * Parse a note name (e.g. "C4", "F#5", "Bb3") to MIDI note number.
 * C4 = 60 (scientific pitch notation).
 * Returns null if unparseable.
 */
export function noteToMidi(note: string): number | null {
  const m = note.match(/^([A-G])([#bB]?)(-?\d+)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ? (m[2].toLowerCase() === 'b' ? 'B' : '#') : '';
  const octave = parseInt(m[3], 10);
  const key = letter + acc;
  const semi = NOTE_SEMITONES[key as keyof typeof NOTE_SEMITONES];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

/**
 * Convert MIDI note number to note name (e.g. 60 → "C4").
 * C4 = 60 (scientific pitch notation).
 */
export function midiToNote(n: number): string {
  const octave = Math.floor(n / 12) - 1;
  const pitch = n % 12;
  const names: Record<number, string> = {
    0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F',
    6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B',
  };
  return `${names[pitch]}${octave}`;
}

/**
 * Convert MIDI note number to frequency (Hz) using equal temperament.
 * A4 (MIDI 69) = 440 Hz
 * f = 440 * 2^((n - 69) / 12)
 *
 * Used by all exporters. Chip plugins may override with hardware-accurate versions.
 */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert MIDI note number to note name and then to frequency.
 * Convenience function for backends that work with note names.
 */
export function midiToFreqForNote(noteName: string): number | null {
  const midi = noteToMidi(noteName);
  if (midi === null) return null;
  return midiToFreq(midi);
}

/**
 * Parsed macro data: array of values with optional loop point.
 * Syntax: "[v1,v2,v3|loopIdx]" or plain array [v1,v2,v3]
 */
export interface ParsedMacro {
  values: number[];
  loopPoint: number; // -1 = no loop (hold last value)
}

/**
 * Mutable cursor into a ParsedMacro. Create one per note-on.
 */
export interface MacroState {
  index: number;
  done: boolean; // true when past end with no loop
}

/**
 * Parse a macro value from an instrument property.
 * Accepts: `"[1,2,3|2]"` (string), `[1,2,3]` (array), `null`/`undefined`
 */
export function parseMacro(raw: unknown): ParsedMacro | null {
  if (raw === undefined || raw === null) return null;

  if (Array.isArray(raw)) {
    const vals = raw.map(Number).filter(Number.isFinite);
    return vals.length > 0 ? { values: vals, loopPoint: -1 } : null;
  }

  let str = String(raw).trim();
  if (!str.startsWith('[')) return null;
  if (str.endsWith(']')) str = str.slice(1, -1);
  else str = str.slice(1);

  let loopPoint = -1;
  const pipeIdx = str.lastIndexOf('|');
  if (pipeIdx >= 0) {
    loopPoint = parseInt(str.slice(pipeIdx + 1), 10);
    if (isNaN(loopPoint) || loopPoint < 0) loopPoint = -1;
    str = str.slice(0, pipeIdx);
  }

  const values = str.split(',').map(s => parseFloat(s.trim())).filter(Number.isFinite);
  if (values.length === 0) return null;
  if (loopPoint >= values.length) loopPoint = values.length - 1;
  return { values, loopPoint };
}

/**
 * Get the current value from a ParsedMacro given its state.
 * Returns last value if past the end.
 */
export function macroValue(macro: ParsedMacro, state: MacroState): number {
  if (state.done) return macro.values[macro.values.length - 1];
  return macro.values[Math.min(state.index, macro.values.length - 1)];
}

/**
 * Advance a macro state by one frame.
 * Handles looping and end-of-macro logic.
 */
export function advanceMacro(macro: ParsedMacro, state: MacroState): void {
  if (state.done) return;
  state.index++;
  if (state.index >= macro.values.length) {
    if (macro.loopPoint >= 0) {
      state.index = macro.loopPoint;
    } else {
      state.index = macro.values.length - 1;
      state.done = true;
    }
  }
}

/**
 * Create a new macro state cursor.
 */
export function makeMacroState(): MacroState {
  return { index: 0, done: false };
}
```

#### Unit Tests: `packages/engine/src/util/music.test.ts`

```typescript
describe('noteToMidi', () => {
  it('C4 = 60', () => expect(noteToMidi('C4')).toBe(60));
  it('A4 = 69', () => expect(noteToMidi('A4')).toBe(69));
  it('F#5 = 78', () => expect(noteToMidi('F#5')).toBe(78));
  it('Bb3 = 58', () => expect(noteToMidi('Bb3')).toBe(58));
  it('DB3 = 49', () => expect(noteToMidi('DB3')).toBe(49));
  it('invalid returns null', () => expect(noteToMidi('invalid')).toBeNull());
  it('negative octave', () => expect(noteToMidi('C-1')).toBe(0));
});

describe('midiToNote', () => {
  it('60 = C4', () => expect(midiToNote(60)).toBe('C4'));
  it('69 = A4', () => expect(midiToNote(69)).toBe('A4'));
  it('78 = F#5', () => expect(midiToNote(78)).toBe('F#5'));
});

describe('midiToFreq', () => {
  it('A4 (69) = 440 Hz', () => expect(midiToFreq(69)).toBeCloseTo(440, 2));
  it('A3 (57) = 220 Hz', () => expect(midiToFreq(57)).toBeCloseTo(220, 2));
  it('C4 (60) ≈ 261.63 Hz', () => expect(midiToFreq(60)).toBeCloseTo(261.63, 1));
});

describe('parseMacro', () => {
  it('parses array', () => {
    const m = parseMacro([1, 2, 3]);
    expect(m?.values).toEqual([1, 2, 3]);
    expect(m?.loopPoint).toBe(-1);
  });
  it('parses string with loop', () => {
    const m = parseMacro('[0,8,15|1]');
    expect(m?.values).toEqual([0, 8, 15]);
    expect(m?.loopPoint).toBe(1);
  });
  it('returns null for invalid', () => expect(parseMacro('invalid')).toBeNull());
});

describe('macro state', () => {
  it('advances and loops', () => {
    const macro = parseMacro([1, 2, 3])!;
    const state = makeMacroState();
    expect(macroValue(macro, state)).toBe(1);
    advanceMacro(macro, state);
    expect(macroValue(macro, state)).toBe(2);
    advanceMacro(macro, state);
    advanceMacro(macro, state);
    expect(state.done).toBe(true);
    expect(macroValue(macro, state)).toBe(3);
  });
});
```

#### Export from engine entry points

**`packages/engine/src/export/index.ts`** — add:

```typescript
// Music utilities for exporters and plugins
export { 
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  midiToFreq,
  midiToFreqForNote,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from '../util/music.js';
```

**`packages/engine/src/index.ts`** — also re-export for public API.

---

### Part 3: Extract Channel Simulation Module

#### Objective

Extract the ~750-line chip-agnostic effects engine from `packages/plugins/export-vgm/src/backends/sms.ts` into a new shared module `backends/channelSim.ts`. This enables:
- Reuse across all chip backends
- Single source of truth for effect implementations
- Easier maintenance and testing

#### Base Channel Simulation State

```typescript
// packages/plugins/export-vgm/src/backends/channelSim.ts

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

  // Generic macros (from centralized engine utilities)
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

#### What Goes into `channelSim.ts`

Shared, chip-agnostic routines:

```typescript
// Pitch utilities (from centralized engine music.ts)
export { NOTE_SEMITONES, noteToMidi, midiToFreq, midiToFreqForNote } from '@beatbax/engine';

// Macro system (from centralized engine music.ts)
export {
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from '@beatbax/engine';

// Instrument resolution (chip-agnostic)
export function resolveInstrument(
  event: { instrument?: string; instProps?: Record<string, unknown> },
  insts: Record<string, InstrumentNode>,
  channelDefault: string | undefined,
): InstrumentNode | null;

// Generic effect parsing (all effects except chip-specific ones like noise_rate_env)
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

// Generic frame advancement (macros, vibrato, tremolo, volslide, portamento, bend)
export function advanceGenericFrames(
  state: BaseChannelSimState,
  frames: number,
): { periodChanged: boolean; volumeChanged: boolean };

// Tremolo attenuation helper (handles chip volume direction differences)
export function calcTremoloAttenuation(
  state: BaseChannelSimState,
  baseAttenuation: number,
  invertScale: boolean,
): number;
```

The `invertScale` parameter handles hardware differences:
- **SN76489 (SMS):** 0 = loudest, 15 = mute → `invertScale = false`
- **AY-3-8910:** 0 = mute, 15 = loudest → `invertScale = true`

#### What Stays in Each Backend

##### SMS (`sms.ts`/`sn76489.ts`)

| Code | Reason |
|---|---|
| `freqToPeriod(freq, clock)` | SN76489 formula: `clock / (32 × freq)`, 10-bit clamp |
| `ChannelSimState` extension | `noiseIsWhite`, `noiseRate` (0–3), `ggPanBits`, `noiseRateEnvMacro` |
| `makeChannelState()` | Sets SMS-specific defaults (`noiseIsWhite=true`, `noiseRate=2`) |
| `isNoiseChannel(psgCh)` | SN76489 channel-index convention (ch 3 = noise) |
| `channelIdToPsg(id)` | 1-based ISM id → 0-based PSG index |
| `readGgPan()`, `readGenericPan()` | GG-only hardware feature |
| `buildGgStereoByte()` | GG stereo register encoding |
| `noteOn()` | Sets SMS noise fields; calls baseline channel state |
| `noiseRateEnvMacro` advancement | In `advanceFrames`, SMS-specific block |
| `emitChannelTickFinalWrites()` | SN76489 PSG write commands |
| GD3 `systemName` | `"Sega Master System"` / `"Sega Game Gear"` |

##### AY-3-8910 (future `ay.ts`/`ay38910.ts`)

| Code | Reason |
|---|---|
| `freqToPeriod(freq, clock)` | AY formula: `clock / (16 × freq)`, 12-bit clamp |
| `ChannelSimState` extension | `envelopeShape`, `useEnvelope`, `noiseMixEnabled`, `toneMixEnabled`, `noiseRate` (0–31) |
| `makeChannelState()` | Sets AY-specific defaults |
| `noteOn()` | Sets AY envelope, mixer, noise fields |
| `envelopeCounter` advancement | 16-shape AY envelope state machine |
| `emitChannelTickFinalWrites()` | AY register writes (address latch + data I/O) |
| Clock resolution from `chipRegion` | Atari ST: 2.0 MHz; MSX: 1.79 MHz; Amstrad CPC: 1.0 MHz |
| GD3 `systemName` | `"Atari ST"` / `"MSX"` / `"Amstrad CPC"` etc. |

---

## Implementation Plan

### Phase 1: Centralize Engine Utilities

1. Create `packages/engine/src/util/music.ts` with all pitch and macro utilities
2. Create `packages/engine/src/util/music.test.ts` with comprehensive unit tests
3. Export from `packages/engine/src/export/index.ts` and `packages/engine/src/index.ts`
4. Update all current consumers to import from `@beatbax/engine` instead of local definitions
5. Run full test suite to confirm backward compatibility

**Scope:** All consumers throughout the codebase (expand, SMS chip, NES chip, VGM exporter, Web UI, etc.)

### Phase 2: Introduce VGM Backend Architecture

1. Create `packages/plugins/export-vgm/src/backends/types.ts` with `VgmBackend` interface and `VgmTranslateResult` type
2. Create `packages/plugins/export-vgm/src/backendRegistry.ts` with chip alias normalisation and backend lookup
3. Extend `VgmHeaderParams` in `vgmWriter.ts` to include optional `ay8910Clock` and `ym2413Clock` fields
4. Add AY and YM2413 clock constants to `constants.ts`
5. Create `packages/plugins/export-vgm/src/backends/sn76489.ts` implementing `VgmBackend` (SMS logic extracted from current `ismToVgm.ts` and `index.ts`)
6. Create compatibility shims: `sms.ts` and `psgState.ts` (re-export from `sn76489.ts`)
7. Refactor `index.ts` to dispatcher pattern using backend registry
8. Delete `ismToVgm.ts` (logic moved to `sn76489.ts`)
9. Create AY stub backend (`ay.ts`) that registers aliases but returns "not yet implemented" error
10. Run full test suite with determinism gate: hash SMS VGM output before/after, confirm byte-for-byte match

**Scope:** VGM exporter only. No engine API changes.

### Phase 3: Extract Channel Simulation Module

1. Create `packages/plugins/export-vgm/src/backends/channelSim.ts`
2. Import centralized utilities from `@beatbax/engine` (see Phase 1)
3. Define and export `BaseChannelSimState` interface with all generic effect fields
4. Export `makeBaseChannelState(mutedAttenuation: number)`
5. Export chip-agnostic effect parsing: `parseGenericEffectsOnNoteOn()`
6. Export chip-agnostic frame advancement: `advanceGenericFrames()`
7. Export tremolo helper: `calcTremoloAttenuation(state, baseAttenuation, invertScale)`
8. Export instrument resolution: `resolveInstrument()`
9. Refactor `sn76489.ts` to consume `channelSim.ts`
   - Remove private copies of extracted functions
   - Change `ChannelSimState` to extend `BaseChannelSimState`; add only SMS-specific fields
   - Update `makeChannelState()` to call `makeBaseChannelState()` first
   - Update effect parsing to call `parseGenericEffectsOnNoteOn()` then handle chip-specific effects
   - Update frame advancement to call `advanceGenericFrames()` then advance chip-specific state
   - Update attenuation calculation to use `calcTremoloAttenuation()` with `invertScale=false`
10. Run determinism gate: SMS VGM output must remain bit-for-byte identical

**Scope:** VGM exporter; backward compatibility verified by determinism gate.

### Phase 4: Update All Chip Backends

For each chip plugin (SMS, NES, GB):
1. Update to import centralized utilities from `@beatbax/engine` instead of local copies
2. Remove private copies of `noteToMidi`, `midiToFreq`, macro parsing, etc.
3. Run full test suite for that chip

**Scope:** Chip plugins only. No feature changes; utility consolidation only.

### Phase 5: Prepare AY Backend Integration (Future)

When implementing the full AY-3-8910 backend:
1. Refactor `packages/plugins/export-vgm/src/backends/ay.ts` from stub to full implementation
2. Follow the same pattern as `sn76489.ts`: extend `BaseChannelSimState` with AY-specific fields, call `parseGenericEffectsOnNoteOn()` and `advanceGenericFrames()`, add chip-specific logic
3. Add AY chip plugin (`packages/plugins/chip-ay/`) alongside existing chip plugins
4. Implement AY ISM validation in the chip plugin
5. Wire up exporter resolution in `apps/web-ui/src/plugins/exporter-registry-config.ts`

---

## Testing Strategy

### Unit Tests

| Test file | Scope |
|-----------|-------|
| `packages/engine/src/util/music.test.ts` | Pitch and macro utilities; determinism |
| `packages/plugins/export-vgm/src/backends/channelSim.test.ts` | Generic effect parsing, frame advancement, attenuation helpers |
| `packages/plugins/export-vgm/src/backends/sn76489.test.ts` | SMS backend: validate, translate, GD3, headerParams |
| `packages/plugins/export-vgm/src/backendRegistry.test.ts` | Chip alias normalisation, backend lookup, missing chip error messages |

### Integration Tests

| Test file | Scope |
|-----------|-------|
| `packages/plugins/export-vgm/tests/vgm-exporter.test.ts` | Existing SMS tests; backend dispatch; unsupported chip errors; validate/export consistency |
| `packages/plugins/export-vgm/tests/vgmWriter.test.ts` | Confirm SMS header byte output unchanged after header params extension |

### Regression Gate

Before merging each phase:

1. **Phase 1:** Run full test suite across all packages. No test changes expected.
2. **Phase 2:** Compare SHA-256 hash of `beatbax export vgm songs/sms/battle_field.bax` output before and after. Must be byte-identical.
3. **Phase 3:** Re-run Phase 2 regression gate. SMS output must remain byte-for-byte identical.
4. **Phase 4:** Run full test suite for each updated chip plugin. No test changes expected.

---

## Backward Compatibility & API Stability

| Component | Stability | Notes |
|-----------|-----------|-------|
| Engine utilities (`@beatbax/engine`) | ✅ Backward compatible | New module; no existing code affected. All consumers can migrate incrementally. |
| VGM exporter plugin id (`"vgm"`) | ✅ Stable | Unchanged. CLI and Web UI continue to work without modification. |
| VGM exporter API | ✅ Stable | `ExporterPlugin` interface unchanged. No new parameters, no breaking changes. |
| SMS VGM output | ✅ Deterministic | Byte-for-byte identical before/after refactoring. Verified by regression gate. |
| Chip plugins | ✅ Stable | No changes to plugin interface or lifecycle. |

---

## Future Enhancements

### Near-term (Months 2–3)

- **AY-3-8910 backend:** Full implementation following the established `VgmBackend` pattern. Enables VGM export for ZX Spectrum, Atari ST, Amstrad CPC, MSX.
- **YM2413 backend:** OPLL FM support for MSX-Music and PC-88 compositions.

### Mid-term (Months 4–6)

- **YM2612 backend:** Genesis FM+PSG dual-chip VGM. Requires interleaved register write ordering.
- **Per-chip backend packages:** If the number of backends grows to ≥4, consider separating backends into optional packages with dynamic discovery.

### Long-term

- **Hardware-accurate plugin timings:** Each chip backend defines precise register-write ordering and clock-relative timing, not just VGM offsets.
- **Debugger integration:** Inspect per-channel state at each frame; visualize effect curves; log register writes.

---

## References

- VGM exporter: `packages/plugins/export-vgm/src/index.ts`
- Current ISM-to-VGM translator: `packages/plugins/export-vgm/src/ismToVgm.ts`
- VGM binary builder: `packages/plugins/export-vgm/src/vgmWriter.ts`
- SMS chip plugin: `packages/plugins/chip-sms/src/index.ts`
- Exporter registry: `packages/engine/src/export/registry.ts`
- Web UI exporter config: `apps/web-ui/src/plugins/exporter-registry-config.ts`
- VGM specification: https://vgmrips.net/wiki/VGM_Specification
- AY-3-8910 hardware guide: `docs/chips/ay/hardware_guide.md`
