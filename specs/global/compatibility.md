# Compatibility and determinism

## MUST

- Preserve public module APIs; prefer additive changes.
- Keep parse → expand → schedule → export **deterministic** for the same source and options.
- Require spec review and downstream impact analysis for parser, AST, expansion, scheduler, and ISM changes.
- Document migration when behavior or file formats change.
- Fail loudly rather than silently dropping data or changing meaning.

## MUST NOT

- Ship silent breaking changes.
- Soften validation to make an invalid song “work”.
- Change AST meanings, ISM ordering, scheduler timing, or transform order without a spec and tests.

## Core change checklist

1. Spec (or amendment to a complete spec) exists.
2. Constitution Check in `plan.md` records AST/ISM/scheduler impact.
3. Tests updated first or in parallel.
4. User-facing docs (`docs/grammar/`, export guides) updated when composers are affected.
