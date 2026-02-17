---
title: "Parser Error Recovery for Multiple Syntax Errors"
status: proposed
authors: ["GitHub Copilot"]
created: 2026-02-16
issue: ""
---

## Summary

Enhance the BeatBax parser to detect and report multiple syntax errors in a single parse pass, improving the developer experience by allowing users to see all syntax issues at once rather than fixing them one at a time.

## Problem Statement

Currently, the BeatBax parser (Peggy-based PEG parser) stops at the first syntax error it encounters:

```
saq
channel 1 => inst leadZ seq lead_seqx lead_seqy
```

When `saq` is encountered, parsing stops. The user must:
1. Fix `saq`
2. Re-parse
3. Discover the next syntax error
4. Repeat

This differs from modern IDE experiences (VS Code, IntelliJ, etc.) where multiple syntax errors are shown simultaneously, allowing users to fix multiple issues before re-parsing.

**Current behavior:**
- Only shows first syntax error
- Requires iterative "fix-parse-discover" cycle
- Slower feedback loop for users with multiple typos

**Expected behavior:**
- Show all detectable syntax errors in one pass
- Allow users to fix multiple issues before re-validation
- Match behavior of mainstream language servers

## Proposed Solution

### Summary

Implement error recovery in the Peggy parser to allow parsing to continue after encountering syntax errors. The parser will:

1. Detect a syntax error
2. Record the error with location information
3. Apply recovery heuristics to skip the problematic section
4. Continue parsing the rest of the document
5. Return a partial AST along with all collected errors

### Recovery Strategies

Several error recovery strategies should be implemented:

#### 1. **Statement-Level Recovery**
When an invalid statement is encountered, skip to the next line that starts with a valid keyword:

```
saq          # Error: unknown keyword
channel 1 => # Skip to here and continue
```

#### 2. **Token Synchronization**
For incomplete statements, synchronize at known delimiters:
- Newlines (statement boundaries)
- Keywords (`inst`, `pat`, `seq`, `channel`, etc.)
- Block boundaries (future feature)

#### 3. **Insertion Recovery**
Suggest missing tokens when the expected token is clear:

```
inst lead type=pulse1 duty=50  # Missing env parameter
# Could suggest: "Did you mean: inst lead type=pulse1 duty=50 env=..."
```

#### 4. **Fallback Nodes**
Create placeholder AST nodes for unparseable sections:

```typescript
{
  nodeType: 'ErrorStmt',
  errorMessage: 'Unknown keyword "saq"',
  loc: { start: { line: 1, col: 1 }, end: { line: 1, col: 4 } }
}
```

### Error Types to Detect

1. **Unknown Keywords**: `saq`, `seqq`, `instx`
2. **Missing Operators**: `channel 1 inst lead` (missing `=>`)
3. **Incomplete Statements**: `inst lead type=` (missing value)
4. **Invalid Syntax**: `channel abc =>` (invalid channel number)
5. **Unclosed Strings**: `inst lead wave=[1,2,3` (missing `]`)

### Example Output

**Input:**
```
saq
channel 1 => inst leadZ seq lead_seqx
patt melody = C5 E5 G5
channel 2 => inst bass seq
```

**Current behavior:**
```
Error: Unknown keyword 'saq'. Valid keywords: chip, bpm, time, inst, pat, seq, channel, play, export, import (line 1, col 1)
```

**With error recovery:**
```
Error: Unknown keyword 'saq'. Valid keywords: chip, bpm, time, inst, pat, seq, channel, play, export, import (line 1, col 1)
Warning: Channel 1 references undefined instrument 'leadZ' (line 2, col 18)
Warning: Channel 1 references undefined sequence 'lead_seqx' (line 2, col 29)
Error: Unknown keyword 'patt'. Did you mean 'pat'? (line 3, col 1)
Error: Channel 2 statement incomplete: missing sequence name (line 4, col 21)
```

## Implementation Plan

### Phase 1: Peggy Grammar Enhancement

**Effort**: High
**Priority**: Medium
**Time Estimate**: 2-3 weeks

Modify `packages/engine/src/parser/peggy/grammar.peggy`:

1. **Add error rules to the grammar:**

```peggy
Statement
  = ChipStmt
  / BpmStmt
  / TimeStmt
  / InstStmt
  / PatStmt
  / SeqStmt
  / ChannelStmt
  / PlayStmt
  / ExportStmt
  / ImportStmt
  / ErrorStmt  // NEW: Catch-all error production

ErrorStmt
  = error:InvalidKeyword { return { nodeType: 'ErrorStmt', error } }
  / error:IncompleteStmt { return { nodeType: 'ErrorStmt', error } }

InvalidKeyword
  = word:$([A-Za-z_]+) !ValidKeyword {
      return {
        type: 'unknown-keyword',
        keyword: word,
        message: `Unknown keyword '${word}'`,
        loc: location()
      }
    }

ValidKeyword
  = "chip" / "bpm" / "time" / "inst" / "pat" / "seq" / "channel" / "play" / "export" / "import"
```

2. **Implement synchronization points:**
   - After any error, skip to next newline
   - Continue parsing from next statement
   - Track all errors in parser state

3. **Preserve location information:**
   - All error nodes must include precise `loc` data
   - Enable IDE to show red squiggles at correct positions

### Phase 2: Parser Entry Point Changes

**Effort**: Medium
**Time Estimate**: 3-5 days

Modify `packages/engine/src/parser/peggy/index.ts`:

```typescript
export interface ParseResult {
  ast: AST;
  errors: ParseError[];
  hasErrors: boolean;
}

export interface ParseError {
  message: string;
  loc: SourceLocation;
  type: 'syntax' | 'recovery';
}

export function parseWithPeggy(source: string): ParseResult {
  const errors: ParseError[] = [];

  try {
    const program = peggyParse(source, {
      // Enable error recovery
      grammarSource: source,
      onError: (error: any) => {
        errors.push({
          message: enhanceParseError(error, source).message,
          loc: error.location,
          type: error.recoverable ? 'recovery' : 'syntax'
        });
      }
    }) as ProgramNode;

    // Build AST even if errors occurred
    const ast = buildAST(program);

    return {
      ast,
      errors,
      hasErrors: errors.length > 0
    };
  } catch (e: any) {
    // Fatal error - couldn't recover
    return {
      ast: createEmptyAST(),
      errors: [{
        message: enhanceParseError(e, source).message,
        loc: e.location,
        type: 'syntax'
      }],
      hasErrors: true
    };
  }
}

// Maintain backward compatibility
export function parse(source: string): AST {
  const result = parseWithPeggy(source);
  if (result.hasErrors) {
    // Throw first error for backward compatibility
    throw new Error(result.errors[0].message);
  }
  return result.ast;
}
```

### Phase 3: Web UI Integration

**Effort**: Low
**Time Estimate**: 1-2 days

Update `apps/web-ui/src/main-phase2.ts`:

```typescript
try {
  const parseResult = parseWithPeggy(content);

  // Show all syntax errors
  if (parseResult.hasErrors) {
    const diagnostics = parseResult.errors.map(err =>
      parseErrorToDiagnostic(err, content)
    );
    diagnosticsManager.setDiagnostics(diagnostics);

    // Emit all parse errors to Output panel
    parseResult.errors.forEach(err => {
      eventBus.emit('parse:error', { error: err, message: err.message });
    });
  }

  // Continue with validation even if parse errors exist
  // (but skip validation if AST is too corrupted)
  if (parseResult.ast && !isCriticallyBroken(parseResult.ast)) {
    const warnings = validateAST(parseResult.ast, content);
    // ... rest of validation
  }
} catch (e: any) {
  // Fatal error handling
}
```

### Phase 4: CLI Considerations

**Effort**: Low
**Time Estimate**: 1 day

For CLI, maintain strict behavior:
- Show all errors but exit with failure code
- Optional `--continue-on-error` flag for analysis mode

### Phase 5: Documentation Updates

**Effort**: Low
**Time Estimate**: 1 day

1. Update parser documentation
2. Add examples to TUTORIAL.md
3. Document error recovery behavior in README.md

## Testing Strategy

### Unit Tests

1. **Multiple syntax errors detected:**
```typescript
test('shows multiple unknown keywords', () => {
  const source = `
    saq
    channel 1 => inst lead
    patt melody = C5
  `;
  const result = parseWithPeggy(source);
  expect(result.errors).toHaveLength(2);
  expect(result.errors[0].message).toContain('saq');
  expect(result.errors[1].message).toContain('patt');
});
```

2. **Recovery allows valid statements to parse:**
```typescript
test('parses valid statements after errors', () => {
  const source = `
    saq
    inst lead type=pulse1
  `;
  const result = parseWithPeggy(source);
  expect(result.errors).toHaveLength(1);
  expect(result.ast.insts.lead).toBeDefined();
});
```

3. **Location information preserved:**
```typescript
test('error locations are accurate', () => {
  const source = `line1\nsaq\nline3`;
  const result = parseWithPeggy(source);
  expect(result.errors[0].loc.start.line).toBe(2);
});
```

### Integration Tests

1. **Web UI shows multiple errors:**
   - Type multiple syntax errors
   - Verify all show red squiggles
   - Verify Output panel shows all errors

2. **Validation works with partial AST:**
   - Syntax error in line 1
   - Valid code with semantic errors in line 3
   - Both types of errors should show

3. **Error recovery doesn't create false positives:**
   - Ensure recovered parsing doesn't report spurious errors

## Migration Path

### Backward Compatibility

The existing `parse()` function will maintain current behavior:
- Throws on first error
- Returns AST only if parsing succeeds
- No breaking changes for existing consumers

New `parseWithPeggy()` function provides enhanced behavior:
- Returns result object with AST and errors
- Gradual migration path for consumers

### Migration Steps

1. **Week 1**: Implement error recovery in grammar
2. **Week 2**: Add `parseWithPeggy()` function alongside `parse()`
3. **Week 3**: Update Web UI to use new function
4. **Week 4**: Testing and refinement
5. **Future**: Deprecate old `parse()` in favor of new API

## Implementation Checklist

- [ ] Research Peggy error recovery mechanisms
- [ ] Design error node types for AST
- [ ] Implement ErrorStmt production in grammar
- [ ] Add synchronization rules (skip to next statement)
- [ ] Create `parseWithPeggy()` with error collection
- [ ] Update `enhanceParseError()` to handle multiple errors
- [ ] Add unit tests for multiple syntax errors
- [ ] Update Web UI to display multiple errors
- [ ] Update Output panel to show all syntax errors
- [ ] Test with real-world error scenarios
- [ ] Document error recovery behavior
- [ ] Add examples to TUTORIAL.md
- [ ] Consider CLI `--continue-on-error` flag

## Future Enhancements

### Smart Suggestions

For common typos, suggest corrections:
```
Error: Unknown keyword 'patt'. Did you mean 'pat'?
Error: Unknown keyword 'instx'. Did you mean 'inst'?
```

### Quick Fixes

Provide VS Code-style quick fixes:
- "Change 'patt' to 'pat'"
- "Insert missing '='"
- "Remove invalid keyword"

### Partial Playback

Allow playback of valid sections even when errors exist:
```
Warning: Errors detected in channels 2 and 4. Playing channels 1 and 3 only.
```

### Error Severity Levels

Distinguish between:
- **Errors**: Cannot proceed (invalid syntax)
- **Warnings**: Can proceed with assumptions (undefined references during editing)
- **Info**: Suggestions (could optimize pattern)

## Open Questions

1. **How many errors should we report?**
   - All errors (could be overwhelming)
   - First N errors per file (e.g., 10)
   - First N errors per section

2. **How to handle cascading errors?**
   - One syntax error might cause multiple false errors
   - Need smart filtering to avoid noise

3. **Should we parse incomplete lines during editing?**
   - User is typing: `inst lead type=`
   - Should we wait for completion or show error immediately?

4. **Performance impact?**
   - Error recovery may slow down parsing
   - Need benchmarks with large files

5. **Should CLI have lenient mode?**
   - Strict mode: fail on any error (current)
   - Lenient mode: continue and report all errors
   - Analysis mode: show errors but don't fail

## References

- [Peggy Parser Documentation](https://peggyjs.org/documentation.html)
- [PEG Parser Error Recovery Techniques](https://dl.acm.org/doi/10.1145/512927.512945)
- [VS Code Language Server Protocol - Diagnostics](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#diagnostic)
- [Tree-sitter Error Recovery](https://tree-sitter.github.io/tree-sitter/using-parsers#error-handling)
- [Resilient Parsing in Rust Analyzer](https://rust-analyzer.github.io/blog/2020/09/16/resilient-parsing.html)

## Additional Notes

**Complexity vs. Value Trade-off:**

This feature significantly improves UX but requires substantial engineering effort. The implementation should be phased:

1. **Phase 1** (MVP): Basic error recovery - skip to next valid statement
2. **Phase 2**: Smart suggestions and quick fixes
3. **Phase 3**: Advanced recovery with partial AST building

**Alternative Approaches:**

1. **Switch to Tree-sitter**: More robust error recovery built-in, but requires rewriting grammar
2. **Dual-mode parsing**: Keep simple PEG for CLI, add resilient parser for IDE
3. **Post-parse validation**: Don't modify parser, improve validation to catch more issues

**Recommendation:**

Start with basic error recovery in Peggy (Phase 1). Measure impact on UX and performance. If successful and valuable, continue with phases 2 and 3. If Peggy limitations prove too restrictive, consider Tree-sitter migration as a separate project.
