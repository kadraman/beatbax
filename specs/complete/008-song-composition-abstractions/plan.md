# Implementation Plan: Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes

**Spec**: [spec.md](spec.md) | **Updated**: 2026-10-28

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — syntax and desugar rules taken only from [spec.md](spec.md) (Phase 1–2 + Beginner Mode; Phase 3–4 deferred)
- [x] AST / ISM / scheduler / expansion impact identified — new parse stmts + composition expansion pass that **lowers to existing** `pat` / `seq` / `channel` before `expandAllSequences` / ISM; **no** scheduler or ISM shape changes
- [x] Plugins remain isolated; core does not gain plugin dependencies — all work in `@beatbax/engine` + shared `@beatbax/app-core` editor tokens
- [x] Determinism and compatibility preserved (or migration documented) — fully backward compatible; sample songs migrate after Phase 2 with event-count / resolve parity
- [x] Tests planned for new behavior — see Testing Strategy and [tasks.md](tasks.md)

## Implementation Plan

### AST Changes

| Node / field | Fields | Notes |
|------|--------|-------|
| `AliasDecl` (authored map) | `name` → `SequenceItem[]` + loc | Immutable; expand into seq RHS |
| `SeqCatRhs` | on seq: `catOperands` or expand at assemble | Flatten to `sequenceItems` before resolve |
| `SectionDecl` | `name`, `roles: { role, items[] }[]`, loc | Desugars to `seq <section>_<role>` |
| `FormDecl` | `name`, `sectionNames[]`, `defaults?`, loc | Used with channel role binding |
| Channel extras | `role?`, `formRef?` | Expand to `seq` + standard channel |
| Beginner sugar | parsed then desugared | `section … use`, `form … > …`, `channel auto` |

Update `packages/engine/src/parser/ast.ts` and `schema/ast.schema.json`. Optional authored maps (`aliases`, `sections`, `forms`) may remain on AST for tooling; resolution MUST see only lowered seqs/channels.

### Parser Changes

- **Peggy** (`packages/engine/src/parser/peggy/grammar.peggy`): `AliasStmt`, `SectionStmt` (block + Beginner `use`), `FormStmt` (`,` and `>`), extend `SeqRhs` with `CatExpr`; extend `ChannelStmt` / `parseChannelRhs` for `role` / `form` / `channel auto`.
- Add keywords to `ReservedWord`, `VALID_KEYWORDS`, `listTopLevelDefinitions`.
- **Composition expansion** (`packages/engine/src/expand/compositionExpand.ts`, new): run in `parseWithPeggy` after stmt collection, before semantic seq/channel validation:
  1. Beginner Mode desugar
  2. Collect `alias` / `section` / `form`
  3. Expand aliases (forward refs OK; cycles error)
  4. Expand `section` → synthetic `seq` decls (collision errors)
  5. Expand `form` + channel `role` → timeline `seq` + standard `channel` lines
  6. Expand `seq` RHS `cat()` → flat item list
  7. Existing pat/seq/modifier expansion unchanged in resolve

### CLI Changes

- `beatbax play` / `export` / `verify` — automatic (no new flags required for v1).
- Optional `beatbax expand` deferred (Phase 4).

### Editor Changes (`packages/app-core`)

Minimal for Phase 1–2 ship:

- Keywords / Monarch / hover / completions: `packages/app-core/src/editor/beatbax-language.ts`, `completion.ts`, `completion-docs.ts`, `top-level-directives.ts`
- Help snippet: `apps/web-ui` / desktop help panels if they consume shared docs — prefer app-core completion docs first
- Full Outline / Timeline / Expanded Source panels deferred unless already trivial; not required to close Phase 1–2 + sample migration

### Export Changes

None — expanded song identical to hand-written equivalent.

### Documentation Updates

- Cross-link `docs/features/complete/sequence-arrangements.md`
- New demo: `songs/features/song_composition_demo.bax`
- Migrate all chip **full arrangement** sample songs (see tasks); update `songs/*/README.md`
- Do **not** migrate `instruments/`, `effects/`, or `songs/features/` demos (except the new composition demo)

### Sample song migration

After Phase 2, refactor every `songs/{gameboy,nes,sms,spectrum-128}/*.bax` root file to `section`/`form`/`role` (or `cat`/`alias` only for true monoliths). Parity: `resolveSong` event counts (and `verify`) match pre-migration baseline.

---

## Testing Strategy

### Unit Tests

| Area | Cases |
|------|--------|
| `cat()` | Two/three operands; per-operand modifiers; nested cat; empty cat error; unknown seq ref |
| `alias` | Use in seq RHS; duplicate name; forward refs; alias-to-alias acyclic; cycle error |
| `section` | Role expansion naming; empty section; duplicate role; name collision with explicit seq |
| `form` + `role` | Four-channel expansion matches hand-written crypt-style channel lines; missing role error |
| Beginner Mode | `section … use`, `form … > …`, `channel auto` → same as canonical |
| Expansion idempotence | Expand twice === expand once |

### Integration Tests

- `songs/features/song_composition_demo.bax` resolve parity vs hand-written twin
- Per migrated sample song: event-count parity fixture or scripted baseline
- Editor keyword/completion smoke tests in `packages/app-core/tests/`

---

## Migration Path

- Existing `.bax` files remain valid without changes.
- Sample songs adopt Phase 2 structure in-repo once expansion ships.
- Phase 3 `include` and Phase 4 preprocessor remain deferred.
