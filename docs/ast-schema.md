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

Notes:
- The schema uses a node-based AST model: top-level `body` is an array of nodes. Each node includes a `nodeType` discriminant (e.g. `PatternDef`, `SequenceDef`, `InstDef`, etc.).
- The schema is intentionally conservative about instrument `params` and pattern `transforms` to remain compatible with the existing AST; extend `params` and transform shapes as needed.
- Structured parsing is enabled by default; `BEATBAX_PEGGY_EVENTS=0` can be used as a temporary opt-out. Optional `patternEvents` and `sequenceItems` maps supplement legacy `pats`/`seqs` token maps and are materialized by the resolver when structured parsing is enabled.
- If you want an XML Schema (XSD) or TypeScript types generated from this JSON Schema, I can add conversion tooling (quick follow-up).
