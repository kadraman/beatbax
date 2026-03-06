# BeatBax Web UI - Phase 3 Implementation

**Status**: ✅ Complete
**Date**: March 5, 2026

> **Note:** Phase 3 **BUILDS ON** Phase 1's Monaco editor/diagnostics/layout and Phase 2's PlaybackManager/ChannelControls/OutputPanel. It adds a Toolbar, full export pipeline (JSON/MIDI/UGE/WAV), file/URL/drag-drop import, and an examples browser — without replacing any prior functionality.

---

## Overview

Phase 3 of the web-ui migration implements **Export & Import** — enabling users to open `.bax` files, load curated examples, load songs from URLs, drag-and-drop files onto the editor, and download the current song in four formats: JSON (ISM), MIDI, UGE (hUGETracker), and WAV (rendered audio).

---

## Integration with Phase 1 and Phase 2

Phase 3 extends the existing modular architecture:

### Phase 1 Components (Reused)
- ✅ **Monaco Editor** — full VS Code editor with syntax highlighting
- ✅ **BeatBax Language** — custom language with autocomplete
- ✅ **Diagnostics** — inline parse error markers
- ✅ **Split Layout** — resizable three-pane layout
- ✅ **EventBus** — type-safe pub/sub (extended with `song:loaded`)

### Phase 2 Components (Reused)
- ✅ **PlaybackManager** — plays loaded songs automatically
- ✅ **ChannelControls** — refreshes channel panel on every file load
- ✅ **ChannelState** — mute/solo toggling per channel
- ✅ **OutputPanel** — log messages for file load and export events
- ✅ **TransportControls** — play/pause/stop keyboard shortcuts

### Phase 3 Components (Added)
- ✅ **ExportManager** — coordinates all export formats with browser download
- ✅ **ExportValidator** — validates song before export
- ✅ **DownloadHelper** — browser-safe file download, MIME types, export history
- ✅ **MidiBuilder** — browser-side SMF MIDI construction
- ✅ **Toolbar** — Open button, Examples dropdown, export buttons, Verify
- ✅ **FileLoader** — `<input type="file">` picker with File API reader
- ✅ **DragDropHandler** — drag-and-drop `.bax`/`.uge` files onto the editor
- ✅ **RemoteLoader** — fetch `.bax` from URLs and GitHub shorthand; EXAMPLE_SONGS pre-fetch cache

**Integration point:** `main-phase3.ts` — combines all three phases.

---

## Components Implemented

### 1. ExportManager (`export/export-manager.ts`)

Central coordinator for all export operations. Parses and resolves the song, validates it, runs the appropriate exporter, triggers a browser download, and emits EventBus events throughout.

**Supported formats:**

| Format | Extension | Description |
|--------|-----------|-------------|
| `json` | `.json`   | ISM (Intermediate Song Model) as JSON |
| `midi` | `.mid`    | 4-track Standard MIDI File |
| `uge`  | `.uge`    | hUGETracker v6 binary file |
| `wav`  | `.wav`    | PCM audio rendered via OfflineAudioContext |

**WAV rendering note:** `OfflineAudioContext.currentTime` stays at `0` until `startRendering()` is called, so the real-time scheduler never fires. The fix overrides `scheduler.tick` before calling `playAST()` to unconditionally drain the event queue, then flushes again after scheduling and before `startRendering()`.

**Export filename:** Derived from the stem of the last loaded `.bax` file (e.g. `sample_song.bax` → `sample_song.wav`). Defaults to `song` for editor-typed content.

**API:**
```typescript
const manager = new ExportManager(eventBus);
const result = await manager.export(source, 'wav', { filename: 'my_song' });
// → { success: true, filename: 'my_song.wav', size: 87040 }
```

**EventBus events emitted:**

| Event | Payload |
|-------|---------|
| `export:started` | `{ format }` |
| `export:success` | `{ format, filename }` |
| `export:error`   | `{ format, error }` |

---

### 2. ExportValidator (`export/export-validator.ts`)

Pre-export validation that checks the resolved song model for common problems (empty channels, missing instruments, etc.) and returns warnings without blocking export.

---

### 3. DownloadHelper (`export/download-helper.ts`)

Browser-safe download utilities:

- `downloadText(content, filename, mimeType)` — downloads a UTF-8 string as a file
- `downloadBinary(bytes, filename, mimeType)` — downloads a `Uint8Array` as a binary file
- `ensureExtension(filename, ext)` — appends extension if missing
- `MIME_TYPES` — map of format → MIME type string
- `ExportHistory` — lightweight in-memory log of recent exports

---

### 4. MidiBuilder (`export/midi-builder.ts`)

Browser-side construction of a 4-track Standard MIDI File from the resolved song model. Handles tempo events, note on/off, and channel mapping (pulse1→ch1, pulse2→ch2, wave→ch3, noise→ch10).

---

### 5. Toolbar (`ui/toolbar.ts`)

Top toolbar that provides all file and export controls.

**Features:**
- **Open** button — triggers a `<input type="file">` picker filtered to `.bax,.uge`
- **Examples** dropdown — lists curated example songs from `EXAMPLE_SONGS`
- **Export** buttons — one button per format (JSON, MIDI, UGE, WAV)
- **Verify** button — parse-only check with inline diagnostics, no playback

**Examples pre-fetch:** The first time the dropdown is opened, `prefetchExamples()` silently fetches all example files in parallel and caches their content. Subsequent clicks are served from the cache with no HTTP round-trip.

**Keyboard shortcut:** `Ctrl+O` opens the file picker.

**API:**
```typescript
const toolbar = new Toolbar({
  container,
  eventBus,
  onLoad: (filename, content) => { /* ... */ },
  onExport: (format) => { /* ... */ },
  onVerify: () => { /* optional */ },
});
toolbar.setExportEnabled(true | false);
toolbar.setStatus('Exported song.wav', 'success');
```

---

### 6. FileLoader (`import/file-loader.ts`)

Wraps the browser File API:

- `readFileAsText(file)` — reads a `File` object as a UTF-8 string via `FileReader`
- `FileLoader` class — creates and manages an `<input type="file">` element, attaches it to the DOM, and invokes `onLoad` / `onError` callbacks

---

### 7. DragDropHandler (`import/drag-drop-handler.ts`)

Attaches drag-and-drop listeners to any `HTMLElement` (defaults to `document.body`).

**Features:**
- Accepts `.bax` and `.uge` files by default (configurable via `acceptedExtensions`)
- Visual overlay during drag with CSS class `drag-over`
- Debounced drag counter to handle nested elements
- Cleanup via `dispose()` — removes all event listeners and overlay
- `onDrop`, `onInvalidFile`, `onError` callbacks

---

### 8. RemoteLoader (`import/remote-loader.ts`)

Fetches `.bax` source from remote URLs with a 10 s timeout.

**Features:**
- `loadRemote(url, options?)` — fetches text from an absolute URL or a `/songs/*` local path
- GitHub shorthand: `owner/repo/path.bax` expands to `https://raw.githubusercontent.com/...`
- `loadFromQueryParams(params)` — reads `?song=<url>` and loads on page startup
- `EXAMPLE_SONGS` — typed array of `{ label, path }` for the Toolbar dropdown
- `RemoteLoader` class — configurable instance with base URL

**Security:** `httpsOnly` option (default `false`) rejects plain-HTTP remote URLs when enabled.

---

## Event Bus Extensions

Phase 3 adds one new event to `utils/event-bus.ts`:

| Event | Payload | Purpose |
|-------|---------|---------|
| `song:loaded` | `{ filename: string }` | Fired before `parse:success` whenever a file is loaded from any source (Open, Examples, drag-drop, URL). Allows subscribers such as `ChannelControls` to reset their cached AST so the next `parse:success` always triggers a full re-render. |

---

## File Load → Channel Controls Refresh Flow

When any file is loaded:

```
eventBus.emit('song:loaded', { filename })
  → ChannelControls.ast = null   (cache reset)

emitParse(content)               (synchronous parse in main-phase3.ts)
  → eventBus.emit('parse:started')
  → eventBus.emit('parse:success', { ast })
    → ChannelControls.hasChannelStructureChanged()  returns true (ast was null)
    → ChannelControls.render()   ✅ UI updated immediately
```

This means the channel panel reflects the new song as soon as the file loads — without requiring the user to press Play.

---

## browser-fs Alias

`packages/engine` uses Node's `fs` module in some code paths (e.g. UGE writer). A Vite alias maps `fs` to `src/utils/browser-fs.ts`, which provides a no-op stub plus a `getCapturedWrite` / `clearCapturedWrite` API so the browser export pipeline can intercept binary output without native file I/O.

---

## Vite Build Configuration

`vite.config.ts` has a `phase3` build input targeting `index-phase3.html`. The `buffer` package is listed in `optimizeDeps.include` so it is pre-bundled and available as `globalThis.Buffer` via the polyfill at the top of `main-phase3.ts`.

---

## Directory Structure Added

```
src/
  export/
    export-manager.ts      # Central export coordinator (JSON/MIDI/UGE/WAV)
    export-validator.ts    # Pre-export song validation
    download-helper.ts     # Browser file download, MIME types, history
    midi-builder.ts        # Browser-side SMF MIDI construction
    index.ts               # Module re-exports
  import/
    file-loader.ts         # File picker + FileReader wrapper
    drag-drop-handler.ts   # Drag-and-drop .bax/.uge onto editor
    remote-loader.ts       # Fetch from URL/GitHub; EXAMPLE_SONGS cache
    index.ts               # Module re-exports
  ui/
    toolbar.ts             # Open, Examples, Export, Verify toolbar
  utils/
    browser-fs.ts          # Node fs stub for browser builds
```

---

## Key Implementation Notes

### Export filename
All exports use the stem of the last-loaded `.bax` filename. The stem is stored in `loadedFilename` (in `main-phase3.ts`) and updated in all three load paths (Open, drag-drop, URL). When the user types content fresh with no file loaded, the default is `song`.

### ChannelControls re-render on load
Prior to Phase 3, `ChannelControls` only re-rendered when `parse:success` was emitted by `PlaybackManager.play()`. Phase 3 introduces `emitParse()` — called immediately after `editor.setValue()` in every load path — so the channel panel updates without playback. The `song:loaded` event is emitted first to clear `ChannelControls.ast`, bypassing the "same channel structure" optimisation guard.

### Example song pre-fetch
`toolbar.ts` calls `prefetchExamples()` on the first dropdown open. This fires parallel `loadRemote()` calls for all entries in `EXAMPLE_SONGS` and stores results in `this.exampleCache`. The cache is also populated on first click if pre-fetch hasn't completed yet.
