---
title: Pattern Effects System
status: partially-implemented
authors: ["kadraman"]
created: 2025-12-12
updated: 2026-02-01
issue: "https://github.com/kadraman/beatbax/issues/5"
---

## Summary

BeatBax features a comprehensive effects system enabling expressive performance techniques like panning, vibrato, portamento, arpeggio, volume slides, and more. Effects can be applied per-note inline or as pattern-level modifiers.

**Current Implementation (v0.1.0+):** Nine core effects are fully implemented with WebAudio playback, PCM rendering, and export support:
- ✅ **Panning** - Stereo positioning with Game Boy NR51 terminal mapping
- ✅ **Vibrato** - Pitch modulation with customizable depth, rate, and waveforms
- ✅ **Portamento** - Smooth pitch glides between notes
- ✅ **Arpeggio** - Rapid note cycling for chord simulation
- ✅ **Volume Slide** - Dynamic volume automation over time
- ✅ **Tremolo** - Amplitude modulation with configurable depth, rate, and waveforms
- ✅ **Note Cut** - Gate notes after N ticks for staccato/percussive effects
- ✅ **Retrigger** - Rhythmic note retriggering with optional volume fadeout
- ✅ **Pitch Bend** - Smooth pitch bends with curve shaping (linear, exp, log, sine)
- ✅ **Pitch Sweep** - Hardware-accurate Game Boy NR10 frequency sweep (Pulse 1 only)
- ✅ **Echo/Delay** - Time-delayed feedback repeats for ambient and rhythmic effects

This document includes explicit mapping plans for Game Boy/hUGETracker (.uge) / hUGEDriver compatibility, plus applicability notes for other retro sound chips.

## Motivation

- **Expressive sequencing**: Enable musical techniques beyond static notes
- **Tracker heritage**: Effects are fundamental to tracker-style music composition
- **Hardware authenticity**: Many effects map directly to hardware capabilities
- **Competitive feature**: Essential for serious chip music production
- **Creative exploration**: Opens new compositional possibilities

## Implementation Status

**Implemented (v0.1.0+):**
- ✅ Panning (stereo position, GB NR51, MIDI CC #10)
- ✅ Vibrato (pitch modulation with depth/rate/waveform)
- ✅ Portamento (smooth pitch glide)
- ✅ Arpeggio (chord simulation via rapid note cycling)
- ✅ Volume Slide (per-tick gain automation)
- ✅ Tremolo (amplitude modulation with depth/rate/waveform)
- ✅ Note Cut (gate notes after N ticks)
- ✅ Retrigger (rhythmic note retriggering with volume fadeout)
- ✅ Pitch Bend (smooth pitch bends with curve shaping)
- ✅ Pitch Sweep (hardware-accurate GB NR10 frequency sweep)
- ✅ Echo/Delay (time-delayed feedback repeats with WebAudio DelayNode)
- ✅ Named effect presets with expansion
- ✅ UGE export for pan, vib, port, bend, arp, volSlide, cut, sweep (trem: meta-event only, retrig/echo: not supported with warnings)
- ✅ MIDI export for all implemented effects

**Remaining Limitations:**
- Tremolo exports to MIDI as meta-event (no native UGE support)
- Echo/Delay: Only works in WebAudio playback; UGE export displays warning and omits effect
- Retrigger: Only works in WebAudio playback; UGE export displays warning and omits effect
- **CLI playback warnings**: Both retrigger and echo display warnings when played with CLI/PCM renderer (effects ignored)
- Volume slide disables instrument envelopes (architectural limitation - needs separate gain stage)
- **Pitch Bend** UGE export uses approximation with tone portamento (3xx) - complex curves may lose fidelity

## Core Effects

Summary: the following core effects are available in the language/runtime:

**✅ Implemented (v0.1.0+):**
- Panning (`pan` / `gb:pan`): stereo position (enum or numeric) with GB NR51 mapping where requested.
- Vibrato (`vib`): periodic pitch modulation (depth + rate).
- Portamento / Slide (`port`): smooth pitch glide toward a target note or frequency.
- Arpeggio (`arp`): rapid cycling between pitch offsets to simulate chords.
- Volume Slide (`volSlide`): per-tick gain changes / slides.
- Tremolo (`trem`): periodic amplitude modulation (gain LFO with depth, rate, and waveform).
- Note Cut (`cut`): cut/gate a note after N ticks.
- Retrigger (`retrig`): repeated retriggering of a note at tick intervals with optional volume fadeout.
- Pitch Bend (`bend`): arbitrary pitch bends with optional curve shapes (linear, exp, log, sine).
- Pitch Sweep (`sweep`): hardware-accurate Game Boy NR10 frequency sweep (Pulse 1 channel only).
- Echo/Delay (`echo`): time-delayed feedback repeats using WebAudio DelayNode.

Only make updates to the default parser (Peggy grammar). Structured parsing is enabled by default; the legacy tokenizer path has been removed after the Peggy migration.

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
pat melody = C4<vib:4,volSlide:+1> E4<vib:6,volSlide:-1>

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

# Apply to notes (inline preset expansion is supported)
pat melody = C4<wobble> E4<riser> G4<stutter>

# Or as pattern modifiers (apply preset to every note in a pattern)
pat melody_wobble = melody:wobble
```

### Preset format and precedence

- Definition: `effect <name> = <rhs>` where `<rhs>` is one or more effect tokens separated by whitespace. Each token follows the inline effect syntax (e.g. `vib:8,4`, `volSlide:+1`, `gb:pan:L`). The parser currently stores the preset RHS on the AST (as a raw RHS string) and the resolver expands presets where needed.
- Application: applying a preset via `pat:name` or `pattern:name` appends the preset's effects to each note in the referenced pattern as if they were inline effects (e.g. `C4<wobble>` → `C4<vib:8,4>`). Inline usage `C4<wobble>` is also supported — the resolver expands inline preset names into the preset's RHS during resolution.
- Precedence rule (implemented): inline effects explicitly written on a note take precedence over preset effects of the same type. When a preset is applied and a note already contains an inline effect of the same `type`, the inline effect is kept and the preset's effect of that `type` is skipped. Other preset effects are appended in their original order.
- Examples:

```bax
# preset provides a vib
effect wobble = vib:8,4

# inline vib wins; preset vib is not duplicated
pat a = C4<vib:3>
seq s = a:wobble

# preset effects apply when inline absent
pat b = C4
seq t = b:wobble
```

- Parameterized presets (e.g. `wobble(6)`) are not currently supported. If you need parameterization, request it and the grammar/resolver can be extended.

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
| Note Cut | Length counter | ✅ GainNode ramp to zero (oscillator continues) |
| Retrigger | Software | Create multiple AudioNodes |

### MIDI Export

| Effect | MIDI Equivalent | CC / Event |
|--------|-----------------|------------|
| Panning | Pan/Balance | CC #10 (Pan) |
| Vibrato | Modulation | Text Meta Event |
| Portamento | Portamento | Text Meta Event |
| Arpeggio | Note sequence | Multiple Note On/Off |
| Volume Slide | Volume automation | CC #7 |
| Tremolo | Expression | Text Meta Event |
| Pitch Bend | Pitch Wheel | Pitch Bend events |

### UGE Export

hUGETracker supports limited effects per row. Map BeatBax effects to UGE effect columns where possible:

| BeatBax | UGE Effect | Notes |
|---------|------------|-------|
| `vib` | Vibrato (4xy) | Exported with tuned depth/rate mapping; use `--verbose` to see effect counts |
| `port` | Tone portamento (3xx) / slide (1xx/2xx) | Map to tone portamento for target slides |
| `arp` | Arpeggio (0xy) | Direct mapping for up to 2 offsets; expand for more |
| `volSlide` | Volume slide (effect column) | Set volume per row or per tick |
| `pan` | NR51 per-channel terminal mapping (8xx effect) | Map `gb:pan` or snapped numeric pans to NR51 bits in UGE output; per-note panning requires baking or channel-expansion |
| `cut` | Note cut (E0x extended effect) | Cut after x ticks; explicit cuts shown in effect column |
| `retrig` | **NOT SUPPORTED** | WebAudio-only, no UGE export |

**Export Options**:
- Use `--verbose` flag to see detailed effect statistics (vibrato count, note cut count) during export
- Use `--debug` flag to see internal effect encoding and placement diagnostics
- Use `--strict-gb` flag to enforce enum-only panning (reject numeric pan values)

## Applicability to Other Sound Chips

Different retro sound chips have varying native support for effects. Below is a practical guide for how BeatBax effects map to several common chips (SID, MSX/AY, NES APU, SN76489 / Master System, YM2612 / Genesis). For each chip we state whether an effect is: "Native" (chip has dedicated LFO/command or effect), "Approx" (can be approximated reliably by rapid register updates or pattern expansion), or "Bake" (must be rendered into the sample / instrument or emulated using extra channels). Implementation notes follow to help exporter decisions.

Notes on terminology:
- "Register modulation" or "software LFO" means the effect can be produced by changing pitch/volume registers programmatically at audio rate (or per-frame), not necessarily via a built-in LFO.
- "Channels" indicates how many hardware voices are available; heavy emulation (e.g., echo via extra channels) may be impractical for limited-voice chips.

### Commodore 64 — SID (MOS 6581 / 8580)
- **Vibrato (`vib`):** ✅ **IMPLEMENTED** — Native on SID via hardware LFO; BeatBax implements software LFO for Game Boy with calibrated depth/rate mapping to hUGETracker 4xy effect.
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

// Top-level named effect presets (stored on the AST)
export interface EffectsMap {
  // key: preset name, value: raw RHS string (e.g. 'vib:4,8,sine,4')
  [presetName: string]: string;
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
  // Match: C4<vib:4> or C4<vib:4,volSlide:+1>
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

Additionally, the Peggy grammar and parser now recognize an `EffectStmt` top-level directive of the form:

```peg
EffectStmt = "effect" __ name:Identifier _ "=" _ rhs:RestOfLine
```

The parser attaches named presets to the AST (see `EffectsMap` above) and the resolver expands presets either when they are applied as sequence/pattern modifiers or when used inline (e.g. `C4<wobble>`). Precedence rules (inline wins) are applied during resolution.

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
  - hUGETracker mapping: `4xy` (Vibrato) — `x` is the **waveform selector** (0-15, selects which internal vibrato waveform hUGETracker uses), `y` is the **depth** (0-15, vibrato amplitude). The vibrato speed/rate is controlled by hUGETracker's internal LFO timing, not encoded in the effect parameter.
  - Parameters (BeatBax `vib`):
    - `depth` (1st param, required): vibrato amplitude (0-15 after quantization) → mapped to `y` nibble in `4xy`.
    - `rate` (2nd param, required): vibrato speed in Hz-like units. **Note:** This controls BeatBax playback timing but is NOT exported to UGE (hUGETracker's LFO speed is internal).
    - `waveform` (3rd param, optional): LFO shape selector. Can be a **name** or **number** (0-15). Mapped to `x` nibble in `4xy` for hUGETracker waveform selection. Default: `none` (0).
      - **Official hUGETracker waveform names (0-F):** `none` (0), `square` (1), `triangle` (2), `sawUp` (3), `sawDown` (4), `stepped` (5), `gated` (6), `gatedSlow` (7), `pulsedExtreme` (8), `hybridTrillStep` (9), `hybridTriangleStep` (10), `hybridSawUpStep` (11), `longStepSawDown` (12), `hybridStepLongPause` (13), `slowPulse` (14), `subtlePulse` (15)
      - **Common aliases (backward compat):** `sine`/`sin` → 2 (triangle - smoothest waveform, closest to sine), `tri` → 2, `sqr`/`pulse` → 1, `saw`/`sawtooth` → 3, `ramp` → 4, `noise`/`random` → 5
      - **Note:** hUGETracker has no true sine wave; `sine` maps to `triangle` which provides smooth, musical vibrato
      - Unknown names default to `none` (0)
    - `durationRows` (4th param, optional): length in pattern *rows* for which vibrato is active. Normalized to seconds as `fx.durationSec` for audio backends.
  - Language examples:

```bax
pat vib_demo = C4<vib:3,6> D4<vib:4,8,sine,4> E4<vib:2,5,triangle,8>
```

  - Runtime/Resolver semantics:
    - The resolver converts row-based durations to seconds once during expansion and sets `effect.durationSec` (property name: `fx.durationSec`) on the parsed effect object. All audio backends consult `fx.durationSec` rather than reinterpreting rows themselves.
    - This single normalization point keeps scheduling deterministic and avoids duplicate row→time conversions in audio code and exporters.

  - Backend usage:
    - WebAudio path: `src/effects/index.ts` implements vibrato by modulating `OscillatorNode.frequency` (or equivalent frequency target) using an LFO; it uses `fx.durationSec` to stop/decay the LFO at the correct end-of-note time.
    - Headless/PCM renderer: `src/audio/pcmRenderer.ts` applies the same `fx.durationSec` window when synthesizing per-sample frequency modulation so rendered WAVs match live playback.

  - UGE/hUGETracker export behavior:
    - BeatBax maps `waveform` (3rd param) to tracker waveform nibble `x` (0..15) and `depth` (1st param) to nibble `y` (0..15). The exporter emits `4xy` on BOTH the note row and the first sustain row.
    - **Updated behavior (v0.1.0+):** Vibrato now appears on the note row itself (providing immediate modulation from note trigger) AND continues on the subsequent sustain row. This provides more immediate vibrato effect and matches user expectations for expressive modulation.
    - Because tracker effects are only active on the row they are written to, the UGE exporter repeats the `4xy` vibrato effect on the first sustain row to ensure continuity.
    - When `durationRows` (4th param) is present, the exporter uses that to compute the global row where vibrato should stop; this is also used to drive the deterministic note-cut injection described below.
    - Previous behavior note: Earlier versions applied vibrato only to sustain rows (starting one row after the note). This has been changed to provide immediate modulation.

  - Fallbacks:
    - If the BeatBax vibrato requires higher resolution (complex shapes or sub-tick timing) than the tracker can express, the exporter will either approximate with repeated `4xy` rows, expand into finer-grained pitch steps, or recommend baking the effect into the instrument/sample for faithful reproduction.

  - Implementation references:
    - Resolver: `src/song/resolver.ts` — row→seconds normalization; `fx.durationSec` field.
    - WebAudio vibrato: `src/effects/index.ts`.
    - PCM renderer vibrato: `src/audio/pcmRenderer.ts`.
    - UGE writer mapping & note-cut injection: `packages/engine/dist/export/ugeWriter.js` (and runtime copy in `node_modules/@beatbax/engine/dist/export/ugeWriter.js`).

  - Testing & demo:
    - Example/demo song: `songs/effect_demo.bax` includes `vib` usages and is used by the test harness and CLI export verification.

  - Calibration note (vib parity)
    - The renderer and exporter have been calibrated to improve audible parity with hUGEDriver exports. A coarse automated sweep produced a practical best-fit set of parameters used in source builds: `vibDepthScale=4.0`, `regPerTrackerBaseFactor=0.04`, `regPerTrackerUnit=1`.
    - Measured parity: rendered vibrato depth ≈ **175.70 cents** vs hUGE reference **186.38 cents** (difference ≈ **10.68 cents**) for `songs/effect_demo.bax` at 44.1 kHz.
    - Reproduce or refine the calibration using the helper scripts:
      - `scripts/compare_vib.cjs` — analyzes two WAVs and reports vibrato rate/depth.
      - `scripts/auto_calibrate_vib.mjs` — runs a parameter sweep and writes results to a CSV directory (e.g. `tmp/auto_final/results.csv`).
    - If you need tighter parity, re-run the sweep with a denser grid around the best-match parameters or experiment with modeling additional hUGEDriver micro-behaviors (tick-phase offsets, mask timing, sign conventions).

  - Notes on exporter visibility and note cuts:
    - hUGETracker (and many trackers) do not always render a visible note termination if the exported data only sets volume to 0. To guarantee a visible cut in the tracker UI and playback semantics, the UGE exporter performs a deterministic per-note post-process and injects a single extended-group `E0x` (extended note-cut) at the computed end-of-note global row. This explicit `E0x` forces the tracker to render the cut and matches author intent from BeatBax scripts.
    - The exporter sets volume to `0` on the same row as a safety/fallback for players that prefer volume gating; the `E0x` injection is the reliable signal for hUGETracker-style editors.
    - The UGE writer contains gated debug logging for these operations; enable with the CLI `--debug` flag to see mapping, computed global rows, and injected `E` entries during export.

- Portamento (`port`)
  - hUGETracker mapping: `3xx` (tone portamento) — slides toward the target note/frequency using per-tick rate xx (0-255). BeatBax maps this effect after calculating semitone deltas and timing.
  - Parameters (BeatBax `port`):
    - `speed` (required): portamento speed in tracker units (0-255). Higher values = faster slide.
  - Language examples:

```bax
pat port_demo = C4 E3<port:8> G3<port:8> C4<port:16>
```

  - **Legato behavior (v0.1.0+)**: Notes with portamento automatically use **legato mode** — the envelope continues without retriggering, creating a smooth slide between pitches. This matches tracker semantics where tone portamento (3xx) does not retrigger the note.
    - Example: `C4:4 C5<port:12>:4 C6:4` produces ONE continuous note that slides from C4 → C5 → C6, with envelope retriggering only on C6 (which has no portamento).
    - The `:4` duration specifies how long each pitch is held, while `<port:12>` controls the slide speed.
    - **Envelope sustain**: The envelope from the first note is sustained at its current level for all subsequent legato notes, preventing volume decay during slides.
    - Example with decay envelope: `inst lead duty=50 env=15,down` + `C4:4 C5<port:12>:4 C6<port:12>:4` will start with envelope attack/decay on C4, then sustain at that level while sliding to C5 and C6.

  - Runtime/Resolver semantics:
    - WebAudio path: `src/effects/index.ts` implements portamento by scheduling exponential frequency ramps on `OscillatorNode.frequency` (or equivalent). State is tracked per-channel (Map<channelId, lastFreq>) to support slides across rests.
    - State management: `clearEffectState()` is called on playback stop to prevent frequency state from persisting across playback sessions.
    - Headless/PCM renderer: `src/audio/pcmRenderer.ts` applies portamento with cubic smoothstep easing and tracks per-channel state for seamless slides across rests.

  - UGE/hUGETracker export behavior:
    - BeatBax maps `speed` directly to the tracker's `xx` parameter (0-255) and emits `3xx` on note rows.
    - First-note handling: The exporter skips portamento on the first note of a pattern (using `hasSeenNote` flag) because there's no previous frequency to slide from.
    - Empty cell handling: Rest, sustain, padding, and empty pattern cells use `instrument: -1` (converted to `relativeInstrument: 0` in UGE) to prevent instrument changes from interfering with portamento effects.
    - Transpose compatibility: The pattern transpose utility (`transposePattern`) correctly handles notes with effects (e.g., `E3<port:8>` → `E2<port:8>`) by extracting the note, transposing it, and reconstructing the token with effects intact.

  - Implementation references:
    - WebAudio portamento: `packages/engine/src/effects/index.ts` — frequency ramps and state management.
    - PCM renderer portamento: `packages/engine/src/audio/pcmRenderer.ts` — cubic smoothstep easing.
    - UGE writer mapping: `packages/engine/src/export/ugeWriter.ts` — PortamentoHandler, first-note skipping, empty cell fixes.
    - Pattern transpose fix: `packages/engine/src/patterns/expand.ts` — effect-aware transposition.

  - Testing & demo:
    - Demo song: `songs/effects/portamento.bax` demonstrates varied portamento speeds and pitch glides.
    - Validated behaviors: Runtime playback (WebAudio), PCM rendering (WAV export), UGE export (hUGETracker v6), and transpose operations all working correctly.

  - Known limitations and fixes applied:
    - ✅ Fixed: Portamento state no longer persists across playback sessions (clearEffectState on stop).
    - ✅ Fixed: First note in patterns no longer receives portamento effect in UGE export.
    - ✅ Fixed: Transpose operations now handle notes with inline effects correctly.
    - ✅ Fixed: Empty UGE cells (rest/sustain/padding/empty patterns) use instrument: -1 to prevent interference.

- Arpeggio (`arp`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio, PCM renderer, UGE export)
  - **Implementation**: Cycles through pitch offsets at the chip's native frame rate to simulate chords.
  - **Syntax**: `<arp:3,7>` for semitone offsets, or named presets like `<arpMinor>`.
  - **Behavior**:
    - Always includes root note (offset 0) first in the cycle: Root → +x → +y → Root → ...
    - Cycles at chip-specific frame rate (60 Hz for Game Boy, 50 Hz for C64 PAL, etc.)
    - For `arp:3,7` (minor chord), plays: C → Eb → G → C → ... at 60 Hz
    - Each step lasts ~16.667ms at 60 Hz, creating the chord illusion
  - **hUGETracker mapping**: `0xy` (Arpeggio). The tracker cycles between base note, +x, +y semitones at frame rate.
  - **Export strategy**:
    - UGE: Maps first 2 offsets to x/y nibbles. 3+ note arps trigger a warning (only first 2 exported).
    - MIDI: Not directly representable; could expand to rapid note sequence.
    - Sustains across full note duration in UGE export (effect applied to all sustain rows).
  - **Implementation details**:
    - WebAudio: Schedules frequency changes via `setValueAtTime` at chip frame rate intervals.
    - PCM renderer: Calculates frequency per sample based on frame-rate cycling through offsets.
    - Base frequency stored in `oscillator._baseFreq` to avoid timing issues with scheduled values.
    - Chip frame rates: Game Boy 60Hz, NES 60Hz, C64 50Hz (PAL default), Genesis 60Hz, PC Engine 60Hz.

  - Testing & demo:
    - Demo song: `songs/effects/arpeggio.bax` includes minor/major chord presets and 4-note arpeggios.
    - Validated behaviors: WebAudio playback, CLI/PCM rendering, UGE export with sustain, correct pitch cycling.

  - Known limitations:
    - UGE export limited to 2 offsets (3-note arpeggios including root).
    - Wave channel (BufferSource) doesn't support arpeggio in WebAudio (frequency modulation not available).
    - Arpeggio speed tied to chip frame rate, not customizable per-note.

- Volume Slide (`volSlide`)
  - hUGETracker mapping: Volume slide effect (`Axy` where x=slide up speed 0-15, y=slide down speed 0-15). Note: `Dxy` is pattern break in ProTracker/hUGETracker, not volume slide.
  - Export strategy: Translate BeatBax delta per tick into the tracker's per-tick volume slide units. If simultaneous master volume changes are needed, may also emit `5xx` when appropriate.

- Pitch Bend (`bend`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio, PCM renderer, MIDI export)
  - **Implementation**: Smoothly bends the pitch from the base note frequency to a target pitch with optional delay before bend starts. Supports configurable curve shaping for musical expression.
  - **Syntax**: `<bend:semitones,curve,delay,time>` where:
    - `semitones` (required): Number of semitones to bend - positive = up, negative = down (e.g., +2, -12, +0.5)
    - `curve` (optional): Bend curve shape - `linear` (default), `exp`/`exponential`, `log`/`logarithmic`, `sine`/`sin`
    - `delay` (optional): Time before bend starts as fraction of note duration (default: 0.5 = 50% hold, then bend)
      - `0` = bend starts immediately from note start (chirp-like)
      - `0.5` = hold base pitch for 50% of note, then bend (guitar-style, musical default)
      - `0.75` = hold longer, bend quickly at end
      - `1.0` = bend starts at very end (subtle pitch accent)
    - `time` (optional): Bend duration in seconds - defaults to remaining duration after delay
  - **Behavior**:
    - Holds base frequency for `delay × noteDuration`
    - Then bends pitch smoothly to target frequency over `time` duration
    - Target frequency calculated as: `baseFreq × 2^(semitones / 12)`
    - Curve types:
      - `linear`: Constant rate of pitch change (default)
      - `exp`/`exponential`: Slow start, fast end (accelerating bend)
      - `log`/`logarithmic`: Fast start, slow end (decelerating bend)
      - `sine`/`sin`: Smooth S-curve (slow-fast-slow)
    - If bend time < remaining duration after delay, holds target pitch for remainder
    - Can bend to microtonal intervals (e.g., +0.5 semitones)
  - **WebAudio implementation**:
    - Dual-path support: Detects oscillators (frequency) vs buffer sources (playbackRate)
    - Delay: `setValueAtTime(baseFreq/baseRate, delayTime)` to hold base pitch
    - Linear: `linearRampToValueAtTime(targetFreq/targetRate, bendEnd)` (64 steps for buffer sources)
    - Exponential: `exponentialRampToValueAtTime(targetFreq/targetRate, bendEnd)`
    - Logarithmic/Sine: `setValueCurveAtTime()` with 128-sample smooth automation curve
      - Fallback: 64 `linearRampToValueAtTime()` steps if `setValueCurveAtTime` unsupported
    - Wave channel (buffer sources) uses smooth curves to eliminate clicks/steps
  - **PCM renderer implementation**:
    - Per-sample frequency calculation with curve shaping and delay
    - Delay applied: only bend if `t >= bendDelay && t <= (bendDelay + bendTime)`
    - Curve progress calculated per sample: `(t - bendDelay) / bendTime`
    - Applied transforms:
      - Exponential: `progress²`
      - Logarithmic: `1 - (1 - progress)²`
      - Sine: `(1 - cos(π × progress)) / 2`
  - **MIDI export**: Native pitch wheel events (0xE0 | channel)
    - 14-bit resolution: 0x0000 to 0x3FFF (0-16383), center = 0x2000 (8192)
    - Standard range: ±2 semitones (±8192 units)
    - Formula: `bendValue = 8192 + (semitones / 2) × 8192`
    - Clamped to valid range for bends exceeding ±2 semitones
    - Curve, delay, and time stored as text meta event for reference
  - **hUGETracker/UGE export**: Approximated with tone portamento (3xx)
    - No native high-resolution pitch bend in hUGETracker
    - Converted to effect code `3xx` (tone portamento) with speed-based approximation
    - Priority: 11 (between standard portamento and vibrato in conflict resolution)
    - Delay parameter not preserved in UGE format (portamento always bends across full note)
    - Export warnings issued for:
      - Non-linear curves (exp, log, sine) - only linear bends approximate well
      - Delay values other than 0.0 or 0.5 - partial note timing not supported
    - Speed calculation based on semitone distance:
      - ≤1 semitone: speed = 32 (slowest, most musical for small bends)
      - ≤2 semitones: speed = 48 (whole-tone intervals)
      - ≤5 semitones: speed = 64 (fourth/tritone intervals)
      - ≤7 semitones: speed = 96 (fifth intervals)
      - >7 semitones: speed = 128 (octave+ intervals, fastest)
    - Formula reference: hUGETracker portamento duration = `(256 - speed) / 256 × noteDuration × 0.6`
    - Higher speed values = faster portamento (inverse relationship)
    - Implementation: `packages/engine/src/export/ugeWriter.ts` (PitchBendHandler)
  - **Implementation files**:
    - WebAudio: `packages/engine/src/effects/index.ts` (bend handler with delay)
    - PCM renderer: `packages/engine/src/audio/pcmRenderer.ts` (bendDelay + bendTime split)
    - MIDI export: `packages/engine/src/export/midiExport.ts` (pitch wheel events with delay meta)
    - Demo: `songs/effects/pitchbend.bax`
  - **Use cases**:
    - Guitar-style whole-tone bends: `C4<bend:+2,linear,0.5>` (hold then bend)
    - Dive bombs and risers: `C4<bend:+12,exp,0>` (immediate exponential rise)
    - Subtle expression: `C4<bend:+0.5,sine,0.75>` (quick subtle accent at end)
    - Smooth pitch automation with musical timing
    - Microtonal/experimental pitch effects
  - **Example presets**:
    ```bax
    effect riser = bend:+12,exp,0       # Immediate octave up, exponential
    effect dive = bend:-12,log,0        # Immediate octave down, logarithmic
    effect wholetone = bend:+2,linear,0.5  # Guitar-style bend (hold then bend)
    effect subtle = bend:+0.5,sine,0.75    # Quick subtle upward accent

    effect subtle = bend:+0.5,sine   # Subtle vibrato-like
    ```

- Pitch Sweep (`sweep`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio, PCM renderer, MIDI export, UGE export)
  - **Implementation**: Hardware-accurate Game Boy NR10 frequency sweep emulation. Automatically recalculates frequency at regular intervals using the GB hardware formula.
  - **Syntax**: `<sweep:time,direction,shift>` where:
    - `time` (required): Sweep step time in 1/128 Hz units (0-7, where 0=disabled)
      - Each step occurs every `time/128` seconds
      - Higher values = slower sweep (more steps over longer time)
    - `direction` (optional): 'up'/'+'/ 1 (pitch up) or 'down'/'-'/0 (pitch down, default)
    - `shift` (required): Frequency shift amount (0-7, where 0=no change)
      - Number of bits to shift in GB hardware formula
      - Higher values = more dramatic sweeps
  - **Hardware formula**: `f_new = f_old ± f_old / 2^shift`
    - Applied iteratively at each sweep step
    - Example: shift=1, down → each step: f = f - f/2 = f/2 (halving frequency)
    - Example: shift=7, down → each step: f = f - f/128 (subtle decrease)
  - **Behavior**:
    - Recalculates frequency every `time/128` seconds
    - Direction 'down' decreases frequency (pitch down)
    - Direction 'up' increases frequency (pitch up)
    - Sweep stops when reaching frequency limits (20 Hz - 20 kHz in WebAudio/PCM)
    - Sweep stops if frequency change becomes negligible (< 0.1 Hz)
  - **WebAudio implementation**:
    - Calculates final frequency using iterative sweep formula
    - Uses `exponentialRampToValueAtTime` for smooth hardware-like sweep
    - Works on all channels (not limited to Pulse 1 in software)
  - **PCM renderer implementation**:
    - Per-sample frequency calculation with iterative sweep formula
    - Calculates which sweep step applies at each sample time
    - Applies GB hardware formula step-by-step for accuracy
  - **MIDI export**: Text meta event (no native MIDI sweep equivalent)
  - **Game Boy hardware**:
    - **Only available on Pulse 1 channel** (NR10 register)
    - Pulse 2, Wave, and Noise channels do not have sweep capability
    - Set via instrument definition: `inst laser type=pulse1 sweep=4,down,7`
  - **UGE export**:
    - Sweep is **instrument-level**, not per-note
    - Inline sweep effects (`<sweep:...>`) will warn during UGE export
    - Proper approach: Define sweep in instrument definition
    - Maps to NR10 register parameters (freqSweepTime, freqSweepDir, freqSweepShift)
    - Export writes sweep parameters to duty instrument structure
  - **Implementation files**:
    - WebAudio: `packages/engine/src/effects/index.ts` (sweep handler)
    - PCM renderer: `packages/engine/src/audio/pcmRenderer.ts` (sweep params and calculation)
    - MIDI export: `packages/engine/src/export/midiExport.ts` (text meta event)
    - UGE export: `packages/engine/src/export/ugeWriter.ts` (SweepHandler with warning)
    - Demo: `songs/effects/sweep.bax`
  - **Use cases**:
    - Classic laser sounds: `<sweep:4,down,7>` or `inst laser1 type=pulse1 sweep=4,down,7`
    - Sci-fi "pew" effects: `<sweep:2,down,5>`
    - Pitch risers: `<sweep:6,up,4>`
    - Dive bombs: `<sweep:3,down,6>`
    - Authentic Game Boy sound design
  - **Example presets**:
    ```bax
    # Inline effects (work in WebAudio/MIDI, warn in UGE export)
    effect laser = sweep:4,down,7
    effect riser = sweep:6,up,3

    # Proper GB approach: instrument-level sweep
    inst laser1 type=pulse1 duty=50 env=12,down,1 sweep=4,down,7
    inst riser1 type=pulse1 duty=50 env=12,flat sweep=7,up,3

    pat lasers = C5:4 E5:4 G5:4 C6:4  # Uses instrument sweep
    ```
  - **Important notes**:
    - For authentic GB sound, use instrument-level sweep (not inline effects)
    - Inline sweep effects are flexible for WebAudio/MIDI but not hardware-accurate for GB
    - UGE export requires instrument-level sweep for proper NR10 register encoding
    - Only Pulse 1 has hardware sweep on real Game Boy hardware

- Tremolo (`trem`)
  - hUGETracker mapping: Some trackers include tremolo; if present map accordingly. If hUGETracker lacks tremolo, approximate via fast volume slides or bake.
  - Export strategy: If hUGETracker supports a tremolo effect code, map depth/speed to parameters; otherwise emulate with short repeated volume slide steps within a row/tick or bake.

- Echo / Delay (`echo`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio playback)
  - **Implementation**: Creates time-delayed feedback repeats using WebAudio DelayNode with configurable delay time, feedback, and wet/dry mix.
  - **Syntax**: `<echo:delayTime,feedback,mix>` where:
    - `delayTime` is delay time in seconds or as fraction of beat (< 1.0 = fraction, >= 1.0 = absolute seconds)
    - `feedback` is feedback amount 0-100% (optional, default: 50)
    - `mix` is wet/dry mix 0-100% (optional, default: 30)
  - **Behavior**:
    - Uses DelayNode with feedback loop for authentic delay behavior
    - Feedback controls decay rate (0 = single repeat, 90+ = long tail)
    - Mix controls wet/dry balance (0 = dry only, 100 = wet only)
    - Delay time < 1.0 treated as fraction of beat duration (e.g., 0.25 = quarter beat)
    - Delay time >= 1.0 treated as absolute time in seconds
  - **hUGETracker mapping**: Not natively supported as a per-voice effect. Echo requires routing and feedback not available as a simple effect code.
  - **Export strategy**: Bake delay/echo into the instrument sample (rendered waveform) OR emulate by duplicating notes across spare channels at reduced volume with delay offsets (very limited and channel-expensive). Exporter should warn when `echo` is used and offer the bake option.
  - **Implementation files**:
    - WebAudio: `packages/engine/src/effects/index.ts` (echo handler)
  - **Use cases**:
    - Ambient/spacey textures
    - Slapback delay (short, single repeat)
    - Dub-style echo effects
    - Rhythmic echoes synchronized to tempo

- Note Cut (`cut`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio playback)
  - **Implementation**: Gates notes by ramping gain to zero after a specified number of ticks, creating staccato/gated effects.
  - **Syntax**: `<cut:N>` where N is the number of ticks after which to cut the note.
  - **Behavior**:
    - Schedules gain automation at cut time: `start + (N × tickSeconds)`
    - Cuts are capped at note duration (won't extend beyond note end)
    - Uses gain automation: `cancelScheduledValues()` → `setValueAtTime()` → `exponentialRampToValueAtTime(0.0001, cutTime + 5ms)`
    - Oscillators continue to their originally scheduled stop time (only gain is automated)
    - This approach allows cut to work even when oscillator.stop() was already scheduled
  - **hUGETracker mapping**: E0x extended effect (cut after x ticks, where x=0-F)
  - **Export strategy**: Map BeatBax ticks to tracker's tick/row model and emit cut effect with quantized tick count.
  - **Implementation files**:
    - WebAudio: `packages/engine/src/effects/index.ts` (cut handler)
    - Demo: `songs/effects/notecut.bax`
  - **Use cases**:
    - Staccato articulation (short, detached notes)
    - Rhythmic gating patterns
    - Percussive effects on melodic instruments
    - Creating space in dense arrangements

- Retrigger (`retrig`)
  - **Status**: ✅ **IMPLEMENTED** (WebAudio playback only)
  - **Implementation**: Schedules multiple note restarts at regular tick intervals, creating rhythmic stuttering effects.
  - **Syntax**: `<retrig:interval,volumeDelta>` where:
    - `interval` is the number of ticks between each retrigger (required)
    - `volumeDelta` is the volume change per retrigger in Game Boy envelope units (optional, range: -15 to +15)
      - Negative values create fadeout (e.g., -2, -3, -5)
      - Positive values create fadein (e.g., +2, +3)
      - Normalized to 0-1 range internally by dividing by 15 (e.g., -2 → -0.133 per retrigger)
      - Example: `<retrig:4,-2>` with 8 retrigs = 8 × -0.133 ≈ -1.064 total (full fadeout)
      - May not be audible with `flat` envelopes; use `down` or other decaying envelopes for best results
  - **Behavior**:
    - Schedules additional AudioNodes at regular intervals
    - Each retrigger creates a full note restart (envelope retriggering)
    - Volume delta modifies envelope level multiplicatively: `newLevel = baseLevel × (1 + cumulative_delta/15)`
    - Retriggering stops when reaching note duration
    - Compatible with other effects (pan, vib, etc.) which are applied to all retriggered notes
    - Prevents infinite recursion by filtering out retrig effect from retriggered notes
  - **Known Limitations**:
    - Volume fadeout may not be audible with `flat` envelopes; use `down` or other decaying envelopes for best results
    - PCM renderer (CLI without --browser) does not support retrigger
    - **Workaround**: Use `--browser` flag for CLI playback with retrigger effects
  - **hUGETracker mapping**: **NOT SUPPORTED** - hUGETracker has no native retrigger effect (7xx is note delay, not retrigger)
  - **Export strategy**: Retrigger is WebAudio-only and cannot be exported to UGE. Songs using retrigger will export without this effect. Consider expanding into multiple note events in patterns as a workaround.
  - **Export warning**: When exporting songs with retrigger effects to UGE format, a warning will be displayed: `[WARN] [export] Retrigger effects detected in song but cannot be exported to UGE (hUGETracker has no native retrigger effect). Retrigger effects will be lost. Use WebAudio playback for retrigger support.`
  - **Implementation files**:
    - WebAudio: `packages/engine/src/effects/index.ts` (retrig handler stores metadata)
    - Scheduling: `packages/engine/src/audio/playback.ts` (tryScheduleRetriggers method)
    - Demo: `songs/effects/retrigger.bax`
  - **Use cases**:
    - Drum rolls and rapid-fire percussion
    - Glitchy stuttering effects (fast retriggering)
    - Volume-decaying echo simulation
    - Rhythmic pulsing effects (slower retriggering)
    - Chiptune-style stuttering common in tracker music

### Mapping table (concise)

 - pan(enum,numeric) → NR51 terminal bits (L/R/C) — numeric values snap deterministically to enum (pan < -0.33 → L, pan > 0.33 → R, otherwise C); emit warning on precision loss or provide `--strict-gb` to treat as error
- vib(depth,speed) → 4xy (x=speed, y=depth) — quantize to 0..15
- port(target,speed) → 3xx (tone portamento) or 1xx/2xx for relative slides — compute xx from semitone delta and tick duration
- arp(intervals) → 0xy for 2-3 intervals (x & y are semitone offsets) or expand into rapid notes
- volSlide(delta) → volume slide opcode (tracker-specific) — convert delta/tick → slide units
- bend(semitones,curve) → approximate with 3xx ramps (piecewise) or bake
- trem(depth,speed) → tremolo opcode if present else fast volume slides / bake
- echo(time,fb) → not native — bake into sample or emulate with extra channels
- cut(ticks) → tracker note cut opcode (UGE mapping: E0x)
- retrig(ticks,volDelta) → **WebAudio-only, no UGE export** (hUGETracker has no native retrigger effect)

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

- [x] Add `Effect` and `NoteToken` types to AST
- [x] Update parser to recognize `<effect:param>` syntax (Peggy default parser)
- [x] Implement effect parsing for all core effects
- [x] Create effect application functions in audio backend
- [x] Add panning implementation (WebAudio + UGE + MIDI)
- [x] Add vibrato implementation (WebAudio + PCM renderer + UGE export)
- [x] Add portamento implementation (WebAudio + UGE + MIDI)
- [x] Add arpeggio implementation (WebAudio + PCM renderer + UGE + MIDI)
- [x] Add volume slide implementation (WebAudio + PCM renderer + UGE export + MIDI export)
- [x] Add pitch bend implementation
- [x] Add tremolo implementation (WebAudio + PCM renderer + MIDI export)
- [x] Add note cut implementation (UGE export only)
- [x] Add retrigger implementation (WebAudio + scheduling)
- [ ] Add echo/delay implementation
- [x] Add pattern-level effect modifiers
- [x] Add named effect presets
- [x] Map effects to MIDI export (pan, partial vib/port/vol/bend/trem/cut)
- [x] Map effects to UGE export (pan, vib, port, arp, cut implemented)
- [x] Write unit tests for effect parsing
- [x] Write unit tests for effect application
- [x] Write integration tests (uge.vib.test.ts, uge.arp.test.ts, etc.)
- [x] Add effects examples to demo songs (songs/effects/*.bax)
- [ ] Document effects in TUTORIAL.md
- [ ] Create effects reference guide

---

## Implemented Effects Reference

### Panning (`pan`)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Numeric panning (-1.0 = left, 0.0 = center, 1.0 = right)
pat stereo = C5<pan=-1.0>:4 E5<pan=0.0>:4 G5<pan=1.0>:4

# GB-specific enum panning (L/C/R maps to NR51 terminal bits)
pat gb_pan = C4<gb:pan:L>:4 E4<gb:pan:C>:4 G4<gb:pan:R>:4

# Named panning presets
effect left = pan=-1.0
effect center = pan=0.0
effect right = pan=1.0

# Apply preset to patterns
pat melody_left = melody:left
```

**Parameters:**
- Numeric: `-1.0` to `1.0` where `-1.0` = full left, `0.0` = center, `1.0` = full right
- GB enum: `L` (left), `C` (center/both), `R` (right)
- Namespace: Use `gb:pan:L/C/R` for explicit Game Boy terminal mapping

**Implementation:** Creates a `StereoPannerNode` (or GainNode pair fallback) in WebAudio. Supports both smooth panning (-1 to +1) and discrete GB terminal routing (L/R/C).

**Hardware Mapping:**
- **Game Boy:** Maps to NR51 terminal bits (per-channel L/R/both routing)
  - Numeric values snap to nearest enum: `pan < -0.33` → L, `pan > 0.33` → R, else C
- **UGE Export:** Maps to NR51 channel routing (8xx effect or channel flags)
- **MIDI Export:** Maps to Pan CC #10 (0 = left, 64 = center, 127 = right)

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts` (pan handler)
- UGE export: `packages/engine/src/export/ugeWriter.ts` (NR51 terminal mapping)
- MIDI export: `packages/engine/src/export/midiExport.ts` (CC #10)
**Demo:** `songs/panning_demo.bax`

---

### Portamento (`port`)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Inline portamento with target note and speed
pat slide = C4<port:G4,50>:8 G4<port:C5,30>:8

# Named portamento presets
effect slowGlide = port:+12,20   # Slide up 1 octave slowly
effect fastGlide = port:-5,80    # Slide down 5 semitones quickly

# Apply preset to notes
pat gliding = C4<slowGlide>:8 E4<fastGlide>:8
```

**Parameters:**
- `target` (1st param, required): Target note name (e.g., `G4`) or semitone offset (e.g., `+12`, `-5`)
- `speed` (2nd param, optional): Portamento speed (0-255, higher = faster). Default varies by implementation.

**Implementation:** Applies smooth frequency ramp from current note to target note using `AudioParam.exponentialRampToValueAtTime` (or linear fallback). The slide occurs over the note duration.

**Hardware Mapping:**
- **Game Boy:** Software effect via frequency automation (no native hardware portamento)
- **UGE Export:** Maps to `3xx` effect (tone portamento) with calculated speed parameter
- **MIDI Export:** Maps to Portamento CC #5 + Pitch Bend events

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts` (port handler)
- UGE export: `packages/engine/src/export/ugeWriter.ts` (PortamentoHandler)
- MIDI export: `packages/engine/src/export/midiExport.ts` (CC #5 + pitch bend)
- Demo: `songs/effects/portamento.bax`

**Known Behaviors:**
- Tracks last frequency per channel to enable relative portamento across note boundaries
- Exponential ramp used when available for more musical pitch glide
- State cleared on playback stop via `clearEffectState()`

---

### Vibrato (`vib`)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Inline vibrato with depth and rate
pat melody = C4<vib:3,6> E4<vib:4,8,sine,4>

# Named vibrato presets
effect wobble = vib:8,4
effect subtle = vib:2,5,triangle

# Apply preset to notes
pat vibrato_melody = C4<wobble>:4 E4<subtle>:4
```

**Parameters:**
- `depth` (1st param, required): vibrato amplitude (0-15 after quantization)
- `rate` (2nd param, required): vibrato speed in Hz-like units
- `waveform` (3rd param, optional): LFO shape selector - name or number (0-15). Default: `none` (0)
  - Official waveforms: `none`, `square`, `triangle`, `sawUp`, `sawDown`, `stepped`, `gated`, etc.
  - Common aliases: `sine`→triangle (closest to sine), `tri`→triangle, `sqr`→square, `saw`→sawUp
- `durationRows` (4th param, optional): length in pattern rows for which vibrato is active

**Implementation:** Creates a low-frequency oscillator that modulates the oscillator frequency at the specified depth and rate. The resolver converts row-based durations to seconds (`fx.durationSec`) for deterministic timing across all backends.

**Hardware Mapping:**
- **Game Boy:** Software effect via AudioParam frequency modulation with chip-specific frame rate (60 Hz)
- **UGE Export:** Maps to `4xy` effect (x=waveform, y=depth). Vibrato appears on both note row and first sustain row.
- **MIDI Export:** Maps to Modulation CC #1 + pitch bend approximation

**Calibration:** Vibrato depth calibrated to match hUGEDriver exports within ~10.68 cents difference (175.70 cents vs 186.38 cents reference).

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts`
- PCM renderer: `packages/engine/src/audio/pcmRenderer.ts`
- UGE export: `packages/engine/src/export/ugeWriter.ts` (VibratoHandler)
- Tests: `packages/engine/tests/uge.vib.test.ts`
- Demo: `songs/effects/vibrato.bax`

---

### Arp (Arpeggio)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Inline effect with explicit parameters
pat melody = C4<arp:0,4,7>:4 E4<arp:0,3,7>:4

# Named effect presets
effect arpMinor = arp:3,7          # Minor triad (root + minor 3rd + perfect 5th)
effect arpMajor = arp:4,7          # Major triad (root + major 3rd + perfect 5th)
effect arpMajor7 = arp:4,7,11      # Major 7th chord (4 notes)

# Apply preset to notes
pat chord_prog = C4<arpMinor>:4 F4<arpMajor>:4 G4<arpMajor7>:4
```

**Parameters:**
- Semitone offsets from base note (e.g., `0,4,7` for major triad, `0,3,7` for minor triad)
- Supports 2-4 note arpeggios
- UGE export limitation: only first 2 offsets are exported to hUGETracker's `0xy` effect

**Implementation:** Rapidly cycles oscillator frequency at the chip's native frame rate through the specified pitch offsets, creating the illusion of simultaneous notes playing. Frame rates: 60 Hz for Game Boy/NES/Genesis, 50 Hz for C64 (PAL). Each arpeggio step lasts one frame (~16.667ms at 60Hz, ~20ms at 50Hz).

**Hardware Mapping:**
- **Game Boy:** Software effect via frequency automation (no native hardware arpeggio)
- **UGE Export:** Maps to `0xy` effect (x=offset1, y=offset2). Warns if >2 offsets provided.
- **MIDI Export:** Expands into rapid note sequences

**Known Issues (Fixed in v0.1.0):**
- ✅ Parser grammar fix: `EffectSuffix` now returns effect content without angle brackets
- ✅ Token reconstruction fix: `patternEventsToTokens` wraps effects in `<>` when converting to strings
- ✅ Preset expansion fix: `parseEffectsInline` now treats bare identifiers (e.g., `arpMinor`) as effect names with empty params, allowing preset lookup

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts` (arp handler)
- PCM renderer: `packages/engine/src/audio/pcmRenderer.ts` (arpeggio frequency cycling)
- UGE export: `packages/engine/src/export/ugeWriter.ts` (ArpeggioHandler)
- MIDI export: `packages/engine/src/export/midiExport.ts` (note expansion)
- Tests: `packages/engine/tests/uge.arp.test.ts`
- Demo: `songs/effects/arpeggio.bax`

---

### Volume Slide (`volSlide`)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Inline volume slide with delta
pat melody = C4<volSlide:+3>:4 E4<volSlide:-3>:4

# Stepped volume slide (delta, step count)
pat stepped = C4<volSlide:+2,8>:8 E4<volSlide:-2,8>:8

# Named volume slide presets
effect fadeIn  = volSlide:+5
effect fadeOut = volSlide:-5
effect fastFadeOut = volSlide:-8

# Apply preset to notes
pat fade_melody = C4<fadeIn>:4 E4<fadeOut>:4

# IMPORTANT: Using volSlide with low-volume instruments
# When using instruments with very low initial volume (env=0 or env=1), ensure:
# 1. Sufficient volume headroom for the slide to become audible
# 2. Longer note durations to allow the slide to complete
# 3. Instrument overrides apply to all notes needing the same starting volume
inst lead_in  type=pulse1 env=1,flat    # Start near-silent for fade-ins
pat fade_in = inst(lead_in,2) C4<volSlide:+14>:12 . C4<volSlide:+14,4>:12

# Note re-triggering on monophonic channels:
# Identical consecutive pitches (e.g., C4 C4) blend into one continuous note
# Insert a rest (.) between same-pitch notes to force re-trigger and hear distinct slides
pat compare = inst(lead_in,2) C4<volSlide:+4>:8 . C4<volSlide:+4,16>:8  # Rest forces re-trigger
```

**Parameters:**
- Delta (1st param, required): volume change rate (signed)
  - Positive values = fade in / crescendo
  - Negative values = fade out / decrescendo
  - Typical range: ±1 to ±10 (±1 = ±10% gain change per note)
- Steps (2nd param, optional): number of discrete steps for the slide
  - If omitted: smooth linear ramp over note duration
  - If provided: stepped volume changes at tick intervals

**Implementation:** Applies linear gain automation to the GainNode. For smooth slides, uses `linearRampToValueAtTime`. For stepped slides, uses `setValueAtTime` at each tick interval.

**Hardware Mapping:**
- **Game Boy:** Software gain automation via GainNode (no native hardware volume slide)
- **UGE Export:** Maps to `Axy` effect (x=slide up speed 0-15, y=slide down speed 0-15)
  - Positive delta maps to x nibble (slide up)
  - Negative delta maps to y nibble (slide down)
- **MIDI Export:** Maps to Volume CC #7 with scaled delta

**Scaling:**
- Internal gain values: 0.0 to 1.0
- BeatBax delta values: ±10 typical range
- Conversion: delta ±1 = ±10% gain change
- MIDI scaling: delta ±10 → volume change ±64 (around midpoint 64)

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts` (volSlide handler)
- PCM renderer: `packages/engine/src/audio/pcmRenderer.ts` (volDelta, volSteps)
- UGE export: `packages/engine/src/export/ugeWriter.ts` (VolumeSlideHandler)
- MIDI export: `packages/engine/src/export/midiExport.ts` (CC #7)
- Demo: `songs/effects/volume_slide.bax`

**Known behaviors:**
- **Volume slides REPLACE existing gain automation** (calls `cancelScheduledValues` which wipes envelope automation on the same GainNode). Volume slide and envelope cannot currently coexist - volume slide disables the envelope.
  - **Architectural fix needed**: Use a separate gain stage (additional GainNode) for volume slides to stack with envelopes properly.
- Start volume (baseline) is derived from instrument envelope initial volume (0-15 GB range → 0.0-1.0), defaults to 1.0 (full volume) if no envelope
- Target gain clamped to [0.001, 1.5] allowing volume boosts above baseline up to 1.5x (headroom for fade-ins)
- Stepped slides require `tickSeconds` parameter (provided by resolver)

---

### Tremolo (`trem`)

**Status:** ✅ Implemented (v0.1.0+)

**Syntax:**
```bax
# Basic tremolo with depth and rate
pat shimmer = C4<trem:6,4>:4 E4<trem:8,6>:4 G4<trem:10,8>:4

# Different waveform shapes
pat waveforms =
  C4<trem:8,6,sine>:4      # Smooth sine wave (default)
  E4<trem:8,6,triangle>:4  # Linear triangle wave
  G4<trem:8,6,square>:4    # Hard on/off square wave
  C5<trem:8,6,saw>:4       # Sawtooth ramp

# Named tremolo presets
effect shimmer = trem:6,4,sine
effect pulse = trem:10,8,square
effect slow_wave = trem:4,2,triangle

# Apply preset to notes
pat atmospheric = C4<shimmer>:4 E4<pulse>:4 G4<slow_wave>:4

# Combining tremolo with other effects
pat combo = C4<vib:3,6,trem:6,4>:4       # Vibrato + tremolo
pat stereo_trem = C5<pan:-1.0,trem:10,8>:4  # Panning + tremolo
```

**Parameters:**
- `depth` (1st param, required): Tremolo amplitude (0-15)
  - 0 = no effect
  - 15 = maximum amplitude modulation (±50% volume)
  - Typical range: 4-12 for musical tremolo
- `rate` (2nd param, optional): Tremolo speed in Hz (default: 6)
  - 1-4 Hz: Slow, gentle shimmer
  - 5-10 Hz: Medium tremolo
  - 10+ Hz: Fast pulsing effect
- `waveform` (3rd param, optional): LFO shape (default: `sine`)
  - `sine`: Smooth, natural tremolo
  - `triangle`: Linear volume ramp
  - `square`: Hard on/off pulsing
  - `saw` / `sawtooth`: Ramp waveform
- `duration` (4th param, optional): Duration in pattern rows (defaults to full note length)
  - Normalized to seconds by the resolver as `fx.durationSec` for audio backends
  - The resolver converts row-based durations to seconds during expansion

**Implementation:** Creates an LFO oscillator connected to a GainNode which modulates the amplitude. The LFO oscillates at the specified rate and uses the selected waveform shape.

**Hardware Mapping:**
- **Game Boy:** Software effect via GainNode modulation (no native hardware tremolo)
- **UGE Export:** No native tremolo effect in hUGETracker - exported as meta-event only
  - Can be approximated manually with volume column automation
- **MIDI Export:** Documented via text meta event (no native MIDI tremolo)
  - MIDI doesn't have native tremolo, so it's documented via text meta event

**Scaling:**
- Depth: 0-15 maps to 0-50% amplitude modulation
  - depth 15 = ±50% volume variation (0.5× to 1.5× baseline)
  - depth 8 = ±27% volume variation
  - depth 4 = ±13% volume variation
- Rate: Direct Hz value (1-20 Hz typical range)
- Waveform: Maps to OscillatorNode.type

**Implementation Files:**
- WebAudio: `packages/engine/src/effects/index.ts` (trem handler)
- PCM renderer: `packages/engine/src/audio/pcmRenderer.ts` (tremDepth, tremRate, tremWaveform)
- MIDI export: `packages/engine/src/export/midiExport.ts` (meta-event)
- Demo: `songs/effects/tremolo.bax`

**Known behaviors:**
- Tremolo modulates volume around the current baseline gain value
- Works on pulse and wave channels (not yet implemented for noise)
- Can be combined with other effects like vibrato, panning, and portamento
- Different waveforms create distinct musical characters:
  - Sine: Classic smooth tremolo (organs, strings)
  - Square: Gated/pulsing effect (synthesizers)
  - Triangle: Linear ramping (experimental)
  - Sawtooth: Ramp-up/down effect (special FX)

**Use Cases:**
- Atmospheric pads and sustained notes
- Simulating rotary speaker (Leslie) effects
- Adding movement to static tones
- Creating "shimmer" or "pulse" textures
- Combining with vibrato for rich modulation

---

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
4) Volume Slide (`volSlide`) — row/tick volume deltas; maps to UGE volume slide.
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
npm -w node ./bin/beatbax --export uge songs/effects/vibrato.bax tmp/out.uge
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
