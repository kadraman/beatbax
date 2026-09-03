# Tasks: Scale Awareness — Scale Locking, Snapping, and Channel Locks

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Add `scale` directive to Peggy grammar
- [ ] Add `lock=<value>` to channel grammar rule
- [ ] Add `ScaleDirective` and `lock` to AST TypeScript types
- [ ] Implement `buildScalePitchClasses(root, mode)` utility
- [ ] Implement `validateScaleLocks(ast)` post-processing pass
- [ ] Wire `validateScaleLocks` into parser post-processing chain
- [ ] Update `ast.schema.json` for `scale` and `lock` fields
- [ ] Add `snapToScale` utility to web-ui MIDI step entry subsystem
- [ ] Add Scale Snap toggle to MIDI step entry settings UI
- [ ] Add scale squiggle highlighting to Monaco diagnostics pipeline
- [ ] Unit tests for all scale utilities
- [ ] Integration tests for validation pass
- [ ] Update `docs/language/metadata-directives.md`
- [ ] Update `docs/formats/ast-schema.md`
- [ ] Add scale section to the [docs tutorial](https://beatbax.com/docs/tutorial/overview)

---
