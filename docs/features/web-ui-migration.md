---
title: "Web UI Migration: Modular Desktop-Style Architecture"
status: proposed
authors: ["kadraman"]
created: 2026-02-08
issue: "https://github.com/kadraman/beatbax/issues/45"
---

## Overview

This document outlines the migration strategy for transforming the current monolithic `apps/web-ui/src/main.ts` into a scalable, maintainable desktop-style application with proper separation of concerns.

## Current State

The existing web UI is a single-file Vite + vanilla TypeScript application with all logic in `main.ts`:
- Monaco editor setup and language registration
- Playback controls and engine integration
- Export functionality
- UI event handlers
- State management
- Mixed concerns and tight coupling

**Problems:**
- Difficult to test individual components
- Hard to maintain as features grow
- Cannot reuse logic in other contexts (e.g., Electron)
- No clear separation between UI, business logic, and engine integration
- Limited scalability for new features (help panel, channel mixer, etc.)

## Goals

1. **Modular Architecture**: Break down monolithic file into focused, single-responsibility modules
2. **Testability**: Enable unit testing of individual components
3. **Reusability**: Allow code reuse across browser, Electron, and future frontends
4. **Desktop-Style UX**: Implement professional IDE-like interface with:
   - Menu bar (File, Edit, View, Help)
   - Resizable split panes (editor, output, help)
   - Status bar (errors, tempo, chip info)
   - Toolbar (playback controls, export buttons)
   - Channel mixer (mute/solo/volume per channel)
5. **Type Safety**: Strong TypeScript interfaces throughout
6. **Maintainability**: Clear code organization following BeatBax architectural patterns

## Technology Stack

### Core Dependencies

#### 1. Monaco Editor (Already in use)
- **Purpose**: Full-featured code editor component (VS Code's editor)
- **Size**: ~5MB gzipped (tree-shakeable)
- **Features**:
  - Syntax highlighting
  - IntelliSense/autocomplete
  - Error markers and diagnostics
  - Diff viewer
  - Multiple cursors
  - Command palette
- **Integration**: Custom language definition for `.bax` files

#### 2. Allotment (New dependency)
- **Purpose**: Resizable split panes for layout
- **Size**: ~10KB gzipped
- **Features**:
  - Horizontal and vertical splits
  - Nested layouts
  - Persists sizes to localStorage
  - Drag-to-resize handles
  - Min/max size constraints
- **Repository**: https://github.com/johnwalley/allotment
- **License**: MIT
- **Note**: Zero dependencies, works with vanilla JS/TS

#### 3. Floating UI (Optional)
- **Purpose**: Dropdown menus and tooltips positioning
- **Size**: ~3KB core
- **Alternative**: Native `<details>` + CSS for simple menus
- **Repository**: https://floating-ui.com/
- **License**: MIT

### Build Configuration

#### Vite Plugin for Monaco

```typescript
// vite.config.ts additions
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      // Only bundle languages actually used (reduce bundle size)
      languageWorkers: ['json', 'typescript'],
      customWorkers: [
        {
          label: 'beatbax',
          entry: 'monaco-editor/esm/vs/language/typescript/ts.worker',
        },
      ],
    }),
  ],
});
```

## Proposed Architecture

### Directory Structure

```
apps/web-ui/src/
├── main.ts                    # App initialization & coordination (entry point)
│
├── editor/                    # Monaco editor subsystem
│   ├── monaco-setup.ts        # Editor initialization & configuration
│   ├── beatbax-language.ts    # Language tokenizer, syntax highlighting, autocomplete
│   ├── editor-state.ts        # Editor state management (content, cursor position)
│   ├── diagnostics.ts         # Error markers & inline validation
│   └── snippets.ts            # Code snippets for common patterns
│
├── ui/                        # UI layout and chrome
│   ├── layout.ts              # Allotment split pane setup & persistence
│   ├── menu-bar.ts            # File/Edit/View/Help menu implementation
│   ├── toolbar.ts             # Play/Stop/Export button controls
│   ├── status-bar.ts          # Status indicators (BPM, chip, errors, cursor pos)
│   └── theme-manager.ts       # Dark/light theme switching
│
├── panels/                    # Resizable panel components
│   ├── output-panel.ts        # Console/error/warning output display
│   ├── help-panel.ts          # Reference docs, keyboard shortcuts, examples
│   ├── channel-mixer.ts       # Per-channel mute/solo/volume controls
│   └── export-panel.ts        # Export options and recent exports
│
├── playback/                  # Audio playback subsystem
│   ├── playback-manager.ts    # Wraps engine playback lifecycle
│   ├── transport-controls.ts  # Play/pause/stop state machine
│   ├── audio-sync.ts          # Scheduler integration & timing
│   └── channel-state.ts       # Mute/solo state per channel
│
├── export/                    # Export functionality
│   ├── export-manager.ts      # Handle JSON/MIDI/UGE/WAV exports
│   ├── download-helper.ts     # Browser file download utilities
│   └── export-validator.ts    # Pre-export validation
│
├── import/                    # File import and loading
│   ├── file-loader.ts         # Load .bax files from disk
│   ├── remote-loader.ts       # Load from URLs (examples, gists)
│   └── drag-drop-handler.ts   # Drag-and-drop file support
│
└── utils/                     # Shared utilities
    ├── event-bus.ts           # Cross-component communication (pub/sub)
    ├── local-storage.ts       # Persist editor state & layout preferences
    ├── keyboard-shortcuts.ts  # Global keyboard shortcut handling
    └── analytics.ts           # Optional usage analytics (privacy-respecting)
```

### Module Responsibilities

#### 1. Editor Subsystem (`editor/`)

**monaco-setup.ts**
- Initialize Monaco editor instance
- Configure editor options (theme, font, minimap, etc.)
- Set up automatic layout resizing
- Export factory function for creating editors

**beatbax-language.ts**
- Register `.bax` language with Monaco
- Define syntax highlighting rules (Monarch tokenizer)
- Implement autocomplete provider (keywords, instrument types, notes)
- Hover provider for inline documentation
- Define code snippets

**editor-state.ts**
- Manage editor content state
- Auto-save to localStorage
- Undo/redo stack
- Cursor position tracking
- Selection management

**diagnostics.ts**
- Parse errors and warnings from engine
- Convert to Monaco markers
- Display inline error messages
- Squiggly underlines
- Problem count badge

**snippets.ts**
- Define reusable code snippets
- Instrument definitions
- Pattern templates
- Full song templates

#### 2. UI Chrome (`ui/`)

**layout.ts**
- Initialize Allotment split panes
- Configure layout presets (editor-only, split, three-column)
- Persist pane sizes to localStorage
- Handle pane visibility toggles
- Responsive breakpoints

**menu-bar.ts**
- File menu: New, Open, Save, Save As, Recent Files
- Edit menu: Undo, Redo, Cut, Copy, Paste, Find, Replace
- View menu: Toggle panels, Zoom, Theme
- Help menu: Documentation, Keyboard Shortcuts, Examples, About

**toolbar.ts**
- Play/Pause/Stop buttons
- Export dropdown (JSON, MIDI, UGE, WAV)
- BPM display and adjustment
- Loop/repeat toggle
- Channel mute/solo quick access

**status-bar.ts**
- Current line:column position
- Error/warning count
- Chip type indicator
- BPM display
- Playback time

**theme-manager.ts**
- Switch between dark/light themes
- Apply theme to Monaco, UI, and panels
- Persist theme preference
- System theme detection

#### 3. Panels (`panels/`)

**output-panel.ts**
- Display logged messages
- Color-coded by type (error, warning, info, success)
- Timestamps
- Clear button
- Filter by type
- Auto-scroll to latest

**help-panel.ts**
- Searchable reference documentation
- Keyboard shortcuts list
- Example snippets (click to insert)
- Quick links to full docs
- Collapsible sections

**channel-mixer.ts**
- Per-channel controls (channels 1-4)
- Mute/solo buttons
- Volume sliders
- Pan controls (if supported)
- Visual waveform representation (optional)

**export-panel.ts**
- Export format selection
- Export options (duration, channels, sample rate)
- Recent exports list
- Re-download previous exports
- Export progress indicator

#### 4. Playback (`playback/`)

**playback-manager.ts**
- Wrap engine's `play()` and `stop()` functions
- Parse `.bax` source before playback
- Handle playback errors gracefully
- Emit playback events (started, stopped, error)
- Track playback state

**transport-controls.ts**
- State machine for play/pause/stop
- Button enable/disable logic
- Keyboard shortcuts (Space = play/pause, Esc = stop)
- Prevent double-clicks

**audio-sync.ts**
- Integrate with engine scheduler
- Current playback position
- Time display (current / total)
- Seek support (future)

**channel-state.ts**
- Track mute/solo state per channel
- Apply to engine during playback
- Sync with channel mixer UI
- Persist preferences

#### 5. Export (`export/`)

**export-manager.ts**
- Call engine export functions
- Validate AST before export
- Handle export errors
- Emit export events (started, success, error)
- Track export history

**download-helper.ts**
- Create blob URLs for downloads
- Trigger browser download dialog
- Generate filenames (escape invalid chars)
- Handle MIME types correctly

**export-validator.ts**
- Pre-export validation
- Check for empty patterns/sequences
- Warn about missing instruments
- Suggest fixes for common issues

#### 6. Import (`import/`)

**file-loader.ts**
- File input dialog
- Read local `.bax` files
- Load into editor
- Handle encoding issues

**remote-loader.ts**
- Fetch `.bax` files from URLs
- Handle CORS issues
- Load example songs
- GitHub gist support

**drag-drop-handler.ts**
- Drag-and-drop zone over editor
- Accept `.bax`, `.uge` files
- Visual drop indicator
- Load dropped files

#### 7. Utilities (`utils/`)

**event-bus.ts**
- Lightweight pub/sub event system
- Type-safe event definitions
- Subscribe/unsubscribe methods
- Emit with typed payloads
- Used for cross-component communication

**local-storage.ts**
- Wrapper around localStorage
- Type-safe getters/setters
- JSON serialization
- Key namespacing
- Error handling for quota exceeded

**keyboard-shortcuts.ts**
- Global shortcut registry
- Prevent conflicts
- Display shortcuts in help panel
- Platform-specific (Ctrl vs Cmd)

**analytics.ts** (Optional)
- Privacy-respecting usage tracking
- Feature usage stats
- Error reporting
- No PII collection
- Easy to disable

### Event-Driven Architecture

Components communicate via `EventBus` to avoid tight coupling:

```typescript
// Event type definitions
interface BeatBaxEvents {
  // Editor events
  'editor:changed': { content: string };
  'editor:saved': { filename: string };

  // Parse events
  'parse:started': void;
  'parse:success': { ast: AST };
  'parse:error': { error: Error };

  // Playback events
  'playback:started': void;
  'playback:stopped': void;
  'playback:paused': void;
  'playback:error': { error: Error };
  'playback:position': { current: number; total: number };

  // Export events
  'export:started': { format: string };
  'export:success': { format: string; filename: string };
  'export:error': { format: string; error: Error };

  // UI events
  'theme:changed': { theme: 'dark' | 'light' };
  'panel:toggled': { panel: string; visible: boolean };
  'layout:changed': { layout: string };

  // Channel events
  'channel:muted': { channel: number };
  'channel:soloed': { channel: number };
}
```

## Implementation Details

### Phase 1: Core Infrastructure (Week 1)

**Goal:** Extract editor and establish event-driven architecture

#### Tasks

1. **Create EventBus utility**
   - Implement pub/sub system
   - Add TypeScript event typing
   - Unit tests

2. **Extract Monaco editor setup**
   - Create `editor/monaco-setup.ts`
   - Move editor initialization
   - Export factory function

3. **Create BeatBax language definition**
   - Create `editor/beatbax-language.ts`
   - Implement Monarch tokenizer
   - Add syntax highlighting rules
   - Register autocomplete provider

4. **Implement diagnostics system**
   - Create `editor/diagnostics.ts`
   - Parse engine errors
   - Convert to Monaco markers
   - Display inline errors

5. **Create layout manager**
   - Create `ui/layout.ts`
   - Initialize Allotment
   - Configure basic split (editor + output)
   - Persist sizes to localStorage

6. **Refactor main.ts**
   - Initialize EventBus
   - Use new editor factory
   - Wire up basic events

**Deliverables:**
- `utils/event-bus.ts` with tests
- `editor/` subsystem functional
- `ui/layout.ts` with split panes working
- Reduced `main.ts` size by ~50%

**Testing:**
- Unit tests for EventBus
- Integration test: editor loads and displays content
- Integration test: split panes resize and persist

---

### Phase 2: Playback & Output (Week 2)

**Goal:** Extract playback logic and create output panel

#### Tasks

1. **Create PlaybackManager**
   - Create `playback/playback-manager.ts`
   - Wrap engine play/stop functions
   - Emit playback events via EventBus
   - Handle parsing errors gracefully

2. **Implement transport controls**
   - Create `playback/transport-controls.ts`
   - State machine (stopped → playing → stopped)
   - Button enable/disable logic
   - Keyboard shortcuts

3. **Create OutputPanel**
   - Create `panels/output-panel.ts`
   - Listen to EventBus for errors/logs
   - Display timestamped messages
   - Color-coded by severity
   - Clear and filter buttons

4. **Implement channel state manager**
   - Create `playback/channel-state.ts`
   - Track mute/solo per channel
   - Integrate with engine
   - Persist to localStorage

5. **Add status bar**
   - Create `ui/status-bar.ts`
   - Display error count
   - Show playback time
   - Display BPM and chip

**Deliverables:**
- `playback/` subsystem functional
- `panels/output-panel.ts` working
- `ui/status-bar.ts` live
- All playback logic out of `main.ts`

**Testing:**
- Unit tests for PlaybackManager state
- Integration test: play/stop functionality
- Integration test: errors appear in output panel
- Integration test: keyboard shortcuts work

---

### Phase 3: Export & Import (Week 3)

**Goal:** Modularize export/import functionality

#### Tasks

1. **Create ExportManager**
   - Create `export/export-manager.ts`
   - Wrap engine export functions
   - Emit export events
   - Track export history

2. **Implement download helper**
   - Create `export/download-helper.ts`
   - Generate blob URLs
   - Trigger downloads
   - Handle filenames and MIME types

3. **Add export validator**
   - Create `export/export-validator.ts`
   - Pre-validate AST before export
   - Check for common issues
   - Display warnings in output panel

4. **Create FileLoader**
   - Create `import/file-loader.ts`
   - File input dialog
   - Read file contents
   - Load into editor

5. **Implement drag-and-drop**
   - Create `import/drag-drop-handler.ts`
   - Drop zone overlay
   - Accept `.bax` and `.uge` files
   - Load dropped files

6. **Create toolbar**
   - Create `ui/toolbar.ts`
   - Export dropdown menu
   - Play/stop buttons
   - Visual button states

**Deliverables:**
- `export/` subsystem complete
- `import/` subsystem working
- `ui/toolbar.ts` functional
- All export/import logic out of `main.ts`

**Testing:**
- Unit tests for export validation
- Integration test: export to all formats
- Integration test: load file from disk
- Integration test: drag-and-drop file

---

### Phase 4: Advanced Features (Week 4)

**Goal:** Add professional IDE-like features

#### Tasks

1. **Create menu bar**
   - Create `ui/menu-bar.ts`
   - File menu (New, Open, Save, Recent)
   - Edit menu (Undo, Redo, Find)
   - View menu (Toggle panels, Theme)
   - Help menu (Docs, Shortcuts, Examples)

2. **Implement help panel**
   - Create `panels/help-panel.ts`
   - Embedded reference docs
   - Searchable content
   - Click-to-insert examples
   - Keyboard shortcuts reference

3. **Create channel mixer**
   - Create `panels/channel-mixer.ts`
   - Per-channel mute/solo buttons
   - Volume sliders
   - Visual channel indicators
   - Wire to playback engine

4. **Add theme manager**
   - Create `ui/theme-manager.ts`
   - Dark/light theme switching
   - Apply to Monaco and UI
   - System theme detection
   - Persist preference

5. **Implement keyboard shortcuts**
   - Create `utils/keyboard-shortcuts.ts`
   - Global shortcut registry
   - Platform-specific handling
   - Display in help panel

6. **Add editor state management**
   - Create `editor/editor-state.ts`
   - Auto-save to localStorage
   - Recent files list
   - Cursor position restoration

7. **Create localStorage wrapper**
   - Create `utils/local-storage.ts`
   - Type-safe wrappers
   - Namespaced keys
   - Handle quota errors

**Deliverables:**
- `ui/menu-bar.ts` with all menus
- `panels/help-panel.ts` with docs
- `panels/channel-mixer.ts` working
- `ui/theme-manager.ts` functional
- Complete keyboard shortcut system
- `main.ts` reduced to coordination logic only (~100 lines)

**Testing:**
- Integration test: all menu items work
- Integration test: theme switches apply everywhere
- Integration test: shortcuts don't conflict
- Integration test: localStorage persists state
- E2E test: full workflow from load to export

---

## Detailed Component Specifications

### 1. EventBus (`utils/event-bus.ts`)

```typescript
type EventHandler<T = any> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /**
   * Subscribe to an event
   * @returns Unsubscribe function
   */
  on<K extends keyof BeatBaxEvents>(
    event: K,
    handler: EventHandler<BeatBaxEvents[K]>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => this.off(event, handler);
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof BeatBaxEvents>(
    event: K,
    handler: EventHandler<BeatBaxEvents[K]>
  ): void {
    this.handlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event with payload
   */
  emit<K extends keyof BeatBaxEvents>(
    event: K,
    payload: BeatBaxEvents[K]
  ): void {
    this.handlers.get(event)?.forEach(handler => handler(payload));
  }

  /**
   * Clear all handlers (mainly for testing)
   */
  clear(): void {
    this.handlers.clear();
  }
}
```

**Features:**
- Type-safe event names and payloads
- Returns unsubscribe function
- Supports wildcard handlers (future)
- No memory leaks if properly unsubscribed

**Usage:**
```typescript
const eventBus = new EventBus();

// Subscribe
const unsub = eventBus.on('playback:started', () => {
  console.log('Playback started');
});

// Emit
eventBus.emit('playback:started', undefined);

// Unsubscribe
unsub();
```

---

### 2. Monaco Setup (`editor/monaco-setup.ts`)

```typescript
import * as monaco from 'monaco-editor';
import { registerBeatBaxLanguage } from './beatbax-language';

export interface EditorConfig {
  container: HTMLElement;
  initialValue?: string;
  theme?: 'vs-dark' | 'vs-light';
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

/**
 * Create and configure a Monaco editor instance
 */
export function createEditor(config: EditorConfig): monaco.editor.IStandaloneCodeEditor {
  // Register BeatBax language (only once)
  registerBeatBaxLanguage();

  const editor = monaco.editor.create(config.container, {
    value: config.initialValue || '',
    language: 'beatbax',
    theme: config.theme || 'vs-dark',
    readOnly: config.readOnly || false,

    // Editor options
    fontSize: 14,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'off',
    folding: true,
    lineDecorationsWidth: 10,
    lineNumbersMinChars: 3,

    // Scrollbar
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
    },
  });

  // onChange callback
  if (config.onChange) {
    editor.onDidChangeModelContent(() => {
      config.onChange!(editor.getValue());
    });
  }

  return editor;
}

/**
 * Update editor theme
 */
export function setEditorTheme(
  editor: monaco.editor.IStandaloneCodeEditor,
  theme: 'vs-dark' | 'vs-light'
): void {
  monaco.editor.setTheme(theme);
}

/**
 * Dispose editor and free resources
 */
export function disposeEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
  editor.dispose();
}
```

---

### 3. BeatBax Language (`editor/beatbax-language.ts`)

```typescript
import * as monaco from 'monaco-editor';

let registered = false;

/**
 * Register BeatBax language with Monaco (call once)
 */
export function registerBeatBaxLanguage(): void {
  if (registered) return;
  registered = true;

  // Register language
  monaco.languages.register({ id: 'beatbax' });

  // Define tokenizer (syntax highlighting)
  monaco.languages.setMonarchTokensProvider('beatbax', {
    keywords: [
      'chip', 'bpm', 'time', 'stepsPerBar', 'ticksPerStep', 'volume',
      'inst', 'pat', 'seq', 'channel', 'arrange', 'play', 'export',
      'import', 'song', 'effect'
    ],

    typeKeywords: [
      'type', 'duty', 'env', 'wave', 'sweep', 'gm'
    ],

    chipTypes: [
      'gameboy', 'pulse1', 'pulse2', 'wave', 'noise'
    ],

    tokenizer: {
      root: [
        // Keywords
        [/\b(chip|bpm|time|stepsPerBar|ticksPerStep|volume|inst|pat|seq|channel|arrange|play|export|import|song|effect)\b/, 'keyword'],

        // Type keywords
        [/\b(type|duty|env|wave|sweep|gm)\b/, 'keyword.control'],

        // Chip types
        [/\b(gameboy|pulse1|pulse2|wave|noise)\b/, 'type'],

        // Notes (C4, G#5, etc.)
        [/\b[A-G][#b]?[0-9]\b/, 'constant.numeric'],

        // Rests and sustains
        [/\./, 'constant.language.rest'],
        [/[_\-]/, 'constant.language.sustain'],

        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],

        // Comments
        [/#.*$/, 'comment'],

        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],

        // Operators and delimiters
        [/[=>\[\],:()*+]/, 'delimiter'],

        // Identifiers
        [/[a-zA-Z_]\w*/, 'identifier'],
      ]
    }
  });

  // Register autocomplete provider
  monaco.languages.registerCompletionItemProvider('beatbax', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return {
        suggestions: [
          // Keywords
          {
            label: 'inst',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'inst ${1:name} type=${2:pulse1} duty=${3:50} env=${4:12,down}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define an instrument',
            range,
          },
          {
            label: 'pat',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'pat ${1:name} = ${2:C4 E4 G4}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define a pattern',
            range,
          },
          {
            label: 'seq',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'seq ${1:name} = ${2:pattern}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define a sequence',
            range,
          },
          {
            label: 'channel',
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: 'channel ${1:1} => inst ${2:name} seq ${3:sequence}',
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Map sequence to channel',
            range,
          },

          // Instrument types
          {
            label: 'pulse1',
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: 'pulse1',
            documentation: 'Game Boy Pulse Channel 1 (with sweep)',
            range,
          },
          {
            label: 'pulse2',
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: 'pulse2',
            documentation: 'Game Boy Pulse Channel 2',
            range,
          },
          {
            label: 'wave',
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: 'wave',
            documentation: 'Game Boy Wave Channel (32 samples)',
            range,
          },
          {
            label: 'noise',
            kind: monaco.languages.CompletionItemKind.EnumMember,
            insertText: 'noise',
            documentation: 'Game Boy Noise Channel',
            range,
          },

          // Notes
          ...generateNoteCompletions(range),
        ],
      };
    },
  });

  // Hover provider (show docs on hover)
  monaco.languages.registerHoverProvider('beatbax', {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const docs: Record<string, string> = {
        inst: 'Define an instrument with type, duty cycle, and envelope',
        pat: 'Define a pattern of notes, rests, and sustains',
        seq: 'Define a sequence of patterns with transforms',
        channel: 'Map a sequence to a sound chip channel',
        play: 'Start playback (with optional auto and repeat flags)',
        export: 'Export song to JSON, MIDI, UGE, or WAV format',
      };

      const documentation = docs[word.word];
      if (!documentation) return null;

      return {
        range: new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        ),
        contents: [{ value: documentation }],
      };
    },
  });
}

/**
 * Generate note completions (C0-C8)
 */
function generateNoteCompletions(range: any): any[] {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const completions = [];

  for (let octave = 0; octave <= 8; octave++) {
    for (const note of notes) {
      completions.push({
        label: `${note}${octave}`,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: `${note}${octave}`,
        documentation: `Note: ${note} in octave ${octave}`,
        range,
      });
    }
  }

  return completions;
}
```

---

### 4. PlaybackManager (`playback/playback-manager.ts`)

```typescript
import { parse, resolveImports } from '@beatbax/engine';
import { play, stop } from '@beatbax/engine';
import type { AST } from '@beatbax/engine';
import type { EventBus } from '../utils/event-bus';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  error: Error | null;
}

/**
 * Manages audio playback lifecycle and state
 */
export class PlaybackManager {
  private state: PlaybackState = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    error: null,
  };

  constructor(private eventBus: EventBus) {}

  /**
   * Parse and start playback
   */
  async play(source: string): Promise<void> {
    try {
      // Reset error state
      this.state.error = null;

      // Emit parsing event
      this.eventBus.emit('parse:started', undefined);

      // Parse source
      const ast = parse(source);

      // Resolve imports (if any)
      const resolvedAst = await resolveImports(ast);

      // Emit parse success
      this.eventBus.emit('parse:success', { ast: resolvedAst });

      // Start playback
      await play(resolvedAst);

      // Update state
      this.state.isPlaying = true;
      this.state.isPaused = false;

      // Emit playback started
      this.eventBus.emit('playback:started', undefined);

    } catch (error) {
      this.state.error = error as Error;
      this.eventBus.emit('parse:error', { error: error as Error });
      this.eventBus.emit('playback:error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.state.isPlaying) return;

    stop();

    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.currentTime = 0;

    this.eventBus.emit('playback:stopped', undefined);
  }

  /**
   * Pause playback (future feature)
   */
  pause(): void {
    if (!this.state.isPlaying || this.state.isPaused) return;

    // TODO: Implement pause in engine
    this.state.isPaused = true;
    this.eventBus.emit('playback:paused', undefined);
  }

  /**
   * Get current playback state
   */
  getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state.isPlaying && !this.state.isPaused;
  }
}
```

---

### 5. OutputPanel (`panels/output-panel.ts`)

```typescript
import type { EventBus } from '../utils/event-bus';

export interface OutputMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  timestamp: Date;
  source?: string; // Optional: parse, playback, export, etc.
}

/**
 * Manages console/error output display
 */
export class OutputPanel {
  private messages: OutputMessage[] = [];
  private container: HTMLElement;
  private maxMessages = 1000; // Prevent memory issues

  constructor(
    container: HTMLElement,
    private eventBus: EventBus
  ) {
    this.container = container;
    this.setupEventListeners();
    this.render();
  }

  /**
   * Subscribe to relevant events
   */
  private setupEventListeners(): void {
    // Parse errors
    this.eventBus.on('parse:error', ({ error }) => {
      this.addMessage({
        type: 'error',
        message: `Parse error: ${error.message}`,
        source: 'parser',
        timestamp: new Date(),
      });
    });

    // Playback errors
    this.eventBus.on('playback:error', ({ error }) => {
      this.addMessage({
        type: 'error',
        message: `Playback error: ${error.message}`,
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Export events
    this.eventBus.on('export:started', ({ format }) => {
      this.addMessage({
        type: 'info',
        message: `Exporting to ${format}...`,
        source: 'export',
        timestamp: new Date(),
      });
    });

    this.eventBus.on('export:success', ({ format, filename }) => {
      this.addMessage({
        type: 'success',
        message: `Successfully exported to ${filename}`,
        source: 'export',
        timestamp: new Date(),
      });
    });

    this.eventBus.on('export:error', ({ format, error }) => {
      this.addMessage({
        type: 'error',
        message: `Export failed (${format}): ${error.message}`,
        source: 'export',
        timestamp: new Date(),
      });
    });

    // Parse success
    this.eventBus.on('parse:success', () => {
      this.addMessage({
        type: 'success',
        message: 'Parse successful',
        source: 'parser',
        timestamp: new Date(),
      });
    });

    // Playback started
    this.eventBus.on('playback:started', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback started',
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Playback stopped
    this.eventBus.on('playback:stopped', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback stopped',
        source: 'playback',
        timestamp: new Date(),
      });
    });
  }

  /**
   * Add a message to the output
   */
  addMessage(msg: OutputMessage): void {
    this.messages.push(msg);

    // Trim old messages if exceeds max
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    this.render();
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.render();
  }

  /**
   * Render messages to DOM
   */
  private render(): void {
    const html = `
      <div class="output-header">
        <span>Output</span>
        <button class="clear-btn" title="Clear output">Clear</button>
      </div>
      <div class="output-messages">
        ${this.messages.map(msg => this.renderMessage(msg)).join('')}
      </div>
    `;

    this.container.innerHTML = html;

    // Wire up clear button
    this.container.querySelector('.clear-btn')?.addEventListener('click', () => {
      this.clear();
    });

    // Auto-scroll to bottom
    const messagesDiv = this.container.querySelector('.output-messages');
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  /**
   * Render a single message
   */
  private renderMessage(msg: OutputMessage): string {
    const icon = this.getIcon(msg.type);
    const time = msg.timestamp.toLocaleTimeString();
    const source = msg.source ? `[${msg.source}]` : '';

    return `
      <div class="output-message output-${msg.type}">
        <span class="output-icon">${icon}</span>
        <span class="output-time">${time}</span>
        ${source ? `<span class="output-source">${source}</span>` : ''}
        <span class="output-text">${this.escapeHtml(msg.message)}</span>
      </div>
    `;
  }

  /**
   * Get icon for message type
   */
  private getIcon(type: OutputMessage['type']): string {
    const icons = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅',
    };
    return icons[type];
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
```

**CSS:**
```css
.output-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
}

.output-messages {
  height: calc(100% - 40px);
  overflow-y: auto;
  padding: 8px;
  font-family: 'Consolas', monospace;
  font-size: 13px;
}

.output-message {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  line-height: 1.5;
}

.output-error { color: var(--error-color); }
.output-warning { color: var(--warning-color); }
.output-info { color: var(--info-color); }
.output-success { color: var(--success-color); }

.output-time {
  color: var(--text-muted);
  min-width: 70px;
}

.output-source {
  color: var(--text-muted);
  font-weight: bold;
  min-width: 80px;
}
```

---

### 6. Layout Manager (`ui/layout.ts`)

```typescript
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

export interface LayoutConfig {
  editorContainer: HTMLElement;
  outputContainer: HTMLElement;
  helpContainer?: HTMLElement;
  initialSizes?: number[];
}

/**
 * Manages split pane layout with Allotment
 */
export class LayoutManager {
  private allotment: Allotment;
  private storageKey = 'beatbax-layout-sizes';

  constructor(config: LayoutConfig) {
    const container = document.getElementById('layout-container')!;

    // Create Allotment instance
    this.allotment = new Allotment({
      vertical: false,
      proportionalLayout: true,
    });

    // Load saved sizes or use defaults
    const savedSizes = this.loadSizes();
    const sizes = savedSizes || config.initialSizes || [60, 40];

    // Add panes
    this.allotment.addPane(config.editorContainer, {
      minSize: 300,
      preferredSize: sizes[0],
    });

    this.allotment.addPane(config.outputContainer, {
      minSize: 150,
      preferredSize: sizes[1],
    });

    // Optional help panel
    if (config.helpContainer) {
      this.allotment.addPane(config.helpContainer, {
        minSize: 200,
        preferredSize: sizes[2] || 25,
      });
    }

    // Mount to container
    container.appendChild(this.allotment.element);

    // Listen for resize and persist
    this.allotment.on('change', () => {
      this.saveSizes();
    });
  }

  /**
   * Save current pane sizes to localStorage
   */
  private saveSizes(): void {
    const sizes = this.allotment.getSizes();
    localStorage.setItem(this.storageKey, JSON.stringify(sizes));
  }

  /**
   * Load pane sizes from localStorage
   */
  private loadSizes(): number[] | null {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return null;

    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }

  /**
   * Toggle panel visibility
   */
  togglePanel(index: number): void {
    const pane = this.allotment.getPanes()[index];
    if (!pane) return;

    // Toggle visibility (implementation depends on Allotment API)
    // This may require custom logic
  }

  /**
   * Reset to default layout
   */
  reset(): void {
    localStorage.removeItem(this.storageKey);
    // Reload page or manually reset sizes
    window.location.reload();
  }
}
```

---

## Testing Strategy

### Unit Tests

Each module should have unit tests covering:
- Public API methods
- Error handling
- Edge cases
- State management

**Example: EventBus unit tests**
```typescript
describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  test('should emit and receive events', () => {
    const handler = jest.fn();
    eventBus.on('playback:started', handler);
    eventBus.emit('playback:started', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('should unsubscribe correctly', () => {
    const handler = jest.fn();
    const unsub = eventBus.on('playback:started', handler);
    unsub();
    eventBus.emit('playback:started', undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  test('should handle multiple subscribers', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    eventBus.on('playback:started', handler1);
    eventBus.on('playback:started', handler2);
    eventBus.emit('playback:started', undefined);
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test interactions between components:
- Editor → PlaybackManager → OutputPanel
- User clicks play → Engine plays → Errors display
- Export flow from start to finish

**Example: Playback integration test**
```typescript
describe('Playback Integration', () => {
  test('should play valid song', async () => {
    const eventBus = new EventBus();
    const playbackManager = new PlaybackManager(eventBus);

    const parseSuccess = jest.fn();
    eventBus.on('parse:success', parseSuccess);

    const playbackStarted = jest.fn();
    eventBus.on('playback:started', playbackStarted);

    const source = 'chip gameboy\nbpm 120\nplay';
    await playbackManager.play(source);

    expect(parseSuccess).toHaveBeenCalled();
    expect(playbackStarted).toHaveBeenCalled();
  });
});
```

### E2E Tests

Use Playwright or Cypress to test full workflows:
- Load page → Load example → Play → Stop
- Load page → Write code → Export JSON → Download
- Load page → Open file → Play → Mute channel → Export

---

## Performance Considerations

### Bundle Size Optimization

1. **Tree-shake Monaco languages**
   - Only include JSON and TypeScript workers
   - Custom BeatBax language is small

2. **Code splitting**
   - Lazy-load help panel content
   - Lazy-load export modules until first use

3. **Minification**
   - Use Vite's production build
   - Enable gzip compression on server

**Target bundle sizes:**
- Initial load: <1MB gzipped
- Monaco: ~300KB gzipped (tree-shaken)
- Allotment: ~10KB gzipped
- BeatBax engine: ~150KB gzipped
- App code: <100KB gzipped

### Runtime Performance

1. **Debounce editor changes**
   - Don't parse on every keystroke
   - Use 500ms debounce for live validation

2. **Virtual scrolling for output**
   - If >1000 messages, use virtual list
   - Only render visible messages

3. **Request Animation Frame**
   - Update playback position UI with RAF
   - Smooth animations for VU meters

4. **Web Workers**
   - Parse `.bax` files in worker thread
   - Export in worker to avoid blocking UI

---

## Accessibility

Ensure UI is accessible:

1. **Keyboard Navigation**
   - All buttons accessible via keyboard
   - Focus indicators visible
   - Logical tab order

2. **Screen Reader Support**
   - ARIA labels on all controls
   - Announce errors in output panel
   - Status updates announced

3. **Color Contrast**
   - WCAG AA compliant colors
   - High contrast theme option

4. **Responsive Design**
   - Works on tablets (min 768px width)
   - Graceful degradation on mobile

---

## Future Enhancements

Post-migration features to consider:

1. **Advanced Editor Features**
   - Multi-file project support
   - Split editor view (compare instruments)
   - Code formatting (prettier-style)
   - Reference search (find instrument usage)

2. **Visualization**
   - Real-time waveform display
   - Piano roll view
   - Channel activity indicators
   - Spectrogram

3. **Collaboration**
   - Share songs via URL (encode in hash)
   - Export to GitHub gist
   - Import from URL

4. **Project Management**
   - File tree for multi-file projects
   - Import instrument libraries
   - Organize patterns/sequences in folders

5. **Advanced Playback**
   - Seek to position
   - Loop regions
   - Metronome click
   - MIDI input (play keyboard)

6. **Debugging Tools**
   - Step through ticks
   - Breakpoints on patterns
   - Inspect channel state
   - Performance profiling

---

## Migration Checklist

Use this checklist during implementation:

### Phase 1: Core Infrastructure
- [ ] Create `utils/event-bus.ts` with tests
- [ ] Create `editor/monaco-setup.ts`
- [ ] Create `editor/beatbax-language.ts` with tokenizer
- [ ] Create `editor/diagnostics.ts`
- [ ] Create `ui/layout.ts` with Allotment
- [ ] Refactor `main.ts` to use new modules
- [ ] Verify editor loads and displays content
- [ ] Verify split panes resize and persist sizes
- [ ] Add unit tests for EventBus
- [ ] Add integration test for editor initialization

### Phase 2: Playback & Output
- [ ] Create `playback/playback-manager.ts`
- [ ] Create `playback/transport-controls.ts`
- [ ] Create `panels/output-panel.ts`
- [ ] Create `playback/channel-state.ts`
- [ ] Create `ui/status-bar.ts`
- [ ] Wire up play/stop to PlaybackManager
- [ ] Wire up keyboard shortcuts (Space, Esc)
- [ ] Verify errors appear in output panel
- [ ] Verify playback state updates correctly
- [ ] Add unit tests for PlaybackManager
- [ ] Add integration tests for playback flow

### Phase 3: Export & Import
- [ ] Create `export/export-manager.ts`
- [ ] Create `export/download-helper.ts`
- [ ] Create `export/export-validator.ts`
- [ ] Create `import/file-loader.ts`
- [ ] Create `import/drag-drop-handler.ts`
- [ ] Create `ui/toolbar.ts`
- [ ] Wire up export buttons
- [ ] Wire up file open dialog
- [ ] Wire up drag-and-drop
- [ ] Verify all export formats work
- [ ] Verify file loading works
- [ ] Add unit tests for export validation
- [ ] Add integration tests for export flow

### Phase 4: Advanced Features
- [ ] Create `ui/menu-bar.ts`
- [ ] Create `panels/help-panel.ts`
- [ ] Create `panels/channel-mixer.ts`
- [ ] Create `ui/theme-manager.ts`
- [ ] Create `utils/keyboard-shortcuts.ts`
- [ ] Create `editor/editor-state.ts`
- [ ] Create `utils/local-storage.ts`
- [ ] Wire up all menu items
- [ ] Implement theme switching
- [ ] Implement channel mute/solo
- [ ] Add keyboard shortcuts
- [ ] Implement auto-save
- [ ] Verify all menus work
- [ ] Verify theme switches correctly
- [ ] Verify shortcuts don't conflict
- [ ] Add E2E test for full workflow

### Final Polish
- [ ] Optimize bundle size
- [ ] Add loading spinner
- [ ] Add error boundaries
- [ ] Improve error messages
- [ ] Add tooltips to all buttons
- [ ] Write user documentation
- [ ] Update README
- [ ] Create demo video
- [ ] Deploy to production

---

## Success Criteria

The migration is complete when:

1. ✅ **Modular codebase**: `main.ts` is <150 lines, all logic extracted
2. ✅ **Functional parity**: All existing features work as before
3. ✅ **Desktop-style UI**: Professional IDE-like interface
4. ✅ **Test coverage**: >80% unit test coverage, all integration tests passing
5. ✅ **Performance**: Bundle size <1MB gzipped, load time <2 seconds
6. ✅ **Accessibility**: Keyboard navigation, screen reader support, ARIA labels
7. ✅ **Documentation**: All modules documented, migration guide written
8. ✅ **User feedback**: Positive feedback from alpha testers

---

## Risks & Mitigations

### Risk: Breaking existing functionality
**Mitigation:** Comprehensive integration tests before each phase

### Risk: Bundle size increase
**Mitigation:** Tree-shaking, code splitting, lazy loading

### Risk: Performance degradation
**Mitigation:** Profiling, debouncing, Web Workers for heavy tasks

### Risk: Scope creep
**Mitigation:** Stick to 4-week plan, defer enhancements to post-migration

### Risk: Browser compatibility issues
**Mitigation:** Test on Chrome, Firefox, Safari, Edge; use polyfills if needed

---

## References

- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [Allotment Documentation](https://github.com/johnwalley/allotment)
- [Floating UI](https://floating-ui.com/)
- [Vite Plugin Monaco Editor](https://github.com/vdesjs/vite-plugin-monaco-editor)
- [BeatBax Engine API](../../packages/engine/README.md)

---

## Appendix: File List

Complete list of files to be created:

```
apps/web-ui/src/
├── main.ts (refactored)
├── editor/
│   ├── monaco-setup.ts
│   ├── beatbax-language.ts
│   ├── editor-state.ts
│   ├── diagnostics.ts
│   └── snippets.ts
├── ui/
│   ├── layout.ts
│   ├── menu-bar.ts
│   ├── toolbar.ts
│   ├── status-bar.ts
│   └── theme-manager.ts
├── panels/
│   ├── output-panel.ts
│   ├── help-panel.ts
│   ├── channel-mixer.ts
│   └── export-panel.ts
├── playback/
│   ├── playback-manager.ts
│   ├── transport-controls.ts
│   ├── audio-sync.ts
│   └── channel-state.ts
├── export/
│   ├── export-manager.ts
│   ├── download-helper.ts
│   └── export-validator.ts
├── import/
│   ├── file-loader.ts
│   ├── remote-loader.ts
│   └── drag-drop-handler.ts
└── utils/
    ├── event-bus.ts
    ├── local-storage.ts
    ├── keyboard-shortcuts.ts
    └── analytics.ts (optional)
```

Total: ~30 new TypeScript files, each <300 lines
