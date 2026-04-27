---
title: "Scale Awareness — Scale Locking, Snapping, and Channel Locks"
status: proposed
authors: ["GitHub Copilot"]
created: 2026-04-27
issue: "https://github.com/kadraman/beatbax/issues/102"
---

## Summary

Add scale-awareness to BeatBax so that composers can declare a musical key and scale at the song level, restrict individual channels or patterns to subsets of that scale (root+fifth, chord tones, etc.), receive compile-time diagnostics for out-of-scale notes, and optionally snap MIDI step entry input to the nearest in-scale pitch.

This is a **compile-time validation and authoring-aid feature**. It does not alter runtime playback behaviour or the tick scheduler.

---

## Problem Statement

BeatBax songs are authored as plain text with arbitrary note names. Nothing stops a composer from accidentally entering notes that clash with the intended key, and there is no mechanism to restrict or guide individual channels (e.g. bass = root+fifth only, arpeggio = chord tones only). In a DAW environment, features like Ableton Scale & Fold, Logic Pro Transposition, FL Studio Scale Highlight, and Bitwig Note FX Scale all help prevent these mistakes. BeatBax has an opportunity to implement equivalent assistance as **language keywords and compile-time diagnostics**, consistent with its language-first architecture.

---

## Proposed Solution

### Summary

Introduce three co-operating mechanisms:

| Mechanism | Where | Effect |
|---|---|---|
| `scale` global directive | `.bax` source | Declares the song key and scale |
| `lock` channel annotation | `.bax` source | Restricts a channel or pattern to a note subset |
| Scale validation pass | Parser post-processing | Emits `ast.diagnostics` warnings/errors for violations |
| MIDI step entry snapping | Web UI MIDI subsystem | Snaps or filters incoming MIDI notes to the active scale before insertion |
| Web UI keyboard highlight | Virtual piano / Monaco gutter | Highlights in-scale keys; dims out-of-scale keys |

All source-level mechanisms are **compile-time only**. No runtime patch or scheduler change is required.

---

### Global Scale Directive

Declare the song key and scale type at the top level of a `.bax` file, alongside `chip` and `bpm`:

```bax
scale C major
```

```bax
scale A minor
```

```bax
scale F# dorian
```

**Syntax:**

```
scale <root> <mode>
```

- `<root>` — any chromatic note name: `C`, `C#`, `Db`, `D`, `D#`, `Eb`, `E`, `F`, `F#`, `Gb`, `G`, `G#`, `Ab`, `A`, `A#`, `Bb`, `B`
- `<mode>` — one of the named modes listed below

**Supported modes (v1):**

| Keyword | Semitone intervals |
|---|---|
| `major` | 0, 2, 4, 5, 7, 9, 11 |
| `minor` | 0, 2, 3, 5, 7, 8, 10 |
| `dorian` | 0, 2, 3, 5, 7, 9, 10 |
| `phrygian` | 0, 1, 3, 5, 7, 8, 10 |
| `lydian` | 0, 2, 4, 6, 7, 9, 11 |
| `mixolydian` | 0, 2, 4, 5, 7, 9, 10 |
| `locrian` | 0, 1, 3, 5, 6, 8, 10 |
| `pentatonic_major` | 0, 2, 4, 7, 9 |
| `pentatonic_minor` | 0, 3, 5, 7, 10 |
| `blues` | 0, 3, 5, 6, 7, 10 |
| `chromatic` | 0–11 (no restriction — disables all scale checks) |

The `scale` directive is optional. When absent, no scale validation is performed.

---

### Channel Lock Annotation

A `lock` annotation restricts the **allowed pitches** on a channel or a named pattern to a **subset** of the declared scale. The lock is declared on the channel line:

```bax
channel 1 => inst lead  seq melody  lock=scale
channel 2 => inst bass  seq bassline lock=root+fifth
channel 3 => inst wave1 seq arp      lock=chord
channel 4 => inst snare seq drums
```

**Supported lock values:**

| Value | Allowed pitches (relative to scale root) |
|---|---|
| `scale` | All notes in the declared scale (same as no lock but validates against scale) |
| `root+fifth` | Scale degree 1 and 5 only (power chord / bass use) |
| `chord` | Scale degree 1, 3, 5 (major/minor triad based on scale) |
| `chord7` | Scale degree 1, 3, 5, 7 (seventh chord tones) |
| `octaves` | Root note only, any octave (pedal / drone) |

Lock resolution uses the **declared scale's third and seventh** to determine major/minor character (e.g. `C major` → chord = C E G; `A minor` → chord = A C E).

`lock` is optional per channel. Channels without a lock annotation are unrestricted regardless of the global `scale`.

A `lock` without a `scale` directive is a compile-time **error**: "lock requires a scale declaration".

---

### Validation Modes

A `scale` directive has an optional enforcement mode:

```bax
scale C major warn     # default — out-of-scale notes produce warnings
scale C major error    # out-of-scale notes are compile errors (playback blocked)
scale C major off      # scale is declared (for MIDI snapping / UI) but not validated
```

When `mode` is omitted, `warn` is the default.

The validation pass runs **after** pattern expansion, so transforms (like `oct(-1)`) are resolved before the check. The check operates on the final transposed pitch, not the source spelling.

---

### AST Changes

One new top-level field on the assembled AST:

```typescript
interface ScaleDirective {
  root: string;         // e.g. "C", "F#", "Bb"
  mode: string;         // e.g. "major", "dorian"
  enforcement: 'warn' | 'error' | 'off';
}

// Added to existing AST shape:
ast.scale?: ScaleDirective
```

One new optional field on channel definitions:

```typescript
// Existing ChannelNode, extended:
interface ChannelNode {
  // ... existing fields ...
  lock?: 'scale' | 'root+fifth' | 'chord' | 'chord7' | 'octaves';
}
```

No changes to `PatNode`, `SeqNode`, `InstNode`, or the ISM. The `lock` annotation is metadata used only during the validation pass and exported to the web UI for highlighting; it does not alter scheduling or timing.

---

### Parser Changes

#### `scale` directive

Add `scale <root> <mode> [enforcement]` to the Peggy grammar at the top-level statement level, alongside `bpm`, `chip`, and `volume`.

#### `lock=<value>` on channel lines

Extend the channel rule to accept an optional `lock=<value>` key-value token after the existing instrument/sequence tokens.

#### Validation pass

Add a new post-processing function `validateScaleLocks(ast)` to the parser's existing post-processing chain (after pattern expansion, before diagnostics finalisation).

```typescript
function validateScaleLocks(ast: AssembledAST): ParseDiagnostic[] {
  // 1. If no ast.scale, skip.
  // 2. Build the set of allowed chromatic pitch classes for the scale.
  // 3. For each channel with a lock, further restrict the allowed set.
  // 4. Walk pattern notes referenced by that channel's seq.
  // 5. For each note not in the allowed set, emit a diagnostic.
}
```

Diagnostic format:

```typescript
{
  level: 'warning' | 'error',   // per enforcement mode
  component: 'scale-lock',
  message: 'Note E4 is outside the declared lock "root+fifth" for channel 2 (C major root+fifth = C, G)',
  loc: { start: { line: 14, column: 8 }, end: { line: 14, column: 10 } }
}
```

---

### CLI Changes

No new CLI commands required. The existing `verify` command already surfaces `ast.diagnostics` entries. Scale lock violations appear automatically in `beatbax verify song.bax` output.

Optional future enhancement: `beatbax snap song.bax --scale` to emit a version with out-of-scale notes snapped to the nearest in-scale pitch.

---

### Web UI Changes

#### Monaco editor

- When `ast.scale` is present, the Problems panel surfaces scale lock diagnostics exactly as it does existing parser warnings.
- Squiggles appear under out-of-scale notes in the Monaco editor (using the existing diagnostics → markers pipeline).

#### Virtual keyboard / piano highlight

If the web UI has a virtual keyboard panel (or when one is added):

- In-scale notes are highlighted in the declared scale colour.
- Notes excluded by the active channel lock are dimmed.
- Out-of-scale notes are marked red.

#### MIDI step entry snapping

When MIDI step entry is armed (see `web-midi-step-entry.md`) and `ast.scale` is set, an optional **Scale Snap** toggle is exposed in the MIDI step entry settings:

- **Off (default)**: MIDI notes are inserted as-is; scale diagnostics may appear.
- **Snap**: incoming MIDI note-on pitches are snapped to the nearest in-scale (or in-lock) semitone before the note token is generated.
- **Filter**: MIDI notes outside the active scale/lock are silently discarded.

Scale snap does not modify existing notes — it only applies to newly entered notes during step entry.

```typescript
// Pseudo-code: snap a MIDI pitch to the nearest in-scale semitone
function snapToScale(midiPitch: number, scalePitchClasses: Set<number>): number {
  const pitchClass = midiPitch % 12;
  if (scalePitchClasses.has(pitchClass)) return midiPitch;
  // Search up and down by semitone
  for (let delta = 1; delta <= 6; delta++) {
    if (scalePitchClasses.has((pitchClass + delta) % 12)) return midiPitch + delta;
    if (scalePitchClasses.has((pitchClass - delta + 12) % 12)) return midiPitch - delta;
  }
  return midiPitch; // fallback: chromatic scale always hits
}
```

---

### Export Changes

No export format changes. The `scale` directive and `lock` annotations are compile-time metadata only and are not written into JSON ISM, MIDI SMF, or UGE output.

Future enhancement: MIDI export could optionally emit a key signature meta-event from `ast.scale`.

---

### Documentation Updates

- Add `scale` and `lock` to `docs/language/metadata-directives.md`
- Add a scale-awareness section to `TUTORIAL.md`
- Update `docs/formats/ast-schema.md` to document the new `scale` and `lock` fields

---

## Example Usage

```bax
chip gameboy
bpm 128
scale C major warn

inst lead  type=pulse1 duty=60 env={"level":12,"direction":"down","period":1,"format":"gb"}
inst bass  type=pulse2 duty=30 env={"level":7,"direction":"down","period":1,"format":"gb"}
inst arp   type=wave   wave=[8,9,10,12,13,14,14,15,15,15,14,14,13,12,10,9,8,6,5,3,2,1,1,0,0,0,1,1,2,3,5,6]
inst drums type=noise  env={"level":12,"direction":"down","period":1,"format":"gb"}

# Melody: any note in C major scale — F# would trigger a warning here
pat melody = C5 D5 E5 F5 G5 A5 B5 C6

# Bass: root and fifth only (C and G in any octave)
pat bassline = C3 . G2 . C3 . G2 .

# Arpeggios: chord tones (C E G)
pat arp_pat = C4 E4 G4 C5 C4 E4 G4 C5

seq main = melody
seq bass_seq = bassline
seq arp_seq = arp_pat

channel 1 => inst lead  seq main     lock=scale
channel 2 => inst bass  seq bass_seq lock=root+fifth
channel 3 => inst arp   seq arp_seq  lock=chord
channel 4 => inst drums seq drums_pat

play
```

### Violation example

```bax
scale C major error

pat melody = C5 D5 F#5 G5    # F#5 is not in C major

channel 1 => inst lead seq main lock=scale
```

Output from `beatbax verify`:

```
ERROR  [scale-lock] line 3, col 15: Note F#5 is outside the declared scale C major.
         Channel 1 lock=scale requires: C D E F G A B
Playback blocked. Fix the notes or change scale enforcement to `warn`.
```

---

## Testing Strategy

### Unit Tests

- `ScaleUtils` — `buildScalePitchClasses(root, mode)` returns correct semitone sets for all supported modes
- `ScaleUtils` — `snapToScale(pitch, pitchClasses)` snaps correctly for edge cases (tritone equidistance → prefer up)
- `validateScaleLocks` — emits no diagnostics when all notes conform
- `validateScaleLocks` — emits correct `warning` for out-of-scale notes in `warn` mode
- `validateScaleLocks` — emits `error` in `error` mode
- `validateScaleLocks` — emits nothing when enforcement is `off`
- `validateScaleLocks` — evaluates post-transform pitches (after `oct()`)
- Parser — `scale C major` parses to `ast.scale = { root: 'C', mode: 'major', enforcement: 'warn' }`
- Parser — `lock=root+fifth` on channel parses to `channel.lock = 'root+fifth'`
- Parser — `lock` without `scale` produces `error` diagnostic

### Integration Tests

- Full `.bax` file with `scale C major error` and violating note fails `verify`
- Full `.bax` file with `scale C major warn` and violating note succeeds `verify` with warning
- Full `.bax` file with `scale C major off` and violating note produces no diagnostics
- `lock=chord` in C major restricts to `{ C, E, G }` across octaves
- `lock=root+fifth` in A minor restricts to `{ A, E }` across octaves
- MIDI step entry snap function correctly maps Db → C in C major

---

## Migration Path

Fully additive. Existing `.bax` files without `scale` or `lock` are unchanged in behaviour. No migration required.

---

## Implementation Checklist

- [ ] Add `scale` directive to Peggy grammar
- [ ] Add `lock=<value>` to channel grammar rule
- [ ] Add `ScaleDirective` and `lock` to AST TypeScript types
- [ ] Implement `buildScalePitchClasses(root, mode)` utility
- [ ] Implement `validateScaleLocks(ast)` post-processing pass
- [ ] Wire `validateScaleLocks` into parser post-processing chain
- [ ] Update `ast.schema.json` for `scale` and `lock` fields
- [ ] Add `snapToScale` utility to web-ui MIDI step entry subsystem
- [ ] Add Scale Snap toggle to MIDI step entry settings UI
- [ ] Add scale squiggle highlighting to Monaco diagnostics pipeline
- [ ] Unit tests for all scale utilities
- [ ] Integration tests for validation pass
- [ ] Update `docs/language/metadata-directives.md`
- [ ] Update `docs/formats/ast-schema.md`
- [ ] Add scale section to `TUTORIAL.md`

---

## Future Enhancements

- `beatbax snap` CLI command — rewrite out-of-scale notes to nearest in-scale pitch, emitting fixed `.bax` source
- Per-pattern lock annotation as a pattern-level attribute (currently channel-level only)
- Chord-relative lock that tracks chord changes via a chord sequence
- MIDI key signature export from `ast.scale`
- Scale-aware virtual piano roll if a graphical editor is added
- User-defined custom scales via interval list: `scale C custom 0,2,3,6,7,10`
- Secondary scale (e.g. borrowed chords) declared as `scale2`

---

## Open Questions

1. **Tritone snap tie-breaking**: when a note is equidistant between two in-scale notes, should snap prefer up or down? Proposed default: **up** (conventional music theory).
2. **Transforms and scale check ordering**: should the scale check run before or after `oct()` and other transforms? Proposed: **after** (validate the sound the user will actually hear).
3. **Multi-key songs**: out of scope for v1. A `scale` directive applies for the whole file. Songs that modulate mid-song would need the `off` enforcement mode.
4. **Noise channel exclusion**: noise channels have no pitched notes. Should `lock` annotations be silently ignored on noise channels? Proposed: **yes** — noise channel notes are excluded from scale validation.

---

## References

- Ableton Live — Scale & Fold: https://www.ableton.com/en/manual/midi-scale/
- Bitwig — Note FX Scale: https://www.bitwig.com/
- `docs/language/metadata-directives.md` — existing global directives
- `docs/formats/ast-schema.md` — AST shape and diagnostics
- `docs/features/web-midi-step-entry.md` — MIDI step entry feature
- `packages/engine/src/parser/` — Peggy grammar and post-processing

---

## Additional Notes

The `scale` and `lock` system is intentionally **declarative and passive** — it never silently rewrites notes in the source file. The only automatic rewriting happens in the MIDI step entry path (where the user explicitly enables snap mode). All other enforcement is via diagnostics. This preserves BeatBax's determinism guarantee and keeps the source file as the single source of truth.
