# Language, AST, and ISM

## MUST

- Treat the BeatBax grammar as specified. Do not invent directives, modifiers, or note syntax.
- Keep patterns **channel-agnostic**. Sequences are ordered pattern references plus transforms. Channels consume sequences and apply defaults/overrides.
- Apply transforms at **compile time** only.
- Preserve AST node meanings and ISM semantics/ordering unless a spec explicitly changes them and includes migration.
- Surface semantic issues via `ast.diagnostics` (`error` / `warning`); consumers MUST check diagnostics rather than relying only on thrown exceptions.
- A `pat`, `seq`, `inst`, `effect` or `subpat` name defined again later in the same source file is last-wins and MUST produce a parser `warning` on the later definition (`<keyword> '<name>' redefined; using the later definition.`). Overrides across files follow the import rules ([spec 045](../complete/045-instrument-imports/spec.md)) and get no redefinition warning. Duplicate `channel N` declarations are errors. See [spec 092](../complete/092-duplicate-definition-warnings/spec.md).

## MUST NOT

- Patch compile-time logic at runtime (scheduler, playback, or UI).
- Change AST/ISM contracts without updating [docs/formats/ast-schema.md](../../docs/formats/ast-schema.md) and tests.
- Assume undocumented timing or expansion order.

## Timing contract

- One pattern **step** (one note/rest token of duration 1) lasts one sixteenth note at the song `bpm`: `stepSeconds = 60 / bpm / 4`. A token with duration `:N` lasts `N` steps.
- `stepsPerBar` changes bar grouping and bar numbering only; it never changes step duration.
- Playback, PCM rendering and every exporter that converts steps to time MUST use this contract. Canonical user-facing statement: [docs/grammar/metadata-directives.md](../../docs/grammar/metadata-directives.md).

## Pointers

- Composer reference: [docs/grammar/](../../docs/grammar/)
- AST schema: [docs/formats/ast-schema.md](../../docs/formats/ast-schema.md)
- Instrument mapping: [docs/grammar/instrument-note-mapping-guide.md](../../docs/grammar/instrument-note-mapping-guide.md)
- Import security: [docs/grammar/import-security.md](../../docs/grammar/import-security.md)
