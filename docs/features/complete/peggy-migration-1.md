---
title: "Peggy grammar iteration 1: migrate .bax parsing to Peggy (keep AST + language stable)"
status: completed
authors: ["kadraman"]
created: 2026-01-02
issue: "https://github.com/kadraman/beatbax/issues/26"
---

## Summary

Migrate BeatBax `.bax` parsing from the bespoke tokenizer + hand-written parser (`packages/engine/src/parser/tokenizer.ts` + `packages/engine/src/parser/index.ts`) to a Peggy-based grammar and generated parser.

The migration must preserve AST shape and semantics so downstream systems (resolver, expanders, scheduler, exporters, CLI, demo Web UI) continue to work without changes.

## Problem Statement

The current parser/tokenizer is handwritten and regex-heavy, which tends to create:
- grammar spread across multiple ad-hoc functions rather than a single authoritative grammar
- inconsistent diagnostics and limited source location reporting for certain errors
- fragility around edge-cases (quoted strings, parenthesized groups, transforms, comments)
- higher cost to evolve syntax (new directives, effects, transforms) because parsing and tokenization are tightly coupled

We already have a proposed Chevrotain migration ([docs/features/chevrotain-migration.md](docs/features/chevrotain-migration.md)), but this document proposes Peggy instead as the primary grammar implementation.

## Proposed Solution

### Summary

Peggy now defines the authoritative BeatBax grammar. The generated parser produces the existing `AST` model via grammar actions and a thin wrapper that preserves legacy semantics. The legacy parser remains available behind a feature flag during the deprecation window.

Key requirements:
- Keep the public parser API stable: `parse(source: string): AST` (exported from `packages/engine/src/parser/index.ts`).
- Preserve existing AST schema expectations (see [docs/ast-schema.md](docs/ast-schema.md) and `schema/ast.schema.json`).
- Preserve existing language surface and examples (`songs/*.bax`, `docs/*.md`).
- Improve and standardize parse error messages with line/column where possible.

### Example Syntax

No language surface changes are introduced by this migration.

```bax
chip gameboy
bpm 128
time 4

a:  # comments supported
inst lead  type=pulse1 duty=50 env=12,down
pat melody = C5 E5 G5 C6
seq main = melody melody:oct(+1)
channel 1 => inst lead seq main
play
```

### Example Usage

Consumers continue to call the same entrypoint:

```ts
import { parse } from '@beatbax/engine';

const ast = parse(sourceText);
```

## Implementation Plan

### AST Changes

- No breaking AST changes.
- Optional enhancement (non-breaking): attach source position metadata to nodes (`pos: { line, column, offset }`), but only if this does not alter JSON schema expectations for existing tooling.

### Parser Changes

Add a new Peggy parser implementation while keeping the current parser available during the transition.

Proposed file layout (initial):
- `packages/engine/src/parser/peggy/grammar.peggy` — authoritative grammar
- `packages/engine/src/parser/peggy/index.ts` — wrapper: `parseWithPeggy(source)`
- `packages/engine/src/parser/peggy/generated/*` — generated output (committed or built)

Entry-point wiring:
- `packages/engine/src/parser/index.ts` continues exporting `parse(source: string): AST`.
- Parser selection: Peggy is the default; set `BEATBAX_PARSER=legacy` to opt into the legacy parser during the deprecation window. All engine tests pass under Peggy.

Parity strategy (implemented):
- Grammar parses pattern/sequence RHS directly: notes, rests, group/token repeats, duration suffixes, inline `inst`, `inst(name,N)` temporary overrides, quoted token splits, transforms/modifiers, and inline effects like `<pan:...>`.
- Shorthand pattern definitions without the `pat` keyword (e.g., `foo = C4`) remain supported.
- Indentation and whitespace tolerance match legacy behavior; comments (`#`/`//`) are honored.

Diagnostics:
- Normalize syntax error reporting into a single `BeatBaxParseError` shape (message + location + context snippet).
- Ensure CLI (`verify`) and Web UI show line/column.

### CLI Changes

No CLI surface changes.

Proposed internal change:
- `verify` could print improved errors (line/column and caret), but output format should remain stable enough not to break tests.

### Web UI Changes

No UI changes required. The web UI consumes the engine parser; better errors should automatically improve UX.

### Export Changes

No changes. Exporters operate on resolved song model / ISM and should be unaffected if AST parity holds.

### Documentation Updates

- If parsing behavior changes in subtle ways (e.g., stricter whitespace), update:
  - [docs/metadata-directives.md](docs/metadata-directives.md)
  - [TUTORIAL.md](TUTORIAL.md)
  - any examples that depended on legacy quirks

## Testing Strategy

### Unit Tests

- Grammar-level tests (Peggy):
  - parse minimal valid programs
  - parse common directives (`chip`, `bpm`, `time`, `stepsPerBar`, `ticksPerStep`)
  - parse metadata directives including triple-quoted strings
  - parse edge-case identifiers (hyphens/underscores)
  - parse comments and blank lines

- Parity tests:
  - Run the legacy parser and Peggy parser over a corpus (`songs/*.bax`, selected `tmp/*.bax` if present).
  - Compare resulting ASTs after normalizing any optional metadata fields.

### Integration Tests

- Run the full engine test suite with Peggy enabled. **Status: ✅ all suites passing under `BEATBAX_PARSER=peggy`.**
- Validate that JSON/MIDI/UGE exports for sample songs are unchanged.

## Migration Path

1. Introduce Peggy grammar and a new `parseWithPeggy()` function. **(Done)**
2. Add a test matrix that runs parsing-related tests against both implementations. **(Done via env flag + existing suites)**
3. Fix parity gaps until `BEATBAX_PARSER=peggy` passes the full suite. **(Done)**
4. Flip the default to Peggy; keep legacy parser for one deprecation window. **(Done)**
5. Remove legacy tokenizer/parser once parity and performance are acceptable. **(Planned)**

Rollback:
- Legacy parser remains available behind `BEATBAX_PARSER=legacy` until removal.

## Implementation Checklist

- [x] Add `peggy` dependency and a generation strategy (build-time script)
- [x] Create `packages/engine/src/parser/peggy/grammar.peggy`
- [x] Generate parser module and add `parseWithPeggy()` wrapper
- [x] Add feature flag wiring in `packages/engine/src/parser/index.ts`
- [x] Add unit tests for grammar and transformer (covered by existing suite under Peggy flag)
- [x] Add AST parity tests against `songs/*.bax` (covered by full suite + sample songs)
- [x] Run full test suite with Peggy enabled in CI/local (`BEATBAX_PARSER=peggy`)
- [x] Switch default parser to Peggy
- [X] Deprecate legacy tokenizer/parser

## Future Enhancements

- Better error recovery and multi-error reporting (PEGs typically fail fast; a dedicated strategy may be required).
- Expose CST/parse-tree for editor tooling (future VS Code extension / LSP).
- Use the same grammar as the basis for syntax highlighting and/or a Tree-sitter grammar (separate effort).

## Open Questions

1. **Generated parser output**: commit generated output to the repo, or generate during build (`prebuild`)?
2. **TypeScript typing**: do we want generated TypeScript output, or JS output with a typed wrapper?
3. **Error format stability**: should CLI error messages be considered stable API for tooling?
4. **Performance target**: do we need a parse-time budget for large `.bax` files?

## References

- Peggy: https://github.com/peggyjs/peggy
- PEG parsing (conceptual): https://en.wikipedia.org/wiki/Parsing_expression_grammar
- Existing parser entrypoint: `packages/engine/src/parser/index.ts`
- Metadata directives: [docs/metadata-directives.md](docs/metadata-directives.md)

## Additional Notes

This migration should be strictly non-breaking at the language and AST levels. If the Peggy grammar is initially more strict than the legacy parser (e.g., around whitespace or quoting), treat those as compatibility bugs unless explicitly approved.

---

## Appendix: Initial Peggy grammar (iteration seed)

This is an intentionally minimal starter grammar. It aims to parse the *structure* of a `.bax` file into a simple statement list that can be transformed into the existing BeatBax AST.

- Notes:
- Pattern bodies and sequence `rhs` were initially captured as raw text to preserve legacy behavior. This approach is now deprecated: the Peggy grammar emits structured fields (`rhsEvents` for patterns and `rhsItems` for sequences). The legacy `rhs` string remains temporarily for compatibility during rollout; prefer consuming structured fields directly.
- Comments use `# ...` to end-of-line.
- Strings support single, double, and triple quotes for metadata.

```peggy
// BeatBax PEGGY grammar (seed)
// File: packages/engine/src/parser/peggy/grammar.peggy

{
  // Helper to build a basic location object.
  function loc(location) {
    return {
      start: { offset: location.start.offset, line: location.start.line, column: location.start.column },
      end:   { offset: location.end.offset,   line: location.end.line,   column: location.end.column }
    };
  }
}

Program
  = BlankLines stmts:StatementList? BlankLines {
      return { nodeType: "Program", body: stmts ?? [] };
    }

StatementList
  = head:Statement tail:(BlankLines Statement)* {
      const out = [head];
      for (const t of tail) out.push(t[1]);
      return out;
    }

Statement
  = ChipStmt
  / BpmStmt
  / TimeStmt
  / StepsPerBarStmt
  / TicksPerStepStmt
  / SongMetaStmt
  / InstStmt
  / PatStmt
  / SeqStmt
  / ChannelStmt
  / PlayStmt
  / ExportStmt

// -----------------------------
// Top-level directives
// -----------------------------

ChipStmt
  = s:$("chip" !IdentChar) __ name:Identifier {
      return { nodeType: "ChipStmt", chip: name, loc: loc(location()) };
    }

BpmStmt
  = $("bpm" !IdentChar) __ value:Int {
      return { nodeType: "BpmStmt", bpm: value, loc: loc(location()) };
    }

TimeStmt
  = $("time" !IdentChar) __ value:Int {
      return { nodeType: "TimeStmt", time: value, loc: loc(location()) };
    }

StepsPerBarStmt
  = $("stepsPerBar" !IdentChar) __ value:Int {
      return { nodeType: "StepsPerBarStmt", stepsPerBar: value, loc: loc(location()) };
    }

TicksPerStepStmt
  = $("ticksPerStep" !IdentChar) __ value:Int {
      return { nodeType: "TicksPerStepStmt", ticksPerStep: value, loc: loc(location()) };
    }

SongMetaStmt
  = $("song" !IdentChar) __ key:Identifier __ value:MetaString {
      return { nodeType: "SongMetaStmt", key, value, loc: loc(location()) };
    }

PlayStmt
  = $("play" !IdentChar) args:(_ RestOfLine)? {
      // `args` is a raw string like: "auto repeat" (optional)
      return { nodeType: "PlayStmt", args: args ? args[1] : "", loc: loc(location()) };
    }

ExportStmt
  = $("export" !IdentChar) __ fmt:Identifier __ path:MetaString {
      return { nodeType: "ExportStmt", format: fmt, path, loc: loc(location()) };
    }

// -----------------------------
// Definitions
// -----------------------------

InstStmt
  = $("inst" !IdentChar) __ name:Identifier __ rhs:RestOfLine {
      // (Deprecated) In earlier iterations `rhs` was a raw string like: "type=pulse1 duty=50 env=12,down".
      // The Peggy parser can emit structured instrument fields; prefer parsing those instead of consuming `rhs` directly.
      return { nodeType: "InstStmt", name, rhs, loc: loc(location()) };
    }

PatStmt
  = $("pat" !IdentChar) __ name:Identifier _ "=" _ rhs:RestOfLine {
      // (Deprecated) `rhs` was a raw string like: "C5 E5 G5 C6" or "inst sn C6 C6".
      // Newer parser iterations produce `rhsEvents` (structured pattern tokens); consume those when available.
      return { nodeType: "PatStmt", name, rhs, loc: loc(location()) };
    }

SeqStmt
  = $("seq" !IdentChar) __ name:Identifier _ "=" _ rhs:RestOfLine {
      // (Deprecated) `rhs` was a raw string like: "melody bass_pat melody:oct(-1)".
      // Prefer `rhsItems` (structured sequence items) emitted by the Peggy grammar.
      return { nodeType: "SeqStmt", name, rhs, loc: loc(location()) };
    }

ChannelStmt
  = $("channel" !IdentChar) __ ch:Int __ "=>" __ rhs:RestOfLine {
      // (Deprecated) `rhs` was a raw string like: "inst lead seq main:oct(-1)".
      // Newer parsers may provide structured channel specs; prefer parsing those where possible.
      return { nodeType: "ChannelStmt", channel: ch, rhs, loc: loc(location()) };
    }

// -----------------------------
// Lexical rules
// -----------------------------

MetaString
  = TripleString / QuotedString

TripleString
  = '"""' chars:TripleChar* '"""' {
      return chars.join("");
    }

TripleChar
  = !'"""' c:. { return c; }

QuotedString
  = '"' chars:DoubleChar* '"' { return chars.join(""); }
  / "'" chars:SingleChar* "'" { return chars.join(""); }

DoubleChar
  = '\\' c:. { return c; }
  / !'"' c:. { return c; }

SingleChar
  = '\\' c:. { return c; }
  / !"'" c:. { return c; }

RestOfLine
  = s:$( (!Newline .)* ) { return s.trim(); }

Identifier
  = $([A-Za-z_][A-Za-z0-9_\-]*)

IdentChar
  = [A-Za-z0-9_\-]

Int
  = digits:$([0-9]+) { return parseInt(digits, 10); }

Newline
  = "\r\n" / "\n" / "\r"

BlankLines
  = (_ Newline)*

WS0 = [ \t]*
WS1 = [ \t]+

_  = (WS1 / Comment)*
__ = (WS1 / Comment)+

Comment
  = "#" (!Newline .)*
```

Next iteration targets for the grammar:
- Parse `inst(name,N)` temporary overrides as structured nodes.
- Parse transforms (`:oct(+1)`, `:rev`, `:slow`, etc.) into structured arrays.
- Parse pattern event tokens (notes, rests, inline `inst`) directly instead of `RestOfLine`.

These items remain open; see [docs/features/peggy-migration-2.md](docs/features/peggy-migration-2.md) for the detailed plan to complete them and remove the remaining legacy expression path.
