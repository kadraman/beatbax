/**
 * BeatBax Web UI - Phase 3 Implementation
 * BUILDS ON Phase 1+2: Monaco editor, diagnostics, layout, playback
 * ADDS Phase 3: ExportManager, Toolbar, FileLoader, DragDropHandler, RemoteLoader
 */

// Polyfill Buffer for engine compatibility in browser (must be first)
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import { parse } from '@beatbax/engine/parser';
import { Player } from '@beatbax/engine/audio/playback';
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
import { ChannelControls } from './panels/channel-controls';

// Phase 3 imports — NEW
import { Toolbar } from './ui/toolbar';
import { ExportManager } from './export/export-manager';
import type { ExportFormat } from './export/export-manager';
import { DragDropHandler } from './import/drag-drop-handler';

const log = createLogger('ui:phase3');

// Init logger
loadLoggingFromStorage();
loadLoggingFromURL();
const logConfig = getLoggingConfig();
log.debug('BeatBax Phase 3 starting. Logging config:', logConfig);

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
let player: Player | null = null;
let currentAST: any = null;
let editor: any = null;
let diagnosticsManager: any = null;
let rightPane: HTMLElement;

// Expose eventBus globally for debugging
(window as any).__beatbax_eventBus = eventBus;

// ─── Initial content ─────────────────────────────────────────────────────────
function getInitialContent(): string {
  try {
    const saved = localStorage.getItem('beatbax-editor-content');
    if (saved) return saved;
  } catch (_e) { /* ignore */ }

  return `# BeatBax Phase 3 - Export & Import
# Open a .bax file, drag-and-drop, or use the Examples menu.
# Use the export buttons in the toolbar to download JSON / MIDI / UGE / WAV.

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

// Phase 3 Toolbar host — inserted above the layout
const toolbarContainer = document.createElement('div');
toolbarContainer.id = 'bb-toolbar-host';
appContainer.appendChild(toolbarContainer);

// Layout host — fills remaining height
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
const channelControls = new ChannelControls({ container: rightPane, eventBus, channelState });
channelControls.render();

(window as any).__beatbax_channelState = channelState;
(window as any).__beatbax_playbackManager = playbackManager;
(window as any).__beatbax_outputPanel = outputPanel;
(window as any).__beatbax_statusBar = statusBar;

// ─── Transport bar ────────────────────────────────────────────────────────────
const transportContainer = document.createElement('div');
transportContainer.id = 'phase3-transport';
transportContainer.style.cssText = `
  padding: 6px 10px;
  background: #2d2d2d;
  display: flex;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
`;

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
    enableKeyboardShortcuts: true,
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
// Used as the base for all export filenames. Resets to 'song' when content is typed fresh.
let loadedFilename = 'song';

/** Strip directory, extension and return the bare stem of a filename path. */
function fileBaseStem(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '') || 'song';
}

/**
 * Parse song source and emit parse:success / parse:error so all subscribers
 * (ChannelControls, StatusBar, etc.) immediately reflect the new song.
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

// ─── Phase 3: Toolbar ─────────────────────────────────────────────────────────
const toolbar = new Toolbar({
  container: toolbarContainer,
  eventBus,
  onLoad: (filename, content) => {
    loadedFilename = fileBaseStem(filename);
    editor.setValue?.(content);
    opLog(outputPanel, `📂 Opened ${filename}`);
    eventBus.emit('song:loaded', { filename });
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
      emitParse(result.content);
      toolbar.setExportEnabled(true);
      setTimeout(() => playbackManager.play(getSource()), 300);
    }
  } catch (err: any) {
    log.warn('URL auto-load failed:', err.message);
  }
})();

// ─── Initial validation ───────────────────────────────────────────────────────
(async () => {
  try {
    parse(getSource());
    toolbar.setExportEnabled(true);
  } catch {
    toolbar.setExportEnabled(false);
  }
})();

log.debug('BeatBax Phase 3 initialised ✓');
