---
title: Pattern Effects System
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/5"
---

## Summary

Add a comprehensive effects system to BeatBax that enables expressive performance techniques like vibrato, portamento, arpeggio, volume slides, and more. Effects can be applied per-note inline or as pattern-level modifiers. This document now also includes an explicit mapping plan and exporter guidance for hUGETracker (.uge) / hUGEDriver compatibility, plus applicability notes for other common retro sound chips.

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

(Definitions and implementation sketches retained — vibrato, portamento, arpeggio, volume slide, pitch bend, tremolo, delay/echo, note cut, retrigger)

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

hUGETracker supports limited effects per row. Map BeatBax effects to UGE effect columns where possible:

| BeatBax | UGE Effect | Notes |
|---------|------------|-------|
| `vib` | Not supported natively (use vibrato 4xy if available) | Approximate with pitch automation or tracker vibrato |
| `port` | Tone portamento (3xx) / slide (1xx/2xx) | Map to tone portamento for target slides |
| `arp` | Arpeggio (0xy) | Direct mapping for up to 2 offsets; expand for more |
| `vol` | Volume slide (effect column) | Set volume per row or per tick |
| `cut` | Note cut (ECx or UGE-specific) | Cut after x ticks |
| `retrig` | Retrigger / note delay (EDx/7xx) | Partial support; expand if needed |

## Applicability to Other Sound Chips

Different retro sound chips have varying native support for effects. Below is a practical guide for how BeatBax effects map to several common chips (SID, MSX/AY, NES APU, SN76489 / Master System, YM2612 / Genesis). For each chip we state whether an effect is: "Native" (chip has dedicated LFO/command or effect), "Approx" (can be approximated reliably by rapid register updates or pattern expansion), or "Bake" (must be rendered into the sample / instrument or emulated using extra channels). Implementation notes follow to help exporter decisions.

Notes on terminology:
- "Register modulation" or "software LFO" means the effect can be produced by changing pitch/volume registers programmatically at audio rate (or per-frame), not necessarily via a built-in LFO.
- "Channels" indicates how many hardware voices are available; heavy emulation (e.g., echo via extra channels) may be impractical for limited-voice chips.

### Commodore 64 — SID (MOS 6581 / 8580)
- Vibrato: Native — SID has oscillator pitch modulation via external LFO/envelope control; vibrato can be achieved with hardware LFO or rapid frequency writes.
- Portamento: Native/Approx — common to implement via portamento routines or rapid frequency ramps.
- Arpeggio: Approx — typically implemented by rapid pitch changes (note-sequencing); supported in trackers.
- Volume Slide / Tremolo: Native/Approx — SID supports filter/envelope manipulation and LFOs, so tremolo can be done with hardware routing or software volume writes.
- Echo/Delay: Bake — SID has no internal delay buffer; common approach is to use external reverb chips or render to sample.
- Note Cut / Retrigger: Native/Approx — gating and re-triggering are straightforward by manipulating gate flag and envelope.

Recommendation: Exporter can map most pitch/volume LFOs and slides directly or by register automation. For echoes and complex multi-effect combinations, bake into samples.

### MSX (AY-3-8910 / YM2149 family commonly found in MSX)
- Vibrato: Approx — AY/2149 lacks LFO but you can modulate period registers rapidly to approximate vibrato.
- Portamento: Approx — achievable by stepping frequency registers over time.
- Arpeggio: Approx — expand into rapid pitch steps.
- Volume Slide / Tremolo: Limited/Approx — limited per-channel amplitude resolution and envelope support; often approximated by quick volume changes.
- Echo: Bake/Channel-Expensive — no built-in delay; emulate by duplicating notes into spare channels or bake.
- Note Cut / Retrigger: Native/Approx — gate control and software retrigger works.

Recommendation: Prefer pattern expansion and register automation. Warn on effects that need many rapid updates (may be limited by CPU/timing).

### NES APU (Ricoh 2A03 / 2A07)
- Vibrato: Approx — APU lacks dedicated LFO; approximate by rapid pitch register writes (limited resolution on triangle/pulse).
- Portamento: Approx — achievable via stepped pitch changes.
- Arpeggio: Native/Approx — classic NES chiptunes use arpeggio via rapid pitch changes.
- Volume Slide / Tremolo: Limited/Approx — volume is controlled per-frame; fast tremolo can be simulated but is CPU-limited.
- Echo/Delay: Bake/Channel-Expensive — no internal delay; can use extra channels (DPCM or channel hacking) but usually baked.
- Note Cut / Retrigger: Native/Approx — gate/restart behavior supported.

Recommendation: Translate effects into rapid register updates or expand into pattern subdivisions. For echo and complex polyphonic emulation, bake or consume extra channels.

### Sega Master System / Game Gear (SN76489)
- Vibrato: Approx — no LFO; do pitch modulation via frequency register updates; coarse frequency resolution makes fine vibrato difficult.
- Portamento: Approx — possible but coarse.
- Arpeggio: Approx — expand into pitch steps.
- Volume Slide / Tremolo: Limited — 4-bit attenuation per channel; tremolo can be faked with short volume steps.
- Echo: Bake — no delay buffer.
- Note Cut / Retrigger: Native/Approx — can gate or retrigger by restarting tone generators.

Recommendation: Expect lower fidelity for pitch-based LFOs; use cautious quantization and consider baking when precision is required.

### Yamaha YM2612 (Genesis/Mega Drive FM)
- Vibrato: Native/Excellent — FM operators support pitch modulation and LFOs; vibrato maps well.
- Portamento: Native/Approx — achievable via pitch bend registers or LFO-controlled pitch.
- Arpeggio: Native/Approx — can be done with pitch modulation or rapid note sequencing.
- Volume Slide / Tremolo: Native/Excellent — FM channels support amplitude modulation (tremolo) and envelopes.
- Echo/Delay: External/Bake — Genesis provides PCM/PCM-based effects on some hardware setups and can route through additional DSP; often handled off-chip or by rendering.
- Note Cut / Retrigger: Native — operator envelopes and key on/off allow precise cuts and retriggers.

Recommendation: YM2612 is one of the more expressive chips in this list; map BeatBax LFOs to YM LFO/envelope features where possible and avoid baking unless you need specific multi-tap echo.

### General guidance for cross-chip export
- Native mapping where the chip exposes LFOs, envelopes, or slide commands is preferred.
- Approximation via register automation (rapid period/volume writes) is usually possible but depends on CPU/timing constraints and voice resolution.
- Baking to samples/instruments is the universal fallback when an effect cannot be faithfully reproduced on target hardware (echo, complex curves, overlapping automations across limited effect columns).
- Always warn the user where fidelity will be lost and provide options: bake into sample, approximate (with quantization), or omit with warning.

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

## hUGETracker Exportability Summary

Short answer: Not all BeatBax effects can be exported natively to hUGETracker. Some map directly, some can be approximated by tracker effects/pattern expansion, and a few (notably echo/delay and complex LFO curves) must be baked into samples or emulated using extra channels.

This section provides a precise mapping plan to hUGETracker effect opcodes (based on hUGETracker's effect reference), exporter pseudocode, and a conversion strategy with fallbacks.

### Important notes about hUGETracker

- hUGETracker uses ProTracker/FastTracker-like effect codes. Effects are active on the row they're on and must be re-entered on subsequent rows to persist.
- Relevant hUGETracker manual section: Effect reference (see hUGETracker manual for full details). Key opcodes used in mappings below include: `0xy` (Arpeggio), `1xx` (Portamento up), `2xx` (Portamento down), `3xx` (Tone portamento), `4xy` (Vibrato), `7xx` (Note delay), plus volume and retrigger-ish effects depending on UGE extension.

Reference: hUGETracker effect reference: https://github.com/SuperDisk/hUGETracker/blob/master/manual/src/hUGETracker/effect-reference.md (exporter implementers should fetch the latest manual when implementing.)

### Per-effect mapping (BeatBax → hUGETracker)

- Vibrato (`vib`)
  - hUGETracker mapping: 4xy (Vibrato) — 4x = speed, 4y = depth/offset units (tracker units must be scaled).
  - Export strategy: Map BeatBax speed → x (0..15), depth → y (0..15) after scaling/quantization. Re-insert effect on each row as needed.
  - Fallback: If BeatBax uses custom LFO shapes or higher resolution, bake into sample or approximate with rapid pitch changes.

- Portamento (`port`)
  - hUGETracker mapping: Prefer `3xx` (tone portamento) to slide toward the target note using per-tick rate xx. Use `1xx`/`2xx` (slide up/down) for relative slide steps if needed.
  - Export strategy: Convert target note to pitch delta units used by hUGETracker and compute xx per-tick to reach target in the desired time. If the BeatBax port uses curves, approximate by stepping xx values across rows or bake when precise curve is required.

- Arpeggio (`arp`)
  - hUGETracker mapping: `0xy` (Arpeggio). The tracker cycles between base note, +x, +y semitones. hUGETracker supports 2 offsets; longer arpeggios must be expanded.
  - Export strategy: For 3-step arps encoded as 047, map digits to x/y (take first two non-zero intervals into x/y). For 3+ note arps, expand into rapid note subdivisions (pattern-level expansion) or use multiple channels if available.

- Volume Slide (`vol`)
  - hUGETracker mapping: Volume slide effect (`Dxy` or tracker-specific Jxy-like opcodes; hUGETracker supports volume slide per tick — check manual for exact code used in UGE v6 pattern fields).
  - Export strategy: Translate BeatBax delta per tick into the tracker's per-tick volume slide units. If simultaneous master volume changes are needed, may also emit `5xx` when appropriate.

- Pitch Bend (`bend`)
  - hUGETracker mapping: No direct high-resolution pitch-bend opcode; approximate using tone portamento (`3xx`) or vibrato (`4xy`) combinations.
  - Export strategy: Convert target semitones into per-tick slide amounts, insert a sequence of tone portamento commands, or expand into micro-steps across ticks/rows. For curve shapes (`exp`), approximate with piecewise-linear step sequences or bake into samples.

- Tremolo (`trem`)
  - hUGETracker mapping: Some trackers include tremolo; if present map accordingly. If hUGETracker lacks tremolo, approximate via fast volume slides or bake.
  - Export strategy: If hUGETracker supports a tremolo effect code, map depth/speed to parameters; otherwise emulate with short repeated volume slide steps within a row/tick or bake.

- Delay / Echo (`echo`)
  - hUGETracker mapping: Not natively supported as a per-voice effect. Echo requires routing and feedback not available as a simple effect code.
  - Export strategy (recommended): Bake delay/echo into the instrument sample (rendered waveform) OR emulate by duplicating notes across spare channels at reduced volume with delay offsets (very limited and channel-expensive). Exporter should warn when `echo` is used and offer the bake option.

- Note Cut (`cut`)
  - hUGETracker mapping: Note cut/cut after N ticks is supported by tracker commands (e.g., `ECx` style or UGE-specific cut effect). Use the UGE note cut effect code (see UGE v6 spec / manual).
  - Export strategy: Map BeatBax ticks to tracker's tick/row model and emit cut effect with quantized tick count.

- Retrigger (`retrig`)
  - hUGETracker mapping: Many trackers have a retrigger effect (e.g., `Qxy` in some formats). hUGETracker supports note delay (7xx) and may support retrigger-like effects; otherwise expand into explicit repeated notes or use per-row commands.
  - Export strategy: Translate retrigger interval into repeated note-on commands at the specified tick interval or use retrigger opcode if present. Volume delta per retrig must be quantized to the tracker's volume resolution.

### Mapping table (concise)

- vib(depth,speed) → 4xy (x=speed, y=depth) — quantize to 0..15
- port(target,speed) → 3xx (tone portamento) or 1xx/2xx for relative slides — compute xx from semitone delta and tick duration
- arp(intervals) → 0xy for 2-3 intervals (x & y are semitone offsets) or expand into rapid notes
- vol(delta) → volume slide opcode (tracker-specific) — convert delta/tick → slide units
- bend(semitones,curve) → approximate with 3xx ramps (piecewise) or bake
- trem(depth,speed) → tremolo opcode if present else fast volume slides / bake
- echo(time,fb) → not native — bake into sample or emulate with extra channels
- cut(ticks) → tracker note cut opcode (UGE mapping)
- retrig(ticks,volDelta) → retrigger opcode if present or expand into repeated notes

### Exporter pseudocode (TypeScript sketch)

(kept identical to prior pseudocode block; omitted here for brevity in diff)

## Testing strategy (Exporter-focused)

(kept as before)

## Implementation Checklist (update)

- [x] Add `Effect` and `NoteToken` types to AST
- [x] Update parser to recognize `<effect:param>` syntax
- [x] Implement effect parsing for all core effects
- [x] Create effect application functions in audio backend
- [x] Add vibrato implementation
- [x] Add portamento implementation
- [x] Add arpeggio implementation
- [x] Add volume slide implementation
- [x] Add pitch bend implementation
- [x] Add tremolo implementation
- [x] Add note cut implementation
- [x] Add retrigger implementation
- [ ] Add pattern-level effect modifiers
- [ ] Add named effect presets
- [ ] Map effects to MIDI export
- [x] Map effects to UGE export (where possible)
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
