---
title: "Song Composition Abstractions — Sections, Aliases, Concatenation, and Includes"
status: proposed
authors: ["kadraman"]
created: 2026-05-27
issue: "https://github.com/kadraman/beatbax/issues/125"
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
- **Two-phase symbol handling** — collect declarations first, then resolve/expand references (deterministic but less brittle than pure top-down lookup).
- **Immutable bindings** — `alias` and `const` (if added later) cannot be reassigned.
- **No general expressions** — v1 avoids `ROOT + 2`, loops with indices, or Turing-complete macros in the core grammar.
- **Explicit over magical** — prefer named sections and `cat(intro, hook, …)` over hidden channel synthesis.
- **Observable expansion** — expansion output must be stable and inspectable in CLI/Web UI with diagnostics mapped back to authored source.

---

### User-Friendly Authoring Layer (Beginner Mode)

To reduce cognitive load for first-time and intermediate users, add a **Beginner Mode** surface that desugars to the same `section` / `form` / `channel role` core model.

This is authoring sugar only; runtime and exported song semantics stay identical.

#### Beginner syntax (author-facing)

```bax
# Role order is fixed in Beginner Mode: mel, harm, bass, perc
section intro use intro_mel intro_harm intro_bass intro_perc
section hook  use hook_mel  hook_harm  hook_bass  hook_perc

# `>` is accepted as a readable alias for comma in forms
form main = intro > hook > bridge > hook > outro

# Auto-bind four channels to default roles
channel auto form main inst=lead|arp|bass|kick
```

#### Desugaring contract (compiler-facing)

Beginner forms desugar before normal section/form expansion:

1. `section <name> use a b c d` desugars to:

```bax
section <name> {
  mel = a
  harm = b
  bass = c
  perc = d
}
```

2. `form main = a > b > c` desugars to `form main = a, b, c`.

3. `channel auto form <f> inst=i1|i2|i3|i4` desugars to:

```bax
channel 1 => inst i1 role mel  form <f>
channel 2 => inst i2 role harm form <f>
channel 3 => inst i3 role bass form <f>
channel 4 => inst i4 role perc form <f>
```

#### Beginner Mode constraints (v1)

- Exactly four role lanes (`mel`, `harm`, `bass`, `perc`).
- `channel auto` is valid only once per song in v1.
- If song chip uses non-4-channel layouts, parser returns a targeted diagnostic recommending advanced mode.
- Advanced syntax and Beginner syntax may coexist, but duplicate generated channels are errors.

#### Pedagogy model

- Docs and templates should teach Beginner Mode first.
- Generated/expanded source panel shows canonical advanced syntax so users can learn progressively.
- Help and diagnostics should offer “show expanded version” and “convert to advanced syntax” actions.

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
- Alias resolution in v1 is declaration-collection + resolve (forward references allowed).
- Alias-to-alias references are allowed when acyclic; any cycle is a compile-time error with a cycle trace.
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

#### Validation contract for `section` + `form` (v1)

- `form` referencing an unknown section: compile-time error.
- `channel ... role <r> form <f>` where any section in `<f>` omits role `<r>`: compile-time error.
- Duplicate role keys inside a section: compile-time error.
- Empty section blocks: compile-time error.
- Expansion must preserve strict left-to-right section ordering exactly as listed in `form`.

#### Generated sequence naming and collision policy

Default generated naming remains `<section>_<role>` in v1 for readability.

- If generated name collides with an explicit user `seq` declaration: compile-time error (no silent overwrite).
- If two generated names collide after include prefixes are applied: compile-time error.
- v1.1 candidate: optional generated-name prefix on `form` for very large modular projects.

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
- **Phase 3b (follow-up):** add `export`/namespace semantics and include-once behavior for library-style composition units.
- **Phase 3c (follow-up):** may allow `alias` and `section` once ordering/visibility semantics are proven in fixtures.
- `channel` and `play` remain out of scope.

**Merge semantics:**

- Included symbols merge into the parent compilation unit **in source order**.
- Includes are local-path only in Phase 3a (same trust boundary as local source files).
- Re-including the same file in the same compilation unit is a compile-time error in v1 unless each include uses a distinct explicit prefix.
- Duplicate `pat`/`seq`/`inst` names: **error** unless `include` carries a prefix:

  ```bax
  include "verse.bax" as v_
  # defines v_mel_pat, v_bass_pat, ...
  ```

- Same security model as [instrument-imports.md](complete/instrument-imports.md) and remote imports: allowed roots, size limits, no arbitrary code execution.

**Phase 3b module-direction (design target):**

- `include "x.bax" as x_` remains available for simple prefixing.
- Optional namespaced include form (candidate): `include "x.bax" as x` with qualified refs in expansion/debug output.
- Optional explicit export lists in included fragments to avoid accidental symbol leakage.

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

## Future Enhancements

| Enhancement | Notes |
|-------------|-------|
| `const` for pitch names | `const ROOT = C4` in pat — needs expression policy |
| `seq with` surgical edits | `hook_mel with mel_a_vib replacing mel_a` |
| Per-section `bpm` / `speed` | Requires scheduler support |
| `pat`/`effect` aliases | Same machinery as seq alias |
| Inline `cat()` on `channel` seq lists | Convenience (v1.1 candidate) |
| IDE outline/timeline editing | Promote read-only outline/timeline to lightweight structure editor |
| Beginner Mode to Advanced conversion action | One-click rewrite from sugar syntax to canonical syntax |

**Related but separate:** [scale-awareness.md](scale-awareness.md) — compile-time pitch validation; composes with sections but does not reduce line count.

---

## Resolved Decisions

1. **Channel binding syntax (v1)** — use channel `role` + `form` binding.
2. **Generated seq naming (v1)** — `<section>_<role>` with explicit collision errors.
3. **Inline `cat` on `channel`** — deferred to v1.1.
4. **`include` and `channel`** — included `channel` lines are out of scope for v1/v1.1.
5. **Alias resolution** — two-phase declaration + resolve; forward refs allowed; alias cycles are errors.
6. **Form/role strictness** — missing role coverage is a compile-time error in v1.
7. **Beginner Mode** — sugar syntax is supported, but always lowered to canonical `section`/`form`/`channel role` before main expansion.

## Remaining Question

1. **Expanded source UX default** — Should expanded-source panel be opt-in per session, or auto-open only on structure-related diagnostics?

---

## Constraints and Chip Mapping

This feature set is designed for constrained chips and tracker/export targets. All new constructs are compile-time authoring abstractions and must not relax channel, memory, or export constraints.

### Hard guarantees

- `section`, `form`, `alias`, `cat`, `include`, and Beginner Mode sugar always lower to canonical `pat` / `seq` / `channel` source before normal resolution.
- Lowering must not add runtime behavior, mutable state, or scheduler branches.
- Expanded output must honor the active chip channel count exactly.
- Exporters remain the final authority for format limits; this feature does not bypass exporter validation.
- Equivalent authored/expanded songs must produce equivalent resolved song structure and deterministic playback.

### Constraint mapping

| Constraint type | Impact of new constructs | Required behavior |
|-----------------|--------------------------|-------------------|
| Channel count (chip limit) | Structural only | Error when generated/explicit channel mapping exceeds chip channel limit |
| Pattern/order memory | Indirect | No automatic bloat reduction promised; provide diagnostics and refactor suggestions |
| Instrument/macro memory | Indirect | Keep existing validation/export checks unchanged |
| Export format limits | None by design | Expanded source must pass the same exporter checks as hand-written canonical source |

### Chip-profile behavior

- Beginner Mode role lanes are profile-driven in UI and templates.
- v1 parser sugar remains 4-lane (`mel`, `harm`, `bass`, `perc`) unless extended by a chip-profile revision.
- If Beginner Mode sugar is used with an incompatible chip/profile, emit a targeted diagnostic with a suggested advanced-mode rewrite.

### Acceptance criteria for constrained targets

- For a constrained target fixture, canonical source and sugar-authored source resolve to equivalent event counts and timing.
- Exceeding channel limits via `channel auto` or expanded role mapping fails with a clear compile-time error.
- Export validation warnings/errors remain unchanged versus equivalent canonical source.
- Expanded source view shows the exact channel and sequence material sent to resolver/exporter.

### Web UI requirements for constrained workflows

- Add a chip-aware budget panel summarizing channel usage and target-sensitive structure metrics.
- Add constraint diagnostics with direct fixes where possible.
- Add refactor hints for repeated expanded material (for example alias/cat extraction suggestions).
- Keep Expanded Source panel available from diagnostics so users can inspect canonical output under limits.
- New Song Wizard should expose chip/profile templates and indicate when Beginner Mode shortcuts are compatible.

### Out of scope for this feature

- Automatic pattern packing or memory optimization in exporters.
- Implicit channel virtualization or hidden lane multiplexing.
- Any runtime adaptation to chip limits.

---

## Strudel-Inspired UX Appendix (Non-Normative)

This appendix captures REPL-style interaction patterns inspired by Strudel that can improve authoring ergonomics for large songs, while preserving BeatBax determinism and export correctness.

### Adoption rule

- Borrow interaction patterns, not runtime semantics.
- All UI interactions must still lower to canonical BeatBax source before parse/resolve/export.
- No hidden state that changes playback/export output without visible source changes.

### Must-have capabilities (high value)

1. **Live expanded-structure preview**
  - Always-available preview of `section`/`form`/`alias`/`cat` lowering.
  - Bidirectional navigation: authored line -> expanded output and back.

2. **Section timeline lanes**
  - Visual section order and per-role/per-channel occupancy.
  - Immediate visual warnings for missing roles and likely misalignment.

3. **Progressive onboarding path**
  - Beginner snippets first (`section ... use ...`, `form ... > ...`, `channel auto ...`).
  - One-click “show canonical source” to teach advanced syntax naturally.

4. **Actionable diagnostics**
  - Diagnostics should explain intent, not just parse form.
  - Every structure error should provide at least one safe refactor action where possible.

### Should-have capabilities (next wave)

1. **Tweak-and-accept workflow**
  - Temporary UI-only edits (timeline reorder, role remap) with explicit Apply/Revert into source.

2. **Per-section audition controls**
  - Quick preview/solo/mute for section slices without requiring whole-song playback.

3. **Constraint-aware budget HUD**
  - Chip/export profile indicators (channel usage and structure-size heuristics).
  - Surface likely limit pressure early in authoring.

4. **Round-trip conversion actions**
  - Beginner -> canonical rewrite.
  - Canonical -> beginner-friendly scaffold where representable.

### Out-of-scope borrowings from live-coding REPLs

- Runtime-evaluated expression language.
- Implicit timing/state mutation not represented in source.
- Non-deterministic transformations that cannot round-trip through canonical output.

### Candidate implementation mapping (current web-ui)

- Expanded preview + structural tokens: `apps/web-ui/src/editor/beatbax-language.ts`
- Timeline/outline panels + event wiring: `apps/web-ui/src/utils/event-bus.ts`, `apps/web-ui/src/playback/playback-manager.ts`
- CodeLens/inline affordances: `apps/web-ui/src/editor/codelens-preview.ts`
- Quick refactors from diagnostics: `apps/web-ui/src/editor/code-actions.ts`
- Beginner template flow: `apps/web-ui/src/panels/new-song-wizard.ts`
- Contextual docs/help authoring: `apps/web-ui/src/panels/help-panel.ts`

### Acceptance criteria for this appendix

- REPL-like UX features do not alter resolved output unless source is explicitly updated.
- Any UI-generated source is valid canonical BeatBax or deterministic Beginner sugar that lowers to canonical BeatBax.
- Preview, diagnostics, and export all agree on the same lowered source for a given edit state.

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
