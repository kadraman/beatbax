/**
 * BeatBax Web UI - Phase 4 Implementation
 * BUILDS ON Phase 1+2+3: Monaco editor, diagnostics, layout, playback, exports
 * ADDS Phase 4: MenuBar, ThemeManager, EditorState, advanced IDE chrome
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

// Phase 1 imports
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco } from './editor';
import {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
} from './editor/diagnostics';
import { createThreePaneLayout } from './ui/layout';

// Phase 2 imports
import { PlaybackManager } from './playback/playback-manager';
import { TransportControls } from './playback/transport-controls';
import { ChannelState } from './playback/channel-state';
import { OutputPanel } from './panels/output-panel';
import type { OutputMessage } from './panels/output-panel';
import { StatusBar } from './ui/status-bar';

// Phase 3 imports
import { Toolbar } from './ui/toolbar';
import { ExportManager } from './export/export-manager';
import type { ExportFormat } from './export/export-manager';
import { DragDropHandler } from './import/drag-drop-handler';

// Phase 4 imports — NEW
import { MenuBar } from './ui/menu-bar';
import { ThemeManager } from './ui/theme-manager';
import { EditorState } from './editor/editor-state';
import { HelpPanel } from './panels/help-panel';
import { ChannelMixer } from './panels/channel-mixer';
import { downloadText } from './export/download-helper';
import { openFilePicker } from './import/file-loader';
import { KeyboardShortcuts } from './utils/keyboard-shortcuts';

const log = createLogger('ui:phase4');

// Init logger
loadLoggingFromStorage();
loadLoggingFromURL();
const logConfig = getLoggingConfig();
log.debug('BeatBax Phase 4 starting. Logging config:', logConfig);

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

// ─── Initial content ─────────────────────────────────────────────────────────
function getInitialContent(): string {
  try {
    const saved = localStorage.getItem('beatbax:editor.content');
    if (saved) return saved;
    // Fall back to legacy phase3 key
    const legacy = localStorage.getItem('beatbax-editor-content');
    if (legacy) return legacy;
  } catch (_e) { /* ignore */ }

  return `# BeatBax Phase 4 - Advanced IDE
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
configureMonaco();
registerBeatBaxLanguage();

const appContainer = document.getElementById('app') as HTMLElement;
if (!appContainer) throw new Error('#app container not found');

// ─── Phase 4: Menu bar host (topmost) ────────────────────────────────────────
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
});

diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);

const outputPane = layout.getOutputPane();
rightPane = layout.getRightPane();

// ─── Phase 4: EditorState ─────────────────────────────────────────────────────
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

// ─── Phase 2 Components ───────────────────────────────────────────────────────
const channelState = new ChannelState(eventBus);
const playbackManager = new PlaybackManager(eventBus, channelState);
const outputPanel = new OutputPanel(outputPane, eventBus);
const statusBar = new StatusBar({ container: statusBarContainer }, eventBus);

// ─── Phase 4: Unified Channel Panel (ChannelMixer) in the right pane ────────
// The ChannelMixer is the combined channel controls + monitor. It lives in a
// dedicated scoped div so its render() (which clears innerHTML on every
// parse:success) never conflicts with any sibling nodes in rightPane.
const ccContainer = document.createElement('div');
ccContainer.id = 'bb-channel-controls-host';
ccContainer.style.cssText = 'flex: 1 1 0; overflow-y: auto;';
rightPane.appendChild(ccContainer);

const channelMixer = new ChannelMixer({ container: ccContainer, eventBus, channelState });

// ─── Phase 4: HelpPanel — fixed overlay drawer from the right ────────────────
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

// ─── Phase 4: Central keyboard shortcuts registry ───────────────────────────
// Created before HelpPanel so we can pass getShortcuts: () => ks.list().
// Shortcuts are registered after all components are instantiated (see bottom).
const ks = new KeyboardShortcuts();

const helpPanel = new HelpPanel({
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
    helpPanel.hide();
  },
});

// Toggle panel visibility via panel:toggled
eventBus.on('panel:toggled', ({ panel, visible }) => {
  if (panel === 'output') {
    outputPane.style.display = visible ? '' : 'none';
  }
  if (panel === 'channel-mixer') {
    ccContainer.style.display = visible ? '' : 'none';
  }
});

(window as any).__beatbax_channelState = channelState;
(window as any).__beatbax_playbackManager = playbackManager;
(window as any).__beatbax_outputPanel = outputPanel;
(window as any).__beatbax_statusBar = statusBar;
(window as any).__beatbax_channelMixer = channelMixer; // unified ChannelMixer (in right pane)
(window as any).__beatbax_helpPanel = helpPanel;

// ─── Transport bar ────────────────────────────────────────────────────────────
const transportContainer = document.createElement('div');
transportContainer.id = 'phase4-transport';
transportContainer.className = 'bb-transport';
transportContainer.style.cssText = `
  padding: 6px 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
`;  // background and border handled by .bb-transport via CSS vars

const logo = document.createElement('img');
logo.src = '/logo-menu-bar.png';
logo.alt = 'BeatBax';
logo.style.cssText = 'height: 44px; margin-right: 6px;';
transportContainer.appendChild(logo);

const mkBtn = (label: string, title = '') => {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.style.cssText = 'padding: 6px 14px; font-size: 13px; cursor: pointer;';
  return b;
};

const playBtn = mkBtn('▶ Play', 'Play current song (Space)') as HTMLButtonElement;
const pauseBtn = mkBtn('⏸ Pause', 'Pause playback') as HTMLButtonElement;
const stopBtn = mkBtn('⏹ Stop', 'Stop playback (Esc)') as HTMLButtonElement;
const applyBtn = mkBtn('🔄 Apply', 'Apply and re-play') as HTMLButtonElement;
const liveBtn = mkBtn('⚡ Live', 'Toggle live-play mode') as HTMLButtonElement;
liveBtn.style.border = '2px solid transparent';

transportContainer.append(playBtn, pauseBtn, stopBtn, applyBtn, liveBtn);

// Insert transport bar BEFORE the layout content (but inside layoutHost)
layoutHost.insertBefore(transportContainer, layoutHost.firstChild);

// ─── TransportControls component ─────────────────────────────────────────────
const getSource = () => (editor?.getValue?.() as string) || '';

const transportControls = new TransportControls(
  {
    playButton: playBtn,
    pauseButton: pauseBtn,
    stopButton: stopBtn,
    applyButton: applyBtn,
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

// ─── Live mode ────────────────────────────────────────────────────────────────
let liveMode = false;
liveBtn.addEventListener('click', () => {
  liveMode = !liveMode;
  liveBtn.style.borderColor = liveMode ? '#4caf50' : 'transparent';
  liveBtn.title = liveMode ? 'Live play ON — click to disable' : 'Toggle live-play mode';
  opLog(outputPanel, liveMode ? '⚡ Live play enabled' : '⚡ Live play disabled');
});

editor.onDidChangeModelContent?.(() => {
  if (!liveMode) return;
  clearTimeout((window as any).__bb_liveTimer);
  (window as any).__bb_liveTimer = setTimeout(() => playbackManager.play(getSource()), 800);
});

// ─── Phase 3: ExportManager ───────────────────────────────────────────────────
const exportManager = new ExportManager(eventBus);

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
    opWarn(outputPanel, 'Nothing to export — write a song first', 'export');
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

// ─── Phase 4: ThemeManager ────────────────────────────────────────────────────
const themeManager = new ThemeManager({ eventBus });
themeManager.init();

(window as any).__beatbax_themeManager = themeManager;

// ─── Phase 4: MenuBar ─────────────────────────────────────────────────────────
// Declared before Toolbar so toolbar's onLoad can call menuBar.recordRecent.
// The `toolbar` variable is referenced inside MenuBar callbacks via the closure
// formed after Toolbar is instantiated below.
let toolbar: Toolbar; // forward declaration — assigned after Toolbar construction

const menuBar = new MenuBar({
  container: menuBarContainer,
  eventBus,
  enableGlobalShortcuts: false, // central ks registry owns all menu shortcuts
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
    if (!content.trim()) { opWarn(outputPanel, 'Nothing to save'); return; }
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

// ─── Phase 3: Toolbar ─────────────────────────────────────────────────────────
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
    if (!source.trim()) { opWarn(outputPanel, 'Nothing to verify'); return; }
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

// ─── Phase 3: Drag-and-drop ───────────────────────────────────────────────────
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

// ─── Phase 3: URL query auto-load ─────────────────────────────────────────────
(async () => {
  try {
    const { loadFromQueryParams } = await import('./import/remote-loader');
    const result = await loadFromQueryParams(new URL(location.href).searchParams);
    if (result) {
      const songParam = new URL(location.href).searchParams.get('song') ?? 'song.bax';
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

// ─── Central keyboard shortcut registrations ────────────────────────────────
// All app-wide shortcuts live here so HelpPanel can list them dynamically.

// Transport
ks.register({ key: ' ', description: 'Play / Pause', allowInInput: false,
  action: () => { if (!playBtn.disabled) playBtn.click(); else pauseBtn.click(); },
});
ks.register({ key: 'Escape', description: 'Stop playback or close Help panel',
  action: () => { if (helpPanel.isVisible()) helpPanel.hide(); else stopBtn.click(); },
});
ks.register({ key: 'Enter', ctrlKey: true, description: 'Apply & re-play',
  action: () => applyBtn.click(),
});

// File
ks.register({ key: 'n', ctrlKey: true, description: 'New song',
  action: () => menuBar.triggerNew() });
ks.register({ key: 'o', ctrlKey: true, description: 'Open file…',
  action: () => menuBar.triggerOpen() });
ks.register({ key: 's', ctrlKey: true, description: 'Save',
  action: () => menuBar.triggerSave() });
ks.register({ key: 's', ctrlKey: true, shiftKey: true, description: 'Save as…',
  action: () => menuBar.triggerSaveAs() });

// Edit
ks.register({ key: 'z', ctrlKey: true, description: 'Undo',
  action: () => menuBar.triggerUndo() });
ks.register({ key: 'y', ctrlKey: true, description: 'Redo',
  action: () => menuBar.triggerRedo() });

// View
ks.register({ key: 't', ctrlKey: true, shiftKey: true, description: 'Toggle theme',
  action: () => menuBar.triggerToggleTheme() });
ks.register({ key: '`', ctrlKey: true, description: 'Toggle Output panel',
  action: () => {
    const vis = outputPane.style.display !== 'none';
    eventBus.emit('panel:toggled', { panel: 'output', visible: !vis });
  },
});
ks.register({ key: 'm', ctrlKey: true, shiftKey: true, description: 'Toggle Channel Controls',
  action: () => {
    const vis = ccContainer.style.display !== 'none';
    eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
  },
});

// Help
ks.register({ key: 'F1', description: 'Open Help panel',
  action: () => helpPanel.show() });
ks.register({ key: 'h', ctrlKey: true, shiftKey: true, description: 'Help / keyboard shortcuts',
  action: () => helpPanel.show() });

ks.mount();

log.debug('BeatBax Phase 4 initialised ✓');
