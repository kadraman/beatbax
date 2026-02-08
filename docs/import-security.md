# Import Security

This document describes the security measures implemented in BeatBax's import resolution system to prevent path traversal attacks and unauthorized file access.

## Overview

When BeatBax processes `import` statements in `.bax` and `.ins` files, it validates all import paths to ensure they cannot access files outside the intended project directories. This prevents malicious files from reading sensitive system files or escaping the project sandbox.

**As of February 2026**, BeatBax requires explicit import prefixes to clarify import intentions and enhance security:
- `local:` prefix for local file system imports (CLI only)
- `https://` or `github:` for remote imports (CLI and browser)
- Browser environments block all local imports for security

## Security Measures

### 1. Import Prefix Requirement

All imports must use explicit prefixes to indicate their source:

```
// ✅ VALID - Local file import (CLI only)
import "local:lib/common.ins"
import "local:instruments/drums.ins"

// ✅ VALID - Remote imports (CLI and browser)
import "https://raw.githubusercontent.com/user/repo/main/file.ins"
import "github:user/repo/main/file.ins"

// ❌ REJECTED - Missing prefix
import "lib/common.ins"
import "instruments/drums.ins"
```

This requirement ensures:
- Import intentions are explicit and clear
- Prevents accidental file system access
- Enables browser security (see Browser Security section below)
- Makes code more auditable and secure

### 2. Browser Security

When running in a browser environment, BeatBax automatically blocks local file imports:

```
// In browser - BLOCKED with security error
import "local:lib/common.ins"  
// Error: Local imports are not supported in the browser for security reasons.
//        Import "local:lib/common.ins" cannot be loaded.
//        Use remote imports (https:// or github:) instead, or run in CLI for local file access.

// In browser - ALLOWED
import "https://example.com/instruments/drums.ins"
import "github:beatbax/instruments-gb/main/melodic.ins"
```

**Browser Detection:**
The engine uses `typeof window !== 'undefined'` to detect browser contexts and enforce this restriction automatically. This prevents browser-based attacks that could attempt to read local file system contents.

**CLI Warnings:**
When using `--browser` flag with songs containing local imports, the CLI displays a warning:
```
⚠️  Warning: This song contains N local file import(s) which will be blocked by browser security.
   The browser will display an error when attempting to load this song.
   To play this song in the browser, replace local imports with remote imports (https:// or github:).
```

### 3. Path Traversal Prevention

Import paths containing `..` **as a path segment** are rejected to prevent directory traversal attacks:

```
# ❌ REJECTED - path traversal with .. segments
import "local:../../../etc/passwd"
import "local:lib/../../secrets/keys.txt"
import "local:subdir/../../../outside/file.ins"
import "local:lib/.."

# ✅ ALLOWED - filenames containing ".." as part of the name
import "local:lib/drums..backup.ins"
import "local:lib/file..old.ins"
import "local:lib/my..version2.ins"
```

The validation uses a path segment check (regex: `/(^|\/)\.\.($|\/)/`) which:
- **Blocks** `.` when preceded by `/` or start-of-string AND followed by `/` or end-of-string
- **Allows** `..` as part of a filename (e.g., `drums..backup.ins`)

This prevents path traversal attacks while allowing legitimate filenames that happen to contain two consecutive dots.

### 4. Absolute Path Restriction

By default, absolute paths are **not allowed** in import statements:

```
// ❌ REJECTED by default - Unix absolute path
import "/etc/passwd"
import "/var/www/data.ins"

// ❌ REJECTED by default - Windows absolute path
import "C:/Windows/System32/config/sam"
import "D:\\secrets\\passwords.txt"
```

This ensures that imports are always relative to the project structure.

### 5. Allowed Directory Validation

Even after passing initial validation, the **resolved** path must be within one of the allowed directories:

- The directory containing the importing file (base directory)
- Any configured search paths

If the resolved path falls outside these directories, the import is rejected:

```
// Example: importing from /project/main.bax
import "lib/common.ins"  // ✅ resolves to /project/lib/common.ins (allowed)
```

## Configuration

### Default Behavior

By default, only relative imports within the project directory and configured search paths are allowed:

```typescript
import { resolveImports } from '@beatbax/engine';

const resolved = resolveImports(ast, {
  baseFilePath: '/project/songs/main.bax',
  searchPaths: ['/project/lib'],
  // absolutePaths are NOT allowed by default
});
```

### Allowing Absolute Paths

For advanced use cases (e.g., shared instrument libraries in system directories), you can enable absolute paths:

```typescript
const resolved = resolveImports(ast, {
  baseFilePath: '/project/main.bax',
  searchPaths: ['/usr/share/beatbax/instruments'],
  allowAbsolutePaths: true,  // Enable absolute paths
});
```

**Important:** Even with `allowAbsolutePaths: true`, path traversal using `..` is still rejected. Absolute paths must still resolve to an allowed directory (search paths).

## Valid Import Patterns

### Local Imports (CLI Only)

```
// Import from same directory
import "local:common.ins"

// Import from subdirectory
import "local:lib/drums.ins"
import "local:instruments/bass.ins"

// Import from nested subdirectories
import "local:lib/chiptune/gameboy/pulse.ins"
```

### Remote Imports (CLI and Browser)

```
// HTTPS URL
import "https://raw.githubusercontent.com/user/repo/main/instruments.ins"

// GitHub shorthand
import "github:user/repo/main/instruments.ins"
```

### Absolute Imports (When Enabled)

```typescript
// With allowAbsolutePaths: true and appropriate searchPaths
import "/usr/share/beatbax/instruments/standard.ins"
import "C:/BeatBax/Library/drums.ins"
```

## Error Messages

When security validation fails, BeatBax provides clear error messages:

### Missing Import Prefix

```
Error: Invalid import path "lib/common.ins": local file imports must use "local:" prefix.
Use "local:lib/common.ins" instead.
Remote imports should use "https://" or "github:" prefix.
```

### Browser Security Violation

```
Error: Local imports are not supported in the browser for security reasons.
Import "local:lib/common.ins" cannot be loaded.
Use remote imports (https:// or github:) instead, or run in CLI for local file access.
```

### Path Traversal Detected

```
Error: Invalid import path "local:../../../etc/passwd":
path traversal using ".." is not allowed for security reasons
```

### Absolute Path Not Allowed

```
Error: Invalid import path "local:/etc/passwd":
absolute paths are not allowed for security reasons
```

### Outside Allowed Directories

```
Error: Security violation: import path "local:../../outside/file.ins"
resolves to "/outside/file.ins" which is outside the allowed directories
```

## Best Practices

### For Users

1. **Use `local:` prefix** for all local file imports in CLI
2. **Use remote imports** (`https://` or `github:`) when sharing or for browser playback
3. **Organize imports** in a dedicated directory (e.g., `lib/` or `instruments/`)
4. **Never trust** `.bax` files from untrusted sources without inspection
5. **Configure search paths** instead of using absolute paths when possible
6. **Test in browser** to ensure remote imports work correctly

### For Tool Developers

1. **Never enable `allowAbsolutePaths`** without explicit user consent
2. **Validate and sanitize** any user-provided search paths
3. **Log security rejections** for audit purposes
4. **Consider sandboxing** when executing untrusted `.bax` files
5. **Use virtual file systems** for testing to avoid real file system access

## Implementation Details

The security validation happens in two stages:

1. **Pre-resolution validation** - Checks import path syntax before resolution
   - Rejects `..` segments
   - Rejects absolute paths (unless allowed)

2. **Post-resolution validation** - Verifies resolved path is within allowed directories
   - Uses normalized paths for comparison
   - Checks against base directory and all search paths

This two-stage approach provides defense in depth, catching both obvious attacks and subtle bypasses.

## Testing

The security features are covered by comprehensive tests in `packages/engine/tests/resolver.imports.test.ts`:

```bash
npm test -- resolver.imports.test
```

Test cases include:
- Path traversal attempts with various `..` patterns
- Unix and Windows absolute path formats
- Valid relative paths in subdirectories
- Absolute paths with `allowAbsolutePaths` enabled
- Path traversal rejection even with `allowAbsolutePaths`
- Resolved path validation against allowed directories

## Security Considerations

### Not a Complete Sandbox

These measures protect against basic path traversal attacks but do not provide complete sandboxing:

- **Symlink attacks** are not prevented (symlinks are followed by the file system)
- **Time-of-check-time-of-use (TOCTOU)** races could occur in theory
- **Resource exhaustion** (import bombs) is not prevented
- **Malicious .bax code execution** is out of scope (BeatBax is a data format, not a programming language with arbitrary code execution)

### When Additional Security Is Required

For high-security environments or running untrusted code:

1. Use a **virtual file system** or **chroot jail**
2. Run BeatBax in a **container** or **VM**
3. Implement **resource limits** (max file size, max imports, max recursion depth)
4. **Audit all imports** before execution
5. Use **signed/verified** instrument libraries only

## Migration Guide

**Breaking Change (February 2026)**: All local imports now require the `local:` prefix.

```
# Before (no longer accepted)
import "lib/common.ins"
import "instruments/drums.ins"

# After (required)
import "local:lib/common.ins"
import "local:instruments/drums.ins"

# Or use remote imports for browser compatibility
import "github:beatbax/instruments-gb/main/common.ins"
```

**Automatic Migration:**
Update all import statements in your `.bax` and `.ins` files by adding the `local:` prefix to file paths that don't start with `https://` or `github:`.

## Related Documentation

- [Remote Imports](features/remote-imports.md) - Using https:// and github: imports
- [Instruments Guide](instruments.md) - How to define and organize instruments
- [Tutorial](../TUTORIAL.md) - Basic usage and examples
