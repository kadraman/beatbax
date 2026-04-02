/**
 * BeatBax Web UI — main entry point
 * Bootstraps the full IDE: Monaco editor, diagnostics, layout, playback, exports,
 * MenuBar, ThemeManager, EditorState, keyboard shortcuts, and advanced IDE chrome.
 */

// Polyfill Buffer for engine compatibility in browser (must be first)
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import './styles.css';

import { parse } from '@beatbax/engine/parser';
import { resolveSong, resolveSongAsync } from '@beatbax/engine/song';
import {
  createLogger,
  loadLoggingFromStorage,
  loadLoggingFromURL,
  getLoggingConfig,
} from '@beatbax/engine/util/logger';

// Core / editor imports
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco, registerNoteEditCommands } from './editor';
import {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  parseErrorToDiagnostic,
  warningsToDiagnostics,
  type Diagnostic,
} from './editor/diagnostics';
import { setupCodeLensPreview } from './editor/codelens-preview';
import { setupGlyphMargin } from './editor/glyph-margin';
import { setupCommandPalette } from './editor/command-palette';
import { getInitialContent } from './app/bootstrap';
import { buildAppLayout } from './app/layout';
import { buildBottomTabs, buildRightTabs } from './app/tabs';
import { buildShortcutsModal } from './app/modals';

// Playback imports
import { PlaybackManager } from './playback/playback-manager';
import { TransportControls } from './playback/transport-controls';
import { toggleChannelMuted, toggleChannelSoloed } from './stores/channel.store';
import {
  parseStatus,
  parsedBpm,
  parsedChip,
  validationErrors as validationErrorsAtom,
  validationWarnings as validationWarningsAtom,
} from './stores/editor.store';
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
import { HelpPanel } from './panels/help-panel';
import { ChannelMixer } from './panels/channel-mixer';
import { ChatPanel } from './panels/chat-panel';
import { downloadText } from './export/download-helper';
import { openFilePicker } from './import/file-loader';
import { KeyboardShortcuts } from './utils/keyboard-shortcuts';
import {
  withErrorBoundary,
  showFatalError,
  installGlobalErrorHandlers,
} from './utils/error-boundary';
import { LoadingSpinner } from './utils/loading-spinner';
import { FeatureFlag, isFeatureEnabled, setFeatureEnabled } from './utils/feature-flags';

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

// Expose eventBus globally for debugging
(window as any).__beatbax_eventBus = eventBus;

// ─── Fatal error guard ────────────────────────────────────────────────────────
// Wrap the entire module body so any synchronous throw during startup
// shows the full-screen fatal overlay instead of a blank/broken page.
try {

// ─── DOM setup ───────────────────────────────────────────────────────────────
const spinner = new LoadingSpinner();

configureMonaco();
registerBeatBaxLanguage();

const appContainer = document.getElementById('app') as HTMLElement;
if (!appContainer) throw new Error('#app container not found');

const appLayout = buildAppLayout(appContainer);
const { menuBarContainer, toolbarContainer, layoutHost, editorPane, outputPane, rightPane } = appLayout;

editor = createEditor({
  container: editorPane,
  value: getInitialContent(),
  theme: 'beatbax-dark',
  language: 'beatbax',
  autoSaveDelay: 500,
  emitChangedEvents: true,
});

diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);
setupCodeLensPreview(editor.editor, eventBus, () => (editor?.getValue?.() as string) || '');
registerNoteEditCommands(editor.editor);

// Navigate cursor when user clicks a Problems panel diagnostic row.
eventBus.on('navigate:to', ({ line, column }) => {
  const monacoEditor = editor.editor;
  monacoEditor.setPosition({ lineNumber: line, column });
  monacoEditor.revealLineInCenter(line);
  monacoEditor.focus();
});

// Keep status-bar cursor position in sync with Monaco.
editor.editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
  statusBar?.setCursorPosition(e.position.lineNumber, e.position.column);
});

// Editor is fully initialised — remove the static boot overlay.
spinner.hideBoot();

// ─── Bottom pane: Problems | Output tabs ─────────────────────────────────────
const bottomTabs = buildBottomTabs(outputPane, appLayout.layout);

const problemsContainer = document.createElement('div');
problemsContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
bottomTabs.tabContents['problems'].appendChild(problemsContainer);

const outputLogsContainer = document.createElement('div');
outputLogsContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
bottomTabs.tabContents['output'].appendChild(outputLogsContainer);

// ─── EditorState ─────────────────────────────────────────────────────────────
// EditorState has been removed; monaco-setup now emits editor:changed
// directly and editor.store.ts handles localStorage persistence.

// ─── Status bar ───────────────────────────────────────────────────────────────
const statusBarContainer = document.createElement('div');
statusBarContainer.id = 'status-bar';
statusBarContainer.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:1000;';
document.body.appendChild(statusBarContainer);

// ─── Core components ─────────────────────────────────────────────────────────────────
setupGlyphMargin(editor.editor, eventBus);
const playbackManager = new PlaybackManager(eventBus);
const problemsPanel = new OutputPanel(problemsContainer, eventBus, { singleTab: 'problems' });
const outputPanel = new OutputPanel(outputLogsContainer, eventBus, { singleTab: 'output' });
const statusBar = withErrorBoundary('StatusBar', () => new StatusBar({ container: statusBarContainer }), statusBarContainer);

// Install global error handlers now that panels are ready.
// Uncaught errors and unhandled rejections are forwarded as error messages.
installGlobalErrorHandlers((message, _err) => {
  problemsPanel.addMessage({
    type: 'error',
    message: `Uncaught error: ${message}`,
    source: 'runtime',
    timestamp: new Date(),
  });
  bottomTabs.show('problems');
});

// Auto-show the relevant bottom tab when events arrive.
eventBus.on('parse:error', () => bottomTabs.show('problems'));
eventBus.on('validation:errors', ({ errors }) => { if (errors.length > 0) bottomTabs.show('problems'); });
eventBus.on('validation:warnings', ({ warnings }) => { if (warnings.length > 0) bottomTabs.show('problems'); });
eventBus.on('playback:started', () => bottomTabs.show('output'));

// ─── Problems tab badge ───────────────────────────────────────────────────────
let _badgeErrors = 0, _badgeWarnings = 0;
eventBus.on('validation:errors',   ({ errors })   => { _badgeErrors   = errors.length;   bottomTabs.updateBadge(_badgeErrors, _badgeWarnings); });
eventBus.on('validation:warnings', ({ warnings }) => { _badgeWarnings = warnings.length; bottomTabs.updateBadge(_badgeErrors, _badgeWarnings); });
eventBus.on('parse:error',         ()             => { _badgeErrors   = 1;               bottomTabs.updateBadge(_badgeErrors, _badgeWarnings); });

// ─── Right pane: Mixer | Help | Copilot tabs ──────────────────────────────────
const rightTabs = buildRightTabs(rightPane, appLayout.layout);



// ─── Unified Channel Panel (ChannelMixer) in the channels tab ──────────────
// The ChannelMixer lives in a dedicated scoped div so its render() (which
// clears innerHTML on every parse:success) never conflicts with sibling nodes.
const ccContainer = document.createElement('div');
ccContainer.id = 'bb-channel-controls-host';
ccContainer.style.cssText = 'flex: 1 1 0; overflow-y: auto;';
rightTabs.tabContents['channels']!.appendChild(ccContainer);

const channelMixer = withErrorBoundary(
  'ChannelMixer',
  () => new ChannelMixer({ container: ccContainer, eventBus }),
  ccContainer,
);

// ─── HelpPanel — embedded in the help tab ──────────────────────────────────
const helpContainer = document.createElement('div');
helpContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
rightTabs.tabContents['help']!.appendChild(helpContainer);

// ─── Keyboard Shortcuts modal ───────────────────────────────────────────────
const shortcutsModal = buildShortcutsModal();

// ─── Central keyboard shortcuts registry ────────────────────────────────────
// Created before HelpPanel so we can pass getShortcuts: () => ks.list().
// Shortcuts are registered after all components are instantiated (see bottom).
const ks = new KeyboardShortcuts();

const helpPanel = withErrorBoundary('HelpPanel', () => new HelpPanel({
  container: helpContainer,
  eventBus,
  embedded: true,
  defaultVisible: true,
  getShortcuts: () => ks.list(),
  onInsertSnippet: (snippet) => {
    const monacoEditor = editor?.editor;
    if (!monacoEditor) return;
    const selection = monacoEditor.getSelection();
    const id = { major: 1, minor: 1 };
    const op = { identifier: id, range: selection, text: snippet, forceMoveMarkers: true };
    monacoEditor.executeEdits('help-panel', [op]);
    monacoEditor.focus();
  },
}), appContainer);

// ─── ChatPanel — AI Copilot tab ─────────────────────────────────────────────
// The AI tab container is always present in the DOM; the ChatPanel itself is
// only created when the feature flag is first enabled (lazy instantiation).
const aiContainer = document.createElement('div');
aiContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
rightTabs.tabContents['ai']!.appendChild(aiContainer);

// Initially hide the AI tab button — shown only when feature flag is on.
const aiTabBtn = rightTabs.tabButtons['ai'];
if (aiTabBtn) aiTabBtn.classList.add('bb-right-tab--hidden');

let chatPanel: ChatPanel | null = null;

// ─── Pending AI change state ────────────────────────────────────────────────
interface PendingAIChange {
  previousContent: string;
  decorationIds: string[];
  banner: HTMLElement;
}
let pendingAIChange: PendingAIChange | null = null;

function clearPendingAIChange(restore = false): void {
  if (!pendingAIChange) return;
  const monacoEditor = editor?.editor;
  if (monacoEditor) {
    monacoEditor.deltaDecorations(pendingAIChange.decorationIds, []);
    if (restore) {
      const model = monacoEditor.getModel();
      if (model) {
        monacoEditor.executeEdits('chat-undo', [{ range: model.getFullModelRange(), text: pendingAIChange.previousContent, forceMoveMarkers: true }]);
        monacoEditor.focus();
      }
    }
  }
  pendingAIChange.banner.remove();
  pendingAIChange = null;
}

// Module-level cache of last-seen diagnostics (populated by validation events).
let lastDiagnostics: Diagnostic[] = [];

/** Map a raw validation entry to a Diagnostic. */
function toDiagnostic(entry: any, severity: 'error' | 'warning'): Diagnostic {
  return {
    message: entry.message,
    severity,
    startLine: entry.loc?.start?.line ?? 1,
    startColumn: entry.loc?.start?.column ?? 1,
  };
}

function getChatPanel(): ChatPanel {
  if (!chatPanel) {
    chatPanel = new ChatPanel({
      container: aiContainer,
      eventBus,
      getEditorContent: () => (editor?.getValue?.() as string) || '',
      getDiagnostics: () => lastDiagnostics,
      onInsertSnippet: (text) => {
        const monacoEditor = editor?.editor;
        if (!monacoEditor) return;
        const pos = monacoEditor.getPosition();
        if (!pos) return;
        monacoEditor.executeEdits('chat-panel', [{
          identifier: { major: 1, minor: 1 },
          range: { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column },
          text,
          forceMoveMarkers: true,
        }]);
        monacoEditor.focus();
      },
      onReplaceSelection: (text) => {
        const monacoEditor = editor?.editor;
        if (!monacoEditor) return;
        const sel = monacoEditor.getSelection();
        if (!sel) return;
        monacoEditor.executeEdits('chat-panel', [{
          identifier: { major: 1, minor: 1 },
          range: sel,
          text,
          forceMoveMarkers: true,
        }]);
        monacoEditor.focus();
      },
      onReplaceEditor: (text) => {
        const monacoEditor = editor?.editor;
        if (!monacoEditor) return;
        const model = monacoEditor.getModel();
        if (!model) return;
        const fullRange = model.getFullModelRange();
        monacoEditor.executeEdits('chat-panel', [{
          identifier: { major: 1, minor: 1 },
          range: fullRange,
          text,
          forceMoveMarkers: true,
        }]);
        monacoEditor.focus();
      },
      onHighlightChanges: (addedLineNums, previousContent) => {
        const monacoEditor = editor?.editor;
        if (!monacoEditor || addedLineNums.length === 0) return;
        // Clear any existing pending change
        clearPendingAIChange(false);
        // Green decorations on every added/changed line
        const decorations = addedLineNums.map(lineNum => ({
          range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
          options: {
            isWholeLine: true,
            className: 'bb-changed-line-added',
            overviewRulerColor: '#4ec94e',
            overviewRulerLane: 4,
          },
        }));
        const ids = monacoEditor.deltaDecorations([], decorations);
        // Create Keep / Discard banner inside the editor container
        const editorDom = monacoEditor.getDomNode() as HTMLElement | null;
        if (!editorDom) return;
        const banner = document.createElement('div');
        banner.className = 'bb-ai-change-banner';
        const dot = document.createElement('span');
        dot.className = 'bb-ai-change-banner-dot';
        dot.textContent = '⬤';
        const label = document.createElement('span');
        label.textContent = `AI: ${addedLineNums.length} changed line${addedLineNums.length !== 1 ? 's' : ''}`;
        const keepBtn = document.createElement('button');
        keepBtn.className = 'bb-ai-banner-keep';
        keepBtn.textContent = '✓ Keep';
        keepBtn.addEventListener('click', () => clearPendingAIChange(false));
        const discardBtn = document.createElement('button');
        discardBtn.className = 'bb-ai-banner-discard';
        discardBtn.textContent = '✗ Discard';
        discardBtn.addEventListener('click', () => clearPendingAIChange(true));
        banner.append(dot, label, keepBtn, discardBtn);
        editorDom.appendChild(banner);
        pendingAIChange = { previousContent, decorationIds: ids, banner };
      },
    });
  }
  return chatPanel;
}

// Keep lastDiagnostics in sync with validation events.
eventBus.on('validation:errors', ({ errors }) => {
  lastDiagnostics = [
    ...lastDiagnostics.filter(d => d.severity !== 'error'),
    ...errors.map((e: any) => toDiagnostic(e, 'error')),
  ];
});
eventBus.on('validation:warnings', ({ warnings }) => {
  lastDiagnostics = [
    ...lastDiagnostics.filter(d => d.severity !== 'warning'),
    ...warnings.map((w: any) => toDiagnostic(w, 'warning')),
  ];
});

/** Toggle the AI chat panel on/off. Creates it on first use. */
function toggleAIAssistant(): void {
  const wasEnabled = isFeatureEnabled(FeatureFlag.AI_ASSISTANT);
  const nowEnabled = !wasEnabled;
  setFeatureEnabled(FeatureFlag.AI_ASSISTANT, nowEnabled);

  if (nowEnabled) {
    // Show the tab button and switch to it
    aiTabBtn?.classList.remove('bb-right-tab--hidden');
    rightTabs.tabOpen['ai'] = true;
    getChatPanel().show(); // ensure panel is created and visible
    rightTabs.show('ai');
  } else {
    getChatPanel().hide();
    rightTabs.close('ai');
    aiTabBtn?.classList.add('bb-right-tab--hidden');
    rightTabs.tabOpen['ai'] = false;
  }
}

// Initialise AI tab visibility on page load (in case flag is already set).
if (isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
  aiTabBtn?.classList.remove('bb-right-tab--hidden');
  rightTabs.tabOpen['ai'] = true;
  getChatPanel().show();
}

// Restore the last active tab now that all tabs (including AI) are initialised.
rightTabs.restorePersistedTab();

// Toggle panel visibility via panel:toggled
eventBus.on('panel:toggled', ({ panel, visible }) => {
  if (panel === 'output') {
    visible ? bottomTabs.show('output') : bottomTabs.close('output');
  }
  if (panel === 'problems') {
    visible ? bottomTabs.show('problems') : bottomTabs.close('problems');
  }
  if (panel === 'channel-mixer') {
    visible ? rightTabs.show('channels') : rightTabs.close('channels');
  }
  if (panel === 'help') {
    visible ? rightTabs.show('help') : rightTabs.close('help');
  }
  if (panel === 'shortcuts') {
    if (visible) shortcutsModal.open();
  }
  if (panel === 'ai-assistant') {
    toggleAIAssistant();
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

(window as any).__beatbax_playbackManager = playbackManager;
(window as any).__beatbax_problemsPanel = problemsPanel;
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

// Sync error state with TransportControls and Live button
let hasParseErrors = false;

function setErrorState(hasErrors: boolean): void {
  hasParseErrors = hasErrors;
  transportControls.setHasErrors(hasErrors);
  // Disable the Live button when errors exist; deactivate live mode too.
  transportBar.liveButton.disabled = hasErrors;
  if (hasErrors && liveMode) {
    liveMode = false;
    transportBar.liveButton.classList.remove('bb-live-btn--active');
    transportBar.liveButton.title = 'Toggle live-play mode';
    clearTimeout((window as any).__bb_liveTimer);
  }
}

eventBus.on('parse:error', () => setErrorState(true));
eventBus.on('validation:errors', ({ errors }) => setErrorState(errors.length > 0));

// ─── Live mode (handled by transportBar.liveButton) ──────────────────────────
let liveMode = false;
transportBar.liveButton.addEventListener('click', () => {
  if (hasParseErrors) return; // button is disabled but guard anyway
  liveMode = !liveMode;
  transportBar.liveButton.classList.toggle('bb-live-btn--active', liveMode);
  transportBar.liveButton.title = liveMode ? 'Live play ON — click to disable' : 'Toggle live-play mode';
  opLog(outputPanel, liveMode ? '⚡ Live play enabled' : '⚡ Live play disabled');
  if (!liveMode) {
    clearTimeout((window as any).__bb_liveTimer);
  }
});

// React to content changes via the EditorState-emitted event.
// (BeatBaxEditor wrapper has no onDidChangeModelContent; EditorState is the
// sole emitter of 'editor:changed'.)
eventBus.on('editor:changed', () => {
  // Always run a debounced parse so squiggles and Problems panel stay live.
  clearTimeout((window as any).__bb_parseTimer);
  (window as any).__bb_parseTimer = setTimeout(() => emitParse(getSource()), 600);

  // Additionally trigger live playback when Live mode is on and song is valid.
  if (!liveMode || hasParseErrors) return;
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
 * Runs the full parse + resolve pipeline so semantic errors (undefined
 * sequences, instruments, patterns) are detected and shown live.
 */
async function emitParse(content: string): Promise<void> {
  try {
    eventBus.emit('parse:started', undefined);
    parseStatus.set('parsing');
    const ast = parse(content);

    // Split parser diagnostics into errors and warnings
    const errors: Array<{ component: string; message: string; loc?: any }> = [];
    const warnings: Array<{ component: string; message: string; loc?: any }> = [];
    for (const d of ((ast as any).diagnostics ?? [])) {
      const entry = { component: d.component ?? 'parser', message: d.message, loc: d.loc };
      if (d.level === 'error') errors.push(entry); else warnings.push(entry);
    }

    // Run the resolver to surface arrange/expand warnings.
    // Use the async path when imports are present so remote/local imports
    // (github:, https://) don't throw in browser sync mode and don't
    // incorrectly mark a valid song as a parse error.
    try {
      const resolveOpts = { onWarn: (w: any) => warnings.push(w) };
      if ((ast as any).imports?.length > 0) {
        await resolveSongAsync(ast as any, resolveOpts);
      } else {
        resolveSong(ast as any, resolveOpts);
      }
    } catch (resolveErr: any) {
      eventBus.emit('parse:error', { error: resolveErr, message: resolveErr.message ?? String(resolveErr) });
      parseStatus.set('error');
      return;
    }

    // Emit errors (disables Play button, shows in Problems > Errors)
    eventBus.emit('validation:errors', { errors });
    validationErrorsAtom.set(errors);

    // Emit warnings (informational only)
    eventBus.emit('validation:warnings', { warnings });
    validationWarningsAtom.set(warnings);

    // Update Monaco markers for both (preserve level so errors get red squiggles)
    const allDiags = [
      ...errors.map(e => ({ ...e, level: 'error' as const })),
      ...warnings.map(w => ({ ...w, level: 'warning' as const })),
    ];
    if (allDiags.length > 0) {
      diagnosticsManager?.setDiagnostics?.(warningsToDiagnostics(allDiags));
    } else {
      diagnosticsManager?.clear?.();
    }

    eventBus.emit('parse:success', { ast });
    parseStatus.set('success');
    parsedBpm.set((ast as any).bpm || 120);
    parsedChip.set((ast as any).chip || 'gameboy');
  } catch (err: any) {
    eventBus.emit('parse:error', { error: err, message: err.message ?? String(err) });
    parseStatus.set('error');
  }
}

async function handleExport(format: ExportFormat) {
  const source = getSource();
  if (!source.trim()) {
    opWarn(problemsPanel, 'Nothing to export — write or load a song first (File → Open or drag a .bax file).', 'export');
    return;
  }
  const result = await exportManager.export(source, format, { filename: loadedFilename });
  if (result.success) {
    opLog(outputPanel, `✓ Exported ${result.filename} (${result.size ?? 0} bytes)`, 'export');
    if (result.warnings?.length) {
      result.warnings.forEach(w => opWarn(problemsPanel, w, 'export'));
      bottomTabs.show('problems');
    }
  } else {
    opError(problemsPanel, `Export failed: ${result.error?.message ?? 'unknown error'}`, 'export');
    bottomTabs.show('problems');
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
  onShowShortcuts: () => shortcutsModal.open(),
  onExport: (format) => handleExport(format),
  onNew: () => {
    if (confirm('Clear the editor and start a new song?')) {
      playbackManager.stop();
      editor.setValue?.('');
      loadedFilename = 'song';
      opLog(outputPanel, '📄 New song');
    }
  },
  onOpen: () => {
    openFilePicker({
      accept: '.bax',
      onLoad: (result) => {
        playbackManager.stop();
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
    if (!content.trim()) { opWarn(problemsPanel, 'Nothing to save — the editor is empty.'); return; }
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
    playbackManager.stop();
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
  onToggleAI: () => toggleAIAssistant(),
});

(window as any).__beatbax_menuBar = menuBar;

// ─── Toolbar ─────────────────────────────────────────────────────────────────
toolbar = new Toolbar({
  container: toolbarContainer,
  eventBus,
  onLoad: (filename, content) => {
    playbackManager.stop();
    loadedFilename = fileBaseStem(filename);
    editor.setValue?.(content);
    opLog(outputPanel, `📂 Opened ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
    toolbar.setExportEnabled(true);
  },
  onExport: handleExport,
  onVerify: doVerify,
});

(window as any).__beatbax_toolbar = toolbar;
(window as any).__beatbax_exportManager = exportManager;

// ─── Shared verify helper ─────────────────────────────────────────────
function doVerify(): void {
  const source = getSource();
  if (!source.trim()) {
    opWarn(problemsPanel, 'Nothing to verify — the editor is empty. Use File → Open or type a song.');
    return;
  }
  try {
    parse(source);
    opLog(outputPanel, '✔ Verification passed', 'verify');
    bottomTabs.show('output');
    diagnosticsManager?.clearAll?.();
    toolbar.setExportEnabled(true);
  } catch (err: any) {
    opError(problemsPanel, `✗ Verification failed: ${err.message ?? err}`, 'verify');
    bottomTabs.show('problems');
    if (diagnosticsManager && err.loc) {
      diagnosticsManager.setMarkers([parseErrorToDiagnostic(err)]);
    }
    toolbar.setExportEnabled(false);
  }
}

// ─── Drag-and-drop ───────────────────────────────────────────────────────────
const dragDrop = new DragDropHandler(document.body, {
  onDrop: (filename, content) => {
    playbackManager.stop();
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
// Shift+F1 → Switch to Help tab (F1 alone is Monaco's own Command Palette — leave that alone)
monacoInst.addCommand(KeyMod.Shift | KeyCode.F1, () => { rightTabs.show('help'); });
// Ctrl+Shift+/ is Monaco's "Toggle Block Comment" so Ctrl+? cannot be used.
// Alt+Shift+K (K for Keyboard shortcuts) is free in all browsers and Monaco.
monacoInst.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyK, () => { shortcutsModal.open(); });
// Alt+Shift+I → Show AI/Copilot tab (I for Intelligence/AI; no browser conflict).
monacoInst.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI, () => {
  if (rightTabs.tabOpen['ai']) rightTabs.show('ai'); else toggleAIAssistant();
});
// Alt+Shift+V → Verify syntax (no browser conflict).
monacoInst.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyV, () => { doVerify(); });
// Ctrl+Shift+L → Theme toggle.
// Monaco binds Ctrl+Shift+L to "Select All Occurrences" by default; registering
// here via addCommand overrides that default while Monaco has focus.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, () => { menuBar.triggerToggleTheme(); });
// Ctrl+Shift+Y → Switch to Channel Mixer tab (Monaco captures this key when focused).
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY, () => {
  rightTabs.show('channels');
});
// Ctrl+Alt+P → Monaco Command Palette.
// NOTE: on Windows ‘Ctrl+Alt’ equals AltGr on European keyboards so this may
// not fire on all systems. F1 is the primary reliable shortcut. A global
// fallback is also registered via ks (see below) which focuses Monaco first.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP, () => {
  monacoInst.trigger('', 'editor.action.quickCommand', null);
});
// Escape: close the Help overlay if it is open, and allow Monaco to handle
// its own Escape uses (close find widget, suggestions, rename dialog, etc.).
// Playback stop via Escape is NOT done from inside Monaco — use F8 instead.
monacoInst.onKeyDown((e: IKeyboardEvent) => {
  if (e.keyCode === KeyCode.Escape && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (rightTabs.activeTab === 'help') rightTabs.switch('channels');
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
ks.register({ key: 'Escape', description: 'Stop playback (when editor not focused)', allowInInput: false,
  action: () => transportBar.stopButton.click(),
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
// Note transposition — handled by Monaco addCommand inside registerNoteEditCommands.
// These entries exist solely for help-panel display; allowInInput: false ensures the
// global handler never fires while the editor (textarea) is focused.
ks.register({ key: '.', altKey: true,              description: 'Note: semitone up (editor)',  allowInInput: false, action: () => {} });
ks.register({ key: ',', altKey: true,              description: 'Note: semitone down (editor)', allowInInput: false, action: () => {} });
ks.register({ key: '.', altKey: true, shiftKey: true, description: 'Note: octave up (editor)',    allowInInput: false, action: () => {} });
ks.register({ key: ',', altKey: true, shiftKey: true, description: 'Note: octave down (editor)',  allowInInput: false, action: () => {} });

// View — marked allowInInput: true so they work while the editor is focused
// (Monaco doesn't intercept any of these key combinations).
//
// All panel toggles use Alt+Shift+<key> for consistency and to avoid
// browser-reserved shortcuts (Ctrl+Shift+R = hard refresh, Ctrl+Shift+B =
// bookmarks, Ctrl+Shift+H = history, Ctrl+Shift+Y = reading list/pocket).
// Ctrl+` is the exception (VS Code-style output/terminal toggle; no conflict).
ks.register({ key: 'l', altKey: true, shiftKey: true, description: 'Theme (Dark / Light)', allowInInput: true,
  action: () => menuBar.triggerToggleTheme() });
ks.register({ key: '`', ctrlKey: true, description: 'Show Output panel', allowInInput: true,
  action: () => bottomTabs.show('output'),
});
ks.register({ key: 'p', altKey: true, shiftKey: true, description: 'Show Problems panel', allowInInput: true,
  action: () => bottomTabs.show('problems'),
});
ks.register({ key: 'y', altKey: true, shiftKey: true, description: 'Show Channel Mixer tab', allowInInput: true,
  action: () => rightTabs.show('channels'),
});
ks.register({ key: 'b', altKey: true, shiftKey: true, description: 'Toggle Toolbar', allowInInput: true,
  action: () => {
    const vis = toolbar?.isVisible?.() ?? false;
    eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !vis });
  },
});
ks.register({ key: 'r', altKey: true, shiftKey: true, description: 'Toggle Transport Bar', allowInInput: true,
  action: () => {
    const vis = transportBar?.isVisible?.() ?? false;
    eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !vis });
  },
});

// Help — Shift+F1 is safe (F1 alone opens Monaco's own Command Palette).
ks.register({ key: 'F1', shiftKey: true, description: 'Show Help tab', allowInInput: true,
  action: () => rightTabs.show('help') });
ks.register({ key: 'h', altKey: true, shiftKey: true, description: 'Show Help tab', allowInInput: true,
  action: () => rightTabs.show('help') });
// Alt+Shift+K → open the Keyboard Shortcuts modal.
ks.register({ key: 'k', altKey: true, shiftKey: true, description: 'Show Keyboard Shortcuts', allowInInput: true,
  action: () => shortcutsModal.open() });
// Alt+Shift+I → Show AI/Copilot tab (or enable it if the feature flag is off).
ks.register({ key: 'i', altKey: true, shiftKey: true, description: 'Show AI Copilot tab', allowInInput: true,
  action: () => { if (rightTabs.tabOpen['ai']) rightTabs.show('ai'); else toggleAIAssistant(); } });
// Alt+Shift+V → Verify syntax.
ks.register({ key: 'v', altKey: true, shiftKey: true, description: 'Verify syntax', allowInInput: true,
  action: () => doVerify() });

// Ctrl+Alt+P → Command Palette (global fallback: works even when Monaco is not focused).
// Monaco's own addCommand version only fires when Monaco already has focus; this
// registration also covers the case where focus is elsewhere by focusing Monaco first.
// Note: on European AltGr keyboards Ctrl+Alt may be intercepted by the OS — use F1 instead.
ks.register({ key: 'p', ctrlKey: true, altKey: true, description: 'Open Command Palette', allowInInput: true,
  action: () => { monacoInst.focus(); setTimeout(() => monacoInst.trigger('', 'editor.action.quickCommand', null), 50); },
});

ks.mount();

// ─── Command Palette — BeatBax-specific commands in the Monaco palette ────────
setupCommandPalette({
  editor: monacoInst,
  getSource,
  onExport: handleExport,
  onVerify: doVerify,
  onToggleMute: (channelId) => toggleChannelMuted(channelId),
  onToggleSolo: (channelId) => toggleChannelSoloed(channelId),
  onStopPreview: () => monacoInst.trigger('', 'beatbax.stopPreview', null),
  onPlayRaw: (src, chunkInfo) => {
    if (chunkInfo && Object.keys(chunkInfo).length > 0) {
      eventBus.emit('preview:chunkInfo', { chunkInfo });
    }
    bottomTabs.show('output');
    playbackManager.play(src);
  },
});

// ─── Shortcuts panel — instantiated after ks.mount() so the full registered ─
// shortcut list is available when HelpPanel first renders the section.
const shortcutsPanel = withErrorBoundary('ShortcutsPanel', () => new HelpPanel({
  container: shortcutsModal.container,
  eventBus,
  embedded: true,
  singleSection: 'shortcuts',
  hideHeader: true,
  twoColumns: true,
  defaultVisible: true,
  getShortcuts: () => ks.list(),
}), appContainer);
(window as any).__beatbax_shortcutsPanel = shortcutsPanel;

log.debug('BeatBax initialised ✓');

} catch (fatalError) {
  showFatalError(fatalError);
}
