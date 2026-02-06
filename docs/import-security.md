# Import Security

This document describes the security measures implemented in BeatBax's import resolution system to prevent path traversal attacks and unauthorized file access.

## Overview

When BeatBax processes `import` statements in `.bax` and `.ins` files, it validates all import paths to ensure they cannot access files outside the intended project directories. This prevents malicious files from reading sensitive system files or escaping the project sandbox.

## Security Measures

### 1. Path Traversal Prevention

Import paths containing `..` segments are **always rejected**, regardless of configuration:

```
// ❌ REJECTED - path traversal
import "../../../etc/passwd"
import "lib/../../secrets/keys.txt"
import "subdir/../../../outside/file.ins"
```

Even if the resolved path would be within an allowed directory, any use of `..` in the import statement itself is forbidden to prevent confusion and potential security bypasses.

### 2. Absolute Path Restriction

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

### 3. Allowed Directory Validation

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

### Relative Imports (Always Safe)

```
// Import from same directory
import "common.ins"

// Import from subdirectory
import "lib/drums.ins"
import "instruments/bass.ins"

// Import from nested subdirectories
import "lib/chiptune/gameboy/pulse.ins"
```

### Absolute Imports (When Enabled)

```typescript
// With allowAbsolutePaths: true and appropriate searchPaths
import "/usr/share/beatbax/instruments/standard.ins"
import "C:/BeatBax/Library/drums.ins"
```

## Error Messages

When security validation fails, BeatBax provides clear error messages:

### Path Traversal Detected

```
Error: Invalid import path "../../../etc/passwd": 
path traversal using ".." is not allowed for security reasons
```

### Absolute Path Not Allowed

```
Error: Invalid import path "/etc/passwd": 
absolute paths are not allowed for security reasons
```

### Outside Allowed Directories

```
Error: Security violation: import path "../../outside/file.ins" 
resolves to "/outside/file.ins" which is outside the allowed directories
```

## Best Practices

### For Users

1. **Use relative paths** for all imports within your project
2. **Organize imports** in a dedicated directory (e.g., `lib/` or `instruments/`)
3. **Never trust** `.bax` files from untrusted sources without inspection
4. **Configure search paths** instead of using absolute paths when possible

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

## Related Documentation

- [Instruments Guide](instruments.md) - How to define and organize instruments
- [Tutorial](../TUTORIAL.md) - Basic usage and examples
- [Import Examples](import-examples.md) - Common import patterns and project structures
