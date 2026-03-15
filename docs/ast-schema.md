**AST Schema**

- **Schema**: [schema/ast.schema.json](schema/ast.schema.json#L1)
-- **Validator (CLI)**: [scripts/validate-ast.cjs](scripts/validate-ast.cjs#L1)

Usage:

1. Install validator dependency (project root):

```bash
npm install --save-dev ajv
```

2. Validate an AST JSON file:

```bash
node scripts/validate-ast.cjs path/to/ast.json
# or, after `npm link` or installing the package globally:
validate-ast path/to/ast.json
```

## Parser Diagnostics (`ast.diagnostics`)

The parser attaches a `diagnostics` array to the AST when it detects semantic issues during its post-processing pass. Hard errors that prevent playback have `level: 'error'`; informational issues have `level: 'warning'`.

### `ParseDiagnostic` type

```typescript
interface ParseDiagnostic {
  level: 'error' | 'warning';
  component: string;       // e.g. 'parser'
  message: string;
  loc?: SourceLocation;    // { start: { line, column }, end: { line, column } }
}
```

### Conditions that produce an `error`

| Condition | Example |
|---|---|
| Unknown `chip` name | `chip atari` |
| Unknown `play` flag | `play loopx` |
| Instrument has unknown `type` | `inst x type=triangle` |
| Channel has no instrument | `channel 1 => seq main` |
| Channel references undefined instrument | `channel 1 => inst ghostInst seq main` |
| Channel has no seq/pat | `channel 1 => inst lead` |
| Channel references undefined seq/pat | `channel 1 => inst lead seq mainX` |
| Sequence references undefined pat/seq | `seq s = patA ghostPat` |

### Conditions that produce a `warning`

| Condition | Example |
|---|---|
| Instrument has unknown property key | `inst x type=pulse1 dutyx=50` |
| Pattern contains unrecognized token | `pat m = C5 ZZ G5` |

### Consuming diagnostics

```typescript
const ast = parse(source);
for (const d of ast.diagnostics ?? []) {
  if (d.level === 'error') {
    // d.message, d.loc?.start.line, d.loc?.start.column
  }
}
```

The CLI `verify` command and the web UI Problems panel both consume `ast.diagnostics` directly — no inline validation logic is needed in consumers.

---

Notes:
- The schema uses a node-based AST model: top-level `body` is an array of nodes. Each node includes a `nodeType` discriminant (e.g. `PatternDef`, `SequenceDef`, `InstDef`, etc.).
 - The schema is intentionally conservative about instrument `params` and pattern `transforms` to remain compatible with the existing AST; extend `params` and transform shapes as needed.
 - Structured parsing is enabled by default. Optional `patternEvents` and `sequenceItems` maps supplement legacy `pats`/`seqs` token maps and are materialized by the resolver when structured parsing is enabled.
 - Deprecation: legacy `rhs` string fields are deprecated in favor of structured `tokens` (for patterns) and `items` (for sequences). The JSON Schema (`schema/ast.schema.json`) marks `rhs` as deprecated; prefer consuming structured fields directly.
- If you want an XML Schema (XSD) or TypeScript types generated from this JSON Schema, I can add conversion tooling (quick follow-up).
