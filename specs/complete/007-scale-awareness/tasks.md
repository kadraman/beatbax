# Tasks: Scale Awareness — Scale Locking, Snapping, and Channel Locks

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn Description` with repo paths. Reconciled against the code on 2026-10-02.

## Phase 1: Language and parser

- [x] T001 `scale <root> <mode> [warn|error|off]` statement in `packages/engine/src/parser/peggy/grammar.peggy` (`ScaleStmt`, `ScaleEnforcement`)
- [x] T002 `lock=<value>` (and `lock <value>`) on channel lines, parsed from channel tokens in `packages/engine/src/parser/peggy/index.ts`
- [x] T003 `ScaleDirective`, `ScaleEnforcement`, `ScaleLock` and `ChannelNode.lock` in `packages/engine/src/parser/ast.ts`
- [x] T004 `buildScalePitchClasses(root, mode)` and `buildLockPitchClasses(scale, lock)` in `packages/engine/src/parser/scale-awareness.ts`
- [x] T005 `validateScaleLocks(ast)` post-transform pass with source-note provenance in `packages/engine/src/parser/scale-lock-provenance.ts`
- [x] T006 Pass wired into the parser post-processing chain; `lock` without `scale` and unknown locks are errors (`packages/engine/src/parser/peggy/index.ts`)
- [x] T007 `scale` and `lock` in `schema/ast.schema.json`

## Phase 2: Authoring aids

- [x] T010 `snapMidiToPitchClasses` and `scaleLockPitchClasses` (ties snap up) in `packages/app-core/src/input/midi-step-entry.ts`
- [x] T011 Scale snap mode (`off` / `snap` / `filter`) setting: `settingMidiScaleSnapMode` in `packages/app-core/src/stores/settings.store.ts`, UI in `apps/desktop/src/renderer/src/components/settings/editor.tsx` and `apps/web-ui/src/panels/settings-sections/editor.ts`, applied by both `midi-step-entry-controller.ts` files
- [x] T012 Scale diagnostics shown as Monaco squiggles through the existing `warningsToDiagnostics` pipeline (`packages/app-core/src/editor/diagnostics.ts`); lock completions in `packages/app-core/src/editor/completion.ts`; scale context helpers in `packages/app-core/src/editor/scale-context.ts`

## Phase 3: Tests

- [x] T020 Unit tests: `packages/engine/tests/parser.scale-awareness.test.ts`, `packages/engine/tests/scale-lock-provenance.test.ts`
- [x] T021 Snap / filter tests: `apps/web-ui/tests/midi-step-entry.test.ts`

## Phase 4: Docs

- [x] T030 `scale` and channel locks in `docs/grammar/metadata-directives.md`
- [x] T031 `scale` and `lock` fields in `docs/formats/ast-schema.md`
- [x] T032 Scale-awareness guide on the website (beatbax.com repo, confirmed 2026-10-03): [Metadata Directives → Scale and channel locks](https://beatbax.com/docs/language/metadata-directives#scale-and-channel-locks) with a demo per lock, `lock=` in Channels, MIDI step entry notes; linked from the [tutorial overview](https://beatbax.com/docs/tutorial/overview) as an optional topic rather than a walkthrough step
- [x] T033 Move to `specs/complete/007-scale-awareness/` and update `specs/STATUS.md`

Virtual keyboard scale highlighting is tracked by [013 virtual-piano-keyboard](../../features/013-virtual-piano-keyboard/).
