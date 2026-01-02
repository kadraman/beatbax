**AST Schema**

- **Schema**: [schema/ast.schema.json](schema/ast.schema.json#L1)
-- **Validator (CLI)**: [bin/validate-ast.cjs](bin/validate-ast.cjs#L1)

Usage:

1. Install validator dependency (project root):

```bash
npm install --save-dev ajv
```

2. Validate an AST JSON file:

```bash
node bin/validate-ast.cjs path/to/ast.json
# or, after `npm link` or installing the package globally:
validate-ast path/to/ast.json
```

Notes:
- The schema uses a node-based AST model: top-level `body` is an array of nodes. Each node includes a `nodeType` discriminant (e.g. `PatternDef`, `SequenceDef`, `InstDef`, etc.).
- The schema is intentionally conservative about instrument `params` and pattern `transforms` to remain compatible with the existing AST; extend `params` and transform shapes as needed.
- Structured parsing (behind `BEATBAX_PEGGY_EVENTS=1`) adds optional `patternEvents` and `sequenceItems` maps to the AST; these supplement legacy `pats`/`seqs` token maps and are materialized by the resolver when the flag is set.
- If you want an XML Schema (XSD) or TypeScript types generated from this JSON Schema, I can add conversion tooling (quick follow-up).
