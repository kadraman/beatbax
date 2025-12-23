---
title: Wave Channel Volume Control
status: proposed
authors: ["kadraman"]
created: 2025-12-23
issue: "https://github.com/kadraman/beatbax/issues/15"
---

## Overview

The Game Boy wave channel (channel 3) has a global volume control separate from the wavetable data itself. This control has 4 settings: 0% (mute), 25%, 50%, and 100%. Currently, BeatBax has no way to specify this, and the UGE export defaults to 25%, making wave instruments much quieter than expected.

## Problem

When exporting to UGE format, all wave instruments default to 25% volume in hUGETracker, making them significantly quieter than pulse and noise channels. Users cannot control this setting, leading to unbalanced mixes.

## Proposed Solution

Add a `volume` parameter to wave channel instruments that maps to the Game Boy's wave channel volume control.

### Syntax

```
inst wave_loud  type=wave wave=[...] volume=100
inst wave_soft  type=wave wave=[...] volume=50
inst wave_quiet type=wave wave=[...] volume=25
inst wave_mute  type=wave wave=[...] volume=0
```

Valid values: `0`, `25`, `50`, `100` (matching GB hardware values)  
Default: `100` (maximum volume for best balance)

### Alternative Syntax (Percentage)

```
inst wave1 type=wave wave=[...] vol=100%
inst wave2 type=wave wave=[...] vol=50%
```

This could be normalized to the 4 hardware values (0, 25, 50, 100).

## Implementation Plan

### 1. AST Changes

**File:** `packages/engine/src/parser/ast.ts`

Add `volume` field to wave instrument properties:

```typescript
export interface WaveInstrumentProps {
  type: 'wave';
  wave: number[];  // 16 x 4-bit samples
  volume?: 0 | 25 | 50 | 100;  // Wave channel volume (default: 100)
}
```

### 2. Parser Changes

**File:** `packages/engine/src/parser/index.ts`

In the instrument parsing section (around line 350), add volume parameter parsing:

```typescript
// For wave instruments
if (waveMatch) {
  const wave = waveMatch[1].split(',').map(v => parseInt(v.trim(), 10));
  
  // Parse volume parameter
  let volume: 0 | 25 | 50 | 100 = 100;  // Default to 100%
  const volumeMatch = inst.match(/\bvolume=(\d+)/i);
  if (volumeMatch) {
    const v = parseInt(volumeMatch[1], 10);
    if (![0, 25, 50, 100].includes(v)) {
      throw new Error(`Invalid wave volume ${v} for instrument "${name}". Must be 0, 25, 50, or 100`);
    }
    volume = v as 0 | 25 | 50 | 100;
  }
  
  return {
    type: 'wave',
    wave,
    volume,
    gm: gmNum
  };
}
```

### 3. UGE Export Changes

**File:** `packages/engine/src/export/ugeWriter.ts`

Update wave instrument encoding (around line 180-200):

```typescript
function encodeWaveInstrument(inst: WaveInstrumentProps): Buffer {
  const buf = Buffer.alloc(18);
  
  // Map volume to GB hardware values (0-3)
  const volumeMap = { 0: 0, 25: 1, 50: 2, 100: 3 };
  const volumeValue = volumeMap[inst.volume ?? 100];
  
  // Byte 0: Volume (bits 5-6) + length flag (bit 7)
  buf[0] = (volumeValue << 5) | 0x80;  // 0x80 = use length
  
  // Bytes 2-17: Wave data (16 samples, 4-bit each, packed into bytes)
  for (let i = 0; i < 16; i += 2) {
    const high = (inst.wave[i] & 0xF) << 4;
    const low = inst.wave[i + 1] & 0xF;
    buf[2 + (i / 2)] = high | low;
  }
  
  return buf;
}
```

### 4. Wave Channel Implementation

**File:** `packages/engine/src/chips/gameboy/wave.ts`

The wave channel should apply the volume control during playback:

```typescript
export class GameBoyWaveChannel {
  private globalVolume: number = 1.0;  // 100% by default
  
  setInstrument(inst: WaveInstrumentProps) {
    this.wavetable = inst.wave;
    
    // Map volume to gain multiplier
    const volumeMap = { 0: 0, 25: 0.25, 50: 0.5, 100: 1.0 };
    this.globalVolume = volumeMap[inst.volume ?? 100];
  }
  
  tick() {
    // Apply global volume to output
    const rawSample = this.wavetable[this.wavePosition];
    const normalizedSample = (rawSample / 15) * 2 - 1;  // -1 to 1
    const volumeAdjusted = normalizedSample * this.globalVolume;
    
    this.gainNode.gain.value = volumeAdjusted;
    // ... rest of tick logic
  }
}
```

### 5. Documentation Updates

**File:** `docs/instruments.md` (create if doesn't exist)

Add section on wave channel volume:

```markdown
## Wave Channel Volume

The Game Boy wave channel has a global volume control separate from the wavetable data:

- `volume=0` - Mute (0%)
- `volume=25` - Quiet (25%)
- `volume=50` - Medium (50%)
- `volume=100` - Loud (100%, default)

Example:
```
inst bass type=wave wave=[0,4,8,12,15,12,8,4,0,4,8,12,15,12,8,4] volume=100
inst pad  type=wave wave=[8,11,13,14,15,14,13,11,8,4,2,1,0,1,2,4] volume=50
```

**Best Practices:**
- Use `volume=100` for leads and bass to match pulse channel volume
- Use `volume=50` for background pads and textures
- Avoid `volume=25` unless specifically needed for very quiet parts
```

## Testing Strategy

### Unit Tests

**File:** `packages/engine/tests/wave-volume.test.ts`

```typescript
describe('Wave Channel Volume', () => {
  test('parses volume parameter correctly', () => {
    const ast = parseScript(`
      inst w1 type=wave wave=[0,8,15,8] volume=100
      inst w2 type=wave wave=[0,8,15,8] volume=50
      inst w3 type=wave wave=[0,8,15,8] volume=25
      inst w4 type=wave wave=[0,8,15,8] volume=0
    `);
    
    expect(ast.insts.w1.volume).toBe(100);
    expect(ast.insts.w2.volume).toBe(50);
    expect(ast.insts.w3.volume).toBe(25);
    expect(ast.insts.w4.volume).toBe(0);
  });
  
  test('defaults to 100% when not specified', () => {
    const ast = parseScript(`
      inst w type=wave wave=[0,8,15,8]
    `);
    expect(ast.insts.w.volume).toBe(100);
  });
  
  test('rejects invalid volume values', () => {
    expect(() => parseScript(`
      inst w type=wave wave=[0,8,15,8] volume=75
    `)).toThrow(/Invalid wave volume/);
  });
});

describe('Wave Volume UGE Export', () => {
  test('encodes volume correctly', () => {
    const inst: WaveInstrumentProps = {
      type: 'wave',
      wave: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      volume: 100
    };
    
    const buf = encodeWaveInstrument(inst);
    expect(buf[0] & 0x60).toBe(0x60);  // Volume bits = 11 (100%)
  });
  
  test('encodes 50% volume', () => {
    const inst: WaveInstrumentProps = {
      type: 'wave',
      wave: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      volume: 50
    };
    
    const buf = encodeWaveInstrument(inst);
    expect(buf[0] & 0x60).toBe(0x40);  // Volume bits = 10 (50%)
  });
});
```

### Integration Tests

Test that songs with wave volume variations export correctly and sound balanced when imported into hUGETracker.

## Migration Path

This is a backward-compatible addition:
1. Existing songs without `volume=` parameter will default to 100%
2. This matches the expected behavior (maximum volume)
3. No breaking changes to existing files

## Alternative Approaches Considered

### 1. Channel-level volume control
```
channel 3 => inst wave1 volume=100 seq main
```

**Rejected:** Too inflexible - can't change volume per instrument

### 2. Per-note volume control
```
pat melody = C4:vol(50) D4:vol(100) E4:vol(50)
```

**Rejected:** Wave channel doesn't support per-note volume on real hardware

### 3. Automatic volume normalization
Automatically adjust wave volume based on wavetable peak amplitude.

**Rejected:** Removes user control and may not match intended mix

## Open Questions

1. **Should we support `vol=` as an alias for `volume=`?**
   - Pro: Shorter, consistent with future ADSR syntax
   - Con: Less explicit, `volume` is clearer

2. **Should we normalize non-standard values (e.g., `volume=75` → `volume=50`)?**
   - Pro: More forgiving, easier for users
   - Con: Unpredictable rounding, better to enforce valid values

3. **Should we warn if wavetable samples are already quiet (max < 15)?**
   - Pro: Helps users avoid double-quieting
   - Con: May be intentional, adds complexity

## References

- [Pan Docs - Wave Channel](https://gbdev.io/pandocs/Audio_Registers.html#ff1a--nr30-channel-3-dac-enable)
- [hUGETracker Wave Instrument Format](https://github.com/SuperDisk/hUGETracker)
- Game Boy Programming Manual, Audio Section 3.3

## Implementation Checklist

- [ ] Add `volume` field to `WaveInstrumentProps` in AST
- [ ] Implement parser support for `volume=` parameter
- [ ] Add validation for valid values (0, 25, 50, 100)
- [ ] Update UGE writer to encode volume correctly
- [ ] Update wave channel playback to apply global volume
- [ ] Write unit tests for parsing and encoding
- [ ] Write integration tests for UGE export
- [ ] Update documentation with examples
- [ ] Update `instrument_demo.bax` to demonstrate volume control
- [ ] Test in hUGETracker to verify correct import