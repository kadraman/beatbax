# Tasks: Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

### Phase 1
- [ ] AST: `AliasDecl`, `SeqCatRhs`
- [ ] Parser: `alias`, `cat()` in seq RHS
- [ ] Resolver: declaration-collection + alias/cat expansion + alias cycle diagnostics
- [ ] Tests: unit + demo song snippet
- [ ] Web UI: syntax + help snippet
- [ ] Beginner Mode: `>` form separator and `section ... use ...` desugaring tests

### Phase 2
- [ ] AST: `SectionDecl`, `FormDecl`, channel `role`/`form`
- [ ] Parser + desugar pass + generated-name collision checks
- [ ] Tests: crypt-equivalent expansion golden test
- [ ] Web UI: completions for section roles
- [ ] Web UI: Song Structure Outline + Arrangement Timeline (read-only)
- [ ] Web UI: section/form CodeLens expand preview + create-missing-role quick fix
- [ ] Beginner Mode: `channel auto form ... inst=...|...|...|...` desugaring + diagnostics

### Phase 3
- [ ] Phase 3a `include` resolver (pat/seq/effect only)
- [ ] Prefix option + security parity with local-source trust model
- [ ] Tests: multi-file fixture + repeated include collision handling
- [ ] Phase 3b design note for include exports/namespaces/include-once behavior
- [ ] Phase 3c design note for alias/section include support

### Phase 4 (optional)
- [ ] `beatbax expand` CLI
- [ ] Document preprocessor contract

---
