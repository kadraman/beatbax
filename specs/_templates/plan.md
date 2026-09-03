# Implementation Plan: <TITLE>

**Spec**: [spec.md](spec.md) | **Date**: YYYY-MM-DD | **Branch**: `feat/NNN-slug`

## Summary

Primary requirement and technical approach.

## Technical context

- **Packages / surfaces**: e.g. `packages/engine`, `apps/desktop`, `packages/cli`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full / web-lite / both / CLI / engine-only
- **Performance / constraints**: (or N/A)

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

**Exceptions** (fill only if a principle cannot be met):

| Principle | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| | | |

## Project structure

List directories and files this feature will add or change.

## Implementation

### AST changes

### Parser / grammar changes

### CLI changes

### Desktop / web UI changes

### Export changes

### Documentation updates

(`docs/grammar/`, chip guides, `specs/global/` if contracts change)

## Testing strategy

### Unit tests

### Integration tests

### Manual / QA

## Migration and compatibility

## Open implementation questions
