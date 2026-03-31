**AST Schema**

- **Schema**: [schema/ast.schema.json](schema/ast.schema.json#L1)
- **Validator (CLI)**: [scripts/validate-ast.cjs](scripts/validate-ast.cjs#L1)

The schema validates the **assembled AST** returned by `parseWithPeggy` — the structured object with top-level `pats`, `insts`, `seqs`, `channels`, and optional fields (`effects`, `patternEvents`, `sequenceItems`, `arranges`, `imports`, `bpm`, `chip`, `volume`, `play`, `metadata`, `diagnostics`).

Usage:

1. Install validator dependency (project root):

```bash
npm install --save-dev ajv
```

2. Export an AST JSON file and validate it:

```bash
# Export the assembled AST to JSON first:
node -e "
import('./packages/engine/dist/parser/peggy/index.js').then(m => {
  const fs = require('fs');
  fs.writeFileSync('ast.json', JSON.stringify(m.parseWithPeggy(fs.readFileSync('song.bax','utf8')), null, 2));
});"

# Then validate:
node scripts/validate-ast.cjs ast.json
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
- The schema validates the assembled `AST` interface returned by `parseWithPeggy`. This is the structured object produced after statement assembly — not the raw `ProgramNode` body array from the Peggy grammar.
- Top-level required properties are `pats`, `insts`, `seqs`, and `channels`. All other properties are optional.
- `InstrumentNode` allows additional properties for chip-specific extensibility (e.g. `gm`, `__loc`).
- `ChannelNode` includes `seqSpecTokens` (raw sequence spec token array from the RHS).
- Structured parsing is enabled by default. `patternEvents` and `sequenceItems` supplement the legacy `pats`/`seqs` token maps with structured event objects.
- `duty` accepts any string value (e.g. `"50"`, `"12.5"`, `"75"`). The Game Boy hardware supports 12.5, 25, 50, and 75 percent duty cycles.
- If you want TypeScript types generated from this JSON Schema, a conversion step using `json-schema-to-typescript` can be added.
