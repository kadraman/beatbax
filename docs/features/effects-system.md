---
title: Pattern Effects System
status: proposed
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/5"
---

## Summary

Add a comprehensive effects system to BeatBax that enables expressive performance techniques like panning, vibrato, portamento, arpeggio, volume slides, and more. Effects can be applied per-note inline or as pattern-level modifiers.

This document now also includes an explicit mapping plan and exporter guidance for initial implementation of gameboy and hUGETracker (.uge) / hUGEDriver compatibility, plus applicability notes for other common retro sound chips.

## Motivation

- **Expressive sequencing**: Enable musical techniques beyond static notes
- **Tracker heritage**: Effects are fundamental to tracker-style music composition
- **Hardware authenticity**: Many effects map directly to hardware capabilities
- **Competitive feature**: Essential for serious chip music production
- **Creative exploration**: Opens new compositional possibilities

## Current Limitations

- Only static notes with fixed pitch/volume
- No way to apply panning, vibrato, pitch bends, or volume automation

## Core Effects

Summary: the following core effects will be implemented and exposed in the language/runtime (one-line intent per effect):

- Panning (`pan` / `gb:pan`): stereo position (enum or numeric) with GB NR51 mapping where requested.
- Vibrato (`vib`): periodic pitch modulation (depth + rate).
- Portamento / Slide (`port`): smooth pitch glide toward a target note or frequency.
- Arpeggio (`arp`): rapid cycling between pitch offsets to simulate chords.
- Volume Slide (`vol`): per-tick gain changes / slides.
- Pitch Bend (`bend`): arbitrary pitch bends with optional curve shapes.
- Tremolo (`trem`): periodic amplitude modulation (gain LFO).
- Delay / Echo (`echo`): time-delayed feedback repeats (backend or baked).
- Note Cut (`cut`): cut/gate a note after N ticks.
- Retrigger (`retrig`): repeated retriggering of a note at tick intervals.

Only make updates to the default parser (Peggy grammar). Structured parsing is enabled by default; the legacy tokenizer path remains only as a temporary fallback (opt-out via `BEATBAX_PEGGY_EVENTS=0`).

## Effect Combinations

Multiple effects can be applied to a single note:

Stateful/routable controls (keep outside the general `Effect` array):
- Pan/routing (sequence-level `pan()` transform, instrument defaults, channel NR51/MIDI CC #10)
- Channel/sequence gain trims (mixer-style balance), distinct from per-note volume slides
- Mute/solo flags (runtime state)
- Tempo/speed modifiers that affect scheduling (e.g., channel speed multipliers)
- Chip-level mix toggles (e.g., Game Boy NR50/NR51 master terminals)

All other effects in this doc (vib, port, arp, vol slide, bend, trem, cut, retrig, echo) remain per-note/per-pattern effects.

### Inline effect parameter parsing

- Syntax: `effect:arg1,arg2,...` — parameters are comma-separated inside `<>` on a note, or in named `effect` presets.
- Trimming: whitespace around parameters is trimmed before parsing.
- Empty parameters (e.g., `fx:1,,2` or consecutive commas) are ignored — they are filtered out and do not become empty-string params.
- Numeric conversion: parameters that parse as numbers (e.g., `1`, `-0.5`) are converted to numeric values; otherwise they remain strings.
- Special-cases: `pan` supports `enum` (`L|R|C`) and numeric forms; GB-specific namespaced tokens like `gb:pan:L` are supported.
- Rationale: removing empty parameters avoids surprising empty-string values being passed to effect handlers and simplifies downstream effect implementations.

```bax
# Vibrato + volume slide
pat melody = C4<vib:4,vol:+1> E4<vib:6,vol:-1>

# Portamento + tremolo
pat melody_glide = C4<port:G4,trem:8>

# Arpeggio + echo
pat melody_arp = C4<arp:047,echo:4,50>

# Panning (generic + GB-specific)
pat stereo = C5<pan=-1.0>:4 E5<pan=0.0>:4 G5<pan=1.0>:4 C6<gb:pan:L>:4
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
| Panning | Game Boy NR51 terminal bits / software panning | NR51 per-channel terminal flags or StereoPannerNode for software targets |
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
| Panning | Pan/Balance | CC #10 (Pan) |
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
| `pan` | Not a native per-row effect (NR51 per-channel terminal mapping) | Map `gb:pan` or snapped numeric pans to NR51 bits in UGE output; per-note panning requires baking or channel-expansion |
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
  pan?: Pan;           // Optional panning information (enum or numeric)
}

export interface Effect {
  type: 'vib' | 'port' | 'arp' | 'vol' | 'bend' | 'trem' | 'echo' | 'cut' | 'retrig';
  params: (string | number)[];
}

export type Pan = {
  // Discrete enum for hardware-like panning (L, R, C)
  enum?: 'L' | 'R' | 'C';
  // Continuous panning value in range [-1.0, 1.0]
  value?: number;
  // Optional namespace to indicate source (e.g. 'gb' when `gb:pan` used)
  sourceNamespace?: string;
};

export interface InstrumentNode {
  name: string;
  type: string;
  pan?: Pan; // instrument-level default panning
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
  // parseEffects now returns both parsed effects and an optional pan value
  const { effects, pan } = parseEffects(effectsStr);

  const result: NoteToken = { note, effects };
  if (pan) result.pan = pan;

  return result;
}

function parseEffects(str: string): { effects: Effect[]; pan?: Pan } {
  // Split by comma tokens and parse each in a single pass.
  const tokens = str.split(',').map(s => s.trim()).filter(Boolean);
  const effects: Effect[] = [];
  let pan: Pan | undefined;

  for (const tok of tokens) {
    // Detect namespaced pan tokens first: gb:pan:L, pan:L, pan=-0.5
    const panMatch = tok.match(/^(?:(gb):)?pan[:=](-?\d*\.?\d+|L|R|C)$/i);
    if (panMatch) {
      const [, ns, val] = panMatch;
      const up = String(val).toUpperCase();
      if (up === 'L' || up === 'R' || up === 'C') {
        pan = { enum: up as 'L'|'R'|'C', sourceNamespace: ns || undefined };
      } else {
        const num = Number(val);
        if (!Number.isNaN(num)) {
          pan = { value: num, sourceNamespace: ns || undefined };
        }
      }
      // don't push pan into effects array
      continue;
    }

    // Otherwise parse as a normal effect token
    effects.push(parseEffect(tok));
  }

  return { effects, pan };
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

- Panning (`pan` / `gb:pan`)
  - hUGETracker mapping: Not a native per-row effect in hUGETracker. For Game Boy-targeted UGE exports, panning is represented by the NR51 terminal/left-right selection (per-channel) rather than a tracker effect opcode.
  - Export strategy: When `gb:pan` (enum) is present, map `L`/`R`/`C` to NR51 bits and emit those as channel terminal flags in the UGE output (or as channel-level metadata if the UGE container stores terminal bits). When only generic `pan` numeric values are used, deterministically snap to enum (e.g. pan < -0.33 → L, pan > 0.33 → R, otherwise C) and emit a warning about loss of precision.
  - UGE writer implementation notes: the exporter emits NR51 changes into the tracker pattern data as a single `8xx` Set-Panning effect written on Channel 1 when the computed NR51 mix changes and a note onset occurs (or on the initial row). To reduce redundant edits, the writer tracks the last emitted NR51 state and suppresses re-writes on sustain/rest rows.
  - Note: the exporter no longer appends an `[NR51=0x..]` debug comment to the UGE file; if you need round-trip metadata include it externally in your build tooling or use JSON export.
  - Per-note panning: If a BeatBax song specifies per-note panning but the UGE format/export target only supports per-channel terminal routing, exporter options are:
    - Expand/route notes to alternate channels with different NR51 settings (channel-expensive), or
    - Bake panning into the rendered instrument/sample (recommended for strict stereo results), or
    - Snap to the channel's current NR51 setting and warn the user.
  - Fallbacks & strict mode: Provide a `--strict-gb` or similar flag to treat non-enum numeric pans as errors rather than silently snapping. Document and warn for any precision loss or unsupported per-note semantics.
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

 - pan(enum,numeric) → NR51 terminal bits (L/R/C) — numeric values snap deterministically to enum (pan < -0.33 → L, pan > 0.33 → R, otherwise C); emit warning on precision loss or provide `--strict-gb` to treat as error
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

```typescript
// High-level exporter sketch: convert BeatBax ISM -> target formats (UGE, MIDI)
function exportSong(song: ISong, opts: ExportOptions) {
  // Resolve per-note pan (inline override -> instrument default -> channel default)
  for (const ch of song.channels) {
    for (const ev of ch.events) {
      if (ev.type === 'note') ev.pan = resolvePan(ev, ch.instrument);
    }
  }

  if (opts.format === 'uge') return exportToUGE(song, opts as UGEOptions);
  if (opts.format === 'midi') return exportToMIDI(song, opts as MIDIOptions);
  return JSON.stringify(song, null, 2);
}

function resolvePan(noteEvent: NoteEvent, inst?: InstrumentNode): Pan | undefined {
  if (noteEvent.pan) return noteEvent.pan;
  if (inst?.pan) return inst.pan;
  return undefined;
}

// UGE export path (Game Boy-focused mapping)
function exportToUGE(song: ISong, opts: UGEOptions) {
  const uge = new UGEWriter();

  for (const ch of song.channels) {
    const channelMeta = { nr51: 0b11 }; // default both
    for (const ev of ch.events) {
      if (ev.type !== 'note') { uge.writeEvent(ch.index, ev); continue; }

      const pan = ev.pan;
      if (pan) {
        if (pan.enum) {
          channelMeta.nr51 = mapPanEnumToNR51(pan.enum);
        } else if (typeof pan.value === 'number') {
          if (opts.strictGb) throw new Error('numeric pan not allowed in strict GB export');
          const snapped = snapToGB(pan.value);
          uge.warn(`snapping pan ${pan.value} -> ${snapped}`);
          channelMeta.nr51 = mapPanEnumToNR51(snapped);
        }
      }

      const ugeEffects = (ev.effects || []).map(e => effectToUGEOpcodes(e, ev, opts)).filter(Boolean);
      uge.writeNote(ch.index, ev.note, ugeEffects as any);
    }
    uge.setChannelTerminalFlags(ch.index, channelMeta.nr51);
  }

  return uge.finish();
}

function mapPanEnumToNR51(p: 'L'|'R'|'C') {
  switch (p) {
    case 'L': return 0b10; // left only (channel mask bits will be applied per-channel)
    case 'R': return 0b01; // right only
    case 'C': return 0b11; // both
  }
}

function snapToGB(value: number): 'L'|'C'|'R' {
  if (value < -0.33) return 'L';
  if (value > 0.33) return 'R';
  return 'C';
}

// MIDI export path
function exportToMIDI(song: ISong, opts: MIDIOptions) {
  const midi = new MidiWriter();
  for (const ch of song.channels) {
    const track = midi.addTrack();
    for (const ev of ch.events) {
      if (ev.type !== 'note') continue;
      track.addNote(ev.note, ev.ticks);

      if (ev.pan) {
        const panVal = ev.pan.enum ? enumToPanValue(ev.pan.enum) : Math.round(((ev.pan.value ?? 0) + 1) * 63.5);
        track.addController(10, panVal, ev.ticks);
      }

      for (const fx of ev.effects || []) {
        const midiOps = effectToMIDIEvents(fx);
        midiOps.forEach(o => track.addEvent(o, ev.ticks));
      }
    }
  }
  return midi.build();
}

function enumToPanValue(e: 'L'|'C'|'R') {
  if (e === 'L') return 0;
  if (e === 'C') return 64;
  return 127;
}

function effectToUGEOpcodes(effect: Effect, ev: NoteEvent, opts: UGEOptions) {
  switch (effect.type) {
    case 'vib':
      // Map depth/speed -> 4xy after quantization
      return ugeVibrato(effect.params);
    case 'port':
      // Tone portamento -> 3xx (or 1xx/2xx for relative)
      return ugePortamento(effect.params);
    case 'arp':
      // Arpeggio -> 0xy (or expand into rapid notes if >2 offsets)
      return ugeArpeggio(effect.params);
    case 'vol':
      // Volume slide -> tracker volume slide opcode
      return ugeVolumeSlide(effect.params);
    case 'bend':
      // Pitch bend -> approximate with portamento/vibrato or bake
      return ugeBendApprox(effect.params);
    case 'trem':
      // Tremolo -> map to tremolo opcode if available, else emulate
      return ugeTremolo(effect.params);
    case 'cut':
      // Note cut -> ECx or UGE-specific cut effect
      return ugeNoteCut(effect.params);
    case 'retrig':
      // Retrigger -> tracker retrig opcode or explicit repeated notes
      return ugeRetrig(effect.params);
    case 'echo':
      // Echo must be baked or emulated with extra channels; signal fallback
      return null;
    default:
      return null;
  }
}

function effectToMIDIEvents(effect: Effect) {
  switch (effect.type) {
    case 'vib':
      // Vibrato -> modulation CC + optional pitchbend LFO approximation
      return [{ type: 'cc', cc: 1, value: effect.params[1] || 64 }];
    case 'port':
      // Portamento -> pitch-bend events and portamento CC where supported
      return [{ type: 'pitchbend', value: portParamsToBend(effect.params) }];
    case 'arp':
      // Arpeggio -> expanded note events (handled earlier) — no single MIDI opcode
      return [];
    case 'vol':
      // Volume slide -> CC7 (volume) updates across ticks
      return [{ type: 'cc', cc: 7, value: effect.params[0] }];
    case 'bend':
      // Bend -> pitchbend events (curve approximated by stepped bends)
      return [{ type: 'pitchbend', value: bendParamsToPitch(effect.params) }];
    case 'trem':
      // Tremolo -> CC11 (expression) or modulation CC depending on mapping
      return [{ type: 'cc', cc: 11, value: effect.params[0] || 64 }];
    case 'cut':
      // Cut -> timed Note Off events
      return [{ type: 'noteoff', delayTicks: effect.params[0] }];
    case 'retrig':
      // Retrig -> expanded repeated Note On/Off events
      return [];
    case 'echo':
      // Echo -> no MIDI mapping (must be baked into audio)
      return [];
    default:
      return [];
  }
}
```

## Testing strategy (Exporter-focused)

Goals: verify exporter mappings, deterministic snapping/warnings for `pan`, and fallbacks (bake/channel-expansion) across targets.

1) Unit tests (fast, deterministic)
  - Parser: assert `parseEffects` returns `{ effects, pan }` for examples (`pan:L`, `gb:pan:R`, `pan=-0.5`).
  - AST: validate `NoteToken.pan` and `InstrumentNode.pan` shapes and `sourceNamespace` propagation.
  - Snap logic: test `snapToGB()` produces L/C/R for boundary values (e.g. -0.34, -0.33, 0.33, 0.34) and that `--strict-gb` triggers an error path.
  - Effect mapping quantization: ensure `vib` -> 4xy quantizes depth/speed into 0..15 range for UGE.
  - Portamento mapping: test `port(target,speed)` -> computed `xx` rates make the port reach the target in expected tick counts.
  - Arpeggio mapping: verify `arp` with 2 offsets -> `0xy` mapping; 3+ offsets -> exported expansion.
  - Volume slide mapping: verify `vol` delta/tick -> tracker slide units and MIDI CC7 deltas.
  - Bend mapping: ensure `bend` produces pitchbend approximations within acceptable error for short bends.
  - Tremolo mapping: verify `trem` falls back to volume slides or trem opcode and records a bake warning when unsupported.
  - Cut / Retrig: test `cut` emits correct UGE cut opcode and `retrig` expands to repeated notes when needed.

2) Exporter tests (integration-like, mocked outputs)
  - UGE writer: export an example song (e.g. `songs/panning_demo.bax`) and assert per-channel NR51 bits appear where expected, and numeric pans produce logged warnings when snapped.
  - MIDI writer: export a short sequence with `pan` and assert CC#10 events exist with expected values (-1→0..127 mapping).
  - Regression: ensure existing effect mappings (vib, port, arp, vol, etc.) remain unchanged by pan changes.

3) End-to-end (smoke) tests
  - Run full parse → resolve → export(UGE/MIDI/JSON) for sample songs; programmatically inspect outputs (UGE binary fields, MIDI track CCs) and fail CI on mismatches.

4) Manual / Visual checks
  - Provide short example songs and a small `tools/` runner script to export and open resulting MIDI/UGE in standard tools for QA.
  - Example QA script: `tools/validate-pan-example.cjs` — exports `songs/panning_demo.bax` to JSON/UGE/WAV and prints a summary of NR51/pan decisions and any snapping warnings.

Notes: prefer Jest for unit/integration tests (existing repo uses Jest). Add test fixtures for edge cases (per-note pan on GB targets, multiple conflicting pan sources: instrument vs inline).

## Stereo Panning (`pan`) Additional Implementation Details

### Proposed Syntax

#### Inline Panning (generic)

```bax
# Enum form (discrete): note-level
pat A = C4<pan:L> E4<pan:R> G4<pan:C>

# Numeric form (continuous): -1 left, 0 center, +1 right
pat B = C4<pan=-1.0> E4<pan=0.0> G4<pan=1.0>
```

#### Inline Game Boy-specific

```bax
# Force Game Boy NR51 semantics for this token
pat A = C4<gb:pan:L> D4<gb:pan:R>
```

#### Instrument Default

```bax
# Generic instrument default
inst lead type=pulse1 pan=L

# Numeric instrument default for software targets
inst pad type=wave pan=0.25

# Game Boy specific default (maps exactly to NR51 bits)
inst lead type=pulse1 gb:pan=L
```

Notes on syntax:
- Accept both inline token-style (e.g. `<pan:L>` or `<pan=-0.5>`) and parameter-style for instrument declarations (e.g. `pan=L` or `pan=0.5`).
- The namespace prefix `gb:` applies the explicit Game Boy mapping semantics; if omitted, `pan` is treated generically and backends decide how to map it.

### Hardware Mapping (Game Boy)

The Game Boy `NR51` register provides per-channel left/right toggles. For the GB exporter, enum values map exactly to bits:

| Bax Pan | NR51 Left Bit | NR51 Right Bit | Result |
|---------|---------------|----------------|--------|
| `L`     | 1             | 0              | Left Only |
| `R`     | 0             | 1              | Right Only |
| `C`     | 1             | 1              | Center (Both) |

Numeric-to-GB mapping guidance for exporters:
- If `gb:pan` is used with a numeric value, exporters SHOULD either reject it (error) or snap deterministically to the nearest enum (recommended snap thresholds e.g. pan < -0.33 -> L, pan > 0.33 -> R, otherwise C). Use a warning or a strict-export flag to control rejection vs snapping.
- If generic `pan` is numeric and the GB exporter receives it, snap with deterministic thresholds and emit a warning about loss of precision.

### Backends and semantics

- WebAudio/Browser: Prefer continuous numeric pan using StereoPannerNode where supported. Accept enum forms and map `L` -> -1, `C` -> 0, `R` -> +1.
- Game Boy (UGE exporter): Honor `gb:pan` exactly (map to NR51 bits). For generic `pan` values, map enum forms exactly; map numeric by snapping (document and warn). Provide an option (e.g. `--strict-gb`) to fail on non-enum numeric pans when strict hardware accuracy is required.
- Other chip exporters: Map `pan` to their native primitives or provide a best-effort mapping. If a target cannot represent panning, exporter should ignore with a warning or implement a software stereo post-process.

### Examples

1) Generic pan used across targets:
```bax
inst lead type=pulse1 pan=L
pat A = C4<pan:L> E4<pan:-0.5> G4<pan=0.5>
```

2) Force Game Boy hardware NR51 semantics:
```bax
inst lead type=pulse1 gb:pan=L
pat A = C4<gb:pan:C> D4<gb:pan:R>
```

## Implementation Checklist

- [ ] Add `Effect` and `NoteToken` types to AST
- [x] Update parser to recognize `<effect:param>` syntax (Peggy default parser)
- [ ] Implement effect parsing for all core effects
- [ ] Create effect application functions in audio backend
- [x] Add panning implementation
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

## Implementation Plan — Phased rollout

This section describes a practical, incremental implementation approach. Implementers should complete each phase end-to-end (parser → resolver → playback → export → tests) before moving to the next phase. Keep changes minimal and add unit tests for each slice.

Phase 1 — Effect infrastructure + Panning (priority)
- Current status: parser inline effect syntax is live in the default Peggy path; panning is wired through resolver, playback, and exports (GB NR51 + MIDI CC #10). Remaining work focuses on richer effect parsing/application beyond pan.
- Add core effect infrastructure:
  - AST: `Effect` union, per-note `pan?: Pan` (already specified in AST section).
  - Parser: update `src/parser/parser.ts` to route effect tokens into `parseEffects()` and surface `pan` separately (see examples above).
  - Song resolver: propagate `NoteToken.pan` into resolved ISM events in `src/song/resolver.ts`.
  - Playback: implement panning in `src/audio/playback.ts`:
    - Browser: wire a `StereoPannerNode` (or GainNode pair fallback) and map numeric [-1..1] to panner value.
    - Engine/Node: provide a `pan` field in `createBaseNodes()` return value and ensure `scheduleNote()` connects panner between source/gain and destination.
  - Exporters:
    - UGE: implement `snapToGB()` helper and map enum/numeric pans to NR51 bits in `packages/engine/src/export/ugeWriter.ts`.
    - MIDI: emit CC #10 events in `packages/engine/src/export/midiExport.ts` using `enumToPanValue()` mapping.
  - Tests: add Jest units under `packages/engine/tests/`:
    - `parser.effects.test.ts` (assert `parseEffects` returns `{ effects, pan }`).
    - `snap.test.ts` (verify `snapToGB()` thresholds and `--strict-gb` behavior).

Phase 2 onwards — Add one effect at a time (vib, port, arp, vol, bend, trem, cut, retrig, echo)
- For each effect follow these steps:
  1. Parser + AST: add token parsing in `parseEffects()` and update `Effect` types.
  2. Resolver: ensure any pattern-level presets are resolved into per-note `effects` arrays.
  3. Playback: implement `applyEffect()` handlers in `src/audio/playback.ts` with fallbacks (AudioParam automation, node LFOs, or baked rendering).
  4. Exporter: add mapping to `packages/engine/src/export/*` for UGE and MIDI:
     - UGE: compute opcode parameters (quantize to tracker ranges, re-insert per-row as needed).
     - MIDI: map to CCs/pitchbend/note expansions as documented above.
  5. Tests: unit tests for parser, mapping quantization tests (UGE numeric ranges), and integration test exporting demo song.

Recommended Game Boy-first implementation order (highest applicability/coverage first):
1) Vibrato (`vib`) — maps to GB-friendly pitch mod (export via 4xy), core tracker effect.
2) Portamento (`port`) — tone slide/glide (3xx/1xx/2xx), common in GB tunes.
3) Arpeggio (`arp`) — classic tracker chord simulation (0xy); expand longer arps as needed.
4) Volume Slide (`vol`) — row/tick volume deltas; maps to UGE volume slide.
5) Tremolo (`trem`) — amplitude LFO; software gain automation.
6) Pitch Bend (`bend`) — higher-res glide; approximate with portamento sequences.
7) Note Cut (`cut`) — gate after N ticks; aligns with GB length/gating semantics.
8) Retrigger (`retrig`) — rapid re-hits within a row; software-only on GB.
9) Echo/Delay (`echo`) — bake or channel-expensive; add last with clear fallbacks.

Example phase-specific notes:
- Vibrato (`vib`) — quantize depth/speed to 0..15 for UGE `4xy`. Add `ugeVibrato()` helper that returns u8 opcodes.
- Portamento (`port`) — implement `computePortRate()` helper to convert semitone delta + tick-duration → tracker `xx` value.
- Arpeggio (`arp`) — support both `0xy` mapping and expansion path for >2 offsets; add pattern-expansion tests.

Developer workflow / quick commands
- Run parser tests only:
```bash
npm -w test -- packages/engine --testPathPattern parser.effects.test.ts
```
- Run full exporter integration for a fixture:
```bash
npm -w node ./bin/beatbax --export uge songs/effect_demo.bax tmp/out.uge
```

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
