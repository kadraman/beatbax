/**
 * BeatBax Command Palette
 *
 * Registers all BeatBax-specific commands with the Monaco editor so they
 * appear in the Command Palette (F1 / Ctrl+Alt+P) and can be triggered via
 * keyboard shortcuts or programmatically.
 *
 * Commands are grouped into four categories:
 *   BeatBax: Export   — JSON, MIDI, UGE, WAV
 *   BeatBax: Edit     — generate starters, insert transform, format, play selection
 *   BeatBax: Validate — verify / validate song
 *   BeatBax: Channels — mute / solo toggles for channels 1–4
 *
 * @module editor/command-palette
 */

import * as monaco from 'monaco-editor';
import { KeyCode, KeyMod } from 'monaco-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'midi' | 'uge' | 'wav' | 'famitracker';

export interface CommandPaletteOptions {
  /** The Monaco editor instance. */
  editor: monaco.editor.IStandaloneCodeEditor;

  /** Current song source accessor (called fresh on every invocation). */
  getSource: () => string;

  /** Trigger an export by format. */
  onExport: (format: ExportFormat) => void;

  /** Re-run verify / validate. */
  onVerify: () => void;

  /** Toggle mute on a channel (1-based). */
  onToggleMute: (channelId: number) => void;

  /** Toggle solo on a channel (1-based). */
  onToggleSolo: (channelId: number) => void;

  /** Stop any active preview. */
  onStopPreview?: () => void;

  /**
   * Play a fully-formed BeatBax source string directly (used for raw-note
   * selections that can't be resolved against the editor's existing AST).
   *
   * When called with a `chunkInfo`, the map contains channelId → ordered
   * [{seqName, noteCount, patNames}] chunks for channels that hold merged seqs.
   * The glyph margin uses sourcePattern events (patNames lookup) with a
   * noteCount-boundary fallback to resolve which original seq is active.
   */
  onPlayRaw?: (
    source: string,
    chunkInfo?: Record<number, Array<{ seqName: string; noteCount: number; patNames: string[] }>>,
  ) => void;

  /**
   * Optional: return export data as a plain string for clipboard operations.
   * Called by beatbax.exportToClipboard for text-based formats (e.g. JSON).
   * If not provided or returns null, exportToClipboard falls back to onExport.
   */
  onExportData?: (format: ExportFormat) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Starter-snippet constants
// ---------------------------------------------------------------------------

const SAMPLE_INST_SNIPPET = `inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2,0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2]
inst sn    type=noise  env=12,down
`;

const SAMPLE_PAT_SNIPPET = `pat melody = C4 E4 G4 C5
`;

const TRANSFORMS = [
  { label: 'oct(+1)  — octave up',        insert: 'oct(+1)' },
  { label: 'oct(-1)  — octave down',       insert: 'oct(-1)' },
  { label: 'rev      — reverse pattern',   insert: 'rev' },
  { label: 'slow     — halve speed',       insert: 'slow' },
  { label: 'fast     — double speed',      insert: 'fast' },
  { label: 'transpose(+1) — semitone up',  insert: 'transpose(+1)' },
  { label: 'transpose(-1) — semitone down',insert: 'transpose(-1)' },
  { label: 'arp(0,3,7) — major arp',       insert: 'arp(0,3,7)' },
  { label: 'arp(0,3,6) — minor arp',       insert: 'arp(0,3,6)' },
  { label: 'inst(name) — override inst',   insert: 'inst(name)' },
];

// ---------------------------------------------------------------------------
// Helper: DOM-based quick-pick (lightweight substitute for missing Monaco API)
// ---------------------------------------------------------------------------

/**
 * Opens a minimal floating list anchored to the editor's DOM node.
 * Resolves with the chosen value, or `null` if dismissed.
 */
function showQuickPick(
  anchorElement: HTMLElement,
  items: Array<{ label: string; value: string }>,
  placeholder: string,
): Promise<string | null> {
  return new Promise(resolve => {
    // Overlay to capture outside clicks
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;';

    const list = document.createElement('div');
    list.role = 'listbox';
    list.style.cssText = `
      position: fixed;
      z-index: 9999;
      background: var(--editor-bg, #1e1e1e);
      border: 1px solid var(--border-color, #454545);
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      min-width: 280px;
      max-width: 380px;
      max-height: 240px;
      overflow-y: auto;
      font-family: var(--editor-font, monospace);
      font-size: 13px;
      color: var(--text-color, #d4d4d4);
    `;

    // Position near the top-centre of the editor
    const rect = anchorElement.getBoundingClientRect();
    list.style.top = `${rect.top + 48}px`;
    list.style.left = `${rect.left + Math.floor(rect.width / 2) - 190}px`;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 6px 10px; font-size: 11px; color: var(--text-muted, #888); border-bottom: 1px solid var(--border-color, #454545);';
    header.textContent = placeholder;
    list.appendChild(header);

    function dismiss(value: string | null) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      list.remove();
      resolve(value);
    }

    for (const item of items) {
      const row = document.createElement('div');
      row.role = 'option';
      row.style.cssText = 'padding: 6px 10px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      row.textContent = item.label;
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--button-hover-bg, #2a2d2e)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('click', (e) => { e.stopPropagation(); dismiss(item.value); });
      list.appendChild(row);
    }

    overlay.addEventListener('click', () => dismiss(null));
    document.body.appendChild(overlay);
    document.body.appendChild(list);

    // Dismiss on Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismiss(null); }
    };
    document.addEventListener('keydown', onKey);
  });
}

// ---------------------------------------------------------------------------
// Helper: insert text at cursor in Monaco
// ---------------------------------------------------------------------------

function insertAtCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
  text: string,
  source = 'command-palette',
): void {
  const sel = editor.getSelection();
  if (!sel) return;
  editor.executeEdits(source, [{
    range: sel,
    text,
    forceMoveMarkers: true,
  }]);
  editor.focus();
}

// ---------------------------------------------------------------------------
// Module-level: last export format used (for Quick Export command)
// ---------------------------------------------------------------------------

let lastExportFormat: ExportFormat = 'json';

// ---------------------------------------------------------------------------
// Helper: toast notification
// ---------------------------------------------------------------------------

/**
 * Shows a brief non-blocking toast message anchored to the bottom-centre of
 * the viewport. Auto-dismisses after `duration` ms.
 */
function showToast(message: string, duration = 3000): void {
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed', 'bottom:52px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:10000', 'background:var(--editor-bg,#252526)',
    'border:1px solid var(--border-color,#454545)', 'border-radius:4px',
    'padding:7px 14px', 'font-family:var(--editor-font,monospace)', 'font-size:13px',
    'color:var(--text-color,#d4d4d4)', 'box-shadow:0 2px 8px rgba(0,0,0,.5)',
    'max-width:480px', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    'pointer-events:none',
  ].join(';');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---------------------------------------------------------------------------
// Helper: input box (lightweight DOM prompt)
// ---------------------------------------------------------------------------

/**
 * Shows a minimal floating input box anchored near the editor.
 * Resolves with the entered string, or `null` if dismissed / Escape pressed.
 */
function showInputBox(
  anchorElement: HTMLElement,
  placeholder: string,
  initialValue = '',
): Promise<string | null> {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;';

    const box = document.createElement('div');
    box.style.cssText = [
      'position:fixed', 'z-index:9999',
      'background:var(--editor-bg,#1e1e1e)',
      'border:1px solid var(--border-color,#454545)',
      'border-radius:4px', 'box-shadow:0 4px 20px rgba(0,0,0,.5)',
      'min-width:280px', 'max-width:380px', 'overflow:hidden',
      'font-family:var(--editor-font,monospace)', 'font-size:13px',
      'color:var(--text-color,#d4d4d4)',
    ].join(';');

    const rect = anchorElement.getBoundingClientRect();
    box.style.top = `${rect.top + 48}px`;
    box.style.left = `${rect.left + Math.floor(rect.width / 2) - 190}px`;

    const header = document.createElement('div');
    header.style.cssText = 'padding:6px 10px;font-size:11px;color:var(--text-muted,#888);border-bottom:1px solid var(--border-color,#454545);';
    header.textContent = placeholder;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialValue;
    input.style.cssText = [
      'display:block', 'width:100%', 'box-sizing:border-box',
      'padding:7px 10px', 'background:transparent', 'border:none', 'outline:none',
      'font-family:inherit', 'font-size:13px', 'color:var(--text-color,#d4d4d4)',
    ].join(';');

    function dismiss(value: string | null) {
      document.removeEventListener('keydown', onDocKey);
      overlay.remove();
      box.remove();
      resolve(value);
    }

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { dismiss(input.value.trim() || null); }
      else if (e.key === 'Escape') { dismiss(null); }
    });

    const onDocKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(null); };

    overlay.addEventListener('click', () => dismiss(null));
    box.appendChild(header);
    box.appendChild(input);
    document.body.appendChild(overlay);
    document.body.appendChild(box);
    document.addEventListener('keydown', onDocKey);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

// ---------------------------------------------------------------------------
// Helper: source analysis utilities
// ---------------------------------------------------------------------------

/** Return the word at the current cursor position, or null. */
function getWordUnderCursor(
  editor: monaco.editor.IStandaloneCodeEditor,
): string | null {
  const pos = editor.getPosition();
  if (!pos) return null;
  const model = editor.getModel();
  if (!model) return null;
  return model.getWordAtPosition(pos)?.word ?? null;
}

/** Return the 1-based line number of the first line matching `pattern`, or -1. */
function findLineNumber(source: string, pattern: RegExp): number {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return -1;
}

/** Reveal and focus a specific 1-based line number in the editor. */
function gotoLine(
  editor: monaco.editor.IStandaloneCodeEditor,
  lineNumber: number,
): void {
  editor.revealLineInCenter(lineNumber);
  editor.setPosition({ lineNumber, column: 1 });
  editor.focus();
}

interface DefinitionItem {
  kind: 'pat' | 'seq' | 'inst';
  name: string;
  lineNumber: number;
}

/** Parse all pat/seq/inst definitions from source text, in order. */
function parseAllDefinitions(source: string): DefinitionItem[] {
  const items: DefinitionItem[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(pat|seq|inst)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=\s]/);
    if (m) items.push({ kind: m[1] as 'pat' | 'seq' | 'inst', name: m[2], lineNumber: i + 1 });
  }
  return items;
}

/** Count note tokens (e.g. C4, C#4) in a string, excluding rests. Valid octaves are 1–8. */
function countNoteTokens(text: string): number {
  return (text.match(/\b[A-Ga-g][#b]?[1-8]\b/g) ?? []).length;
}

/** Extract the BPM from a `bpm N` directive in the source; default 120. */
function extractBpm(source: string): number {
  const m = source.match(/^\s*bpm\s+(\d+)/im);
  return m ? Math.max(1, parseInt(m[1], 10)) : 120;
}

/** Validate that a string is a legal BeatBax identifier. */
function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** Escape special regex metacharacters in a literal string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Public registration function
// ---------------------------------------------------------------------------

/**
 * Register all BeatBax command palette commands on the given editor.
 * Returns a disposable that removes all registered actions.
 */
export function setupCommandPalette(opts: CommandPaletteOptions): monaco.IDisposable {
  const { editor, getSource, onExport, onVerify, onToggleMute, onToggleSolo, onPlayRaw, onExportData } = opts;

  const disposables: monaco.IDisposable[] = [];

  // ── Helpers ──────────────────────────────────────────────────────────────

  function reg(descriptor: monaco.editor.IActionDescriptor): void {
    disposables.push(editor.addAction(descriptor));
  }

  const editorDom = editor.getDomNode();

  // ── BeatBax: Export ───────────────────────────────────────────────────────

  reg({
    id: 'beatbax.exportJson',
    label: 'BeatBax: Export → JSON',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ],
    run: () => onExport('json'),
  });

  reg({
    id: 'beatbax.exportMidi',
    label: 'BeatBax: Export → MIDI',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM],
    run: () => onExport('midi'),
  });

  reg({
    id: 'beatbax.exportUge',
    label: 'BeatBax: Export → UGE (hUGETracker)',
    keybindings: [],
    run: () => onExport('uge'),
  });

  reg({
    id: 'beatbax.exportWav',
    label: 'BeatBax: Export → WAV',
    keybindings: [],
    run: () => onExport('wav'),
  });

  reg({
    id: 'beatbax.exportFamitracker',
    label: 'BeatBax: Export → FamiTracker (.ftm)',
    keybindings: [],
    run: () => onExport('famitracker'),
  });

  // ── BeatBax: Validate ─────────────────────────────────────────────────────

  reg({
    id: 'beatbax.verifySong',
    label: 'BeatBax: Verify / Validate Song',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV],
    // Keep in context menu: one slim validate entry is genuinely useful on right-click
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 2,
    run: () => onVerify(),
  });

  // ── BeatBax: Edit — generate starters ────────────────────────────────────

  reg({
    id: 'beatbax.generateSampleInst',
    label: 'BeatBax: Generate Sample Instruments',
    keybindings: [],
    run: () => insertAtCursor(editor, SAMPLE_INST_SNIPPET, 'beatbax.generateSampleInst'),
  });

  reg({
    id: 'beatbax.generateSamplePat',
    label: 'BeatBax: Generate Sample Pattern',
    keybindings: [],
    run: () => insertAtCursor(editor, SAMPLE_PAT_SNIPPET, 'beatbax.generateSamplePat'),
  });

  // ── BeatBax: Edit — insert transform ─────────────────────────────────────

  reg({
    id: 'beatbax.insertTransform',
    label: 'BeatBax: Insert Transform…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        TRANSFORMS.map(t => ({ label: t.label, value: t.insert })),
        'Pick a transform to insert',
      );
      if (chosen) insertAtCursor(editor, chosen, 'beatbax.insertTransform');
    },
  });

  // ── BeatBax: Edit — play selection ────────────────────────────────────────

  reg({
    id: 'beatbax.playSelection',
    label: 'BeatBax: Play Selected Sequence / Pattern',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space],
    // One context-menu entry for quick play-selection
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 1,
    run: () => {
      const selection = editor.getSelection();
      if (!selection) return;
      const selectedText = editor.getModel()?.getValueInRange(selection)?.trim();
      if (!selectedText) return;

      // Collect every pat/seq definition line in the selection (handles multi-line).
      const selLines = selectedText.split('\n').map(l => l.trim()).filter(Boolean);
      const found: Array<{ name: string; kind: 'pat' | 'seq' }> = [];
      for (const line of selLines) {
        const pm = line.match(/^pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (pm) { found.push({ name: pm[1], kind: 'pat' }); continue; }
        const sm = line.match(/^seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (sm) { found.push({ name: sm[1], kind: 'seq' }); }
      }

      // Multiple definitions → build a multi-channel synthetic source and play.
      if (found.length > 1) {
        const { source: multiSrc, chunkInfo } = buildMultiPlaySource(found, getSource());
        onPlayRaw?.(multiSrc, Object.keys(chunkInfo).length > 0 ? chunkInfo : undefined);
        return;
      }

      // Single definition line (pat or seq).
      if (found.length === 1) {
        const { name, kind } = found[0];
        editor.trigger('', kind === 'seq' ? 'beatbax.previewSeq' : 'beatbax.previewPattern', name);
        return;
      }

      // Single bare identifier → look up in source to decide seq vs pat.
      const isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/.test(selectedText);
      if (isIdentifier) {
        const source = getSource();
        const isSeq = new RegExp(`^\\s*seq\\s+${selectedText}\\s*=`, 'm').test(source);
        editor.trigger('', isSeq ? 'beatbax.previewSeq' : 'beatbax.previewPattern', selectedText);
        return;
      }

      // Raw note tokens: synthesise a minimal one-channel song.
      const syntheticSource = [
        'chip gameboy',
        'bpm 120',
        'time 4',
        'inst _tmp type=pulse1 duty=50 env=12,down',
        `pat __sel__ = ${selectedText}`,
        'channel 1 => inst _tmp seq __sel__',
        'play',
      ].join('\n');
      onPlayRaw?.(syntheticSource);
    },
  });

  // ── BeatBax: Edit — format document ──────────────────────────────────────

  reg({
    id: 'beatbax.formatDocument',
    label: 'BeatBax: Format BeatBax Document',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const source = model.getValue();
      const formatted = formatBeatBaxSource(source);
      if (formatted === source) return; // nothing changed
      const fullRange = model.getFullModelRange();
      editor.executeEdits('beatbax.formatDocument', [{
        range: fullRange,
        text: formatted,
        forceMoveMarkers: false,
      }]);
      editor.focus();
    },
  });

  // ── BeatBax: Channels — mute / solo ──────────────────────────────────────

  for (let ch = 1; ch <= 4; ch++) {
    const channelId = ch;
    reg({
      id: `beatbax.toggleMuteChannel${channelId}`,
      label: `BeatBax: Toggle Mute Channel ${channelId}`,
      keybindings: [],
      run: () => onToggleMute(channelId),
    });

    reg({
      id: `beatbax.soloChannel${channelId}`,
      label: `BeatBax: Solo Channel ${channelId}`,
      keybindings: [],
      run: () => onToggleSolo(channelId),
    });
  }

  // ── BeatBax: Channels — quick-pick mute / solo ────────────────────────────

  reg({
    id: 'beatbax.toggleMuteChannel',
    label: 'BeatBax: Toggle Mute Channel…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        [1, 2, 3, 4].map(n => ({ label: `Channel ${n}`, value: String(n) })),
        'Select channel to toggle mute',
      );
      if (chosen) onToggleMute(Number(chosen));
    },
  });

  reg({
    id: 'beatbax.soloChannel',
    label: 'BeatBax: Solo Channel…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const chosen = await showQuickPick(
        anchor,
        [1, 2, 3, 4].map(n => ({ label: `Channel ${n}`, value: String(n) })),
        'Select channel to solo',
      );
      if (chosen) onToggleSolo(Number(chosen));
    },
  });

  // ── Phase 1: Navigation commands ─────────────────────────────────────────

  reg({
    id: 'beatbax.gotoPatternDef',
    label: 'BeatBax: Go to Pattern Definition',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyD],
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 10,
    run: () => {
      const word = getWordUnderCursor(editor);
      if (!word || !isValidIdentifier(word)) { showToast('No identifier under cursor'); return; }
      const source = getSource();
      const line = findLineNumber(source, new RegExp(`^\\s*pat\\s+${escapeRegex(word)}\\s*=`));
      if (line < 0) { showToast(`Pattern '${word}' not found`); return; }
      gotoLine(editor, line);
    },
  });

  reg({
    id: 'beatbax.gotoSeqDef',
    label: 'BeatBax: Go to Sequence Definition',
    keybindings: [],
    run: () => {
      const word = getWordUnderCursor(editor);
      if (!word || !isValidIdentifier(word)) { showToast('No identifier under cursor'); return; }
      const source = getSource();
      const line = findLineNumber(source, new RegExp(`^\\s*seq\\s+${escapeRegex(word)}\\s*=`));
      if (line < 0) { showToast(`Sequence '${word}' not found`); return; }
      gotoLine(editor, line);
    },
  });

  reg({
    id: 'beatbax.gotoInstDef',
    label: 'BeatBax: Go to Instrument Definition',
    keybindings: [],
    run: () => {
      const word = getWordUnderCursor(editor);
      if (!word || !isValidIdentifier(word)) { showToast('No identifier under cursor'); return; }
      const source = getSource();
      const line = findLineNumber(source, new RegExp(`^\\s*inst\\s+${escapeRegex(word)}\\s`));
      if (line < 0) { showToast(`Instrument '${word}' not found`); return; }
      gotoLine(editor, line);
    },
  });

  reg({
    id: 'beatbax.findReferences',
    label: 'BeatBax: Find All References',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF],
    run: () => {
      const word = getWordUnderCursor(editor);
      if (!word) { showToast('No identifier under cursor'); return; }
      editor.trigger('beatbax.findReferences', 'actions.find', null);
      // Populate the search widget after it opens
      setTimeout(() => {
        editor.trigger('beatbax.findReferences', 'editor.action.changeAll', { searchString: word });
        editor.getAction('actions.find')?.run();
      }, 50);
    },
  });

  reg({
    id: 'beatbax.listDefinitions',
    label: 'BeatBax: List All Definitions…',
    keybindings: [],
    run: async () => {
      const source = getSource();
      const defs = parseAllDefinitions(source);
      if (defs.length === 0) { showToast('No definitions found in source'); return; }
      const anchor = editorDom ?? document.body;
      const items = defs.map(d => ({
        label: `${d.kind} ${d.name}  (line ${d.lineNumber})`,
        value: String(d.lineNumber),
      }));
      const chosen = await showQuickPick(anchor, items, 'Jump to definition');
      if (chosen) gotoLine(editor, parseInt(chosen, 10));
    },
  });

  // ── Phase 2: Audition & Playback commands ─────────────────────────────────

  reg({
    id: 'beatbax.previewPattern',
    label: 'BeatBax: Preview Pattern Under Cursor',
    keybindings: [KeyMod.Alt | KeyCode.KeyP],
    contextMenuGroupId: '9_beatbax',
    contextMenuOrder: 3,
    run: (_, patternName?: string) => {
      const source = getSource();
      const name = typeof patternName === 'string' && patternName.trim()
        ? patternName.trim()
        : getWordUnderCursor(editor) ?? '';
      if (!name) { showToast('No pattern name under cursor'); return; }

      // Find pattern body in source
      const lines = source.split('\n');
      let body = '';
      for (const line of lines) {
        const m = line.match(new RegExp(`^\\s*pat\\s+${name}\\s*=\\s*(.*)`));
        if (m) { body = m[1].trim(); break; }
      }
      if (!body) { showToast(`Pattern '${name}' not found`); return; }

      // Find first declared instrument for preview.  When no instrument is
      // declared in the source, synthesise a minimal fallback using the first
      // channel-agnostic type (pulse1); the fallback name '_tmp' avoids
      // clashing with any user-defined instruments.
      let inst: string | null = null;
      for (const line of lines) {
        const m = line.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) { inst = m[1]; break; }
      }
      const useFallbackInst = inst === null;
      const instName = inst ?? '_tmp';

      const bpm = extractBpm(source);
      // Use the chip from source to keep the synthetic preview compatible.
      // Fall back to 'gameboy' only when no chip directive is present — this
      // preview path is a best-effort audition, not a production export.
      const chipMatch = source.match(/^\s*chip\s+([A-Za-z0-9_-]+)/im);
      const chip = chipMatch ? chipMatch[1] : 'gameboy';

      // Build a minimal working preview source.  Preserve all inst/pat/seq
      // definitions from the original source so the pattern can reference them.
      // Only emit a synthetic fallback instrument when none is declared.
      const KEEP_RE_PAT = /^\s*(?:inst|effect|pat|seq|bpm|time|chip|ticksPerStep|stepsPerBar|volume)\b/;
      const baseLines = source.split('\n').filter(l => KEEP_RE_PAT.test(l));
      const synthetic = [
        ...baseLines,
        ...(useFallbackInst ? [`inst _tmp type=pulse1 duty=50 env=12,down`] : []),
        `pat __preview__ = ${body}`,
        `channel 1 => inst ${instName} seq __preview__`,
        'play',
      ].join('\n');
      onPlayRaw?.(synthetic);
    },
  });

  reg({
    id: 'beatbax.previewSeq',
    label: 'BeatBax: Preview Sequence Under Cursor',
    keybindings: [],
    run: (_, seqName?: string) => {
      const source = getSource();
      const name = typeof seqName === 'string' && seqName.trim()
        ? seqName.trim()
        : getWordUnderCursor(editor) ?? '';
      if (!name) { showToast('No sequence name under cursor'); return; }

      const lines = source.split('\n');

      // Find the sequence body
      let seqBody = '';
      for (const line of lines) {
        const m = line.match(new RegExp(`^\\s*seq\\s+${name}\\s*=\\s*(.*)`));
        if (m) { seqBody = m[1].trim(); break; }
      }
      if (!seqBody) { showToast(`Sequence '${name}' not found`); return; }

      // Find instrument from existing channel assignment or first declared inst
      let instName: string | null = null;
      for (const line of lines) {
        const m = line.match(new RegExp(`^\\s*channel\\s+\\d+\\s*=>\\s*inst\\s+([A-Za-z_][A-Za-z0-9_]*)\\s+seq\\s+${name}`));
        if (m) { instName = m[1]; break; }
      }
      if (!instName) {
        for (const line of lines) {
          const m = line.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
          if (m) { instName = m[1]; break; }
        }
      }
      const inst = instName ?? '_tmp';

      const bpm = extractBpm(source);
      const chipMatch = source.match(/^\s*chip\s+([A-Za-z0-9_-]+)/im);
      const chip = chipMatch ? chipMatch[1] : 'gameboy';

      // Preserve all inst/pat definitions so the seq body can reference them
      const KEEP_RE = /^\s*(?:(inst|effect|pat|seq|bpm|time|chip|ticksPerStep|stepsPerBar|volume)\b|#|\/\/|$)/;
      const baseLines = source.split('\n').filter(l => KEEP_RE.test(l));
      const newLines = [...baseLines];
      newLines.push(`channel 1 => inst ${inst} seq ${name}`);
      newLines.push('play');
      onPlayRaw?.(newLines.join('\n'));
    },
  });

  reg({
    id: 'beatbax.playFromCursor',
    label: 'BeatBax: Play from Cursor Position',
    keybindings: [KeyMod.Alt | KeyMod.Shift | KeyCode.KeyP],
    run: () => {
      const source = getSource();
      const pos = editor.getPosition();
      if (!pos) { showToast('No cursor position'); return; }

      const lines = source.split('\n');
      const cursorLine = lines[pos.lineNumber - 1] ?? '';

      // Detect if cursor is on a channel line
      const chanMatch = cursorLine.match(/^\s*channel\s+(\d+)\s*=>\s*inst\s+(\S+)\s+seq\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (chanMatch) {
        const seqName = chanMatch[3];
        editor.trigger('', 'beatbax.previewSeq', seqName);
        return;
      }

      // Try to detect seq name on cursor line
      const seqMatch = cursorLine.match(/^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (seqMatch) {
        editor.trigger('', 'beatbax.previewSeq', seqMatch[1]);
        return;
      }

      // Try to detect pat name on cursor line
      const patMatch = cursorLine.match(/^\s*pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (patMatch) {
        editor.trigger('', 'beatbax.previewPattern', patMatch[1]);
        return;
      }

      // Fall back to playing the full song from the start
      showToast('Playing from beginning — cursor not on a playable line');
      onPlayRaw?.(source);
    },
  });

  // ── Phase 3: Editing & Organization commands ──────────────────────────────

  reg({
    id: 'beatbax.duplicatePattern',
    label: 'BeatBax: Duplicate Pattern',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;
      const line = model.getLineContent(pos.lineNumber);
      const m = line.match(/^(\s*pat\s+)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*.*)/);
      if (!m) { showToast('Cursor must be on a `pat NAME = ...` line'); return; }

      const source = getSource();
      const origName = m[2];

      // Generate unique name
      let n = 2;
      while (new RegExp(`^\\s*pat\\s+${origName}_${n}\\s*=`, 'm').test(source)) n++;
      const newName = `${origName}_${n}`;

      const newLine = `${m[1]}${newName}${m[3]}`;
      const lineCount = model.getLineCount();
      // Insert after current line
      const insertLineNumber = pos.lineNumber;
      editor.executeEdits('beatbax.duplicatePattern', [{
        range: {
          startLineNumber: insertLineNumber,
          startColumn: model.getLineMaxColumn(insertLineNumber),
          endLineNumber: insertLineNumber,
          endColumn: model.getLineMaxColumn(insertLineNumber),
        },
        text: `\n${newLine}`,
        forceMoveMarkers: false,
      }]);
      showToast(`Duplicated as '${newName}'`);
      editor.focus();
    },
  });

  reg({
    id: 'beatbax.duplicateSeq',
    label: 'BeatBax: Duplicate Sequence',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;
      const line = model.getLineContent(pos.lineNumber);
      const m = line.match(/^(\s*seq\s+)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*.*)/);
      if (!m) { showToast('Cursor must be on a `seq NAME = ...` line'); return; }

      const source = getSource();
      const origName = m[2];

      let n = 2;
      while (new RegExp(`^\\s*seq\\s+${origName}_${n}\\s*=`, 'm').test(source)) n++;
      const newName = `${origName}_${n}`;

      const newLine = `${m[1]}${newName}${m[3]}`;
      const insertLineNumber = pos.lineNumber;
      editor.executeEdits('beatbax.duplicateSeq', [{
        range: {
          startLineNumber: insertLineNumber,
          startColumn: model.getLineMaxColumn(insertLineNumber),
          endLineNumber: insertLineNumber,
          endColumn: model.getLineMaxColumn(insertLineNumber),
        },
        text: `\n${newLine}`,
        forceMoveMarkers: false,
      }]);
      showToast(`Duplicated as '${newName}'`);
      editor.focus();
    },
  });

  reg({
    id: 'beatbax.renameDefinition',
    label: 'BeatBax: Rename Definition…',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR],
    run: async () => {
      const model = editor.getModel();
      if (!model) return;
      const anchor = editorDom ?? document.body;
      const word = getWordUnderCursor(editor);
      if (!word) { showToast('No identifier under cursor'); return; }

      const newName = await showInputBox(anchor, `Rename '${word}' to:`, word);
      if (!newName || newName === word) return;
      if (!isValidIdentifier(newName)) {
        showToast(`'${newName}' is not a valid identifier`);
        return;
      }

      const source = model.getValue();
      if (new RegExp(`^\\s*(?:pat|seq|inst)\\s+${newName}\\s*=`, 'm').test(source)) {
        showToast(`'${newName}' already exists`);
        return;
      }

      // Replace all standalone identifier references using word boundaries.
      // Word boundaries (\b) are reliable for identifiers since BeatBax names
      // only contain [A-Za-z0-9_] characters.
      const updated = source.replace(
        new RegExp(`\\b${word}\\b`, 'g'),
        newName,
      );

      const fullRange = model.getFullModelRange();
      editor.executeEdits('beatbax.renameDefinition', [{
        range: fullRange,
        text: updated,
        forceMoveMarkers: false,
      }]);
      showToast(`Renamed '${word}' → '${newName}'`);
      editor.focus();
    },
  });

  reg({
    id: 'beatbax.extractToPattern',
    label: 'BeatBax: Extract Selection to Pattern',
    keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const selection = editor.getSelection();
      if (!selection) return;
      const selectedText = model.getValueInRange(selection).trim();
      if (!selectedText) { showToast('Select note tokens to extract'); return; }

      const source = model.getValue();

      // Generate unique name
      let n = 1;
      while (new RegExp(`^\\s*pat\\s+extracted_${n}\\s*=`, 'm').test(source)) n++;
      const newName = `extracted_${n}`;

      // Find the current block end to insert after
      const cursorLine = selection.endLineNumber;
      const newPatLine = `pat ${newName} = ${selectedText}`;

      editor.executeEdits('beatbax.extractToPattern', [
        // Replace selection with new pattern name
        { range: selection, text: newName, forceMoveMarkers: true },
        // Insert new pattern definition after cursor line
        {
          range: {
            startLineNumber: cursorLine,
            startColumn: model.getLineMaxColumn(cursorLine),
            endLineNumber: cursorLine,
            endColumn: model.getLineMaxColumn(cursorLine),
          },
          text: `\n${newPatLine}`,
          forceMoveMarkers: false,
        },
      ]);
      showToast(`Extracted to pattern '${newName}'`);
      editor.focus();
    },
  });

  reg({
    id: 'beatbax.sortDefinitions',
    label: 'BeatBax: Sort Definitions…',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;

      const lineContent = model.getLineContent(pos.lineNumber);
      const kwMatch = lineContent.match(/^\s*(pat|seq|inst)\s+/);
      if (!kwMatch) { showToast('Cursor must be on a pat/seq/inst definition line'); return; }
      const keyword = kwMatch[1];
      const kwRe = new RegExp(`^\\s*${keyword}\\s+`);

      // Find the contiguous block of lines with the same keyword
      const totalLines = model.getLineCount();
      let blockStart = pos.lineNumber;
      while (blockStart > 1 && kwRe.test(model.getLineContent(blockStart - 1))) blockStart--;
      let blockEnd = pos.lineNumber;
      while (blockEnd < totalLines && kwRe.test(model.getLineContent(blockEnd + 1))) blockEnd++;

      if (blockStart === blockEnd) { showToast('Only one definition in block — nothing to sort'); return; }

      // Extract and sort the block lines by definition name
      const blockLines: string[] = [];
      for (let i = blockStart; i <= blockEnd; i++) blockLines.push(model.getLineContent(i));

      const sorted = [...blockLines].sort((a, b) => {
        const ma = a.match(/^\s*(?:pat|seq|inst)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const mb = b.match(/^\s*(?:pat|seq|inst)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const na = ma?.[1] ?? '';
        const nb = mb?.[1] ?? '';
        return na.localeCompare(nb);
      });

      editor.executeEdits('beatbax.sortDefinitions', [{
        range: {
          startLineNumber: blockStart,
          startColumn: 1,
          endLineNumber: blockEnd,
          endColumn: model.getLineMaxColumn(blockEnd),
        },
        text: sorted.join('\n'),
        forceMoveMarkers: false,
      }]);
      showToast(`Sorted ${blockLines.length} ${keyword} definitions`);
      editor.focus();
    },
  });

  // ── Phase 4: Analysis & Diagnostics commands ──────────────────────────────

  reg({
    id: 'beatbax.showUnused',
    label: 'BeatBax: Show Unused Definitions',
    keybindings: [],
    run: async () => {
      const source = getSource();
      if (!source.trim()) { showToast('No source to analyse'); return; }

      const defs = parseAllDefinitions(source);
      const unused: DefinitionItem[] = [];

      for (const def of defs) {
        // A definition is referenced if its name appears somewhere other than
        // its own definition line.
        const lines = source.split('\n');
        const nameRe = new RegExp(`\\b${def.name}\\b`);
        let refCount = 0;
        for (let i = 0; i < lines.length; i++) {
          if (i + 1 === def.lineNumber) continue; // skip definition line itself
          if (nameRe.test(lines[i])) refCount++;
        }
        if (refCount === 0) unused.push(def);
      }

      if (unused.length === 0) {
        showToast('✓ No unused definitions found');
        return;
      }

      const pats  = unused.filter(d => d.kind === 'pat').length;
      const seqs  = unused.filter(d => d.kind === 'seq').length;
      const insts = unused.filter(d => d.kind === 'inst').length;
      const summary = [pats && `${pats} unused pat`, seqs && `${seqs} unused seq`, insts && `${insts} unused inst`]
        .filter(Boolean).join(', ');

      const anchor = editorDom ?? document.body;
      const items = unused.map(d => ({
        label: `${d.kind} ${d.name}  (line ${d.lineNumber})`,
        value: String(d.lineNumber),
      }));
      const chosen = await showQuickPick(anchor, items, `Unused definitions — ${summary}`);
      if (chosen) gotoLine(editor, parseInt(chosen, 10));
    },
  });

  reg({
    id: 'beatbax.showPatternInfo',
    label: 'BeatBax: Show Pattern Duration',
    keybindings: [],
    run: async () => {
      const source = getSource();
      const word = getWordUnderCursor(editor);
      if (!word) { showToast('No pattern name under cursor'); return; }

      const lines = source.split('\n');
      let body = '';
      for (const line of lines) {
        const m = line.match(new RegExp(`^\\s*pat\\s+${word}\\s*=\\s*(.*)`));
        if (m) { body = m[1]; break; }
      }
      if (!body) { showToast(`Pattern '${word}' not found`); return; }

      const bpm = extractBpm(source);
      // Approximate duration: treats each note token as one quarter note.
      // Real durations depend on time signature and per-note lengths; this is
      // intentionally a quick estimate for display purposes only.
      const noteCount = countNoteTokens(body);
      const durationMs = Math.round((noteCount / bpm) * 60_000);
      const durationS  = (durationMs / 1000).toFixed(2);
      // Approximate tick count (4 ticks per note at default resolution)
      const tickCount  = noteCount * 4;

      const info = `Pattern '${word}': ${noteCount} notes | ≈${durationS}s @ ${bpm}BPM | ${tickCount} ticks`;
      const anchor = editorDom ?? document.body;
      await showQuickPick(anchor, [{ label: info, value: '' }], 'Pattern info');
    },
  });

  reg({
    id: 'beatbax.auditSong',
    label: 'BeatBax: Audit Song for Issues',
    keybindings: [],
    run: async () => {
      const source = getSource();
      if (!source.trim()) { showToast('No source to audit'); return; }

      const lines = source.split('\n');
      const issues: Array<{ msg: string; lineNumber: number }> = [];

      // Build definition sets
      const patDefs  = new Set<string>();
      const seqDefs  = new Set<string>();
      const instDefs = new Set<string>();
      for (const line of lines) {
        const pm = line.match(/^\s*pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);  if (pm) patDefs.add(pm[1]);
        const sm = line.match(/^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);  if (sm) seqDefs.add(sm[1]);
        const im = line.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\s/);   if (im) instDefs.add(im[1]);
      }

      // Check channel assignments
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*channel\s+\d+\s*=>\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\s+seq\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (!m) continue;
        const [, instName, seqName] = m;
        if (!instDefs.has(instName)) issues.push({ msg: `✗ Unmatched instrument: '${instName}'`, lineNumber: i + 1 });
        if (!seqDefs.has(seqName))   issues.push({ msg: `✗ Unmatched sequence: '${seqName}'`,    lineNumber: i + 1 });
      }

      // Check sequence bodies for unmatched pattern references
      const seqBodies = new Map<string, string>();
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
        if (m) seqBodies.set(m[1], m[2]);
      }
      for (const [seqName, body] of seqBodies) {
      // Seq bodies contain pattern/seq references with optional transforms
      // separated by `:` (e.g. `melody:oct(+1)`).  Split on `:` to extract
      // the bare name before any transform; this is safe because `:` does not
      // appear in BeatBax identifiers.  Filter to well-formed identifiers to
      // avoid false positives from malformed or partial lines.
      const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
      const tokens = body.split(/\s+/).filter(Boolean)
        .map(t => t.split(':')[0])
        .filter(t => ID_RE.test(t));
        for (const tok of tokens) {
          if (!patDefs.has(tok) && !seqDefs.has(tok)) {
            const lineNo = findLineNumber(source, new RegExp(`^\\s*seq\\s+${seqName}\\s*=`));
            issues.push({ msg: `✗ In seq '${seqName}': unknown reference '${tok}'`, lineNumber: lineNo });
          }
        }
      }

      // Check for circular sequence references (simple DFS)
      const visited = new Set<string>();
      const recStack = new Set<string>();
      function hasCycle(name: string): boolean {
        if (recStack.has(name)) return true;
        if (visited.has(name)) return false;
        visited.add(name); recStack.add(name);
        const body = seqBodies.get(name) ?? '';
        for (const tok of body.split(/\s+/).filter(Boolean).map(t => t.split(':')[0])) {
          if (seqDefs.has(tok) && hasCycle(tok)) return true;
        }
        recStack.delete(name);
        return false;
      }
      for (const seqName of seqDefs) {
        visited.clear(); recStack.clear();
        if (hasCycle(seqName)) {
          const lineNo = findLineNumber(source, new RegExp(`^\\s*seq\\s+${seqName}\\s*=`));
          issues.push({ msg: `✗ Circular sequence reference involving '${seqName}'`, lineNumber: lineNo });
        }
      }

      if (issues.length === 0) {
        showToast('✓ No issues found');
        return;
      }

      const anchor = editorDom ?? document.body;
      const items = issues.map(iss => ({
        label: `${iss.msg}  (line ${iss.lineNumber})`,
        value: String(iss.lineNumber),
      }));
      const chosen = await showQuickPick(anchor, items, `${issues.length} issue(s) found — click to jump`);
      if (chosen) gotoLine(editor, parseInt(chosen, 10));
    },
  });

  // ── Phase 5: Channel operations ───────────────────────────────────────────

  reg({
    id: 'beatbax.copyChannelConfig',
    label: 'BeatBax: Copy Channel Configuration',
    keybindings: [],
    run: () => {
      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;
      const line = model.getLineContent(pos.lineNumber);
      const m = line.match(/^\s*channel\s+\d+\s*=>\s*(.*)/);
      if (!m) { showToast('Cursor must be on a `channel N =>` line'); return; }
      const config = m[1].trim();
      navigator.clipboard?.writeText(config).then(
        () => showToast(`Copied: ${config}`),
        () => showToast(`Copied (clipboard unavailable): ${config}`),
      );
    },
  });

  reg({
    id: 'beatbax.swapChannels',
    label: 'BeatBax: Swap Channel Assignments…',
    keybindings: [],
    run: async () => {
      const model = editor.getModel();
      if (!model) return;
      const source = model.getValue();
      const lines = source.split('\n');

      // Collect all channel lines
      const chanLines: Array<{ lineNumber: number; n: number; config: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*channel\s+(\d+)\s*=>\s*(.*)/);
        if (m) chanLines.push({ lineNumber: i + 1, n: parseInt(m[1], 10), config: m[2].trim() });
      }

      if (chanLines.length < 2) { showToast('Need at least 2 channels to swap'); return; }

      const anchor = editorDom ?? document.body;
      const pickItems = chanLines.map(c => ({
        label: `Channel ${c.n}: ${c.config}`,
        value: String(c.lineNumber),
      }));

      const first = await showQuickPick(anchor, pickItems, 'Select first channel to swap');
      if (!first) return;
      const second = await showQuickPick(
        anchor,
        pickItems.filter(i => i.value !== first),
        'Select second channel to swap',
      );
      if (!second) return;

      const ch1 = chanLines.find(c => c.lineNumber === parseInt(first, 10))!;
      const ch2 = chanLines.find(c => c.lineNumber === parseInt(second, 10))!;

      // Swap: preserve the `channel N =>` prefix, swap the config part
      const newLine1 = `channel ${ch1.n} => ${ch2.config}`;
      const newLine2 = `channel ${ch2.n} => ${ch1.config}`;

      editor.executeEdits('beatbax.swapChannels', [
        {
          range: { startLineNumber: ch1.lineNumber, startColumn: 1, endLineNumber: ch1.lineNumber, endColumn: model.getLineMaxColumn(ch1.lineNumber) },
          text: newLine1,
          forceMoveMarkers: false,
        },
        {
          range: { startLineNumber: ch2.lineNumber, startColumn: 1, endLineNumber: ch2.lineNumber, endColumn: model.getLineMaxColumn(ch2.lineNumber) },
          text: newLine2,
          forceMoveMarkers: false,
        },
      ]);
      showToast(`Swapped Channel ${ch1.n} ↔ Channel ${ch2.n}`);
      editor.focus();
    },
  });

  // ── Phase 5: Export convenience commands ─────────────────────────────────

  reg({
    id: 'beatbax.exportToClipboard',
    label: 'BeatBax: Export to Clipboard…',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const formats: Array<{ label: string; value: ExportFormat }> = [
        { label: 'JSON (ISM format)',       value: 'json' },
        { label: 'MIDI (Standard MIDI)',    value: 'midi' },
        { label: 'FamiTracker Text (.ftm)', value: 'famitracker' },
      ];
      const chosen = await showQuickPick(
        anchor,
        formats.map(f => ({ label: f.label, value: f.value })),
        'Export to clipboard — pick format',
      );
      if (!chosen) return;

      const format = chosen as ExportFormat;
      lastExportFormat = format;

      if (onExportData) {
        const data = await onExportData(format);
        if (data !== null) {
          try {
            await navigator.clipboard.writeText(data);
            showToast(`Exported ${format.toUpperCase()} (${data.length} chars) — copied to clipboard`);
          } catch {
            showToast(`Export ready but clipboard write failed — try a different browser`);
          }
          return;
        }
      }

      // Fallback: trigger regular export (file download)
      onExport(format);
      showToast(`Exporting ${format.toUpperCase()} — check your downloads`);
    },
  });

  reg({
    id: 'beatbax.quickExport',
    label: 'BeatBax: Quick Export (Last Format)',
    keybindings: [KeyMod.CtrlCmd | KeyCode.KeyE],
    run: () => {
      onExport(lastExportFormat);
      showToast(`Exporting ${lastExportFormat.toUpperCase()}…`);
    },
  });

  // ── Phase 5: Reference & Help commands ───────────────────────────────────

  reg({
    id: 'beatbax.showEffectPresets',
    label: 'BeatBax: Show Effect Presets',
    keybindings: [],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const presets: Array<{ label: string; value: string }> = [
        { label: 'pan(left)          — hard pan left',                  value: 'pan(left)' },
        { label: 'pan(right)         — hard pan right',                 value: 'pan(right)' },
        { label: 'pan(center)        — center pan',                     value: 'pan(center)' },
        { label: 'vib(12,4)          — vibrato depth 12, rate 4',       value: 'vib(12,4)' },
        { label: 'vib(6,2,sine)      — subtle sine vibrato',            value: 'vib(6,2,sine)' },
        { label: 'port(12)           — portamento 12 ticks',            value: 'port(12)' },
        { label: 'arp(0,3,7)         — major arpeggio',                 value: 'arp(0,3,7)' },
        { label: 'arp(0,3,6)         — minor arpeggio',                 value: 'arp(0,3,6)' },
        { label: 'arp(0,4,7)         — major 7th arpeggio',             value: 'arp(0,4,7)' },
        { label: 'volSlide(12,down)  — volume decrease over 12 ticks',  value: 'volSlide(12,down)' },
        { label: 'volSlide(8,up)     — volume increase over 8 ticks',   value: 'volSlide(8,up)' },
        { label: 'trem(12,4)         — tremolo depth 12, rate 4',       value: 'trem(12,4)' },
        { label: 'cut(4)             — cut note after 4 ticks',         value: 'cut(4)' },
        { label: 'retrig(4)          — retrigger every 4 ticks',        value: 'retrig(4)' },
        { label: 'bend(+12,16,linear) — pitch bend +1 octave linear',   value: 'bend(+12,16,linear)' },
        { label: 'bend(-12,16,exp)   — pitch bend -1 octave exp curve', value: 'bend(-12,16,exp)' },
        { label: 'sweep(+1,4,8)      — GB NR10 sweep up (shift 1, pace 4, len 8)', value: 'sweep(+1,4,8)' },
        { label: 'echo(8,0.5)        — echo 8 ticks delay, 50% feedback', value: 'echo(8,0.5)' },
      ];
      const chosen = await showQuickPick(anchor, presets, 'Insert effect preset');
      if (chosen) insertAtCursor(editor, chosen, 'beatbax.showEffectPresets');
    },
  });

  reg({
    id: 'beatbax.showSyntaxHelp',
    label: 'BeatBax: Show Syntax Help…',
    keybindings: [KeyMod.CtrlCmd | KeyCode.KeyH],
    run: async () => {
      const anchor = editorDom ?? document.body;
      const topics: Array<{ label: string; value: string }> = [
        { label: 'pat — Pattern definition',         value: 'pat' },
        { label: 'seq — Sequence definition',        value: 'seq' },
        { label: 'inst — Instrument definition',     value: 'inst' },
        { label: 'channel — Channel assignment',     value: 'channel' },
        { label: 'bpm — Tempo directive',            value: 'bpm' },
        { label: 'time — Time signature',            value: 'time' },
        { label: 'chip — Sound chip selection',     value: 'chip' },
        { label: 'effect — Named effect preset',    value: 'effect' },
        { label: 'play — Start playback',            value: 'play' },
        { label: 'Notes — Note syntax (C4, C#4…)',   value: 'notes' },
        { label: 'Transforms — oct, rev, slow, fast…', value: 'transforms' },
        { label: 'Effects — pan, vib, port, arp…',  value: 'effects' },
      ];

      const HELP_TEXT: Record<string, string> = {
        pat: 'pat NAME = NOTE...\n  Define a pattern of note events.\n  Example: pat melody = C4 E4 G4 C5',
        seq: 'seq NAME = PATNAME[:TRANSFORM]...\n  Define a sequence of pattern references with optional transforms.\n  Example: seq main = melody:oct(+1) bass_pat',
        inst: 'inst NAME type=TYPE [param=value...]\n  Define an instrument.\n  Types: pulse1 | pulse2 | wave | noise | dpcm | triangle | sawtooth | pcm\n  Example: inst lead type=pulse1 duty=50 env=12,down',
        channel: 'channel N => inst INSTNAME seq SEQNAME\n  Assign instrument and sequence to a channel (1-based).\n  Example: channel 1 => inst lead seq main',
        bpm: 'bpm N\n  Set beats per minute (1–999).\n  Example: bpm 120',
        time: 'time N\n  Set steps per bar (e.g. 4 for 4/4).\n  Example: time 4',
        chip: 'chip NAME\n  Select sound chip backend.\n  Options: gameboy | nes | sms | ...\n  Example: chip gameboy',
        effect: 'effect NAME TYPE(params)\n  Define a named effect preset for reuse.\n  Example: effect myVib vib(12,4)',
        play: 'play\n  Start song playback.',
        notes: 'Notes: C4 D4 E4 F4 G4 A4 B4\n  Sharp: C#4  Flat: Cb4\n  Rest: . (dot)\n  Octaves 1–8',
        transforms: 'Transforms applied in seq body:\n  oct(+N/-N) — shift octave\n  rev — reverse pattern\n  slow — halve speed\n  fast — double speed\n  transpose(+N/-N) — semitone shift\n  arp(a,b,c) — arpeggio offsets\n  inst(NAME) — override instrument',
        effects: 'Effects applied per-note with | separator:\n  C4|pan(left)  D4|vib(12,4)  E4|cut(4)\n  Full list: pan, vib, port, arp, volSlide, trem, cut, retrig, bend, sweep, echo',
      };

      const chosen = await showQuickPick(anchor, topics, 'BeatBax Syntax Help');
      if (!chosen) return;

      const helpText = HELP_TEXT[chosen] ?? `No help available for '${chosen}'`;
      // Show help in a second quick-pick (read-only display)
      await showQuickPick(
        anchor,
        helpText.split('\n').map(line => ({ label: line || ' ', value: '' })),
        `Help: ${chosen}`,
      );
    },
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  return {
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-item play helper
// ---------------------------------------------------------------------------

/**
 * Build a complete BeatBax source that plays multiple selected pat/seq items.
 *
 * Strategy:
 *  - Preserve all `inst`, `effect`, `pat`, `seq`, `bpm`, `time`, `chip`,
 *    `ticksPerStep`, and `stepsPerBar` lines from the full editor source so
 *    referenced patterns and instruments are available.
 *  - Strip existing `channel` and `play` directives.
 *  - For each selected seq: assign it to a channel, reusing the instrument
 *    that the seq was originally assigned to in the source (channel N => inst X
 *    seq NAME); fall back to the first declared instrument.
 *  - For selected pats: chain them into a synthetic sequence on one channel.
 *  - Emit a fresh `play`.
 */
/** One entry per original seq in a merged channel slot. */
export interface SeqChunk { seqName: string; noteCount: number; patNames: string[]; }

/**
 * Known channel limits per chip backend. Extend as new chips are added.
 * Used to decide how many simultaneous channels are available when merging
 * an over-sized selection without hardcoding the Game Boy’s limit.
 */
const CHIP_MAX_CHANNELS: Record<string, number> = {
  gameboy: 4, 'game-boy': 4, gb: 4,
  nes: 5,
  c64: 3, sid: 3,
  genesis: 9, 'sega-genesis': 9, megadrive: 9,
};

function detectMaxChannels(source: string): number {
  const m = source.match(/^\s*chip\s+([A-Za-z0-9_-]+)/im);
  return m ? (CHIP_MAX_CHANNELS[m[1].toLowerCase()] ?? 4) : 4;
}

/** Regex matching a note token (C4, C#4, Cb4, G#5, Bb3 …). */
const NOTE_TOKEN_RE = /\b[A-Ga-g][#b]?\d\b/g;

/** Count playable note tokens in a raw pattern body string (excludes rests). */
function countNotesInBody(body: string): number {
  return (body.match(NOTE_TOKEN_RE) ?? []).length;
}

export function buildMultiPlaySource(
  items: Array<{ name: string; kind: 'pat' | 'seq' }>,
  fullSource: string,
): { source: string; chunkInfo: Record<number, SeqChunk[]> } {
  const maxChannels = detectMaxChannels(fullSource);
  const fullLines = fullSource.split('\n');

  // Lines to preserve verbatim (everything except channel/play directives).
  // The keyword alternatives use \b; comment-only and blank-line alternatives
  // do not end with a word character so they must be matched without \b.
  const KEEP_RE = /^\s*(?:(inst|effect|pat|seq|bpm|time|chip|ticksPerStep|stepsPerBar|volume)\b|#|\/\/|$)/;
  const baseLines = fullLines.filter(l => KEEP_RE.test(l));

  // Build a map: seq-name → inst-name from the original channel assignments.
  const seqInstMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*channel\s+\d+\s*=>\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\s+seq\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) seqInstMap.set(m[2], m[1]); // seq-name → inst-name
  }

  // Build a map: seq-name → raw pattern-list string (for chaining overflow).
  const seqBodyMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*seq\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
    if (m) seqBodyMap.set(m[1], m[2].trim());
  }

  // Build a map: pat-name → raw body string (for note counting).
  const patBodyMap = new Map<string, string>();
  for (const l of fullLines) {
    const m = l.match(/^\s*pat\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)/);
    if (m) patBodyMap.set(m[1], m[2].trim());
  }

  // First declared instrument as fallback.
  const fallbackInst = (() => {
    for (const l of fullLines) {
      const m = l.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) return m[1];
    }
    return null;
  })();

  /**
   * Count note-events a seq will produce from its pattern list.
   * Each pattern reference contributes the note tokens in its body.
   * Result is in the same unit as the scheduler's `eventIndex` counter,
   * so cumulative bounds are directly comparable without a ratio.
   */
  const countSeqNotes = (seqName: string): number => {
    const body = seqBodyMap.get(seqName) ?? '';
    const patRefs = body.split(/\s+/).filter(Boolean).map(t => t.split(':')[0]);
    return patRefs.reduce((sum, ref) => sum + countNotesInBody(patBodyMap.get(ref) ?? ''), 0);
  };

  /**
   * Unique pattern names referenced by a seq (in body order, deduped).
   * Used by glyph-margin to resolve the active chunk via sourcePattern events
   * rather than relying solely on note-count arithmetic.
   */
  const getSeqPatNames = (seqName: string): string[] => {
    const body = seqBodyMap.get(seqName) ?? '';
    const seen = new Set<string>();
    const result: string[] = [];
    for (const token of body.split(/\s+/).filter(Boolean)) {
      const base = token.split(':')[0];
      if (base && !seen.has(base)) { seen.add(base); result.push(base); }
    }
    return result;
  };

  // chunkInfo: channelId → [{seqName, noteCount}] for channels with merged seqs.
  // noteCount is the number of note-events the seq generates so the glyph margin
  // can find the active chunk by comparing eventIndex against cumulative sums
  // — no ratio needed, immune to shared pattern names.
  const chunkInfo: Record<number, SeqChunk[]> = {};

  const newLines = [...baseLines];
  const seqItems = items.filter(i => i.kind === 'seq');
  const patItems = items.filter(i => i.kind === 'pat');
  let ch = 1;

  if (seqItems.length === 0) {
    // nothing
  } else if (seqItems.length <= maxChannels) {
    // One channel per seq — all play simultaneously.
    for (const { name } of seqItems) {
      const inst = seqInstMap.get(name) ?? fallbackInst;
      if (inst) newLines.push(`channel ${ch++} => inst ${inst} seq ${name}`);
    }
  } else {
    // More seqs than channels: distribute round-robin across maxChannels,
    // then merge each channel's seqs into a single chained seq by
    // concatenating their pattern lists.
    const slots: Array<{ names: string[]; inst: string | null }> = Array.from(
      { length: maxChannels },
      () => ({ names: [], inst: null }),
    );
    seqItems.forEach(({ name }, idx) => {
      const slot = slots[idx % maxChannels];
      slot.names.push(name);
      if (!slot.inst) slot.inst = seqInstMap.get(name) ?? fallbackInst;
    });

    // Collect every seq name that will be replaced by a merged definition.
    // We'll strip these from newLines so the editor source doesn't emit a
    // duplicate definition (which would shadow the merged one or cause a
    // parse error).
    const replacedSeqs = new Set<string>();
    for (const { names } of slots) {
      if (names.length > 1) {
        for (const n of names) replacedSeqs.add(n);
      }
    }

    // Remove the to-be-replaced seq definitions from the base lines.
    const filteredBase = newLines.filter(l => {
      const m = l.match(/^\s*seq\s+([A-Za-z0-9_-]+)\s*=/);
      return !m || !replacedSeqs.has(m[1]);
    });
    newLines.length = 0;
    newLines.push(...filteredBase);

    for (let c = 0; c < maxChannels; c++) {
      const { names, inst } = slots[c];
      if (names.length === 0 || !inst) continue;
      if (names.length === 1) {
        // No merging needed — original seq name is used, glyph fires naturally.
        newLines.push(`channel ${ch++} => inst ${inst} seq ${names[0]}`);
      } else {
        // Merge under the FIRST seq’s name so the glyph margin’s seqLineMap
        // (built from the editor model) can find the line for the primary seq.
        const merged = names.map(n => seqBodyMap.get(n) ?? n).join(' ');
        const repName = names[0];
        newLines.push(`seq ${repName} = ${merged}`);
        const channelForSlot = ch;
        newLines.push(`channel ${ch++} => inst ${inst} seq ${repName}`);

        // Record the ordered chunks so the glyph margin can resolve which
        // original seq is active by comparing eventIndex against cumulative
        // note counts (same unit as the scheduler’s per-channel event counter).
        chunkInfo[channelForSlot] = names.map(n => ({
          seqName: n,
          noteCount: countSeqNotes(n),
          patNames: getSeqPatNames(n),
        }));
      }
    }
  }

  // Chain all selected pats into a synthetic sequence on one remaining channel.
  if (patItems.length > 0 && ch <= maxChannels) {
    const chain = patItems.map(p => p.name).join(' ');
    newLines.push(`seq __multi__ = ${chain}`);
    if (fallbackInst) newLines.push(`channel ${ch++} => inst ${fallbackInst} seq __multi__`);
  }

  newLines.push('play');
  return { source: newLines.join('\n'), chunkInfo };
}

// ---------------------------------------------------------------------------
// Minimal formatter
// ---------------------------------------------------------------------------

/**
 * Lightweight formatter: normalises blank lines and aligns `=` signs within
 * consecutive `pat`/`seq`/`inst` blocks. No semantic changes — safe to apply
 * at any time.
 */
function formatBeatBaxSource(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // Collect a run of lines that start with the same directive keyword
    const match = lines[i].match(/^(\s*)(pat|seq|inst)\s+(\S+)\s*=/);
    if (match) {
      const keyword = match[2];
      const runStart = i;
      const run: string[] = [];
      while (
        i < lines.length &&
        lines[i].match(new RegExp(`^\\s*${keyword}\\s+`))
      ) {
        run.push(lines[i]);
        i++;
      }
      if (run.length > 1) {
        // Align the `=` signs: find the longest `keyword name` prefix
        const maxPrefix = Math.max(...run.map(l => {
          const m = l.match(/^(\s*(?:pat|seq|inst)\s+\S+)\s*=/);
          return m ? m[1].length : 0;
        }));
        out.push(...run.map(l => {
          const m = l.match(/^(\s*(?:pat|seq|inst)\s+\S+)(\s*=\s*)(.*)/);
          if (!m) return l;
          const pre = m[1].padEnd(maxPrefix);
          const rest = m[3];
          return `${pre} = ${rest.trimStart()}`;
        }));
      } else {
        out.push(...run);
      }
      // Insert a blank line between keyword blocks (skip if next line is already blank)
      if (i < lines.length && lines[i].trim() !== '') {
        const nextKw = lines[i].match(/^(\s*)(pat|seq|inst)\s+/);
        if (!nextKw || nextKw[2] !== keyword) out.push('');
      }
    } else {
      // Collapse 3+ consecutive blank lines into max 2
      if (
        lines[i].trim() === '' &&
        out.length >= 2 &&
        out[out.length - 1].trim() === '' &&
        out[out.length - 2].trim() === ''
      ) {
        i++;
        continue;
      }
      out.push(lines[i]);
      i++;
    }
  }
  // Remove trailing blank lines beyond one
  while (out.length > 1 && out[out.length - 1].trim() === '' && out[out.length - 2].trim() === '') {
    out.pop();
  }
  return out.join('\n');
}
