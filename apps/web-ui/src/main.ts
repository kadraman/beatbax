/**
 * BeatBax Web UI — main entry point
 * Bootstraps the full IDE: Monaco editor, diagnostics, layout, playback, exports,
 * MenuBar, ThemeManager, EditorState, keyboard shortcuts, and advanced IDE chrome.
 */

// Polyfill Buffer for engine compatibility in browser (must be first)
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import { parse } from '@beatbax/engine/parser';
import {
  createLogger,
  loadLoggingFromStorage,
  loadLoggingFromURL,
  getLoggingConfig,
} from '@beatbax/engine/util/logger';

// Core / editor imports
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco } from './editor';
import {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
} from './editor/diagnostics';
import { setupCodeLensPreview } from './editor/codelens-preview';
import { createThreePaneLayout } from './ui/layout';

// Playback imports
import { PlaybackManager } from './playback/playback-manager';
import { TransportControls } from './playback/transport-controls';
import { ChannelState } from './playback/channel-state';
import { OutputPanel } from './panels/output-panel';
import type { OutputMessage } from './panels/output-panel';
import { StatusBar } from './ui/status-bar';

// Export / import imports
import { Toolbar } from './ui/toolbar';
import { ExportManager } from './export/export-manager';
import type { ExportFormat } from './export/export-manager';
import { DragDropHandler } from './import/drag-drop-handler';

import { KeyCode, KeyMod } from 'monaco-editor';
import type { IKeyboardEvent } from 'monaco-editor';
import { MenuBar } from './ui/menu-bar';
import { ThemeManager } from './ui/theme-manager';
import { TransportBar } from './ui/transport-bar';
import { EditorState } from './editor/editor-state';
import { HelpPanel } from './panels/help-panel';
import { ChannelMixer } from './panels/channel-mixer';
import { downloadText } from './export/download-helper';
import { openFilePicker } from './import/file-loader';
import { KeyboardShortcuts } from './utils/keyboard-shortcuts';
import {
  withErrorBoundary,
  showFatalError,
  installGlobalErrorHandlers,
} from './utils/error-boundary';
import { LoadingSpinner } from './utils/loading-spinner';

const log = createLogger('ui:main');

// Init logger
loadLoggingFromStorage();
loadLoggingFromURL();
const logConfig = getLoggingConfig();
log.debug('BeatBax starting. Logging config:', logConfig);

// ─── Convenience helpers for OutputPanel ─────────────────────────────────────
function opLog(panel: OutputPanel, message: string, source = 'app') {
  panel.addMessage({ type: 'info', message, source, timestamp: new Date() } as OutputMessage);
}
function opWarn(panel: OutputPanel, message: string, source = 'app') {
  panel.addMessage({ type: 'warning', message, source, timestamp: new Date() } as OutputMessage);
}
function opError(panel: OutputPanel, message: string, source = 'app') {
  panel.addMessage({ type: 'error', message, source, timestamp: new Date() } as OutputMessage);
}

// ─── Global state ─────────────────────────────────────────────────────────────
let editor: any = null;
let diagnosticsManager: any = null;
let editorState: EditorState | null = null;
let rightPane: HTMLElement;

// Expose eventBus globally for debugging
(window as any).__beatbax_eventBus = eventBus;

// ─── Fatal error guard ────────────────────────────────────────────────────────
// Wrap the entire module body so any synchronous throw during startup
// shows the full-screen fatal overlay instead of a blank/broken page.
try {

// ─── Initial content ─────────────────────────────────────────────────────────
function getInitialContent(): string {
  try {
    const saved = localStorage.getItem('beatbax:editor.content');
    if (saved) return saved;
    // Fall back to legacy storage key
    const legacy = localStorage.getItem('beatbax-editor-content');
    if (legacy) return legacy;
  } catch (_e) { /* ignore */ }

  return `# BeatBax Web IDE
# Use the menu bar (File / Edit / View / Help) for all operations.
# Drag-and-drop a .bax file to load it, or use File → Open.

chip gameboy
bpm 140
time 4

inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst kick  type=noise  env=12,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]

pat melody  = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat beat    = C6 . . C6 . C6 C6 .

seq main  = melody melody melody melody
seq groove = bassline bassline
seq perc  = beat beat beat beat

channel 1 => inst lead  seq main
channel 2 => inst bass  seq groove:oct(-1)
channel 3 => inst wave1 seq main:oct(-1)
channel 4 => inst kick  seq perc

play
`;
}

// ─── DOM setup ───────────────────────────────────────────────────────────────
const spinner = new LoadingSpinner();

configureMonaco();
registerBeatBaxLanguage();

const appContainer = document.getElementById('app') as HTMLElement;
if (!appContainer) throw new Error('#app container not found');

// ─── Menu bar host (topmost) ────────────────────────────────────────────────
const menuBarContainer = document.createElement('div');
menuBarContainer.id = 'bb-menu-bar-host';
appContainer.appendChild(menuBarContainer);

// ─── Toolbar host (below menu bar) ───────────────────────────────────────────
const toolbarContainer = document.createElement('div');
toolbarContainer.id = 'bb-toolbar-host';
appContainer.appendChild(toolbarContainer);

// ─── Layout host (fills remaining height) ────────────────────────────────────
const layoutHost = document.createElement('div');
layoutHost.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
appContainer.appendChild(layoutHost);

const layout = createThreePaneLayout({ container: layoutHost, persist: true });
const editorPane = layout.getEditorPane();

editor = createEditor({
  container: editorPane,
  value: getInitialContent(),
  theme: 'beatbax-dark',
  language: 'beatbax',
  autoSaveDelay: 500,
  emitChangedEvents: false, // EditorState is the sole editor:changed emitter
});

diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);
setupCodeLensPreview(editor.editor, eventBus, () => (editor?.getValue?.() as string) || '');

// Editor is fully initialised — remove the static boot overlay.
spinner.hideBoot();

const outputPane = layout.getOutputPane();
rightPane = layout.getRightPane();

// ─── EditorState ─────────────────────────────────────────────────────────────
editorState = new EditorState({
  editor: editor.editor,
  eventBus,
  autoSaveDelay: 500,
  restoreOnInit: false, // already restored via getInitialContent()
});

// ─── Status bar ───────────────────────────────────────────────────────────────
const statusBarContainer = document.createElement('div');
statusBarContainer.id = 'status-bar';
statusBarContainer.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;';
document.body.appendChild(statusBarContainer);

// ─── Core components ─────────────────────────────────────────────────────────────────
const channelState = new ChannelState(eventBus);
const playbackManager = new PlaybackManager(eventBus, channelState);
const outputPanel = new OutputPanel(outputPane, eventBus);
const statusBar = withErrorBoundary('StatusBar', () => new StatusBar({ container: statusBarContainer }, eventBus), statusBarContainer);

// Install global error handlers now that outputPanel is ready.
// Uncaught errors and unhandled rejections are forwarded as error messages.
installGlobalErrorHandlers((message, _err) => {
  outputPanel.addMessage({
    type: 'error',
    message: `Uncaught error: ${message}`,
    source: 'runtime',
    timestamp: new Date(),
  });
});

// ─── Unified Channel Panel (ChannelMixer) in the right pane ────────────────
// The ChannelMixer is the combined channel controls + monitor. It lives in a
// dedicated scoped div so its render() (which clears innerHTML on every
// parse:success) never conflicts with any sibling nodes in rightPane.
const ccContainer = document.createElement('div');
ccContainer.id = 'bb-channel-controls-host';
ccContainer.style.cssText = 'flex: 1 1 0; overflow-y: auto;';
rightPane.appendChild(ccContainer);

const channelMixer = withErrorBoundary(
  'ChannelMixer',
  () => new ChannelMixer({ container: ccContainer, eventBus, channelState }),
  ccContainer,
);

// ─── HelpPanel — fixed overlay drawer from the right ───────────────────────
const helpOverlay = document.createElement('div');
helpOverlay.id = 'bb-help-overlay';
helpOverlay.style.cssText = [
  'position: fixed',
  'top: 0',
  'right: 0',
  'bottom: 0',
  'width: min(480px, 90vw)',
  'z-index: 5000',
  'display: none',
  'flex-direction: column',
  'box-shadow: -4px 0 24px rgba(0,0,0,0.5)',
  'border-left: 1px solid #3c3c3c',
].join('; ');
document.body.appendChild(helpOverlay);

// ─── Central keyboard shortcuts registry ────────────────────────────────────
// Created before HelpPanel so we can pass getShortcuts: () => ks.list().
// Shortcuts are registered after all components are instantiated (see bottom).
const ks = new KeyboardShortcuts();

const helpPanel = withErrorBoundary('HelpPanel', () => new HelpPanel({
  container: helpOverlay,
  eventBus,
  defaultVisible: false,
  getShortcuts: () => ks.list(),
  onInsertSnippet: (snippet) => {
    const monacoEditor = editor?.editor;
    if (!monacoEditor) return;
    const selection = monacoEditor.getSelection();
    const id = { major: 1, minor: 1 };
    const op = { identifier: id, range: selection, text: snippet, forceMoveMarkers: true };
    monacoEditor.executeEdits('help-panel', [op]);
    monacoEditor.focus();
    helpPanel?.hide();
  },
// Pass appContainer, not helpOverlay, so that if HelpPanel throws the error
// card is rendered into a visible element.  helpOverlay starts with
// display:none, which would hide the boundary fallback silently.
}), appContainer);

// Toggle panel visibility via panel:toggled
eventBus.on('panel:toggled', ({ panel, visible }) => {
  if (panel === 'output') {
    outputPane.style.display = visible ? '' : 'none';
  }
  if (panel === 'channel-mixer') {
    ccContainer.style.display = visible ? '' : 'none';
  }
  if (panel === 'toolbar') {
    try {
      toolbar?.[visible ? 'show' : 'hide']?.();
    } catch (_e) { /* ignore */ }
  }
  if (panel === 'transport-bar') {
    try {
      transportBar?.[visible ? 'show' : 'hide']?.();
    } catch (_e) { /* ignore */ }
  }
});

(window as any).__beatbax_channelState = channelState;
(window as any).__beatbax_playbackManager = playbackManager;
(window as any).__beatbax_outputPanel = outputPanel;
(window as any).__beatbax_statusBar = statusBar;
(window as any).__beatbax_channelMixer = channelMixer; // unified ChannelMixer (in right pane)
(window as any).__beatbax_helpPanel = helpPanel;

// Transport bar UI will be created by TransportBar

// ─── TransportBar + TransportControls ────────────────────────────────────────
const transportBar = new TransportBar({ container: layoutHost });

// Update transport display from parser / playback events
eventBus.on('parse:success', ({ ast }) => {
  try {
    const bpm = (ast as any)?.bpm ?? 120;
    transportBar.setBpm(Number(bpm));
  } catch (_e) {}
});

eventBus.on('playback:position', ({ current, total }) => {
  try {
    // Format current seconds -> MM:SS if value appears to be seconds, otherwise show tick count
    const label = typeof current === 'number'
      ? `${Math.floor(current/60)}:${Math.floor(current%60).toString().padStart(2,'0')}`
      : String(current);
    transportBar.setTimeLabel(label);
  } catch (_e) {}
});

const getSource = () => (editor?.getValue?.() as string) || '';

const transportControls = new TransportControls(
  {
    playButton: transportBar.playButton,
    pauseButton: transportBar.pauseButton,
    stopButton: transportBar.stopButton,
    applyButton: transportBar.applyButton,
    enableKeyboardShortcuts: false, // central ks registry owns Space/Esc/Ctrl+Enter
  },
  playbackManager,
  eventBus,
  getSource
);
(window as any).__beatbax_transportControls = transportControls;

// Sync error state with TransportControls
eventBus.on('parse:error', () => transportControls.setHasErrors(true));
eventBus.on('validation:warnings', () => transportControls.setHasErrors(false));

// ─── Live mode (handled by transportBar.liveButton) ──────────────────────────
let liveMode = false;
transportBar.liveButton.addEventListener('click', () => {
  liveMode = !liveMode;
  transportBar.liveButton.style.borderColor = liveMode ? '#4caf50' : 'transparent';
  transportBar.liveButton.title = liveMode ? 'Live play ON — click to disable' : 'Toggle live-play mode';
  opLog(outputPanel, liveMode ? '⚡ Live play enabled' : '⚡ Live play disabled');
  if (!liveMode) {
    clearTimeout((window as any).__bb_liveTimer);
  }
});

editor.onDidChangeModelContent?.(() => {
  if (!liveMode) return;
  clearTimeout((window as any).__bb_liveTimer);
  (window as any).__bb_liveTimer = setTimeout(() => playbackManager.play(getSource()), 800);
});

// ─── ExportManager ───────────────────────────────────────────────────────────
const exportManager = new ExportManager(eventBus);

// Show activity spinner during exports (WAV can take several seconds).
eventBus.on('export:started', ({ format }) =>
  spinner.show(format === 'wav' ? 'Rendering WAV audio…' : `Exporting ${format.toUpperCase()}…`)
);
eventBus.on('export:success', () => spinner.hide());
eventBus.on('export:error', () => spinner.hide());

// Tracks the stem of the last loaded .bax filename (e.g. 'sample_song' from 'sample_song.bax').
let loadedFilename = 'song';

/** Strip directory, extension and return the bare stem of a filename path. */
function fileBaseStem(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') || 'song';
}

/**
 * Parse song source and emit parse:success / parse:error so all subscribers
 * (ChannelMixer, StatusBar, etc.) immediately reflect the new song.
 */
function emitParse(content: string): void {
  try {
    eventBus.emit('parse:started', undefined);
    const ast = parse(content);
    eventBus.emit('parse:success', { ast });
    diagnosticsManager?.clear?.();
  } catch (err: any) {
    eventBus.emit('parse:error', { error: err, message: err.message ?? String(err) });
  }
}

async function handleExport(format: ExportFormat) {
  const source = getSource();
  if (!source.trim()) {
    opWarn(outputPanel, 'Nothing to export — write or load a song first (File → Open or drag a .bax file).', 'export');
    return;
  }
  const result = await exportManager.export(source, format, { filename: loadedFilename });
  if (result.success) {
    opLog(outputPanel, `✓ Exported ${result.filename} (${result.size ?? 0} bytes)`, 'export');
    result.warnings?.forEach(w => opWarn(outputPanel, w, 'export'));
  } else {
    opError(outputPanel, `Export failed: ${result.error?.message ?? 'unknown error'}`, 'export');
  }
}

// ─── ThemeManager ────────────────────────────────────────────────────────────
const themeManager = new ThemeManager({ eventBus });
themeManager.init();

(window as any).__beatbax_themeManager = themeManager;

// ─── MenuBar ─────────────────────────────────────────────────────────────────
// Declared before Toolbar so toolbar's onLoad can call menuBar.recordRecent.
// The `toolbar` variable is referenced inside MenuBar callbacks via the closure
// formed after Toolbar is instantiated below.
let toolbar: Toolbar; // forward declaration — assigned after Toolbar construction

const menuBar = new MenuBar({
  container: menuBarContainer,
  eventBus,
  enableGlobalShortcuts: false, // central ks registry owns all menu shortcuts
  onShowShortcuts: () => helpPanel?.showShortcuts(),
  onExport: (format) => handleExport(format),
  onNew: () => {
    if (confirm('Clear the editor and start a new song?')) {
      editor.setValue?.('');
      loadedFilename = 'song';
      opLog(outputPanel, '📄 New song');
    }
  },
  onOpen: () => {
    openFilePicker({
      accept: '.bax',
      onLoad: (result) => {
        loadedFilename = fileBaseStem(result.filename);
        editor.setValue?.(result.content);
        opLog(outputPanel, `📂 Opened ${result.filename}`);
        eventBus.emit('song:loaded', { filename: result.filename });
        menuBar.recordRecent(result.filename);
        emitParse(result.content);
        toolbar?.setExportEnabled(true);
      },
    });
  },
  onSave: () => {
    const content = getSource();
    if (!content.trim()) { opWarn(outputPanel, 'Nothing to save — the editor is empty.'); return; }
    downloadText(content, `${loadedFilename}.bax`, 'text/plain');
    opLog(outputPanel, `💾 Saved ${loadedFilename}.bax`);
  },
  onSaveAs: () => {
    const raw = prompt('Save as:', `${loadedFilename}.bax`);
    if (!raw) return;
    const filename = raw.endsWith('.bax') ? raw : `${raw}.bax`;
    downloadText(getSource(), filename, 'text/plain');
    loadedFilename = fileBaseStem(filename);
    opLog(outputPanel, `💾 Saved ${filename}`);
  },
  onLoadFile: (filename, content) => {
    loadedFilename = fileBaseStem(filename);
    editor.setValue?.(content);
    opLog(outputPanel, `🎵 Loaded ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
    toolbar?.setExportEnabled(true);
  },
  onUndo: () => editor.editor?.trigger('menu', 'undo', null),
  onRedo: () => editor.editor?.trigger('menu', 'redo', null),
  onCut: () => editor.editor?.trigger('menu', 'editor.action.clipboardCutAction', null),
  onCopy: () => editor.editor?.trigger('menu', 'editor.action.clipboardCopyAction', null),
  onPaste: () => editor.editor?.trigger('menu', 'editor.action.clipboardPasteAction', null),
  onFind: () => editor.editor?.trigger('menu', 'actions.find', null),
  onReplace: () => editor.editor?.trigger('menu', 'editor.action.startFindReplaceAction', null),
  onZoomIn: () => {
    const cur = (editor.editor?.getOption(52 /* fontSize */) as number) || 14;
    editor.editor?.updateOptions({ fontSize: Math.min(cur + 2, 32) });
  },
  onZoomOut: () => {
    const cur = (editor.editor?.getOption(52 /* fontSize */) as number) || 14;
    editor.editor?.updateOptions({ fontSize: Math.max(cur - 2, 8) });
  },
  onZoomReset: () => editor.editor?.updateOptions({ fontSize: 14 }),
  onToggleTheme: () => themeManager.toggle(),
});

(window as any).__beatbax_menuBar = menuBar;

// ─── Toolbar ─────────────────────────────────────────────────────────────────
toolbar = new Toolbar({
  container: toolbarContainer,
  eventBus,
  onLoad: (filename, content) => {
    loadedFilename = fileBaseStem(filename);
    editor.setValue?.(content);
    opLog(outputPanel, `📂 Opened ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
    toolbar.setExportEnabled(true);
  },
  onExport: handleExport,
  onVerify: () => {
    const source = getSource();
    if (!source.trim()) { opWarn(outputPanel, 'Nothing to verify — the editor is empty. Use File → Open or type a song.'); return; }
    try {
      parse(source);
      opLog(outputPanel, '✔ Verification passed', 'verify');
      diagnosticsManager?.clearAll?.();
      toolbar.setExportEnabled(true);
    } catch (err: any) {
      opError(outputPanel, `✗ Verification failed: ${err.message ?? err}`, 'verify');
      if (diagnosticsManager && err.loc) {
        diagnosticsManager.setMarkers([parseErrorToDiagnostic(err)]);
      }
      toolbar.setExportEnabled(false);
    }
  },
});

(window as any).__beatbax_toolbar = toolbar;
(window as any).__beatbax_exportManager = exportManager;

// ─── Drag-and-drop ───────────────────────────────────────────────────────────
const dragDrop = new DragDropHandler(document.body, {
  onDrop: (filename, content) => {
    loadedFilename = fileBaseStem(filename);
    editor.setValue?.(content);
    opLog(outputPanel, `🗂 Dropped ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
    toolbar.setExportEnabled(true);
    setTimeout(() => playbackManager.play(getSource()), 200);
  },
});
(window as any).__beatbax_dragDrop = dragDrop;

// ─── URL query auto-load ─────────────────────────────────────────────────────
(async () => {
  const params = new URL(location.href).searchParams;
  const hasSongParam = params.has('song');
  if (hasSongParam) spinner.show('Loading song…');
  try {
    const { loadFromQueryParams } = await import('./import/remote-loader');
    const result = await loadFromQueryParams(params);
    if (result) {
      const songParam = params.get('song') ?? 'song.bax';
      const filename = songParam.split('/').pop() || 'song.bax';
      loadedFilename = fileBaseStem(filename);
      editor.setValue?.(result.content);
      opLog(outputPanel, `🌐 Loaded from URL: ${filename}`);
      eventBus.emit('song:loaded', { filename });
      menuBar.recordRecent(filename);
      emitParse(result.content);
      toolbar.setExportEnabled(true);
      setTimeout(() => playbackManager.play(getSource()), 300);
    }
  } catch (err: any) {
    log.warn('URL auto-load failed:', err.message);
  } finally {
    if (hasSongParam) spinner.hide();
  }
})();

// ─── Initial parse ───────────────────────────────────────────────────────────
// Emit parse:success on startup so subscribers (ChannelMixer, StatusBar, …)
// are populated without requiring the user to press Play first.
(async () => {
  const content = getSource();
  try {
    parse(content); // validate first so we know whether to enable exports
    toolbar.setExportEnabled(true);
  } catch {
    toolbar.setExportEnabled(false);
  }
  emitParse(content);
})();

// ─── Monaco editor shortcut commands ────────────────────────────────────────
// These fire when the Monaco editor has focus and complement the global window
// handler (which is blocked by isInInput when Monaco has focus).
const monacoInst = editor.editor;

// F5 → Play (prevents browser page-refresh when Monaco is focused)
monacoInst.addCommand(KeyCode.F5, () => { transportBar.playButton.click(); });
// F8 → Stop
monacoInst.addCommand(KeyCode.F8, () => { transportBar.stopButton.click(); });
// Ctrl+Enter → Apply & Play (overrides Monaco's built-in "Insert Line Below")
monacoInst.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => { transportBar.applyButton.click(); });
// Shift+F1 → Toggle Help (F1 alone is Monaco's own Command Palette — leave that alone)
monacoInst.addCommand(KeyMod.Shift | KeyCode.F1, () => { helpPanel?.toggle(); });
// Ctrl+Shift+/ is Monaco's "Toggle Block Comment" so Ctrl+? cannot be used.
// Alt+Shift+K (K for Keyboard shortcuts) is free in all browsers and Monaco.
monacoInst.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyK, () => { helpPanel?.showShortcuts(); });
// Ctrl+Shift+L → Theme toggle.
// Monaco binds Ctrl+Shift+L to "Select All Occurrences" by default; registering
// here via addCommand overrides that default while Monaco has focus.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, () => { menuBar.triggerToggleTheme(); });
// Ctrl+Shift+Y → Channel Monitor toggle (Monaco captures this key when focused).
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY, () => {
  const vis = ccContainer.style.display !== 'none';
  eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
});
// Ctrl+Alt+P → Monaco Command Palette (alternative to Ctrl+Shift+P which is
// intercepted by browsers: Firefox opens a Private Window, Chrome/Edge open
// the DevTools command menu, so Ctrl+Shift+P can never reliably reach Monaco).
// F1 is the primary in-editor shortcut for the Command Palette.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP, () => {
  monacoInst.trigger('keyboard', 'editor.action.quickCommand', null);
});
// Escape: close the Help overlay if it is open, and allow Monaco to handle
// its own Escape uses (close find widget, suggestions, rename dialog, etc.).
// Playback stop via Escape is NOT done from inside Monaco — use F8 instead.
monacoInst.onKeyDown((e: IKeyboardEvent) => {
  if (e.keyCode === KeyCode.Escape && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (helpPanel?.isVisible()) helpPanel.hide();
    // Do NOT call transportBar.stopButton.click() here: the same Escape that closes Monaco’s
    // find widget / suggestions overlay would also unexpectedly stop playback.
  }
});

// ─── Central keyboard shortcut registrations ────────────────────────────────
// All app-wide shortcuts live here so HelpPanel can list them dynamically.

// Transport
// Space only fires when the editor does NOT have focus (allowInInput: false is
// correct — users must be able to type spaces). F5/F8 are the in-editor transport
// shortcuts; their Monaco commands (above) handle the in-editor case.
ks.register({ key: ' ', description: 'Play / Pause (when editor not focused)', allowInInput: false,
  action: () => { if (!transportBar.playButton.disabled) transportBar.playButton.click(); else transportBar.pauseButton.click(); },
});
ks.register({ key: 'F5', description: 'Play / re-play', allowInInput: false,
  action: () => transportBar.playButton.click(),
});
ks.register({ key: 'F8', description: 'Stop playback', allowInInput: false,
  action: () => transportBar.stopButton.click(),
});
ks.register({ key: 'Escape', description: 'Stop playback or close Help panel', allowInInput: false,
  action: () => { if (helpPanel?.isVisible()) helpPanel?.hide(); else transportBar.stopButton.click(); },
});
// Ctrl+Enter global handler fires when Monaco is NOT focused; the Monaco
// addCommand above handles the in-editor case.
ks.register({ key: 'Enter', ctrlKey: true, description: 'Apply & re-play', allowInInput: false,
  action: () => transportBar.applyButton.click(),
});

// File
// Note: Ctrl+N is reserved by browsers (new window) and cannot be intercepted —
// use File → New from the menu bar instead.
ks.register({ key: 'o', ctrlKey: true, description: 'Open file…', allowInInput: true,
  action: () => menuBar.triggerOpen() });
ks.register({ key: 's', ctrlKey: true, description: 'Save', allowInInput: true,
  action: () => menuBar.triggerSave() });
ks.register({ key: 's', ctrlKey: true, shiftKey: true, description: 'Save as…', allowInInput: true,
  action: () => menuBar.triggerSaveAs() });

// Edit
// Ctrl+Z / Ctrl+Y: Monaco handles these natively when the editor is focused.
// These entries let them work via the global handler when focus is elsewhere.
ks.register({ key: 'z', ctrlKey: true, description: 'Undo', allowInInput: false,
  action: () => menuBar.triggerUndo() });
ks.register({ key: 'y', ctrlKey: true, description: 'Redo', allowInInput: false,
  action: () => menuBar.triggerRedo() });

// View — marked allowInInput: true so they work while the editor is focused
// (Monaco doesn't intercept any of these key combinations).
//
// Ctrl+Alt+T is reserved by Firefox (opens a new tab).
// Ctrl+Shift+M is reserved by Firefox (Responsive Design Mode).
// Ctrl+Shift+L and Ctrl+Shift+Y are safe in Chrome, Edge and Firefox.
ks.register({ key: 'l', ctrlKey: true, shiftKey: true, description: 'Toggle theme (Dark / Light)', allowInInput: true,
  action: () => menuBar.triggerToggleTheme() });
ks.register({ key: '`', ctrlKey: true, description: 'Toggle Output panel', allowInInput: true,
  action: () => {
    const vis = outputPane.style.display !== 'none';
    eventBus.emit('panel:toggled', { panel: 'output', visible: !vis });
  },
});
ks.register({ key: 'y', ctrlKey: true, shiftKey: true, description: 'Toggle Channel Mixer', allowInInput: true,
  action: () => {
    const vis = ccContainer.style.display !== 'none';
    eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
  },
});
ks.register({ key: 'b', ctrlKey: true, shiftKey: true, description: 'Toggle Toolbar', allowInInput: true,
  action: () => {
    const vis = toolbar?.isVisible?.() ?? false;
    eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !vis });
  },
});
ks.register({ key: 'r', ctrlKey: true, shiftKey: true, description: 'Toggle Transport Bar', allowInInput: true,
  action: () => {
    const vis = transportBar?.isVisible?.() ?? false;
    eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !vis });
  },
});

// Help — Shift+F1 is safe (F1 alone opens Monaco's own Command Palette).
// Both shortcuts toggle the panel open/closed.
ks.register({ key: 'F1', shiftKey: true, description: 'Toggle Help Panel', allowInInput: true,
  action: () => helpPanel?.toggle() });
ks.register({ key: 'h', ctrlKey: true, shiftKey: true, description: 'Toggle Help Panel', allowInInput: true,
  action: () => helpPanel?.toggle() });
// Alt+Shift+K → jump directly to the Keyboard Shortcuts section.
// (Ctrl+Shift+/ = Monaco block comment, so Ctrl+? is not available.)
ks.register({ key: 'k', altKey: true, shiftKey: true, description: 'Show Keyboard Shortcuts', allowInInput: true,
  action: () => helpPanel?.showShortcuts() });

ks.mount();

log.debug('BeatBax initialised ✓');

} catch (fatalError) {
  showFatalError(fatalError);
}
