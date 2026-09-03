# Language, AST, and ISM

## MUST

- Treat the BeatBax grammar as specified. Do not invent directives, modifiers, or note syntax.
- Keep patterns **channel-agnostic**. Sequences are ordered pattern references plus transforms. Channels consume sequences and apply defaults/overrides.
- Apply transforms at **compile time** only.
- Preserve AST node meanings and ISM semantics/ordering unless a spec explicitly changes them and includes migration.
- Surface semantic issues via `ast.diagnostics` (`error` / `warning`); consumers MUST check diagnostics rather than relying only on thrown exceptions.

## MUST NOT

- Patch compile-time logic at runtime (scheduler, playback, or UI).
- Change AST/ISM contracts without updating [docs/formats/ast-schema.md](../../docs/formats/ast-schema.md) and tests.
- Assume undocumented timing or expansion order.

## Pointers

- Composer reference: [docs/grammar/](../../docs/grammar/)
- AST schema: [docs/formats/ast-schema.md](../../docs/formats/ast-schema.md)
- Instrument mapping: [docs/grammar/instrument-note-mapping-guide.md](../../docs/grammar/instrument-note-mapping-guide.md)
- Import security: [docs/grammar/import-security.md](../../docs/grammar/import-security.md)
