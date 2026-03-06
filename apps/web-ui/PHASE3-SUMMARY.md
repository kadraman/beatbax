# Web UI Phase 3 Implementation Summary

**Date**: March 5, 2026  
**Status**: ✅ Complete

---

## What Was Implemented

Phase 3 adds **Export & Import** to the web UI, building directly on Phase 1 (Monaco/diagnostics/layout) and Phase 2 (PlaybackManager/ChannelControls/OutputPanel). No existing functionality was regressed.

---

## Phase 1 + Phase 2 Foundation (Reused)

✅ **Monaco Editor** — syntax highlighting, autocomplete  
✅ **Diagnostics** — inline error markers  
✅ **Split Layout** — three-pane resizable layout  
✅ **EventBus** — type-safe pub/sub (extended)  
✅ **PlaybackManager** — plays loaded songs automatically  
✅ **ChannelControls** — reflects new channel layout on file load  
✅ **OutputPanel** — logs file open/export activity  

---

## Phase 3 Additions

| Component | File | Description |
|-----------|------|-------------|
| **ExportManager** | `export/export-manager.ts` | Parses, resolves, validates and downloads in JSON/MIDI/UGE/WAV |
| **ExportValidator** | `export/export-validator.ts` | Pre-export song validation with warnings |
| **DownloadHelper** | `export/download-helper.ts` | Browser file download, MIME types, export history |
| **MidiBuilder** | `export/midi-builder.ts` | Browser-side 4-track SMF MIDI |
| **Toolbar** | `ui/toolbar.ts` | Open, Examples dropdown, Export buttons, Verify |
| **FileLoader** | `import/file-loader.ts` | File picker + FileReader wrapper |
| **DragDropHandler** | `import/drag-drop-handler.ts` | Drag-and-drop `.bax`/`.uge` onto the editor |
| **RemoteLoader** | `import/remote-loader.ts` | Fetch from URL/GitHub; EXAMPLE_SONGS with pre-fetch cache |

**Integration point:** `main-phase3.ts` + `index-phase3.html`

---

## EventBus Extensions

| Event | Payload | Purpose |
|-------|---------|---------|
| `song:loaded` | `{ filename: string }` | Emitted before `parse:success` on every file load; resets `ChannelControls` AST cache so re-render is never skipped |

---

## Key Behaviours

### Export
- Formats: JSON (ISM), MIDI (4-track SMF), UGE (hUGETracker v6), WAV (OfflineAudioContext render)
- Filename base = stem of last-loaded `.bax` file (e.g. `kick_demo.bax` → `kick_demo.wav`)
- EventBus events: `export:started`, `export:success`, `export:error`
- WAV fix: scheduler queue drained unconditionally before `startRendering()` to work around `OfflineAudioContext.currentTime === 0`

### File Import
- **Open button** — `<input type="file">` filtered to `.bax,.uge`; `Ctrl+O` shortcut
- **Drag-and-drop** — `.bax`/`.uge` anywhere on the window; visual overlay during drag
- **Examples dropdown** — pre-fetches all example songs in parallel on first open; subsequent clicks served from cache
- **URL query** — `?song=<url>` or `?song=owner/repo/file.bax` auto-loads on page start

### Channel Controls Refresh
Before Phase 3, `ChannelControls` only updated when the user pressed Play (the only place `parse:success` was emitted). Phase 3 adds `emitParse()` — called immediately after `editor.setValue()` in every load path — so the channel panel reflects the new song instantly.

Sequence for every file load:
```
song:loaded   → ChannelControls resets its AST cache
emitParse()   → parse:success fires → ChannelControls.render() called
```

### browser-fs Alias
The engine's Node `fs` calls are aliased to `src/utils/browser-fs.ts` in Vite. Binary writes are intercepted via `getCapturedWrite()` so the UGE exporter works in the browser without any native file I/O.

---

## Supporting Files

| File | Role |
|------|------|
| `src/utils/browser-fs.ts` | Node `fs` stub + binary capture for browser builds |
| `src/export/index.ts` | Module re-exports |
| `src/import/index.ts` | Module re-exports |
| `main-phase3.ts` | Phase 3 entry point (~360 lines) |
| `index-phase3.html` | Phase 3 HTML entry |
| `vite.config.ts` | `phase3` Rollup input; `buffer` in `optimizeDeps` |
| `PHASE3-README.md` | Full component reference |
