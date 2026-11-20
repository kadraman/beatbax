# Implementation Plan: Create plugin starter template repository on github.com/beatbax

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Notes

- The `@beatbax/engine` peerDependency should be pinned to the current stable range at time of template creation
- The Jest config should match the pattern used in `packages/plugins/chip-nes/jest.config.cjs` (ts-jest, ESM transform, `testEnvironment: node`)
- The CI workflow should mirror the NES plugin's CI setup
- The `ui-contributions.ts` and `songWizard.ts` examples should mirror structure used in the SMS plugin (`packages/plugins/chip-sms/src/ui-contributions.ts`, `packages/plugins/chip-sms/src/songWizard.ts`)
- Consider adding a `CONTRIBUTING.md` that links back to the main BeatBax contributing guide
