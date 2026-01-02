---
title: Extended AST Types for Instrument Properties
status: draft
authors: ["kadraman"]
created: 2025-12-29
issue: "https://github.com/kadraman/beatbax/issues/24"
---

## Summary

This feature introduces structured AST types for multi-field instrument properties that are currently expressed as comma-separated strings in `.bax` files (for example `env=15,down,7`). The goal is to normalize and prefer typed objects in the AST so downstream code (renderers, exporters, tools) can rely on a single, validated shape instead of re-parsing CSV strings in multiple places.

**Scope**: normalize `env`, `sweep` (already supported), and `noise`-style multi-field properties. Numeric scalar props such as `duty` or `wave` arrays remain unchanged.

## Motivation

- Reduce parsing duplication across parser/renderer/exporter
- Safer downstream code: fewer fragile CSV parses and fewer mutation surprises
- Better tooling: UIs and codemods can consume typed objects instead of guessing semantics
- Smooth migration: keep CSV input supported but normalize to structured AST and emit a deprecation-style warning

## Current State

- `sweep` already has a hybrid implementation: parser accepts CSV and a structured object literal and normalizes it. This project seeks parity for other multi-field props.
- Many songs in the repo and the wild use CSV forms like `env=15,down,7` which must remain playable.

## Proposal

1. Accept both legacy CSV forms and JSON-style object literals in the parser.
2. Normalize (coerce) CSV inputs into structured AST objects during parsing so downstream code always receives typed objects.
3. Emit a single-run warning when parsing CSV-style multi-field props, encouraging migration to structured literals.
4. Provide a codemod to migrate songs to the new structured form.

Only make updates to the default parser (Peggy grammar) - do not make any updates to legacy parser.

## AST Types (suggested)

Add these interfaces to `packages/engine/src/parser/ast.ts`.

```typescript
export interface EnvelopeAST {
  level: number; // 0..15
  direction: 'up' | 'down' | 'none';
  period: number; // envelope timing period (ticks)
}

export interface SweepAST {
  time: number; // 0..7
  direction: 'up' | 'down' | 'none';
  shift: number; // 0..7
}

export interface NoiseAST {
  clockShift?: number;
  widthMode?: 7 | 15;
  divisor?: number;
}

export interface InstrumentNode {
  name: string;
  type: string; // 'pulse1'|'pulse2'|'wave'|'noise'
  duty?: number;
  wave?: number[];
  env?: EnvelopeAST | string | null;   // parser will normalize to EnvelopeAST when possible
  sweep?: SweepAST | string | null;    // already supported; keep union for compatibility
  noise?: NoiseAST | string | null;
}
```

Keep union types initially (`object | string`) to preserve backward compatibility while encouraging tooling to consume the structured form.

## Parser Normalization Rules

- Heuristic: when a property value begins with `{` and ends with `}`, `JSON.parse()` it. Require strict JSON (double quotes) to keep the parser simple.
- If the value is a CSV string (contains `,`), parse into the corresponding structured shape and perform shallow validation (types/ranges). Example for `env`:
  - `level` -> integer 0..15
  - `direction` -> 'up'|'down'|'none'
  - `period` -> integer >= 0
- Store the structured object on the AST node. Also record a small metadata flag (optional) indicating the value was normalized from CSV to support tooling that wants to rewrite files.
- Emit `console.warn()` (or parser logger) once per parsing run when CSV-forms are encountered, e.g.:

```
Deprecated: env=15,down,7 parsed and normalized to env={"level":15,"direction":"down","period":7}. Prefer structured literal.
```

## Deprecation & Migration Strategy

- Continue accepting CSV strings to avoid breaking existing songs, but normalize them in the AST.
- Provide a codemod (`scripts/codemods/env-to-object.js`) with `--dry-run` and `--apply` that converts CSV `env`/`noise`/`sweep` usages into structured JSON literals in `.bax` files.

## Examples

Legacy (accepted):

```
inst bass type=pulse2 duty=25 env=10,down
```

Structured (preferred):

```
inst bass type=pulse2 duty=25 env={"level":10,"direction":"down","period":0}
```

Combined example:

```
inst lead type=pulse1 duty=50 env={"level":15,"direction":"down","period":7} sweep={"time":7,"direction":"up","shift":3}
```

## Implementation Notes

1. Parser: update `packages/engine/src/parser/index.ts` to detect object-literal props and CSV props, JSON.parse object-literals, and convert CSV to structured objects using dedicated parsers (e.g. `parseEnvelope`, `parseSweep`, `parseNoise`).
2. AST: add the interfaces above to `packages/engine/src/parser/ast.ts`. Keep unions for a transitional period.
3. Consumers: update renderers, UGE writer/reader, and exporters to prefer structured objects. If they encounter a string, rely on the parser having already normalized it where possible.
4. Tests: add unit tests for parsing structured literals and CSV normalization; add integration tests asserting rendering parity.
5. Codemod: add a small Node script under `scripts/` that rewrites files or outputs diffs for review.

## Testing Strategy

- Unit tests:
  - parse structured `env` literal → expect `EnvelopeAST` fields
  - parse CSV `env` → expect normalized `EnvelopeAST` and a warning
  - parse structured `noise`/`sweep` → normalized shapes
- Integration tests:
  - Existing `.bax` songs that use CSV must render identically after normalization (audio/PCM tests already in repo)
  - UGE export/import round-trip preserves structured fields

## Developer Checklist

- [ ] Add `EnvelopeAST`, `NoiseAST`, `SweepAST` to `packages/engine/src/parser/ast.ts`
- [ ] Add `parseEnvelope`, `parseNoise` helpers in appropriate modules
- [ ] Update parser to detect and normalize object-literals and CSVs
- [ ] Emit deprecation warnings when CSV forms are parsed
- [ ] Add codemod under `scripts/` with `--dry-run`/`--apply`
- [ ] Add unit and integration tests
- [ ] Audit renderers/exporters to use structured AST shapes

## See Also

- `docs/features/pulse-sweep-support.md` — sweep implementation and examples
- `docs/uge-v6-spec.md` — UGE format and instrument encoding

## Notes

This document intentionally takes a conservative approach: accept legacy inputs but normalize at parse-time. The parser normalization approach reduces downstream complexity while enabling a gradual migration to explicitly structured `.bax` files.
