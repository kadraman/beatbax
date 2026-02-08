# Path Segment Validation Examples

## Valid Filenames with ".." substring

These filenames contain ".." as part of their name and are **allowed**:

```
local:lib/drums..backup.ins          ✅ Allowed
local:lib/file..old.ins              ✅ Allowed  
local:lib/my..version2.ins           ✅ Allowed
local:sounds/bass..808.ins           ✅ Allowed
local:.hidden..file.ins              ✅ Allowed
```

## Invalid Path Traversal Patterns

These use ".." as a path segment for directory traversal and are **rejected**:

```
local:../parent/file.ins             ❌ Rejected (starts with ..)
local:../../grandparent/file.ins     ❌ Rejected (multiple .. segments)
local:lib/../sibling/file.ins        ❌ Rejected (.. in middle)
local:lib/..                         ❌ Rejected (ends with ..)
local:./lib/../../../etc/passwd      ❌ Rejected (.. segments anywhere)
```

## Other Valid Dot Patterns

These contain dots but not ".." as a path segment:

```
local:lib/.hidden.ins                ✅ Allowed (hidden file)
local:lib/file.v2.ins                ✅ Allowed (version marker)
local:lib/drums.backup.old.ins       ✅ Allowed (multiple extensions)
local:...special.ins                 ✅ Allowed (three dots)
```

## Validation Logic

The regex `/(^|\/)\.\.($|\/)/` matches:
- `^` - start of string
- `\/` - forward slash
- `\.\.` - two literal dots
- `$` - end of string

This ensures ".." is only matched when it forms a complete path component.

### Examples:
- `../file` → Matches (^ followed by ..)
- `lib/../file` → Matches (/ followed by .. followed by /)
- `lib/..` → Matches (/ followed by .. followed by $)
- `file..txt` → **No match** (.. surrounded by letters, not slashes)
- `..hidden` → **No match** (.. followed by letters, not / or $)

## Implementation

See `packages/engine/src/song/importResolver.ts` line 78-85 for the validation code.

See `packages/engine/tests/resolver.imports.path-segment-validation.test.ts` for comprehensive test coverage.
