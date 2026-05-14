---
title: "Refactor VGM Exporter & Centralize Engine Utilities"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-10
issue: "https://github.com/kadraman/beatbax/issues/105"
---

## Summary

Consolidate scattered pitch and macro utilities across the codebase into a single authoritative location in the BeatBax engine, then extract the chip-agnostic effects simulation engine from the VGM exporter's SMS backend into a reusable module. This eliminates 20+ duplicate function definitions, reduces maintenance burden, and sets up clean architecture for adding new chip backends (AY-3-8910, YM2413, etc.).

---

## Problem Statement

### Current Issues

1. **Massive utility duplication** — `noteToMidi()`, `midiToFreq()`, macro parsing functions defined in 5–7 different locations across the codebase
2. **Inconsistent implementations** — Different files implement the same function slightly differently, risking silent bugs
3. **Maintenance nightmare** — A bug fix in one location doesn't propagate; new features must be added everywhere
4. **VGM exporter code bloat** — The SMS backend (`sms.ts`) is ~1000 lines and contains 750+ lines of chip-agnostic effects engine that will be duplicated in `ay.ts`

### Current State

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
├─────────────────────────────────────────────────────────────────┤
│ ~750-line effects engine in VGM/SMS backend                      │
│ (vibrato, portamento, arp, tremolo, bend, volslide, etc.)        │
│ → Will be duplicated for AY-3-8910, YM2413, etc.                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposed Solution

### Three-Phase Approach

#### Phase A: Centralize Engine Utilities

Create a single source of truth in `@beatbax/engine` for all pitch and macro utilities. All plugins and exporters import from here.

#### Phase B: Extract Channel Simulation Module

Extract the 750-line chip-agnostic effects engine from `sms.ts` into `backends/channelSim.ts` that imports centralized utilities from the engine.

#### Phase C: Update All Plugins

Refactor SMS backend, then all other plugins/exporters, to use centralized utilities and shared channel simulation.

---

## Phase A: Centralize Engine Utilities

### Objective

Create `packages/engine/src/util/music.ts` as the single source of truth for:
- MIDI ↔ note name conversions
- MIDI → frequency conversion (equal temperament)
- Macro parsing and state management

Export from `@beatbax/engine` for all consumers.

### Implementation

#### 1. Create `packages/engine/src/util/music.ts`

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

#### 2. Create unit tests: `packages/engine/src/util/music.test.ts`

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

#### 3. Export from engine entry points

**`packages/engine/src/export/index.ts`** — add:

```typescript
// Music utilities for exporters and plugins
export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  midiToFreq,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from '../util/music.js';
```

**`packages/engine/src/index.ts`** — also re-export for public API:

```typescript
export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  midiToFreq,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from './util/music.js';
```

#### Phase A Checklist

- [ ] Create `packages/engine/src/util/music.ts` with all functions and interfaces
- [ ] Create `packages/engine/src/util/music.test.ts` with comprehensive unit tests
- [ ] Add exports to `packages/engine/src/export/index.ts`
- [ ] Add exports to `packages/engine/src/index.ts`
- [ ] Run tests: `npm run test -- music.test.ts` (all pass)
- [ ] Build engine: `npm run build` (no TypeScript errors)

---

## Phase B: Extract Channel Simulation Module

### Objective

Create `packages/plugins/export-vgm/src/backends/channelSim.ts` containing all chip-agnostic effects simulation code from `sms.ts`. It imports centralized utilities from `@beatbax/engine` instead of defining them privately.

### Implementation

#### 1. Create `packages/plugins/export-vgm/src/backends/channelSim.ts`

Extract from `sms.ts`:
- Import pitch utilities from `@beatbax/engine` (NOT duplicating)
- Import macro system from `@beatbax/engine` (NOT duplicating)
- Provide `BaseChannelSimState` interface
- Provide generic effect handlers (`parseGenericEffectsOnNoteOn`)
- Provide generic frame advancement (`advanceGenericFrames`)
- Provide helpers (`resolveInstrument`, `calcTremoloAttenuation`)

Key point: **No duplication of pitch/macro utilities**. All imports from engine.

#### 2. Update `packages/plugins/export-vgm/src/backends/sms.ts`

- Import shared utilities from `./channelSim.js`
- Import pitch/macro utilities from `@beatbax/engine`
- Extend `BaseChannelSimState` with SMS-specific fields only
- Remove all duplicated functions
- Keep SMS-specific code: `freqToPeriod()`, noise handling, GG stereo, register writes

#### Phase B Checklist

- [ ] Create `src/backends/channelSim.ts`
  - [ ] Import from `@beatbax/engine` (not duplicate)
  - [ ] Export `BaseChannelSimState` interface
  - [ ] Export `makeBaseChannelState()`
  - [ ] Export `resolveInstrument()`
  - [ ] Export `parseGenericEffectsOnNoteOn()`
  - [ ] Export `advanceGenericFrames()`
  - [ ] Export `calcTremoloAttenuation()`
- [ ] Refactor `src/backends/sms.ts`
  - [ ] Import from `./channelSim.js`
  - [ ] Import from `@beatbax/engine`
  - [ ] Remove duplicated pitch/macro/effect functions
  - [ ] `ChannelSimState` extends `BaseChannelSimState`
- [ ] Run regression gate: SHA-256 hash of SMS VGM output unchanged
- [ ] All VGM exporter tests pass

---

## Phase C: Update All Plugins & Exporters

### Update Chip Plugins

#### SMS Plugin (`packages/plugins/chip-sms/src/`)

- **macros.ts** — remove private `parseMacro`, etc.; import from `@beatbax/engine`
- **periodTables.ts** — remove private `NOTE_BASE`, `noteToMidi`; import from `@beatbax/engine`; keep SMS-specific `freqToPeriod`

#### NES Plugin (`packages/plugins/chip-nes/src/`)

- **macros.ts** — import macro system from `@beatbax/engine`
- **periodTables.ts** — import `noteToMidi` from `@beatbax/engine`; keep NES-specific period/frequency logic

#### Game Boy Plugin (`packages/engine/src/chips/gameboy/`)

- **apu.ts** — keep hardware-accurate `midiToFreq` wrapper; note that standard `midiToFreq` is now in engine

### Update Exporters

#### VGM Exporter (`packages/plugins/export-vgm/src/`)

- **backends/sms.ts** — already updated in Phase B
- **backends/ay.ts** (future) — import from both `./channelSim.js` and `@beatbax/engine`

#### FamiTracker Exporter (`packages/plugins/export-famitracker/src/`)

- **ftm-patterns.ts** — remove private `NOTE_SEMITONES`, `noteToMidi`; import from `@beatbax/engine`

### Update Web UI

#### MIDI Builder (`apps/web-ui/src/export/`)

- **midi-builder.ts** — import `noteToMidi`, `NOTE_SEMITONES` from `@beatbax/engine`

### Phase C Checklist

- [ ] Update SMS plugin
  - [ ] macros.ts imports from engine
  - [ ] periodTables.ts imports from engine
  - [ ] Tests pass
- [ ] Update NES plugin
  - [ ] macros.ts imports from engine
  - [ ] periodTables.ts imports from engine
  - [ ] Tests pass
- [ ] Update FamiTracker exporter
  - [ ] ftm-patterns.ts imports from engine
  - [ ] Tests pass
- [ ] Update Web UI MIDI builder
  - [ ] Imports from engine
  - [ ] Build passes
- [ ] Run full test suite: `npm test` (all pass)
- [ ] Verify exports work: can import from `@beatbax/engine` in all files

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│ Phase A: Engine Utilities                                    │
├─────────────────────────────────────────────────────────────┤
│ packages/engine/src/util/music.ts                            │
│ ├─ noteToMidi(), midiToNote(), midiToFreq()                  │
│ ├─ ParsedMacro, MacroState, parseMacro, etc.                 │
│ └─ Unit tests (music.test.ts)                                │
│ Exported from: @beatbax/engine, @beatbax/engine/export       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase B: VGM Exporter Refactor                               │
├─────────────────────────────────────────────────────────────┤
│ packages/plugins/export-vgm/src/backends/channelSim.ts       │
│ ├─ Imports from @beatbax/engine (NOT duplicating)            │
│ ├─ BaseChannelSimState, effect handlers, helpers             │
│ └─ No chip-specific code                                     │
│                                                               │
│ packages/plugins/export-vgm/src/backends/sms.ts              │
│ ├─ Imports from ./channelSim.ts                              │
│ ├─ Imports from @beatbax/engine                              │
│ ├─ Extends BaseChannelSimState                               │
│ └─ SMS-specific: freqToPeriod, noise, GG stereo              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase C: Plugin Updates                                      │
├─────────────────────────────────────────────────────────────┤
│ All plugins/exporters import from @beatbax/engine            │
│ ├─ chip-sms/macros.ts, periodTables.ts                       │
│ ├─ chip-nes/macros.ts, periodTables.ts                       │
│ ├─ export-famitracker/ftm-patterns.ts                        │
│ └─ apps/web-ui/export/midi-builder.ts                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Strategy

### Unit Tests

- **Phase A:** `packages/engine/src/util/music.test.ts` — full coverage of pitch and macro functions
- **Phase B:** Existing `packages/plugins/export-vgm/tests/vgm-exporter.test.ts` — no changes needed, should still pass
- **Phase C:** Existing plugin tests should pass unchanged

### Regression Testing

| Phase | Test | Verification |
|---|---|---|
| B | SHA-256 hash of SMS VGM | Output must be bit-for-bit identical before/after refactor |
| B | All VGM exporter tests | Must pass without modification |
| C | All chip plugin tests | Must pass for SMS, NES |
| C | Full test suite | `npm test` — all tests pass |

### Regression Procedure

```bash
# Phase B regression
npm run build-all
node bin/beatbax export vgm songs/sms/battle_field.bax --output tmp/before.vgm

# Apply Phase B changes, rebuild
npm run build-all
node bin/beatbax export vgm songs/sms/battle_field.bax --output tmp/after.vgm

# Hash comparison (must match)
Get-FileHash tmp/before.vgm -Algorithm SHA256
Get-FileHash tmp/after.vgm -Algorithm SHA256
```

---

## File Structure After All Phases

```
packages/
├── engine/src/
│   ├── util/
│   │   ├── music.ts        ← NEW: centralized utilities
│   │   ├── music.test.ts   ← NEW: unit tests
│   │   ├── logger.ts       ← existing
│   │   └── diag.ts         ← existing
│   ├── export/
│   │   └── index.ts        ← UPDATED: re-export music.ts
│   └── index.ts            ← UPDATED: re-export music.ts
│
├── plugins/
│   ├── chip-sms/src/
│   │   ├── macros.ts              ← UPDATED: import from engine
│   │   └── periodTables.ts        ← UPDATED: import from engine
│   ├── chip-nes/src/
│   │   ├── macros.ts              ← UPDATED: import from engine
│   │   └── periodTables.ts        ← UPDATED: import from engine
│   ├── export-famitracker/src/
│   │   └── ftm-patterns.ts        ← UPDATED: import from engine
│   └── export-vgm/src/
│       └── backends/
│           ├── channelSim.ts      ← NEW: shared effects engine
│           ├── types.ts           ← unchanged
│           ├── psgState.ts        ← unchanged
│           ├── sms.ts             ← UPDATED: use channelSim + engine imports
│           └── ay.ts              ← stub; will use channelSim when implemented
│
└── apps/web-ui/src/
    └── export/
        └── midi-builder.ts        ← UPDATED: import from engine
```

---

## Risk Assessment

### Low Risk

- Phase A (engine utilities) — new module, doesn't touch existing code
- Existing unit tests provide safety net for all changes

### Medium Risk

- Phase B (VGM refactor) — internal refactoring, but SHA-256 regression gate catches any divergence
- SMS output must be byte-for-byte identical

### Mitigation

- SHA-256 hash verification for all VGM export operations
- All existing tests must pass
- No changes to external API or language syntax
- Each phase can be developed and tested independently

---

## Implementation Checklist

### Phase A: Engine Utilities

- [ ] Create `packages/engine/src/util/music.ts`
- [ ] Create `packages/engine/src/util/music.test.ts`
- [ ] Update `packages/engine/src/export/index.ts` exports
- [ ] Update `packages/engine/src/index.ts` exports
- [ ] Run: `npm run test -- music.test.ts` (all pass)
- [ ] Build: `npm run build` (no errors)

### Phase B: VGM Exporter Refactor

- [ ] Create `packages/plugins/export-vgm/src/backends/channelSim.ts`
- [ ] Update `packages/plugins/export-vgm/src/backends/sms.ts`
- [ ] Regression: SHA-256 hash comparison (must match)
- [ ] Run: `npm run test -- export-vgm` (all pass)
- [ ] Build: `npm run build-all` (no errors)

### Phase C: Plugin Updates

- [ ] Update SMS plugin (macros.ts, periodTables.ts)
- [ ] Update NES plugin (macros.ts, periodTables.ts)
- [ ] Update FamiTracker exporter (ftm-patterns.ts)
- [ ] Update Web UI (midi-builder.ts)
- [ ] Run: `npm test` (all pass)
- [ ] Build: `npm run build-all` (no errors)

### Final Verification

- [ ] All tests pass: `npm test`
- [ ] All builds succeed: `npm run build-all`
- [ ] No TypeScript errors
- [ ] SHA-256 hashes verified for all affected export formats
- [ ] Documentation updated (if applicable)

---

## Benefits

✓ **Single Source of Truth** — One definition of `noteToMidi`, `parseMacro`, etc.
✓ **Reduced Duplication** — Eliminates 20+ copies across codebase
✓ **Easier Maintenance** — Bug fixes and features require one change
✓ **Consistent Behavior** — All plugins use identical utilities
✓ **Scalable Architecture** — Future chip backends (AY, YM2413) reuse existing code
✓ **Better Testing** — Centralized utilities have centralized tests
✓ **Smaller Bundle** — No code duplication

---

## Future Work

1. **AY-3-8910 VGM backend** — will use `channelSim.ts` and engine utilities, no duplication
2. **YM2413 VGM backend** — same pattern, further validates architecture
3. **WAV renderer plugin** — can reuse `channelSim.ts` effects engine
4. **Scale-awareness feature** — add utilities to `music.ts` (e.g., `noteToMidiInScale()`)
5. **Alternative tuning systems** — extend `music.ts` with tuning system abstraction

---

## References

- Engine patterns utilities: [packages/engine/src/patterns/expand.ts](packages/engine/src/patterns/expand.ts)
- SMS macros: [packages/plugins/chip-sms/src/macros.ts](packages/plugins/chip-sms/src/macros.ts)
- SMS period tables: [packages/plugins/chip-sms/src/periodTables.ts](packages/plugins/chip-sms/src/periodTables.ts)
- VGM exporter SMS backend: [packages/plugins/export-vgm/src/backends/sms.ts](packages/plugins/export-vgm/src/backends/sms.ts)
- Multi-chip architecture: [docs/features/vgm-exporter-multi-chip-architecture.md](docs/features/vgm-exporter-multi-chip-architecture.md)
- ZX Spectrum 128 chip plugin spec: [docs/features/zx-spectrum-128-chip-plugin.md](docs/features/zx-spectrum-128-chip-plugin.md)
