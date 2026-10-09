# Implementation Plan: Duplicate definition warnings

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-07 | **Branch**: `feat/092-duplicate-definition-warnings`

## Summary

Track names already seen per kind while the Peggy front end walks top-level statements, and push a warning for each redefinition, mirroring the existing `SubPatStmt` branch. In the desktop app, add a duplicate-definition check to the Edit validation loop in `DesktopCopilotPanel.tsx` that feeds the existing parse-repair path, add one Edit prompt rule, and clean the two SMS songs.

## Technical context

- Parser: `packages/engine/src/parser/peggy/index.ts`. The statement loop handles `InstStmt` (`parseInstRhs` writes `insts[name]`), `EffectStmt` (`effects[name]`), `PatStmt` (`pats[name]`) and `SeqStmt` (`seqs[name]`). `SubPatStmt` already warns on redefinition with `diagnostics.push({ level: 'warning', component: 'parser', … })`.
- Imports are merged later by `song/importResolver.ts` with its own override warnings (spec 045); the parser only sees one file, so FR-003 holds by construction.
- Copilot: `apps/desktop/src/renderer/src/lib/bax-def-index.ts` (`collectBaxDefs` keeps the last definition per `kind:name`), validation loop in `DesktopCopilotPanel.tsx` (`validateBaxSource` → definition merge → `buildRepairPrompt` up to `MAX_PARSE_REPAIR_ATTEMPTS`), Edit prompt in `lib/copilot-context.ts`.

## Constitution Check

- **AST**: no node or field changes; `ast.diagnostics` gains warnings only.
- **ISM / scheduler / export**: unchanged; last-wins is preserved (FR-002). SC-003 guards this with a before/after comparison over `songs/**`.
- **Plugins**: unaffected.
- **Determinism**: diagnostics are emitted in source order.
- **Validation**: strengthened (new warning), never softened.

## Project structure

| Path | Change |
| ---- | ------ |
| `packages/engine/src/parser/peggy/index.ts` | Per-kind `Set` of seen names; warn on `PatStmt`, `SeqStmt`, `InstStmt`, `EffectStmt` redefinition |
| `packages/engine/tests/` | New `parser-redefinition.test.ts`; song-wide ISM/AST equality check (SC-003) |
| `apps/desktop/src/renderer/src/lib/bax-def-index.ts` | `findNewDuplicateDefinitions(previous, next)` returning `{ kind, keyword, name, lines }[]` |
| `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx` | Run the duplicate check inside the validation loop before the definition merge; repair prompt and blocked summary |
| `apps/desktop/src/renderer/src/lib/copilot-context.ts` | Edit rule: define each name once, edit in place |
| `songs/sms/green_zone.bax`, `songs/sms/green_hill_remix.bax` | Remove superseded definitions (and their now-stale "corrected" comments) |
| `specs/global/language.md` | One MUST line: same-file redefinition is last-wins with a parser warning |
| `specs/complete/017-…/spec.md`, `specs/complete/052-…/spec.md` | Cross-references for the Copilot behaviour |

## Implementation

### AST changes

None.

### Parser / grammar changes

No grammar change. In the statement loop, keep `seen = { pat: Set, seq: Set, inst: Set, effect: Set }`. Before storing a definition, if the name is in the set, push the FR-001 warning with `stmt.loc`; then add it. The message reuses the `subpat` wording.

### CLI changes

None. `verify` already prints parser warnings and fails on them only with `--strict`.

### Desktop / web UI changes

- `findNewDuplicateDefinitions(previous, next)`: count definition lines per `kind:name` in each text with the same line regexes as `collectBaxDefs`; return names whose count in `next` is above 1 and above the count in `previous`, with all line numbers from `next`.
- Validation loop: compute duplicates alongside `validateBaxSource`. If any, skip the definition merge, add `Duplicate definition: …` lines to the repair error list, and use the existing repair path and counter. Status notice: *Duplicate definitions — asking Copilot to fix (n/2)…* when duplicates are the only problem; the existing parse-error notice otherwise. When attempts run out, block with the FR-007 summary lines (plus any parse errors).
- Prompt rule appended to the Edit mode hint (FR-008).

### Export changes

None.

### Documentation updates

- `specs/global/language.md` (contract line).
- Spec 017 § Edit apply behaviour: new item for duplicate definitions; spec 052 § Edit mode: one sentence.
- `docs/qa/copilot-test-scenarios.md`: new scenario for the duplicate reply.

## Testing strategy

### Unit tests

- Parser: one warning per later definition for each kind; three definitions → two warnings; `pat x` + `seq x` → none; resolved maps equal last definition; `subpat` and `channel` behaviour unchanged.
- `findNewDuplicateDefinitions`: new duplicate; pre-existing duplicate kept (none); pre-existing duplicate removed (none); cross-kind names (none); line numbers.
- `copilot-context.test.ts`: Edit prompt contains the rule; Ask does not.

### Integration tests

- Engine: every `songs/**/*.bax` parses with zero redefinition warnings (after cleanup), and AST/ISM for each song equals a snapshot taken before the parser change (SC-002, SC-003).

### Manual / QA

- Desktop: open a song with a duplicate `pat` and confirm the squiggle on the later line.
- Copilot: replay the QA case (sample.bax with an existing `melody_vib`, ask again) and confirm repair or **Not applied** with the duplicate named.

## Migration and compatibility

Additive diagnostics only. Songs with same-file redefinitions now show warnings; behaviour is unchanged. `verify --strict` users with such songs will see failures, which is the documented meaning of `--strict`.

## Open implementation questions

None.
