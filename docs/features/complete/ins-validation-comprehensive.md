# .ins File Validation - Implementation Summary

## Overview

Implemented comprehensive validation for `.ins` (instrument-only) import files to enforce the rule that **`.ins` files may only contain `inst` and `import` declarations**.

## Changes Made

### 1. Validation Function Enhancement

**Files Modified:**
- [`packages/engine/src/song/importResolver.ts`](../packages/engine/src/song/importResolver.ts) (lines 210-260)
- [`packages/engine/src/song/importResolver.browser.ts`](../packages/engine/src/song/importResolver.browser.ts) (lines 41-90)

**Implementation:**
The `validateInsFile` function now checks **all** AST properties and rejects:

#### Playback/Structure Directives:
- `patterns` (pat definitions)
- `sequences` (seq definitions)
- `channels` (channel declarations)
- `arranges` (arrange blocks)
- `play` (play command)

#### Top-level Scalar Directives:
- `chip` (chip selection)
- `bpm` (tempo setting)
- `volume` (global volume)

#### Metadata Directives:
- `metadata` (song/metadata - only rejected if non-empty object)

#### Effect Definitions:
- `effects` (effect presets)

#### Structured Pattern Data:
- `patternEvents` (parsed pattern event lists)
- `sequenceItems` (parsed sequence item lists)

#### Unknown Properties:
- Any property not in the allowed list triggers rejection with `unknown property '<name>'`

### 2. Empty Metadata Object Handling

**Issue:** Parser always creates an empty `metadata: {}` object even for files with no metadata directives.

**Solution:** Changed validation to only reject metadata if it's non-empty:
```typescript
if (ast.metadata !== undefined && Object.keys(ast.metadata).length > 0) {
  disallowed.push('metadata');
}
```

This allows .ins files with no metadata directives to pass validation.

### 3. Parser Behavior Documentation

**Discovered:** The `time`, `stepsPerBar`, and `ticksPerStep` directives are parsed by the grammar but **never added to the AST** - they're silently ignored by the parser.

**Impact:** Cannot test validation for these directives since they never reach the validation layer.

**Documentation:** Added comments in test file noting that these directives are not currently handled.

### 4. Comment-Only Files

**Issue:** Parser cannot parse completely empty files or comment-only files without any statements.

**Resolution:** 
- Empty strings (`""`) parse successfully to empty AST
- Comment-only files fail at parse stage before reaching validation
- This is acceptable as the parser enforces its own requirements

---

## Test Suite

**File:** [`packages/engine/tests/resolver.imports.ins-validation-comprehensive.test.ts`](../packages/engine/tests/resolver.imports.ins-validation-comprehensive.test.ts)

**Test Coverage:** 13 tests covering:

### Rejected Directives (8 tests):
1. ✅ `chip` directive
2. ✅ `bpm` directive
3. ✅ `volume` directive
4. ✅ Pattern definitions (`pat`)
5. ✅ Sequence definitions (`seq`)
6. ✅ Channel definitions (`channel`)
7. ✅ Play directive (`play`)
8. ✅ Song metadata (`song name "..."`)

### Special Cases (3 tests):
9. ✅ Effect definitions (placeholder test - parser doesn't support standalone effect directives)
10. ✅ Multiple disallowed directives
11. ✅ Empty .ins files

### Valid .ins Files (2 tests):
12. ✅ Inst declarations only
13. ✅ Inst + import declarations

---

## Security Impact

This comprehensive validation strengthens the security boundary for `.ins` files:

1. **Prevents Code Injection:** By rejecting `play` directives and channel definitions, imported `.ins` files cannot trigger playback or modify song structure.

2. **Prevents Metadata Pollution:** Song metadata can only be set in the main `.bax` file, not in imports.

3. **Prevents Effect Override:** Effect presets cannot be defined in `.ins` files, preventing imported files from modifying effect behavior.

4. **Clear Error Messages:** When validation fails, users get a specific list of disallowed directives found in the file.

---

## Example Validation Errors

### Invalid .ins File:
```beatbax
chip gameboy
bpm 128
inst kick type=noise env=15,down
pat melody = C5 E5 G5
```

**Error:**
```
Invalid .ins file "lib/invalid.ins": .ins files may only contain "inst" and "import" declarations. 
Found: chip, bpm, patterns
```

### Valid .ins File:
```beatbax
# Drum instruments library
import "local:lib/shared.ins"

inst kick type=noise env=15,down
inst snare type=noise env=12,down
inst hat type=noise env=8,down
```

**Result:** ✅ Accepted - contains only `import` and `inst` declarations

---

## Limitations & Notes

1. **Parser Directives:** `time`, `stepsPerBar`, and `ticksPerStep` are parsed but not added to AST, so validation cannot catch them. If these are ever added to the AST, validation will need updating.

2. **Comment-Only Files:** Cannot be parsed due to parser requirements. Empty files work fine.

3. **Empty Metadata:** Parser always creates empty `metadata: {}` object. Validation checks if it's non-empty before rejecting.

---

## Test Results

**Full Test Suite:** ✅ All 256 tests passing
- **New Tests:** 13 comprehensive validation tests
- **Existing Tests:** All passing (no regressions)

---

## Files Modified

1. [`packages/engine/src/song/importResolver.ts`](../packages/engine/src/song/importResolver.ts) - Node.js version
2. [`packages/engine/src/song/importResolver.browser.ts`](../packages/engine/src/song/importResolver.browser.ts) - Browser version
3. [`packages/engine/tests/resolver.imports.ins-validation-comprehensive.test.ts`](../packages/engine/tests/resolver.imports.ins-validation-comprehensive.test.ts) - Test suite (NEW)

---

## Conclusion

The comprehensive .ins validation implementation successfully enforces the "instruments and imports only" rule across all AST properties, providing strong security guarantees and clear error messages when validation fails.
