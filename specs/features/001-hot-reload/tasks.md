# Tasks: Real-time Pattern Hot Reload

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Create `packages/engine/src/runtime/diff.ts` with `diffAST()` function
- [ ] Create `packages/engine/src/runtime/hotReload.ts` with `HotReloadManager` class
- [ ] Add `updateInstrument()` method to Player
- [ ] Add `updatePattern()` method to Player
- [ ] Add `updateChannelSequence()` method to Player
- [ ] Add `setBPM()` method to Player
- [ ] Add `getNextLoopPoint()` helper to Player
- [ ] Update demo `boot.ts` to use HotReloadManager
- [ ] Add visual feedback for live updates in UI
- [ ] Write unit tests for AST diffing
- [ ] Write unit tests for hot reload manager
- [ ] Write integration tests for glitch-free updates
- [ ] Update the [docs tutorial](https://beatbax.com/docs/tutorial/overview) with live coding examples
- [ ] Add keyboard shortcut for manual apply (Ctrl+Enter)
- [ ] Document hot reload API in engine README
