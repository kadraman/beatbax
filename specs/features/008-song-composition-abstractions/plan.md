# Implementation Plan: Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### AST Changes

| Node | Fields | Notes |
|------|--------|-------|
| `AliasDecl` | `name`, `items[]` | Immutable seq-item list |
| `SeqCatRhs` | `operands: { ref, modifiers? }[]` | Used inside `SeqDecl.rhs` |
| `SectionDecl` | `name`, `roles: { role, items[] }[]` | Desugars to seq decls |
| `FormDecl` | `name`, `sectionNames[]`, `defaults?` | Optional inst defaults |
| `ChannelRole` | `role`, `formRef` | On `ChannelStmt` in v1 |
| `IncludeStmt` | `path`, `prefix?` | Extends import resolver |

Update `packages/engine/src/parser/ast.ts` and `schema/ast.schema.json`.

### Parser Changes

- **Peggy** (`grammar.peggy`): new statement rules `AliasStmt`, `SectionStmt`, `FormStmt`, `IncludeStmt`; extend `SeqRhs` with `CatExpr`; extend `ChannelStmt` with optional `role` + `form` clauses.
- **Structured recovery**: partial parses for incomplete `section { }` blocks.
- **Expansion pass** (new or extend `resolver.ts` / `refExpander.ts`):
  1. Collect declarations (`pat`, `seq`, `effect`, `alias`, `section`, `form`, `include`)
  2. Resolve include graph + prefixes (v1 rules)
  3. Resolve aliases (including forward refs); detect and report alias cycles
  4. Expand `section` → synthetic `seq` decls (with collision checks)
  5. Expand `form` + `channel role` → `cat` seqs + standard `channel` lines
  6. Expand `seq` RHS `cat()` → flat seq item list
  7. Continue existing pat/seq/modifier expansion unchanged

### CLI Changes

- `beatbax play` / `export` — no flags required; expansion is automatic.
- `beatbax expand song.bax` (optional) — print desugared `.bax` to stdout or `-o` for debugging.
- Diagnostics cite **original** line numbers (source maps in expansion pass).

### Web UI Changes

- Syntax highlighting and completions for `section`, `form`, `alias`, `cat`, `include`.
- Help panel: new **Song structure** section with `cat` / `section` / `form` examples.
- CodeLens: optional “expand section” preview showing generated seq names.
- New **Song Structure Outline** panel: list sections, roles, forms, and channel role bindings with jump-to-definition.
- New **Arrangement Timeline** preview: section order rendered per channel role to expose misalignment early.
- Add **Expanded Source** side panel (toggle) that shows desugared output and keeps diagnostics mapped to original lines.
- Add quick refactors in editor actions:
  - Convert repeated channel seq lists to `cat(...)` timeline seq
  - Extract repeated seq item runs into `alias`
  - Create missing role stubs in sections referenced by active `form`
- Add Beginner Mode authoring actions:
  - “Create section (simple)” snippet: `section <name> use <mel> <harm> <bass> <perc>`
  - “Create form timeline” wizard using draggable section chips (`>` output)
  - “Auto-map channels” assistant to emit `channel auto ...` and preview expanded lines
- Extend folding provider to fold `section { ... }` blocks and form-centric regions (not comment-only folding).
- New Song Wizard structure templates include form-first examples for long-song workflows.
- Add settings toggle: “Beginner authoring mode” (UI affordance only; does not alter parser strictness).
- No change to playback engine beyond parsing/resolution.

**Implementation anchors in current web-ui codebase:**

- Language tokens/directives/completions: `apps/web-ui/src/editor/beatbax-language.ts`, `apps/web-ui/src/editor/top-level-directives.ts`, `apps/web-ui/src/editor/completion.ts`, `apps/web-ui/src/editor/completion-docs.ts`
- Existing CodeLens infrastructure: `apps/web-ui/src/editor/codelens-preview.ts`
- Existing quick-fix pipeline: `apps/web-ui/src/editor/code-actions.ts`
- Help panel sectioning: `apps/web-ui/src/panels/help-panel.ts`
- New Song Wizard templates: `apps/web-ui/src/panels/new-song-wizard.ts`
- Parse/resolve lifecycle events: `apps/web-ui/src/playback/playback-manager.ts`, `apps/web-ui/src/utils/event-bus.ts`

### Export Changes

- None for ISM/VGM/UGE — expanded song is identical to hand-written `seq`/`channel` equivalent.
- UGE order list length unchanged for equivalent arrangements.

### Documentation Updates

- [Tutorial](https://beatbax.com/docs/tutorial/overview) — song form workflow
- `docs/features/complete/sequence-arrangements.md` — cross-link “successor ergonomics”
- New demo: `songs/features/song_composition_demo.bax`
- Migrate one section of `crypt_of_fallen_kings.bax` as reference (optional, in implementation PR)

---

## Testing Strategy

### Unit Tests

| Area | Cases |
|------|-------|
| `cat()` | Two/three operands; per-operand modifiers; nested cat; unknown seq ref |
| `alias` | Use in seq RHS; duplicate name error; forward references; alias-to-alias acyclic success; cycle error |
| `section` | Role expansion naming; empty section; duplicate role; generated-name collision with explicit seq |
| `form` + `role` | Four-channel expansion matches hand-written `crypt` channel lines; missing role in referenced section errors |
| `include` | Local file; prefix; duplicate symbol error; circular include; repeated include without prefix error |
| Expansion idempotence | Expand twice === expand once |

### Integration Tests

- Parse + `resolveSong` on `song_composition_demo.bax` — event counts match equivalent manual song.
- Golden ISM snapshot: expanded form vs manual `sequence_demo.bax` / crypt excerpt.
- Parse + `resolveSong` on a Beginner Mode fixture (`section ... use`, `form ... > ...`, `channel auto ...`) equals canonical expanded source fixture.
- Web UI: parse diagnostics for malformed `section` block.
- Web UI: outline/timeline panels reflect updated `form` order after edits.
- Web UI: expanded-source panel maps diagnostics to authored line/column correctly.
- Web UI: Beginner Mode helpers generate valid canonical output and preserve round-trip edits.

---

## Migration Path

- **Fully backward compatible** — existing `.bax` files unchanged.
- Authors may adopt incrementally:
  1. Replace long `channel` lists with `seq timeline = cat(...)`.
  2. Introduce `alias` for repeated motif lists.
  3. Refactor multi-section songs into `section` + `form`.
- No migration tool required; optional `beatbax expand` helps manual refactors.

---
