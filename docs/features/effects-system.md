---
title: Pattern Effects System
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/5"
---

## Summary

Add a comprehensive effects system to BeatBax that enables expressive performance techniques like vibrato, portamento, arpeggio, volume slides, and more. Effects can be applied per-note inline or as pattern-level modifiers, following the tracker music tradition while maintaining BeatBax's concise syntax.

## Motivation

- **Expressive sequencing**: Enable musical techniques beyond static notes
- **Tracker heritage**: Effects are fundamental to tracker-style music composition
- **Hardware authenticity**: Many effects map directly to Game Boy hardware capabilities
- **Competitive feature**: Essential for serious chip music production
- **Creative exploration**: Opens new compositional possibilities

## Current Limitations

- Only static notes with fixed pitch/volume
- No way to apply vibrato, pitch bends, or volume automation
- Instrument envelopes are the only dynamic effect
- Limits expressiveness compared to traditional trackers

## Design Philosophy

1. **Inline syntax**: Effects apply to individual notes without breaking pattern flow
2. **Named effects**: Readable mnemonics instead of hex codes
3. **Pattern modifiers**: Apply effects to entire patterns as transforms
4. **Hardware-aware**: Effects should map cleanly to GB hardware when possible
5. **Composability**: Multiple effects can be combined

## Proposed Syntax

### Inline Effects (Per-Note)

```bax
# Effect syntax: note<effect:param>
pat melody = C4<vib:4> E4 G4<port:E5> C5<vol:-2>

# Multiple effects: note<effect1:param1,effect2:param2>
pat bass_pat = C4<vib:4,vol:+1> E4<arp:047> G4
```

### Pattern-Level Effect Modifiers

```bax
# Apply effect to all notes in pattern
pat melody = C4 E4 G4 C5
pat melody_vib = melody:vib(4)        # All notes vibrato at speed 4
pat melody_slide = melody:slide(2)      # All notes volume slide -2 per tick
```

### Sequence-Level Effect Application

```bax
seq main = melody melody_vib melody:port melody_slide
channel 1 => inst lead seq main
```

## Core Effects

### 1. Vibrato (`vib`)

Periodic pitch modulation (LFO on frequency).

```bax
# Syntax: vib:depth or vib:depth,speed
pat melody = C4<vib:4>       # Vibrato depth 4, default speed
pat melody_fast = C4<vib:4,8>     # Vibrato depth 4, speed 8

# Pattern modifier
pat melody_vib = melody:vib(4)        # Apply to all notes
```

**Parameters:**
- `depth`: 0-15 (pitch deviation in cents)
- `speed`: 0-15 (modulation frequency, optional, default=4)

**Implementation:**
```typescript
// Apply vibrato using AudioParam automation
function applyVibrato(
  freqParam: AudioParam,
  baseFreq: number,
  depth: number,
  speed: number,
  start: number,
  dur: number
) {
  const vibratoRate = speed / 10; // Hz
  const cents = depth * 10;
  const ratio = Math.pow(2, cents / 1200);
  
  const numCycles = dur * vibratoRate;
  const samplesPerCycle = 100;
  
  for (let i = 0; i < numCycles * samplesPerCycle; i++) {
    const t = start + (i / samplesPerCycle / vibratoRate);
    const phase = (i / samplesPerCycle) * Math.PI * 2;
    const mod = Math.sin(phase);
    const freq = baseFreq * Math.pow(ratio, mod);
    
    freqParam.setValueAtTime(freq, t);
  }
}
```

### 2. Portamento (`port`)

Smooth pitch glide from one note to another.

```bax
# Syntax: port:targetNote or port:targetNote,speed
pat melody = C4<port:E4>     # Slide C4→E4 over note duration
pat melody_fast = C4<port:E4,8>   # Slide C4→E4 at speed 8

# Pattern shorthand: note~targetNote
pat melody_slide = C4~E4 E4 G4~C5
```

**Parameters:**
- `targetNote`: Destination pitch (e.g., `E4`, `C5`)
- `speed`: 0-15 (glide rate, optional)

**Implementation:**
```typescript
function applyPortamento(
  freqParam: AudioParam,
  startFreq: number,
  endFreq: number,
  startTime: number,
  dur: number,
  speed: number = 8
) {
  // Linear or exponential ramp
  freqParam.setValueAtTime(startFreq, startTime);
  freqParam.exponentialRampToValueAtTime(endFreq, startTime + dur);
}
```

### 3. Arpeggio (`arp`)

Rapidly cycle through multiple notes to create chord effect.

```bax
# Syntax: arp:intervals (up to 3 notes)
pat melody_maj = C4<arp:047>     # C major: C-E-G (0,4,7 semitones)
pat melody_min = C4<arp:037>     # C minor: C-Eb-G (0,3,7)
pat melody_two = C4<arp:04>      # Two-note arp: C-E

# Named arpeggios
pat melody_chords = C4<arp:maj> E4<arp:min> G4<arp:dim>
```

**Parameters:**
- `intervals`: 2-4 digit string, each digit is semitones above root

**Implementation:**
```typescript
function applyArpeggio(
  ctx: AudioContext,
  baseNote: number,
  intervals: number[],
  start: number,
  dur: number,
  inst: any
): AudioNode[] {
  const arpSpeed = 0.05; // 50ms per note (20Hz)
  const numSteps = Math.floor(dur / arpSpeed);
  const nodes: AudioNode[] = [];
  
  for (let i = 0; i < numSteps; i++) {
    const intervalIdx = i % intervals.length;
    const midi = baseNote + intervals[intervalIdx];
    const freq = midiToFreq(midi);
    const noteStart = start + (i * arpSpeed);
    
    const noteNodes = playNote(ctx, freq, noteStart, arpSpeed, inst);
    nodes.push(...noteNodes);
  }
  
  return nodes;
}
```

### 4. Volume Slide (`vol`)

Gradual volume change over note duration.

```bax
# Syntax: vol:delta (signed integer)
pat melody = C4<vol:+2> E4<vol:-3> G4  # Fade in, fade out
pat melody_cresc = C4<vol:+1> E4<vol:+1> G4  # Crescendo

# Pattern modifier
pat melody_fadein = melody:fadeIn        # Convenience: vol:+2 on all notes
pat melody_fadeout = melody:fadeOut       # Convenience: vol:-2 on all notes
```

**Parameters:**
- `delta`: -15 to +15 (volume change per tick)

**Implementation:**
```typescript
function applyVolumeSlide(
  gainParam: AudioParam,
  startVol: number,
  delta: number,
  start: number,
  dur: number
) {
  const endVol = Math.max(0, Math.min(1, startVol + (delta / 15)));
  gainParam.setValueAtTime(startVol, start);
  gainParam.linearRampToValueAtTime(endVol, start + dur);
}
```

### 5. Pitch Bend (`bend`)

Gradual pitch shift (like portamento but relative).

```bax
# Syntax: bend:semitones or bend:semitones,curve
pat melody_up = C4<bend:+2>     # Bend up 2 semitones
pat melody_down = C4<bend:-3>     # Bend down 3 semitones
pat melody_exp = C4<bend:+5,exp> # Exponential curve
```

**Parameters:**
- `semitones`: -12 to +12 (signed pitch change)
- `curve`: `lin` (linear) or `exp` (exponential), optional

### 6. Tremolo (`trem`)

Periodic volume modulation (LFO on gain).

```bax
# Syntax: trem:depth or trem:depth,speed
pat melody = C4<trem:8>      # Tremolo depth 8, default speed
pat melody_fast = C4<trem:8,6>    # Tremolo depth 8, speed 6
```

**Parameters:**
- `depth`: 0-15 (volume modulation amount)
- `speed`: 0-15 (modulation frequency)

### 7. Delay/Echo (`echo`)

Simple delay/repeat effect.

```bax
# Syntax: echo:time,feedback
pat melody = C4<echo:4,50>   # Echo after 4 ticks, 50% volume
```

**Parameters:**
- `time`: Delay time in ticks
- `feedback`: 0-100 (percentage of original volume)

### 8. Note Cut (`cut`)

Abruptly stop note after specified ticks.

```bax
# Syntax: cut:ticks
pat melody = C4<cut:8> . . . # Note plays for 8 ticks then cuts
pat melody_stacc = C4*4<cut:2>     # Staccato: 4 hits, each cut after 2 ticks
```

**Parameters:**
- `ticks`: Number of ticks before cutting (0-15)

### 9. Retrigger (`retrig`)

Rapidly restart note at fixed intervals.

```bax
# Syntax: retrig:ticks or retrig:ticks,volDelta
pat melody = C4<retrig:4>    # Retrigger every 4 ticks
pat melody_fast = C4<retrig:2,50> # Retrigger every 2 ticks at 50% volume
```

**Parameters:**
- `ticks`: Interval between retriggers
- `volDelta`: Volume change per retrigger (percentage)

## Effect Combinations

Multiple effects can be applied to a single note:

```bax
# Vibrato + volume slide
pat melody = C4<vib:4,vol:+1> E4<vib:6,vol:-1>

# Portamento + tremolo
pat melody_glide = C4<port:G4,trem:8>

# Arpeggio + echo
pat melody_arp = C4<arp:047,echo:4,50>
```

## Named Effect Presets

```bax
# Define reusable effect presets
effect wobble = vib:8,4
effect riser = bend:+12,exp
effect stutter = retrig:2,75

# Apply to notes
pat melody = C4<wobble> E4<riser> G4<stutter>

# Or as pattern modifiers
pat melody_wobble = melody:wobble
```

## Hardware Mapping

### Game Boy Effects

| Effect | GB Hardware | Implementation |
|--------|-------------|----------------|
| Vibrato | Software (freq automation) | AudioParam modulation |
| Portamento | Software (freq automation) | AudioParam ramp |
| Arpeggio | Software (note sequencing) | Rapid note switching |
| Volume Slide | Envelope + software | GainNode automation |
| Tremolo | Software (gain automation) | GainNode modulation |
| Note Cut | Length counter | Stop AudioNode early |
| Retrigger | Software | Create multiple AudioNodes |

### MIDI Export

| Effect | MIDI Equivalent | CC / Event |
|--------|-----------------|------------|
| Vibrato | Modulation | CC #1 + Pitch Bend |
| Portamento | Portamento | CC #5 + Pitch Bend |
| Arpeggio | Note sequence | Multiple Note On/Off |
| Volume Slide | Volume automation | CC #7 |
| Tremolo | Expression | CC #11 |
| Pitch Bend | Pitch Wheel | Pitch Bend events |

### UGE Export

hUGETracker supports limited effects per row. Map BeatBax effects to UGE effect columns:

| BeatBax | UGE Effect | Notes |
|---------|------------|-------|
| `vib` | Not supported | Approximate with pitch automation |
| `port` | Not supported | Approximate with multiple notes |
| `arp` | Arpeggio (0xy) | Direct mapping |
| `vol` | Volume (Cxx) | Set volume per row |
| `cut` | Note cut (ECx) | Cut after x ticks |
| `retrig` | Note delay (EDx) | Partial support |

## AST Representation

```typescript
// src/parser/ast.ts
export interface NoteToken {
  note: string;        // e.g., "C4"
  effects?: Effect[];  // Array of effects applied to this note
}

export interface Effect {
  type: 'vib' | 'port' | 'arp' | 'vol' | 'bend' | 'trem' | 'echo' | 'cut' | 'retrig';
  params: (string | number)[];
}

export interface PatternNode {
  name: string;
  events: (NoteToken | RestToken | InstrumentChangeToken)[];
  effects?: PatternEffect[];  // Pattern-wide effects
}

export interface PatternEffect {
  type: string;
  params: any[];
  applyTo: 'all' | 'notes' | 'rests';  // What to apply effect to
}
```

## Parser Changes

```typescript
// src/parser/parser.ts
function parseNote(token: string): NoteToken {
  // Match: C4<vib:4> or C4<vib:4,vol:+1>
  const match = token.match(/^([A-G][#b]?\d+)<(.+)>$/);
  
  if (!match) {
    return { note: token };
  }
  
  const [, note, effectsStr] = match;
  const effects = parseEffects(effectsStr);
  
  return { note, effects };
}

function parseEffects(str: string): Effect[] {
  // Split by comma: "vib:4,vol:+1" → ["vib:4", "vol:+1"]
  return str.split(',').map(parseEffect);
}

function parseEffect(str: string): Effect {
  // Parse "vib:4" or "port:E4,8"
  const [type, paramsStr] = str.split(':');
  const params = paramsStr ? paramsStr.split(',') : [];
  
  return {
    type: type as any,
    params: params.map(p => isNaN(Number(p)) ? p : Number(p))
  };
}
```

## Playback Implementation

```typescript
// src/audio/playback.ts
function scheduleNote(
  ctx: AudioContext,
  note: NoteToken,
  start: number,
  dur: number,
  inst: InstrumentNode
): AudioNode[] {
  const midi = noteToMidi(note.note);
  const baseFreq = midiToFreq(midi);
  
  // Create base oscillator/nodes
  const nodes = createBaseNodes(ctx, baseFreq, start, dur, inst);
  const [osc, gain] = nodes;
  
  // Apply effects
  if (note.effects) {
    for (const effect of note.effects) {
      applyEffect(ctx, effect, osc, gain, baseFreq, start, dur, inst);
    }
  }
  
  return nodes;
}

function applyEffect(
  ctx: AudioContext,
  effect: Effect,
  osc: OscillatorNode,
  gain: GainNode,
  baseFreq: number,
  start: number,
  dur: number,
  inst: any
): void {
  switch (effect.type) {
    case 'vib':
      applyVibrato(osc.frequency, baseFreq, effect.params[0], effect.params[1] || 4, start, dur);
      break;
    case 'port':
      const targetFreq = noteToFreq(effect.params[0]);
      applyPortamento(osc.frequency, baseFreq, targetFreq, start, dur, effect.params[1]);
      break;
    case 'vol':
      applyVolumeSlide(gain.gain, gain.gain.value, effect.params[0], start, dur);
      break;
    // ... other effects
  }
}
```

## Example Songs

### Classic Vibrato Lead

```bax
chip gameboy
bpm 140

inst lead type=pulse1 duty=50 env=12,down

pat melody = C5<vib:4> E5<vib:4> G5<vib:4> C6<vib:6>
pat bass = C3 . G2 . E3 . G2 .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bass
```

### Portamento Bass

```bax
inst bass type=pulse2 duty=25 env=14,down

pat slide = C2<port:G2> G2 E2<port:C3> C3
```

### Arpeggio Chords

```bax
inst arp type=pulse1 duty=50

pat chords = C4<arp:047> F4<arp:057> G4<arp:047> C5<arp:047>
```

## Testing Strategy

### Unit Tests

```typescript
// tests/effects.test.ts
describe('Effects Parsing', () => {
  test('parses inline vibrato', () => {
    const token = parseNote('C4<vib:4>');
    expect(token.effects).toEqual([{ type: 'vib', params: [4] }]);
  });
  
  test('parses multiple effects', () => {
    const token = parseNote('C4<vib:4,vol:+2>');
    expect(token.effects).toHaveLength(2);
  });
});

describe('Effect Application', () => {
  test('vibrato modulates frequency', () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator();
    
    applyVibrato(osc.frequency, 440, 4, 4, 0, 1);
    
    // Verify frequency automation was scheduled
    // (mock AudioParam.setValueAtTime)
  });
});
```

### Integration Tests

```typescript
// tests/effects.integration.test.ts
test('song with effects exports correctly', async () => {
  const src = `
    inst lead type=pulse1
    pat melody = C4<vib:4> E4<port:G4>
    channel 1 => inst lead pat melody
  `;
  
  const ast = parse(src);
  const midi = exportMIDI(ast);
  
  // Verify MIDI contains pitch bend events
  expect(midi).toContain('PitchBend');
});
```

## Implementation Checklist

- [ ] Add `Effect` and `NoteToken` types to AST
- [ ] Update parser to recognize `<effect:param>` syntax
- [ ] Implement effect parsing for all core effects
- [ ] Create effect application functions in audio backend
- [ ] Add vibrato implementation
- [ ] Add portamento implementation
- [ ] Add arpeggio implementation
- [ ] Add volume slide implementation
- [ ] Add pitch bend implementation
- [ ] Add tremolo implementation
- [ ] Add note cut implementation
- [ ] Add retrigger implementation
- [ ] Add pattern-level effect modifiers
- [ ] Add named effect presets
- [ ] Map effects to MIDI export
- [ ] Map effects to UGE export (where possible)
- [ ] Write unit tests for effect parsing
- [ ] Write unit tests for effect application
- [ ] Write integration tests
- [ ] Add effects examples to demo songs
- [ ] Document effects in TUTORIAL.md
- [ ] Create effects reference guide

## Performance Considerations

- Multiple effects per note increase AudioParam automation calls
- Arpeggio creates multiple AudioNodes per note (memory)
- Consider effect pooling/reuse for common patterns
- May need to optimize scheduler for high-density effect usage

## Future Enhancements

- **Custom LFO shapes**: Triangle, square, saw for vibrato/tremolo
- **Effect chains**: Pipe effects through each other
- **Effect macros**: Record and replay effect automation
- **Visual effect editor**: GUI for tweaking effect parameters
- **AI-assisted effects**: Suggest effects based on musical context

## Success Metrics

- ✅ All core effects parse correctly
- ✅ Effects sound authentic on Game Boy backend
- ✅ MIDI export preserves effect intent
- ✅ Performance: no glitches with 4 channels + effects
- ✅ Documentation: clear examples for each effect

## See Also

- [pulse-sweep-support.md](./pulse-sweep-support.md) - Hardware sweep effect
- [hot-reload.md](./hot-reload.md) - Live editing with effects
- [TUTORIAL.md](../../TUTORIAL.md) - Usage examples
- [Tracker Effect Commands](https://github.com/milkytracker/MilkyTracker/wiki/Effect-Commands) - Reference
