---
title: "Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes"
status: proposed
authors: ["kadraman"]
created: 2026-05-27
issue: "<LINK_TO_GITHUB_ISSUE>"
---

## Summary

Add **compile-time** language features that make full-length songs easier to author without changing playback semantics or the tick scheduler. The proposal is delivered in four incremental phases:

| Phase | Feature | Primary benefit |
|-------|---------|-----------------|
| **1** | `seq` concatenation (`cat`) | Shorter channel lines; explicit song timelines |
| **1** | `alias` | Reusable seq/pattern name lists without duplicating bodies |
| **2** | `section` blocks + `form` + channel `role` binding | Declare form once (intro, verse, chorus); reduce per-section `seq` boilerplate |
| **3** | `include` for composition fragments (staged) | Multi-file songs and shared libraries beyond `.ins` |
| **4** (optional) | External macro preprocessor | Power-user repetition; not required for v1 |

All mechanisms expand to the existing `pat` / `seq` / `channel` model before ISM resolution. There is **no runtime scripting**, no mutable variables, and no expression language.

---

## Problem Statement

BeatBax already supports complete songs via:

- `pat` and `seq` definitions
- Comma-separated `channel … seq a, b, c` (sections concatenate in time per channel)
- `*N` repetition and parenthesized groups in seq items
- Colon-chained sequence modifiers (`:oct`, `:rot`, `:every`, …)
- `import` for instrument libraries (local and remote)
- Named `effect` presets

These are sufficient to ship production-quality music (see `songs/gameboy/crypt_of_fallen_kings.bax`, `songs/features/sequence_demo.bax`). As songs grow, authors hit **structural repetition** rather than missing musical primitives:

1. **Four parallel `seq` lines per section** — e.g. `hook_mel`, `hook_harm`, `hook_bass`, `hook_perc` for every section in a seven-part form (~28 seq definitions).
2. **Long, fragile `channel` lines** — the same section order must be repeated on four channels; a typo misaligns the arrangement.
3. **Copy-paste with small edits** — `return_mel` differs from `hook_mel` by one pattern; no way to express “same as hook but swap `mel_a` for `mel_a_vib`” except duplicating lines.
4. **Form exists only in comments** — structure is implied by naming (`intro_*`, `hook_*`) and discipline, not syntax.
5. **`import` is instruments-only** — patterns and arrangement fragments cannot be shared across files.

The removed `arrange` directive ([sequence-arrangements.md](complete/sequence-arrangements.md)) addressed multi-channel grids but was dropped in favour of explicit `channel` lines. This spec **does not revive `arrange` as-is**; it introduces clearer abstractions that lower to today’s `channel` + `seq` semantics.

---

## Proposed Solution

### Design principles

- **Compile-time only** — expansion happens in the parser/resolver; expanded output is debuggable (optional `--expand` flag).
- **Lower to existing AST** — no new runtime node types in the player; `section` and `cat` desugar to `seq` + `channel`.
- **Immutable bindings** — `alias` and `const` (if added later) cannot be reassigned.
- **No general expressions** — v1 avoids `ROOT + 2`, loops with indices, or Turing-complete macros in the core grammar.
- **Explicit over magical** — prefer named sections and `cat(intro, hook, …)` over hidden channel synthesis.

---

### Phase 1 — `cat()` and `alias`

#### `cat()` — sequence concatenation

Introduce a **seq RHS** form that concatenates existing sequences (after each operand’s own expansion/modifiers):

```bax
seq song_mel = cat(intro_mel, hook_mel, bsec_mel, bridge_mel, return_mel, climax_mel, finale_mel)

channel 1 => inst lead seq song_mel
```

**Syntax:**

```
seq <name> = cat(<seqRef> (, <seqRef>)*)
```

- Each `<seqRef>` is a sequence identifier, optionally followed by colon modifiers: `hook_mel:oct(-1)`.
- Operands are expanded **left to right**; modifiers on a ref apply to that operand only.
- `cat()` is only valid on the **RHS of `seq`**, not inside `pat` note lists (v1).
- Nesting: `cat(a, cat(b, c))` allowed; empty `cat()` is a compile-time error.

**Relationship to channel comma lists:**
`channel 1 => inst lead seq a, b, c` already concatenates in time. `cat()` makes the timeline **named and reusable** across channels:

```bax
seq form = cat(intro_mel, hook_mel, finale_mel)
channel 1 => inst lead  seq form
channel 2 => inst arp   seq form_harm
```

`form_harm` above is another `seq` name expanded via `cat(...)`. Inline `cat(...)` directly on `channel` `seq` clauses is deferred to v1.1.

#### `alias` — named token lists

Bind a name to a **seq item list** (same tokens allowed as `seq` RHS today):

```bax
alias hook_mel_body = mel_a mel_a2 mel_a mel_a2

seq hook_mel  = hook_mel_body
seq finale_mel = hook_mel_body
```

**Syntax:**

```
alias <name> = <seqItem>+
```

- `alias` names are **file-scoped** and immutable.
- Resolution: when an alias appears in a `seq` RHS, expand to its item list before pattern/seq reference resolution.
- Aliases may reference patterns and seqs, not other aliases in v1 (avoid cycles and multi-pass lookup complexity).
- Alias resolution is single-pass and top-down in v1: using an alias before its declaration is a compile-time error.
- **Not** in `pat` note lists in v1 (keeps pitch validation simple).

---

### Phase 2 — `section` blocks

A `section` groups the per-channel sequence bodies for one song section (intro, verse, chorus, …).

#### Syntax (v1)

```bax
section intro {
  mel  = mel_intro mel_intro2
  harm = harm_intro harm_intro
  bass = bass_intro bass_intro
  perc = drums_intro drums_intro drums_intro drums_intro
}

section hook {
  mel  = mel_a mel_a2 mel_a mel_a2
  harm = harm_main1 harm_main2 harm_main1 harm_main2
  bass = bass_main1 bass_gallop bass_main1 bass_gallop
  perc = drums_main drums_main drums_drive drums_main
}
```

**Rules:**

- Keys inside `{ }` are **role names** (author-defined: `mel`, `harm`, `bass`, `perc`, or `ch1`…`ch4`).
- Values are **seq RHS item lists** (patterns, reps, groups, modifiers) — not nested `seq` statements.
- The block expands to implicit seq definitions:

  ```bax
  seq intro_mel  = mel_intro mel_intro2
  seq intro_harm = ...
  ```

  Default naming: `<sectionName>_<role>`. v1 uses `_` and does not support configurable separators.

#### Form timeline — `form`

Declare section order once:

```bax
form main = intro, hook, bsec, bridge, return, climax, finale
```

**Expansion** (conceptual) when channels use role-based mapping:

```bax
channel 1 => inst lead seq cat(intro.mel, hook.mel, bsec.mel, ...)
```

**Channel binding to roles (v1): explicit role map on each channel**

```bax
channel 1 => inst lead role mel  form main
channel 2 => inst arp  role harm form main
channel 3 => inst bass role bass form main
channel 4 => inst kick role perc form main
```

Expands to four `cat()` seqs and four `channel` lines.

Section-qualified refs (for example `intro.mel`) are out of scope for v1.

#### Optional `defaults` on `form` (Phase 2.1)

```bax
form main = intro, hook, finale
  defaults inst=lead|arp|bass|kick
```

Maps default instruments per channel index when using channel `role` + `form` binding. Song-level `bpm` remains a top-level directive; per-section `bpm` is out of scope for v1.

#### Comparison to removed `arrange`

| Former `arrange` | This spec |
|------------------|-----------|
| Pipe grid `a \| b \| c \| d` | `section` roles + `form` order |
| `defaults(inst=…)` on arrange | `defaults` on `form` or per-`channel inst` |
| Opaque expansion to channels | Explicit `role` + `form` → `cat` → existing `channel` |
| Multi-row block | `form` comma list |

---

### Phase 3 — `include` for composition fragments

Generalize import resolution beyond instruments.

```bax
include "sections/verse.bax"
include "patterns/drums.bax"
import "instruments/gameboy-lead.ins"
```

Phase 3 is staged to keep resolver behavior deterministic:

- **Phase 3a (MVP):** included files may contain only `pat`, `seq`, `effect`.
- **Phase 3b (follow-up):** may allow `alias` and `section` once ordering/visibility semantics are proven in fixtures.
- `channel` and `play` remain out of scope.

**Merge semantics:**

- Included symbols merge into the parent compilation unit **in source order**.
- Includes are local-path only in Phase 3a (same trust boundary as local source files).
- Re-including the same file is allowed, but resulting duplicate symbol declarations are still errors unless prefixed.
- Duplicate `pat`/`seq`/`inst` names: **error** unless `include` carries a prefix:

  ```bax
  include "verse.bax" as v_
  # defines v_mel_pat, v_bass_pat, ...
  ```

- Same security model as [instrument-imports.md](complete/instrument-imports.md) and remote imports: allowed roots, size limits, no arbitrary code execution.

---

### Phase 4 (optional) — external macro preprocessor

For authors who need `repeat 7 { section verse_$i … }`, provide **`beatbax expand`** (CLI) or a documented preprocessor hook that emits plain `.bax` before parse. **Not** part of core grammar in v1.

Rationale: keeps Peggy grammar and diagnostics stable; macros remain opt-in and inspectable.

---

### Example Usage

#### Before (`crypt_of_fallen_kings.bax` style)

```bax
seq intro_mel  = mel_intro mel_intro2
seq hook_mel   = mel_a mel_a2 mel_a mel_a2
# ... 26 more seq lines ...

channel 1 => inst lead seq intro_mel hook_mel bsec_mel bridge_mel return_mel climax_mel finale_mel
channel 2 => inst arp  seq intro_harm hook_harm bsec_harm bridge_harm return_harm climax_harm finale_harm
# ... channels 3–4 ...
```

#### After (Phase 1 + 2)

```bax
section intro { mel = mel_intro mel_intro2; harm = ...; bass = ...; perc = ... }
section hook  { mel = mel_a mel_a2 mel_a mel_a2;   harm = ...; bass = ...; perc = ... }
# ... other sections ...

form main = intro, hook, bsec, bridge, return, climax, finale

channel 1 => inst lead role mel  form main
channel 2 => inst arp  role harm form main
channel 3 => inst bass role bass form main
channel 4 => inst kick role perc form main
```

#### Phase 1 only (minimal change)

```bax
seq song_mel = cat(intro_mel, hook_mel, bsec_mel, bridge_mel, return_mel, climax_mel, finale_mel)
channel 1 => inst lead seq song_mel
```

---

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
  1. Resolve `alias` → inline items (single-pass, top-down)
  2. Expand `section` → synthetic `seq` decls
  3. Expand `form` + `channel role` → `cat` seqs + standard `channel` lines
  4. Expand `seq` RHS `cat()` → flat seq item list
  5. Continue existing pat/seq/modifier expansion unchanged

### CLI Changes

- `beatbax play` / `export` — no flags required; expansion is automatic.
- `beatbax expand song.bax` (optional) — print desugared `.bax` to stdout or `-o` for debugging.
- Diagnostics cite **original** line numbers (source maps in expansion pass).

### Web UI Changes

- Syntax highlighting and completions for `section`, `form`, `alias`, `cat`, `include`.
- Help panel: new **Song structure** section with `cat` / `section` / `form` examples.
- CodeLens: optional “expand section” preview showing generated seq names.
- No change to playback engine beyond parsing/resolution.

### Export Changes

- None for ISM/VGM/UGE — expanded song is identical to hand-written `seq`/`channel` equivalent.
- UGE order list length unchanged for equivalent arrangements.

### Documentation Updates

- `TUTORIAL.md` — song form workflow
- `docs/features/complete/sequence-arrangements.md` — cross-link “successor ergonomics”
- New demo: `songs/features/song_composition_demo.bax`
- Migrate one section of `crypt_of_fallen_kings.bax` as reference (optional, in implementation PR)

---

## Testing Strategy

### Unit Tests

| Area | Cases |
|------|-------|
| `cat()` | Two/three operands; per-operand modifiers; nested cat; unknown seq ref |
| `alias` | Use in seq RHS; duplicate name error; forward reference error; alias-to-alias disallowed |
| `section` | Role expansion naming; empty section; duplicate role |
| `form` + `role` | Four-channel expansion matches hand-written `crypt` channel lines |
| `include` | Local file; prefix; duplicate symbol error; circular include; repeated include behavior |
| Expansion idempotence | Expand twice === expand once |

### Integration Tests

- Parse + `resolveSong` on `song_composition_demo.bax` — event counts match equivalent manual song.
- Golden ISM snapshot: expanded form vs manual `sequence_demo.bax` / crypt excerpt.
- Web UI: parse diagnostics for malformed `section` block.

---

## Migration Path

- **Fully backward compatible** — existing `.bax` files unchanged.
- Authors may adopt incrementally:
  1. Replace long `channel` lists with `seq timeline = cat(...)`.
  2. Introduce `alias` for repeated motif lists.
  3. Refactor multi-section songs into `section` + `form`.
- No migration tool required; optional `beatbax expand` helps manual refactors.

---

## Implementation Checklist

### Phase 1
- [ ] AST: `AliasDecl`, `SeqCatRhs`
- [ ] Parser: `alias`, `cat()` in seq RHS
- [ ] Resolver: alias inline + cat expansion
- [ ] Tests: unit + demo song snippet
- [ ] Web UI: syntax + help snippet

### Phase 2
- [ ] AST: `SectionDecl`, `FormDecl`, channel `role`/`form`
- [ ] Parser + desugar pass
- [ ] Tests: crypt-equivalent expansion golden test
- [ ] Web UI: completions for section roles

### Phase 3
- [ ] Phase 3a `include` resolver (pat/seq/effect only)
- [ ] Prefix option + security parity with local-source trust model
- [ ] Tests: multi-file fixture + repeated include duplicate handling
- [ ] Phase 3b design note for alias/section include support

### Phase 4 (optional)
- [ ] `beatbax expand` CLI
- [ ] Document preprocessor contract

---

## Future Enhancements

| Enhancement | Notes |
|-------------|-------|
| `const` for pitch names | `const ROOT = C4` in pat — needs expression policy |
| `seq with` surgical edits | `hook_mel with mel_a_vib replacing mel_a` |
| Per-section `bpm` / `speed` | Requires scheduler support |
| `pat`/`effect` aliases | Same machinery as seq alias |
| Inline `cat()` on `channel` seq lists | Convenience (v1.1 candidate) |
| IDE outline view | Sections as foldable regions |

**Related but separate:** [scale-awareness.md](scale-awareness.md) — compile-time pitch validation; composes with sections but does not reduce line count.

---

## Resolved Decisions

1. **Channel binding syntax (v1)** — use channel `role` + `form` binding.
2. **Generated seq naming (v1)** — `<section>_<role>` only.
3. **Inline `cat` on `channel`** — deferred to v1.1.
4. **`include` and `channel`** — included `channel` lines are out of scope for v1/v1.1.
5. **Alias resolution** — single-pass top-down; no forward alias references; no alias-to-alias.

## Remaining Question

1. **Diagnostic verbosity** — Should `--expand` be default in web UI “show expanded source” panel?

---

## References

- [sequence-arrangements.md](complete/sequence-arrangements.md) — removed `arrange`; comma `channel` seq lists
- [sequence-arrangements-spec.md](archive/sequence-arrangements-spec.md) — historical `arrange` design
- [instrument-imports.md](complete/instrument-imports.md) — import resolver pattern
- [additional-beatbax-modifiers.md](complete/additional-beatbax-modifiers.md) — seq modifier chaining at expansion time
- `songs/features/sequence_demo.bax` — current multi-item `channel` syntax
- `songs/gameboy/crypt_of_fallen_kings.bax` — real-world multi-section song
- `packages/engine/src/sequences/expand.ts` — seq repetition and groups
- `packages/engine/src/expand/refExpander.ts` — modifier expansion pipeline

---

## Additional Notes

### Non-goals (v1)

- Runtime variables or mutable state
- Arithmetic on note names in the grammar
- Reviving `arrange` keyword without new semantics
- Turing-complete macros inside `.bax` source

### Success criteria

A contributor can refactor `crypt_of_fallen_kings.bax` so that:

- Section order is declared **once** (`form main = …`).
- Channel lines use **role + form** (or one `cat` per channel) instead of seven repeated identifiers.
- Line count for seq/channel scaffolding drops by **≥40%** without changing rendered audio (ISM golden match).
