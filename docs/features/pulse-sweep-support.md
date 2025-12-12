---
title: Pulse Channel Sweep Support
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/2"
---

## Summary

Add frequency sweep support to the Game Boy pulse channels (specifically pulse1/channel 1). Sweep is a signature Game Boy audio effect that creates smooth pitch bends by automatically adjusting the frequency over time, commonly used for sound effects and melodic flourishes.

## Motivation

- **Authentic GB sound**: Sweep is one of the defining characteristics of Game Boy audio
- **Expressive sequencing**: Enables pitch bends, risers, and characteristic "chip" sound effects
- **Hardware accuracy**: Pulse1 on real GB hardware has a built-in sweep unit
- **Compatibility**: UGE files use sweep; proper import/export requires sweep support

## Current State

- Pulse channels support duty cycle and envelope
- Sweep parameters are defined in the UGE spec but not implemented
- Parser accepts sweep parameters but they're ignored during playback
- `src/chips/gameboy/pulse.ts` has no sweep logic

## Game Boy Hardware Sweep

The Game Boy pulse1 channel has a frequency sweep unit controlled by three parameters:

1. **Sweep Time** (0-7): Time between sweep shifts (in 128 Hz intervals)
   - 0 = sweep disabled
   - 1 = 7.8ms per shift
   - 7 = 54.7ms per shift

2. **Sweep Direction** (0-1): 
   - 0 = increase frequency (pitch up)
   - 1 = decrease frequency (pitch down)

3. **Sweep Shift** (0-7): Amount of frequency change per step
   - Formula: `new_freq = old_freq ± (old_freq >> shift)`
   - 0 = no change
   - 1 = ±50% per step
   - 7 = ±0.78% per step (subtle)

## Proposed Implementation

### 1. Instrument Definition Syntax

```bax
# Existing syntax (no sweep)
inst lead type=pulse1 duty=50 env=12,down

# New syntax with sweep
inst riser type=pulse1 duty=50 env=12,down sweep=4,up,3
inst fall  type=pulse1 duty=25 env=10,down sweep=6,down,2

# Sweep parameters: time,direction,shift
# time: 0-7 (0=off)
# direction: up|down|inc|dec|0|1
# shift: 0-7
```

### 2. AST Changes

Update `InstrumentNode` type:

```typescript
// packages/engine/src/parser/ast.ts
export interface InstrumentNode {
  name: string;
  type: string; // 'pulse1', 'pulse2', 'wave', 'noise'
  duty?: number;
  envelope?: { initial: number; direction: 'up' | 'down' };
  wave?: number[];
  
  // NEW: Sweep parameters
  sweep?: {
    time: number;      // 0-7, 0 = disabled
    direction: 'up' | 'down';
    shift: number;     // 0-7
  };
}
```

### 3. Parser Changes

```typescript
// packages/engine/src/parser/parser.ts
function parseInstrument(tokens: Token[]): InstrumentNode {
  // ... existing parsing ...
  
  // Parse sweep=time,direction,shift
  const sweepToken = findParam(tokens, 'sweep');
  if (sweepToken) {
    const [time, dir, shift] = sweepToken.value.split(',');
    inst.sweep = {
      time: parseInt(time, 10) || 0,
      direction: normalizeDirection(dir), // 'up'|'down'|'inc'|'dec'|'0'|'1' → 'up'|'down'
      shift: parseInt(shift, 10) || 0
    };
  }
}
```

### 4. Pulse Channel Implementation

```typescript
// packages/engine/src/chips/gameboy/pulse.ts
export function playPulse(
  ctx: AudioContext,
  freq: number,
  duty: number,
  start: number,
  dur: number,
  inst: any
): AudioNode[] {
  const osc = ctx.createOscillator();
  osc.type = 'square';
  
  // Set initial frequency
  osc.frequency.setValueAtTime(freq, start);
  
  // Apply sweep if present
  if (inst.sweep && inst.sweep.time > 0) {
    applySweep(ctx, osc.frequency, freq, start, dur, inst.sweep);
  }
  
  // ... existing duty cycle and envelope logic ...
}

function applySweep(
  ctx: AudioContext,
  freqParam: AudioParam,
  initialFreq: number,
  start: number,
  dur: number,
  sweep: { time: number; direction: 'up' | 'down'; shift: number }
) {
  // Calculate sweep parameters
  const sweepInterval = (sweep.time / 128); // Time between shifts in seconds
  const numSweeps = Math.floor(dur / sweepInterval);
  
  let currentFreq = initialFreq;
  
  for (let i = 0; i < numSweeps; i++) {
    const time = start + (i * sweepInterval);
    
    // Calculate frequency delta
    const delta = currentFreq >> sweep.shift;
    
    if (sweep.direction === 'up') {
      currentFreq += delta;
    } else {
      currentFreq -= delta;
    }
    
    // Clamp to valid range (avoid overflow/underflow)
    currentFreq = Math.max(8, Math.min(currentFreq, 20000));
    
    // Schedule frequency change
    freqParam.setValueAtTime(currentFreq, time);
  }
}
```

### 5. UGE Export/Import

```typescript
// packages/engine/src/export/ugeWriter.ts
function writeDutyInstrument(inst: InstrumentNode): Buffer {
  // ... existing fields ...
  
  // Sweep fields (pulse1 only)
  if (inst.type === 'pulse1' && inst.sweep) {
    buffer.writeUInt8(inst.sweep.time, offset++);
    buffer.writeUInt8(inst.sweep.direction === 'down' ? 1 : 0, offset++);
    buffer.writeUInt8(inst.sweep.shift, offset++);
  } else {
    buffer.writeUInt8(0, offset++); // time=0 (disabled)
    buffer.writeUInt8(0, offset++);
    buffer.writeUInt8(0, offset++);
  }
}

// packages/engine/src/import/uge/uge.reader.ts
function readDutyInstrument(buffer: Buffer, offset: number): InstrumentNode {
  // ... existing fields ...
  
  const sweepTime = buffer.readUInt8(offset++);
  const sweepDir = buffer.readUInt8(offset++);
  const sweepShift = buffer.readUInt8(offset++);
  
  if (sweepTime > 0) {
    inst.sweep = {
      time: sweepTime,
      direction: sweepDir === 1 ? 'down' : 'up',
      shift: sweepShift
    };
  }
}
```

## Example Usage

```bax
chip gameboy
bpm 140

# Classic "jump" sound effect
inst jump type=pulse1 duty=50 env=15,down sweep=2,down,4

# Rising synth lead
inst riser type=pulse1 duty=25 env=12,down sweep=5,up,2

# Falling bass hit
inst bass type=pulse1 duty=12 env=14,down sweep=3,down,3

pat sfx = inst jump C6 . . .
pat lead = inst riser C4 E4 G4 C5

channel 1 => inst jump seq sfx
channel 2 => inst riser seq lead
```

## Testing Strategy

### Unit Tests

```typescript
// tests/gameboy/sweep.test.ts
describe('Pulse Sweep', () => {
  test('parses sweep parameters', () => {
    const src = 'inst test type=pulse1 duty=50 sweep=4,up,2';
    const ast = parse(src);
    expect(ast.instruments[0].sweep).toEqual({
      time: 4,
      direction: 'up',
      shift: 2
    });
  });
  
  test('applies sweep to frequency', () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const inst = { type: 'pulse1', duty: 50, sweep: { time: 2, direction: 'up', shift: 1 } };
    const nodes = playPulse(ctx, 440, 0.5, 0, 1, inst);
    
    // Verify frequency automation was scheduled
    // (check AudioParam.setValueAtTime calls via mock)
  });
  
  test('disables sweep when time=0', () => {
    const inst = { type: 'pulse1', duty: 50, sweep: { time: 0, direction: 'up', shift: 2 } };
    // Verify no sweep automation is applied
  });
});
```

### Integration Tests

```typescript
// tests/sweep-export.test.ts
test('UGE export preserves sweep', () => {
  const src = 'inst test type=pulse1 duty=50 sweep=3,down,2';
  const ast = parse(src);
  const uge = exportUGE(ast, 'test.uge');
  const reimported = parseUGE(uge);
  
  expect(reimported.instruments[0].sweep).toEqual({
    time: 3,
    direction: 'down',
    shift: 2
  });
});
```

### Audio Tests

- Create reference UGE files with known sweep settings
- Verify BeatBax playback matches hUGETracker output (auditory testing)
- Check frequency sweep curves match GB hardware behavior

## Implementation Checklist

- [ ] Add `sweep` field to `InstrumentNode` type
- [ ] Update parser to recognize `sweep=time,dir,shift` syntax
- [ ] Implement `applySweep()` in `packages/engine/src/chips/gameboy/pulse.ts`
- [ ] Add sweep support to UGE writer
- [ ] Add sweep support to UGE reader
- [ ] Write unit tests for sweep parsing
- [ ] Write unit tests for sweep audio generation
- [ ] Write integration tests for UGE round-trip
- [ ] Update TUTORIAL.md with sweep examples
- [ ] Add sweep examples to demo songs
- [ ] Document sweep behavior in `docs/uge-v6-spec.md`

## Compatibility Notes

- **Pulse2**: Hardware does not support sweep, parser should warn if sweep specified on pulse2
- **Wave/Noise**: Sweep not applicable, ignore silently or warn
- **UGE v1-5**: Older versions may not have sweep fields, handle gracefully
- **MIDI Export**: Map sweep to pitch bend events in MIDI track

## Performance Considerations

- Sweep requires multiple `setValueAtTime()` calls per note
- For dense arrangements, may need to optimize scheduling
- Consider pre-calculating sweep curves for common sweep settings

## Future Enhancements

- **Visual feedback**: Show sweep curve in web UI waveform display
- **Sweep macros**: Named sweep presets (e.g., `sweep=jump`, `sweep=riser`)
- **Automatic sweep detection**: Suggest sweep parameters when importing MIDI with pitch bends

## Success Metrics

- ✅ Sweep parameters parse correctly
- ✅ Frequency sweep audibly matches GB hardware (subjective testing)
- ✅ UGE files with sweep import/export without data loss
- ✅ Performance: no audio glitches with sweep on all 4 channels
- ✅ Documentation: clear examples in tutorial

## See Also

- [uge-v6-spec.md](../uge-v6-spec.md) - UGE format specification (sweep fields)
- [uge-export-guide.md](../uge-export-guide.md) - UGE export user guide
- [GB Audio Hardware](https://gbdev.io/pandocs/Audio.html) - Game Boy audio documentation
