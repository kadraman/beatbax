---
title: Parser Improvements 1 - Space Tolerance and Pattern Name Validation
status: closed 
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/14"
---

## Overview

Improve the BeatBax parser to be more forgiving and helpful when handling common user errors:

1. **Flexible spacing around `*` operators**
2. **Warnings for problematic pattern names**

## 1. Space Tolerance for Repetition Operators

### Problem
Currently, the parser required `*` operators to be immediately adjacent to the closing `)` or token:
```bax
pat Fill = (C5 E5 G5 C6)*4      # ✅ Worked
pat Fill = (C5 E5 G5 C6) * 4    # ❌ Failed (parsed as 6 tokens)
```

### Solution
Update the parser to normalizes spaces around `*` operators automatically. All of these formats should now work correctly:

```bax
# All of these produce 16 tokens:
pat Fill = (C5 E5 G5 C6)*4      # No spaces
pat Fill = (C5 E5 G5 C6) *4     # Space before *
pat Fill = (C5 E5 G5 C6)* 4     # Space after *
pat Fill = (C5 E5 G5 C6) * 4    # Spaces on both sides
```

This should also works for inline token repetition:
```bax
pat Kick = C3*4                 # No spaces
pat Kick = C3 * 4               # With spaces
```

### Implementation
[`packages/engine/src/patterns/expand.ts`](packages/engine/src/patterns/expand.ts#L78-L81): Update the `expandPattern` function to include preprocessing to normalize spacing:

```typescript
text = text.replace(/\)\s*\*\s*(\d+)/g, ')*$1');
text = text.replace(/([^\s\(\)])\s*\*\s*(\d+)/g, '$1*$2');
```

## 2. Pattern Name Validation

### Problem
Single-letter pattern names (especially A-G) can be confused with note names when referenced in sequences. For example:

```bax
pat E = C5 E5 G5 C6
seq lead = A B E D    # Is 'E' a pattern or a note?
```

In the sequence expander, if pattern `E` doesn't exist in the patterns map, it is treated as a literal token (note `E`), causing silent failures.

### Solution
The parser should warn when pattern names that could be confused with notes are used. This includes:
1. **Single-letter names (A-G)**
2. **Note-like names with octaves (e.g., C4, Bb1, G-1)**

```
[BeatBax Parser] Warning: Pattern name 'E' may be confused with a 
note name. Consider using a more descriptive name like 'E_pattern' 
or 'E_pat'.
```

Single-letter names outside A-G (like `X`, `Y`, `Z`) should not trigger warnings, as they don't conflict with note names.

### Best Practices

**Good pattern names:**
- `Fill`, `Intro`, `Chorus`, `Verse`
- `A_melody`, `B_bass`, `C_harmony`
- `Lead1`, `Bass2`, `Drum1`
- `X`, `Y`, `Z` (single letters that aren't notes)

**Problematic pattern names:**
- `A`, `B`, `C`, `D`, `E`, `F`, `G` (single-letter note names)
- `C4`, `Bb1`, `G-1` (notes with octaves)
- `a`, `b`, `c`, etc. (case-insensitive)

### Implementation
[`packages/engine/src/parser/index.ts`](packages/engine/src/parser/index.ts#L19-L24): Pattern name validation should be added during parsing:

```typescript
const warnProblematicPatternName = (name: string): void => {
  const isSingleLetterNote = /^[A-Ga-g]$/.test(name);
  const isNoteWithOctave = /^[A-Ga-g][#b]?-?\d+$/.test(name);

  if (isSingleLetterNote || isNoteWithOctave) {
    console.warn(`[BeatBax Parser] Warning: Pattern name '${name}' may be confused with a note name...`);
  }
};
```

## Testing

Comprehensive tests should be added in [`packages/engine/tests/parser-space-tolerance.test.ts`](packages/engine/tests/parser-space-tolerance.test.ts):

- ✅ All spacing variations around `*` operators
- ✅ Pattern name validation warnings
- ✅ Integration test with full song parsing
- ✅ All 26 test suites continue to pass

## Migration Guide

### For Existing `.bax` Files

**No action required!** The parser improvements should be backward-compatible:
- Files without spaces around `*` continue to work
- Pattern names that triggered the warning still work (they just show a warning)

### For New `.bax` Files

You should now be able to use more natural spacing:
```bax
# Before (required):
pat Arp = (C4 E4 G4)*4

# After (also works):
pat Arp = (C4 E4 G4) * 4
```

And avoid problematic pattern names:
```bax
# Instead of:
pat E = C5 E5 G5 C6

# Use:
pat Fill = C5 E5 G5 C6
# or
pat E_pattern = C5 E5 G5 C6
```

## Future Considerations

### Potential Enhancements
1. **Error messages** instead of just warnings for single-letter pattern names
2. **Pattern name conflict detection** - warn if a pattern name shadows an existing note or identifier
3. **Syntax highlighting** integration to visually distinguish pattern references from notes
4. **Reserved word checking** for pattern and instrument names

### Breaking Changes (Not Implemented)
The following were considered but rejected to maintain backward compatibility:
- Disallow single-letter pattern names entirely
- Require a specific prefix/suffix for all pattern names
- Case-sensitive pattern name matching

## References

- Original issue: [songs/sample.bax](songs/sample.bax) had patterns with spaces around `*` that weren't expanding correctly
- Implementation: [`packages/engine/src/patterns/expand.ts`](packages/engine/src/patterns/expand.ts), [`packages/engine/src/parser/index.ts`](packages/engine/src/parser/index.ts)
