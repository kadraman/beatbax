# Instrument Note Mapping - Feature Specification

**Status:** Implemented
**Priority:** MVP Enhancement
**Target:** percussion/noise channel workflows

> 📖 **User Guide:** For usage instructions and examples, see [instrument-note-mapping-guide.md](../instrument-note-mapping-guide.md)

## Problem

When using instrument names as pattern tokens (e.g., `snare`, `hihat`, `kick`), all named instruments currently export to the same default note value (C5/index 24) in UGE files. This is problematic for percussion programming where different drum sounds should map to different pitches:

```
inst snare type=noise gb:width=7 env=12,down
inst hihat type=noise gb:width=15 env=8,down

pat drums = snare hihat snare hihat  # All export as C5 - NOT IDEAL
```

In hUGETracker, percussion instruments typically use C7 (index 48) or other specific pitches to control the noise generator's frequency/timbre.

## Solution

Add an optional `note=` parameter to instrument definitions that specifies the default note/pitch to use when that instrument is referenced by name without an explicit note token. This is particularly useful for percussion:

```
inst snare type=noise gb:width=7 env=12,down note=C6
inst hihat type=noise gb:width=15 env=8,down note=C6
inst kick type=pulse1 duty=12.5 env=15,down note=C2

pat drums = snare hihat snare hihat  # Now exports: C6 C6 C6 C6 (displays as C-7 in hUGETracker)
```

## Syntax

```
inst <name> type=<type> [<params>...] note=<note>
```

Where `<note>` is:
- A standard note name: `C2`, `D#5`, `Bb7`, etc.
- For noise channel: typically `C5`-`C6` (exports as C-6 to C-7 in hUGETracker)
- For pulse channels: typically `C2`-`C4` for bass/kicks

**Important:** hUGETracker displays notes ONE OCTAVE HIGHER than BeatBax's MIDI notation. For example, `note=C6` in BeatBax exports as C-7 in hUGETracker.

## Behavior

1. **With explicit note:** `inst snare C5` → uses C5 (overrides instrument default)
2. **Named token only:** `snare` → uses instrument's `note=` value
3. **No `note=` parameter:** Falls back to C5 (index 24) for backward compatibility

## Examples

### Percussion Kit

```
chip gameboy
bpm 140

# Define percussion with specific pitches
inst kick_deep  type=pulse1 duty=12.5 env=15,down,1 note=C2
inst snare      type=noise  gb:width=7  env=13,down,1 note=C6
inst hihat_cl   type=noise  gb:width=15 env=6,down,1  note=C6
inst hihat_op   type=noise  gb:width=15 env=8,down,3  note=D6
inst tom_low    type=noise  gb:width=7  env=14,down,5 note=C5
inst tom_high   type=noise  gb:width=7  env=12,down,3 note=E5

# Use instrument names directly
pat kick_pat  = kick_deep . . . kick_deep . . .
pat snare_pat = . . . . snare . . .
pat hh_pat    = hihat_cl hihat_cl hihat_op hihat_cl

seq drums = kick_pat snare_pat hh_pat

channel 1 => seq drums:inst(kick_deep)
channel 4 => seq drums:inst(snare)
```

### Override Default Note

```
inst snare type=noise gb:width=7 env=13,down note=C6

# Use default note
pat p1 = snare . snare .  # Uses C6 (exports as C-7 in hUGETracker)

# Override per-note
pat p2 = inst(snare) C5 . C7 .  # Uses C5 and C7
```

## Implementation

### Parser Changes

Update instrument parser to accept `note=` parameter:

```typescript
// packages/engine/src/parser/peggy/grammar.peggy
InstStmt = "inst" __ name:Identifier __ params:RestOfLine {
  // Parse params including note=
}
```

### AST Changes

```typescript
// packages/engine/src/parser/ast.ts
export interface InstrumentNode {
  name: string;
  type: string;
  params: Record<string, any>;
  note?: string;  // NEW: Default note for named instrument tokens
  loc?: Loc;
}
```

### Song Resolver Changes

Pass instrument's default note to UGE export:

```typescript
// packages/engine/src/song/resolver.ts
if (typeof token === 'string' && insts[token]) {
  const inst = insts[token];
  let ev: ChannelEvent = {
    type: 'named',
    token,
    instrument: token,
    defaultNote: inst.note,  // NEW: Pass default note
  };
}
```

### UGE Export Changes

```typescript
// packages/engine/src/export/ugeWriter.ts (line ~1179)
} else if (event.type === 'named') {
  const namedEvent = event as any;
  const instIndex = resolveInstrumentIndex(/*...*/);

  // NEW: Use instrument's default note if specified
  let noteValue = 24; // Default C5
  if (namedEvent.defaultNote) {
    const parsedNote = noteNameToMidiNote(namedEvent.defaultNote, 0);
    if (parsedNote !== EMPTY_NOTE) {
      noteValue = parsedNote;
    }
  }

  cell = {
    note: noteValue,
    instrument: instIndex || 0,
    effectCode: 0,
    effectParam: 0,
    pan: namedPan,
  };
}
```

## Migration & Backward Compatibility

- **Existing files without `note=`:** Continue to use C5 (index 24) as default
- **Existing files with explicit notes:** Unaffected
- **No breaking changes:** This is purely additive

## Testing

```typescript
describe('instrument note mapping', () => {
  test('uses instrument default note for named tokens', () => {
    const src = `
      inst snare type=noise note=C7
      pat p = snare . snare .
      channel 4 => pat p inst snare
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    // Verify snare uses C7 (index 48) in UGE export
  });

  test('explicit note overrides instrument default', () => {
    const src = `
      inst snare type=noise note=C7
      pat p = inst(snare) C5
      channel 4 => pat p inst snare
    `;
    // Verify uses C5, not C7
  });
});
```

## Documentation Updates

- [instruments.md](../instruments.md) — add `note=` parameter documentation
- [uge-export-guide.md](../uge-export-guide.md) — document note mapping behavior
- [instrument-note-mapping-guide.md](../instrument-note-mapping-guide.md) — user-facing guide
- [TUTORIAL.md](../../TUTORIAL.md) — add percussion best practices

## Related Issues

- Percussion programming ergonomics
- hUGETracker interoperability for noise channel
- Named instrument token semantics
