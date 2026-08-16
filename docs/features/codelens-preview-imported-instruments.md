---
title: "CodeLens preview with imported instruments"
status: implemented
authors: ["kadraman"]
created: 2026-08-16
related:
  - docs/features/complete/instrument-imports.md
  - docs/features/complete/remote-imports.md
  - docs/features/complete/editor-interactive-features.md
  - docs/features/complete/enhanced-command-palette-commands.md
  - docs/features/complete/desktop-export-imported-instruments.md
issue: "https://github.com/kadraman/beatbax/issues/175"
---

## Summary

CodeLens ▶ Preview on `pat`, `seq`, and `effect` lines was silent when the song's instruments came from `import` (for example `import "local:lib/gameboy-common.ins"`). Whole-song Play worked. Inline `inst` in the same `.bax` worked.

**Shipped in [#176](https://github.com/kadraman/beatbax/pull/176).** Preview now merges imports the same way Play and the parse pipeline do, then resolves and plays. Clicks still re-parse so live edits are heard.

Desktop Export of kit songs now merges imports the same way: [`desktop-export-imported-instruments.md`](complete/desktop-export-imported-instruments.md) ([#171](https://github.com/kadraman/beatbax/issues/171)).

## Problem Statement

[`songs/features/local_import_example.bax`](../../songs/features/local_import_example.bax) has no `inst` lines. Channels reference kit names from local `.ins` files:

```bax
import "local:lib/gameboy-common.ins"
import "local:lib/gameboy-drums.ins"

pat melody = C5 E5 G5 C6 E5 G5 B4 D5
seq main_melody = melody melody:oct(-1)
channel 1 => inst gb_lead seq main_melody
```

Play on the full song succeeds because [`PlaybackManager`](../../packages/app-core/src/playback/playback-manager.ts) parses, then `await resolveImports(..., buildImportResolverOptions())`, then `resolveSong` on the merged AST (`imports` cleared).

CodeLens ▶ Preview does not. Every click in [`codelens-preview.ts`](../../packages/app-core/src/editor/codelens-preview.ts) does:

```ts
rawAst = parse(getSource());
songModel = resolveSong(previewAst);
```

In Desktop (and web), `@beatbax/engine/song` is the **browser** bundle. [`resolveSong`](../../packages/engine/src/song/resolver.browser.ts) sees `ast.imports` and calls [`resolveImportsSync`](../../packages/engine/src/song/importResolver.browser.ts), which **always throws**:

```text
resolveImportsSync is not available in browser context
```

`startPatternPreview` / `startSeqPreview` / `startEffectPreview` catch that and `return null`. There is no `preview:error`, so the lens looks dead.

Same-file `inst` lines work because there is no `imports` array, so `resolveSong` never hits the sync path.

Effects fail even earlier: `resolveEffectPreviewInstrument` picks from `ast.insts` by type (`pulse1` > …). After a bare parse that map is empty, so it returns `null` before `resolveSong`.

Command palette Alt+P is a second instance of the same class of bug. It builds a synthetic `.bax` and plays it via `playbackManager.play` (which **does** resolve imports), but [`KEEP_LINES_RE`](../../packages/app-core/src/editor/command-palette.ts) drops `import` lines, and pattern preview only looks for an inline `inst` declaration (falls back to `_tmp`).

```mermaid
flowchart LR
  click[CodeLens Preview click]
  parse[parse source]
  sync[resolveSong calls resolveImportsSync]
  throw[throws in browser bundle]
  silent[catch returns null]
  click --> parse --> sync --> throw --> silent
```

## Proposed Solution

### Summary

Reuse the Play/parse import path for preview. Do not use `latestResolvedAst` from `parse:success` as the playback source — clicks re-parse so live edits are heard. Merge imports after that parse.

Keep `ensureAudioCtxReady()` **before** any `await` so the click gesture still resumes `AudioContext`.

### CodeLens

1. Add `parseAndResolveForPreview(source)` in `codelens-preview.ts`:
   - Parse with existing `parse` / `parseSourceForPreview`.
   - If `ast.imports?.length`, `await resolveImports(ast, buildImportResolverOptions())` (same helper as [`create-app-context.ts`](../../packages/app-core/src/app/create-app-context.ts) and playback).
   - On import failure, `eventBus.emit('preview:error', { message })` and return `null`.
2. Replace every `parse(getSource())` in the preview / loop / effect / inst-note / MIDI-audition triggers with that helper.
3. Pass the **merged** AST into `startPatternPreview` / `startSeqPreview` / `startEffectPreview` / `startInstNotePreview` so:
   - `insts` includes kit names (`gb_lead`, `kick`, …)
   - `imports` is `[]`, so `resolveSong` does not call `resolveImportsSync`
   - `instChannelId` can map `type=noise` → channel 4 (not default pulse1)
   - the effect picker can find a pulse / wave / noise inst
4. When a start* helper still returns `null` (no inst at all), emit `preview:error` instead of failing silently.

### Command palette

- Add `import` to `KEEP_LINES_RE` so synthetic preview source keeps `import "local:…"` / `github:` / `https:` lines.
- Pattern preview: also take the first `channel … inst NAME` (sequence preview already does this).

## Implementation Plan

### AST Changes

None.

### Parser Changes

None.

### CLI Changes

None. CLI play / verify already resolve imports. CLI export also merges imports. Desktop/web `ExportManager` now merges imports too — see [`desktop-export-imported-instruments.md`](complete/desktop-export-imported-instruments.md) ([#171](https://github.com/kadraman/beatbax/issues/171)).

### Web UI / Desktop Changes

- [`packages/app-core/src/editor/codelens-preview.ts`](../../packages/app-core/src/editor/codelens-preview.ts) — `parseAndResolveForPreview`; all triggers; `preview:error` on failure.
- [`packages/app-core/src/editor/command-palette.ts`](../../packages/app-core/src/editor/command-palette.ts) — keep `import` lines; pattern preview channel-inst fallback.

Desktop `local:` continues to use Electron FS injection via `buildImportResolverOptions()`. Web-lite still cannot load `local:`; remote imports that Play can load should preview too.

### Export Changes

None. ExportManager now merges imports before validate/resolve: [`desktop-export-imported-instruments.md`](complete/desktop-export-imported-instruments.md) ([#171](https://github.com/kadraman/beatbax/issues/171)).

### Documentation Updates

This spec. Preview shipped in [#176](https://github.com/kadraman/beatbax/pull/176). Export of imported kits shipped in [`desktop-export-imported-instruments.md`](complete/desktop-export-imported-instruments.md). After housekeeping, move this file to `docs/features/complete/` and note the preview path in [`instrument-imports.md`](complete/instrument-imports.md).

## Testing Strategy

### Unit Tests

- [`packages/app-core/tests/codelens-preview.test.ts`](../../packages/app-core/tests/codelens-preview.test.ts): mock `resolveImports` + parser; assert `parseAndResolveForPreview` merges kit `insts` and that effect / pattern instrument resolution succeeds on the merged AST.
- [`packages/app-core/tests/command-palette.test.ts`](../../packages/app-core/tests/command-palette.test.ts): synthetic preview source keeps `import "local:…"` and uses the channel inst name when there is no inline `inst` line.

### Integration Tests

Manual: open `songs/features/local_import_example.bax` (saved on disk), click ▶ Preview on `pat melody`, `seq main_melody`, and (on a song that has them) `effect` lines. Confirm audio and Output `preview:error` only when the kit truly cannot load.

## Migration Path

No song-format change. Songs that already import kits start previewing without author edits.

## Implementation Checklist

- [x] `parseAndResolveForPreview` merges imports with `buildImportResolverOptions()`.
- [x] All CodeLens preview / loop / effect / inst-note / MIDI-audition triggers use the merged AST.
- [x] `ensureAudioCtxReady()` still runs before any `await`.
- [x] Import failure and “no instrument to preview” emit `preview:error` (Output panel), not a silent no-op.
- [x] `KEEP_LINES_RE` retains `import` lines; pattern Alt+P uses channel inst when there is no inline `inst`.
- [x] Desktop `local:` preview uses the saved document path; web-lite still blocks `local:`.
- [x] Unit tests + `@beatbax/app-core` patch changeset.

## Future Enhancements

Imported instruments have no `inst` lines in the `.bax`, so they still will not get C3–C7 CodeLens note buttons. Adding lenses from the resolved AST (read-only kit names) is a separate UI change.

## Open Questions

None for v1. Preview stays click-to-reparse; do not snapshot `latestResolvedAst` for playback.

## References

- [`docs/features/complete/instrument-imports.md`](complete/instrument-imports.md)
- [`docs/features/complete/editor-interactive-features.md`](complete/editor-interactive-features.md)
- Preview shipped in [#176](https://github.com/kadraman/beatbax/pull/176) (Fixes [#175](https://github.com/kadraman/beatbax/issues/175)).
- Parse / diagnostics: [#170](https://github.com/kadraman/beatbax/issues/170)
- Export path: [`desktop-export-imported-instruments.md`](complete/desktop-export-imported-instruments.md) ([#171](https://github.com/kadraman/beatbax/issues/171))

## Additional Notes

Patch changeset on `@beatbax/app-core`: CodeLens / command-palette preview merges `import` kits before playback.
