/**
 * BeatBax Web UI — main entry point
 * Bootstraps the full IDE: Monaco editor, diagnostics, layout, playback, exports,
 * MenuBar, ThemeManager, EditorState, keyboard shortcuts, and advanced IDE chrome.
 */

// Polyfill Buffer for engine compatibility in browser (must be first)
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import './styles.css';

// ─── Chip plugin registration ─────────────────────────────────────────────────
// Register all plugins that are enabled in localStorage (defaults: nes).
// This runs before any parse/playback calls so the chipRegistry is fully
// populated when the parser validates `chip` directives.
import { loadPluginsFromStorage } from './plugins/registry-config';
import { loadExporterPluginsFromStorage } from './plugins/exporter-registry-config';
import { setNesWebAudioMixMode, type NesWebAudioMixMode } from '@beatbax/plugin-chip-nes';
import { storage, StorageKey } from './utils/local-storage';

const storedNesMixMode = storage.get(StorageKey.NES_WEB_AUDIO_MIX_MODE);
setNesWebAudioMixMode(storedNesMixMode === 'hardware' ? 'hardware' : ('normalized' as NesWebAudioMixMode));

loadPluginsFromStorage();
loadExporterPluginsFromStorage();
// ─────────────────────────────────────────────────────────────────────────────

import { parse, parseWithPeggy } from '@beatbax/engine/parser';
import { resolveSong, resolveSongAsync } from '@beatbax/engine/song';
import {
  createLogger,
  loadLoggingFromStorage,
  loadLoggingFromURL,
  getLoggingConfig,
} from '@beatbax/engine/util/logger';

// Core / editor imports
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco, registerNoteEditCommands, setupBeatDecorations } from './editor';
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
import { getInitialContent, getStarterSong } from './app/bootstrap';
import { buildAppLayout } from './app/layout';
import { buildBottomTabs, buildRightTabs } from './app/tabs';
import { buildShortcutsModal } from './app/modals';
import { buildSettingsModal } from './panels/settings-panel';

// Playback imports
import { PlaybackManager } from './playback/playback-manager';
import { TransportControls } from './playback/transport-controls';
import { toggleChannelMuted, toggleChannelSoloed, ensureChannels } from './stores/channel.store';
import {
  parseStatus,
  parsedBpm,
  parsedChip,
  validationErrors as validationErrorsAtom,
  validationWarnings as validationWarningsAtom,
} from './stores/editor.store';
import {
  settingShowToolbar, settingShowTransportBar,
  settingShowPatternGrid, settingShowChannelMixer,
  settingShowSongVisualizer,
  settingWordWrap, settingDefaultBpm,
  settingDebugOverlay, settingDebugOverlayPosition, settingDebugOverlayOpacity,
  settingDebugOverlayFontSize, settingDebugExposePlayer,
} from './stores/settings.store';
import { OutputPanel } from './panels/output-panel';
import type { OutputMessage } from './panels/output-panel';
import { StatusBar } from './ui/status-bar';
import { DebugOverlay } from './ui/debug-overlay';

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
import { PatternGrid } from './ui/pattern-grid';
import { HelpPanel } from './panels/help-panel';
import { SongVisualizer } from './panels/song-visualizer';
import { ChannelMixer } from './panels/channel-mixer';
import { ChatPanel } from './panels/chat-panel';
import { downloadText, sanitizeFilename } from './export/download-helper';
import { openFilePicker } from './import/file-loader';
import { KeyboardShortcuts } from './utils/keyboard-shortcuts';
import {
  withErrorBoundary,
  showFatalError,
  installGlobalErrorHandlers,
} from './utils/error-boundary';
import { LoadingSpinner } from './utils/loading-spinner';
import { FeatureFlag, isFeatureEnabled, setFeatureEnabled } from './utils/feature-flags';
import { BeatBaxStorage } from './utils/local-storage';

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

// ─── Panel visibility persistence ─────────────────────────────────────────────
// readPanelVis reads through BeatBaxStorage so the key namespace matches what
// ChannelMixer and other components write (beatbax: prefix, no double 'panel.panel.' issue).
function readPanelVis(key: string, defaultVal = true): boolean {
  try {
    const v = storage.get(key);
    return v === undefined ? defaultVal : v === 'true';
  } catch { return defaultVal; }
}
function writePanelVis(key: string, visible: boolean): void {
  try { storage.set(key, String(visible)); } catch { /* ignore */ }
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
const { menuBarContainer, toolbarContainer, layoutHost, patternGridContainer, mixerHostContainer, inlineMixerContainer, editorPane, outputPane, rightPane } = appLayout;

editor = createEditor({
  container: editorPane,
  value: getInitialContent(settingDefaultBpm.get()),
  theme: 'beatbax-dark',
  language: 'beatbax',
  autoSaveDelay: storage.getJSON<boolean>(StorageKey.AUTO_SAVE, true) !== false ? 500 : 0,
  emitChangedEvents: true,
});

// Force Monaco to use custom folding provider for BeatBax
editor.editor.updateOptions({ foldingStrategy: 'auto' });

// Expose the editor wrapper immediately so Settings panel can live-apply options.
(window as any).__beatbax_editor = editor;

// Apply any persisted editor options (word wrap, font size).
const _storedWordWrap = storage.get(StorageKey.WORD_WRAP, 'false');
const _storedFontSize = parseInt(storage.get(StorageKey.FONT_SIZE, '14') ?? '14', 10);
editor.editor.updateOptions({
  wordWrap: _storedWordWrap === 'true' ? 'on' : 'off',
  fontSize: isNaN(_storedFontSize) ? 14 : _storedFontSize,
});

diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);

// CodeLens previews: always register the provider (language-level, global),
// then enable/disable via updateOptions based on stored preference.
const _storedCodeLens = storage.get(StorageKey.CODELENS, 'true') !== 'false';
setupCodeLensPreview(editor.editor, eventBus, () => (editor?.getValue?.() as string) || '');
editor.editor.updateOptions({ codeLens: _storedCodeLens });

// Beat decorations: highlights downbeats/upbeats in the editor.
// Returns a cleanup function so we can teardown when the setting is toggled off.
const _storedBeatDecorations = storage.get(StorageKey.BEAT_DECORATIONS, 'true') !== 'false';
let _beatDecorationsCleanup: (() => void) | null = null;
if (_storedBeatDecorations) {
  _beatDecorationsCleanup = setupBeatDecorations(editor.editor, eventBus);
}
// Expose a live-toggle function for the Settings panel
(window as any).__beatbax_toggleBeatDecorations = (enabled: boolean) => {
  if (enabled && !_beatDecorationsCleanup) {
    _beatDecorationsCleanup = setupBeatDecorations(editor.editor, eventBus);
  } else if (!enabled && _beatDecorationsCleanup) {
    _beatDecorationsCleanup();
    _beatDecorationsCleanup = null;
  }
};

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

// ─── Debug overlay ────────────────────────────────────────────────────────────
const debugOverlay = new DebugOverlay(
  playbackManager,
  settingDebugOverlayPosition.get(),
  settingDebugOverlayOpacity.get(),
  settingDebugOverlayFontSize.get(),
);
debugOverlay.toggle(settingDebugOverlay.get());
settingDebugOverlay.subscribe((enabled) => debugOverlay.toggle(enabled));
settingDebugOverlayPosition.subscribe((pos) => debugOverlay.setPosition(pos));
settingDebugOverlayOpacity.subscribe((pct) => debugOverlay.setOpacity(pct));
settingDebugOverlayFontSize.subscribe((px) => debugOverlay.setFontSize(px));

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



// ─── Unified Channel Panel (SongVisualizer) in the channels tab ─────────────
// The SongVisualizer lives in a dedicated scoped div so its render() (which
// clears innerHTML on every parse:success) never conflicts with sibling nodes.
const ccContainer = document.createElement('div');
ccContainer.id = 'bb-channel-controls-host';
ccContainer.style.cssText = 'flex: 1 1 0; overflow-y: auto;';
rightTabs.tabContents['channels']!.appendChild(ccContainer);

const songVisualizer = withErrorBoundary(
  'SongVisualizer',
  () => new SongVisualizer({ container: ccContainer, eventBus, playbackManager }),
  ccContainer,
);

// ─── ChannelMixer — horizontal strip at the bottom ──────────────────────────
// The mixer is gated by the CHANNEL_MIXER feature flag; it can be shown/hidden via
// the View → Channel Mixer menu item or Settings → General → Show channel mixer.
const channelMixer = withErrorBoundary(
  'ChannelMixer',
  () => new ChannelMixer({
    container: mixerHostContainer,
    inlineContainer: inlineMixerContainer,
    eventBus,
    playbackManager,
  }),
  mixerHostContainer,
);

// ─── HelpPanel — embedded in the help tab ──────────────────────────────────
const helpContainer = document.createElement('div');
helpContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
rightTabs.tabContents['help']!.appendChild(helpContainer);

// ─── Keyboard Shortcuts modal ───────────────────────────────────────────────
const shortcutsModal = buildShortcutsModal();

// ─── Settings modal ─────────────────────────────────────────────────────────
const settingsModal = buildSettingsModal();

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
// Show the Song Visualizer tab only when its feature flag is enabled.
const songVisualizerEnabled = isFeatureEnabled(FeatureFlag.SONG_VISUALIZER);
if (!songVisualizerEnabled) {
  rightTabs.close('channels');
}
(window as any).__beatbax_toggleSongVisualizer = (enabled: boolean) => {
  enabled ? rightTabs.show('channels') : rightTabs.close('channels');
};

// Subscribe to feature-flag:changed so the UI reacts immediately when a flag
// is toggled from the Settings panel (no page reload needed for most flags).
eventBus.on('feature-flag:changed', ({ flag, enabled }) => {
  if (flag === FeatureFlag.AI_ASSISTANT) {
    if (enabled) {
      aiTabBtn?.classList.remove('bb-right-tab--hidden');
      rightTabs.tabOpen['ai'] = true;
      getChatPanel().show();
      rightTabs.show('ai');
    } else {
      getChatPanel().hide();
      rightTabs.close('ai');
      aiTabBtn?.classList.add('bb-right-tab--hidden');
      rightTabs.tabOpen['ai'] = false;
    }
    // Refresh Settings model sidebar so the AI section appears/disappears.
    settingsModal.refresh();
  }
  if (flag === FeatureFlag.CHANNEL_MIXER) {
    // When the Channel Mixer feature is toggled, show/hide the horizontal mixer
    // and update the legacy right-pane mixer accordingly.
    // Route show/hide through panel:toggled so the MenuBar panelVisible map and
    // settingShowChannelMixer atom are updated by the single canonical handler.
    try {
      eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: enabled });
      if (enabled) {
        // Hide legacy right-pane mixer when the new one is enabled
        rightTabs.close('channels');
      } else {
        // Show legacy right-pane mixer when the new one is disabled
        rightTabs.show('channels');
      }
    } catch (_e) { /* ignore */ }
  }
  if (flag === FeatureFlag.PATTERN_GRID) {
    (window as any).__beatbax_togglePatternGrid?.(enabled);
  }
  if (flag === FeatureFlag.PER_CHANNEL_ANALYSER) {
    playbackManager.setPerChannelAnalyser(enabled);
  }
  if (flag === FeatureFlag.HOT_RELOAD) {
    _applyLiveMode(enabled);
  }
  if (flag === FeatureFlag.SONG_VISUALIZER) {
    (window as any).__beatbax_toggleSongVisualizer?.(enabled);
  }
});

// Toggle panel visibility via panel:toggled
eventBus.on('panel:toggled', ({ panel, visible }) => {
  if (panel === 'output') {
    visible ? bottomTabs.show('output') : bottomTabs.close('output');
  }
  if (panel === 'problems') {
    visible ? bottomTabs.show('problems') : bottomTabs.close('problems');
  }
  if (panel === 'song-visualizer') {
    // Song Visualizer in the right pane.
    // Only honour show requests when the Song Visualizer feature is enabled.
    if (visible && !isFeatureEnabled(FeatureFlag.SONG_VISUALIZER)) return;
    visible ? rightTabs.show('channels') : rightTabs.close('channels');
    settingShowSongVisualizer.set(visible);
  }
  if (panel === 'channel-mixer') {
    // Only honour show/hide requests when the Channel Mixer feature is enabled.
    if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
    try {
      channelMixer?.[visible ? 'show' : 'hide']?.();
      settingShowChannelMixer.set(visible);
    } catch (_e) { /* ignore */ }
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
      settingShowToolbar.set(visible);
    } catch (_e) { /* ignore */ }
  }
  if (panel === 'transport-bar') {
    try {
      transportBar?.[visible ? 'show' : 'hide']?.();
      settingShowTransportBar.set(visible);
    } catch (_e) { /* ignore */ }
  }
  if (panel === 'pattern-grid') {
    patternGridContainer.style.display = visible ? '' : 'none';
    settingShowPatternGrid.set(visible);
  }
});

(window as any).__beatbax_playbackManager = playbackManager;
(window as any).__beatbax_setPerChannelAnalyser = (enabled: boolean) => {
  playbackManager.setPerChannelAnalyser(enabled);
};

// ─── Expose player to window (controlled by Settings → Advanced) ──────────────
function applyExposePlayer(enabled: boolean): void {
  if (enabled) {
    (window as any).__beatbax_player = playbackManager.getPlayer();
  } else {
    delete (window as any).__beatbax_player;
  }
}
applyExposePlayer(settingDebugExposePlayer.get());
settingDebugExposePlayer.subscribe((enabled) => applyExposePlayer(enabled));
// Keep the player reference fresh after each play() call
eventBus.on('playback:started', () => {
  if (settingDebugExposePlayer.get()) {
    (window as any).__beatbax_player = playbackManager.getPlayer();
  }
});

(window as any).__beatbax_problemsPanel = problemsPanel;
(window as any).__beatbax_outputPanel = outputPanel;
(window as any).__beatbax_statusBar = statusBar;
(window as any).__beatbax_songVisualizer = songVisualizer;
(window as any).__beatbax_channelMixer = channelMixer; // channel mixer strip
(window as any).__beatbax_helpPanel = helpPanel;
(window as any).__beatbax_settingsModal = settingsModal;
(window as any).__beatbax_togglePatternGrid = (visible: boolean) => {
  patternGridContainer.style.display = visible ? '' : 'none';
  settingShowPatternGrid.set(visible);
};
// Called by Features settings when the Channel Mixer feature flag is toggled.
// Routes through panel:toggled so the MenuBar panelVisible map, the
// settingShowChannelMixer atom, and any other panel:toggled listeners all
// stay in sync — same as the View menu and keyboard shortcut paths.
(window as any).__beatbax_toggleChannelMixer = (enabled: boolean) => {
  try {
    eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: enabled });
    // Legacy tab is a feature-flag side-effect, not a visibility concern,
    // so it stays here rather than inside the panel:toggled handler.
    if (enabled) {
      rightTabs.close('channels');
    } else {
      rightTabs.show('channels');
    }
  } catch (_e) { /* ignore */ }
};

// Transport bar UI will be created by TransportBar

// ─── TransportBar + TransportControls ────────────────────────────────────────
const transportBar = new TransportBar({ container: layoutHost });
if (!readPanelVis(StorageKey.PANEL_VIS_TRANSPORT_BAR)) transportBar.hide();

// ─── Pattern Grid (sequence overview, sits below TransportBar) ─────────────────
const patternGrid = new PatternGrid();
patternGridContainer.appendChild(patternGrid.el);

// ── Runtime state for transport extras ───────────────────────────────────────
let _currentBpm = 120;          // last BPM from AST (or nudged override) — drives the transport display
let _lastAstBpm = 120;          // last BPM seen from the AST — used to detect direct source edits
let _currentSig = 4;            // stepsPerBar from AST
let _masterVolPct = storage.getJSON<number>(StorageKey.MASTER_VOLUME, 100) ?? 100;        // master volume 0-100 %
let _loopMode = storage.getJSON<boolean>(StorageKey.PLAYBACK_LOOP, false) ?? false;
let _lastBeat = -1;             // last beat value, used to detect beat changes for LED
// When true the user has manually toggled loop since the last song load,
// so AST-driven auto-sync is suppressed until the next song:loaded event.
let _loopUserOverride = false;
// When true the user has nudged BPM since the last song load,
// so AST-driven BPM sync is suppressed until the next song:loaded event.
let _bpmUserOverride = false;

// Update transport display from parser / playback events
eventBus.on('parse:success', ({ ast, sourceBpm: evtSourceBpm }) => {
  try {
    // Use sourceBpm from the event when available (emitted by PlaybackManager
    // *before* any BPM override is applied). Fall back to ast.bpm for events
    // emitted by emitParse(), which always reflects the raw source value.
    const bpm = Number(evtSourceBpm ?? (ast as any)?.bpm ?? 120);
    if (!_bpmUserOverride) {
      // No nudge active — always sync display and tracking to the AST BPM.
      _currentBpm = bpm;
      _lastAstBpm = bpm;
      transportBar.setBpm(bpm);
    } else if (bpm !== _lastAstBpm) {
      // The user has edited the bpm directive directly in the editor.
      // Their source edit wins — clear the nudge override and sync to the new value.
      _bpmUserOverride = false;
      playbackManager.setBpmOverride(null);
      _clearBpmOverrideDecoration();
      _currentBpm = bpm;
      _lastAstBpm = bpm;
      transportBar.setBpm(bpm);
    } else {
      // Override still active, AST BPM unchanged.
      // Keep _lastAstBpm current so future change-detection stays accurate,
      // then re-anchor the decoration in case the bpm line moved.
      _lastAstBpm = bpm;
      _applyBpmOverrideDecoration(_currentBpm);
    }

    // `stepsPerBar` / `time` — keep _currentSig for BAR:BT calculation
    let sig = Number((ast as any)?.stepsPerBar ?? (ast as any)?.time ?? 0);
    if (!sig) {
      const src = getSource();
      const m = src.match(/^\s*(?:stepsPerBar|time)\s+(\d+)/m);
      sig = m ? Number(m[1]) : 4;
    }
    _currentSig = sig;

    // Sync loop button with the `play` directive: enable loop when
    // `play … repeat` is present, disable it when absent.
    // Skipped if the user has manually overridden loop since the last file load.
    // When the AST has no repeat directive, fall back to the "Loop by default"
    // setting rather than unconditionally disabling loop.
    if (!_loopUserOverride) {
      const songHasRepeat = (ast as any)?.play?.repeat === true;
      const loopDefault = storage.getJSON<boolean>(StorageKey.PLAYBACK_LOOP, false) ?? false;
      const desired = songHasRepeat || loopDefault;
      if (desired !== _loopMode) {
        _applyLoopMode(desired);
      }
    }
  } catch (_e) {}
});

// Update pattern grid on each successful parse
eventBus.on('parse:success', ({ ast, song }: any) => {
  try {
    // Ensure the channel store has entries for every channel in this song
    // so mute/solo work for all channels (e.g. NES channel 5 DMC).
    if (ast?.channels?.length) {
      ensureChannels((ast.channels as any[]).map((c: any) => c.id as number));
    }
    if (song) patternGrid.setSong(song, ast);
  } catch (_e) {}
});

// Navigate Monaco editor when user clicks a pattern block in the grid
patternGrid.onNavigate = (patName: string) => {
  try {
    const source = getSource();
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*pat\s+(\S+)/);
      if (m && m[1] === patName) {
        eventBus.emit('navigate:to', { line: i + 1, column: 1 });
        break;
      }
    }
  } catch (_e) {}
};

eventBus.on('playback:position', ({ current, total }) => {
  try {
    const mins = Math.floor(current / 60);
    const secs = Math.floor(current % 60);
    transportBar.setTimeLabel(`${mins}:${secs.toString().padStart(2, '0')}`);

    // Derive BAR:BEAT from elapsed seconds, BPM, and stepsPerBar
    if (_currentBpm > 0 && _currentSig > 0) {
      const secondsPerStep = 60 / _currentBpm;
      const totalSteps     = Math.floor(current / secondsPerStep);
      const bar  = Math.floor(totalSteps / _currentSig) + 1;
      const beat = (totalSteps % _currentSig) + 1;
      transportBar.setBarBeat(bar, beat);
      // Flash the beat LED each time the beat number advances
      if (beat !== _lastBeat) {
        _lastBeat = beat;
        transportBar.flashBeatLed();
      }
    }

    // Global Pattern Grid playhead follows elapsed wall-clock time.
    const playheadProgress = total > 0 ? (current / total) : 0;
    patternGrid.setGlobalProgress(playheadProgress);
  } catch (_e) {}
});

// Update STEP display from per-channel position events (use channel 1)
eventBus.on('playback:position-changed', ({ channelId, position }) => {
  if (channelId === 1) {
    try {
      const step  = (position.eventIndex  ?? 0) + 1;
      const total = (position.totalEvents ?? 0) || 1;
      transportBar.setStep(step, total);
    } catch (_e) {}
  }
  // Advance pattern grid cursor for every channel
  try { patternGrid.setPosition(channelId, position.progress ?? 0); } catch (_e) {}
});

// Reset position LCDs when playback stops
eventBus.on('playback:stopped', () => {
  try { transportBar.resetPosition(); } catch (_e) {}
  try { patternGrid.clearPositions(); } catch (_e) {}
  _lastBeat = -1;
});

eventBus.on('playback:paused', () => {
  try { patternGrid.pausePositions(); } catch (_e) {}
});

eventBus.on('playback:started',  () => { try { patternGrid.resumePositions(); } catch (_e) {} });
eventBus.on('playback:resumed',  () => { try { patternGrid.resumePositions(); } catch (_e) {} });

// When a new file is loaded, clear the manual loop override so the next
// parse:success can re-sync the loop button from the incoming song's play directive.
// Also clear the BPM override so the song's own BPM takes effect again.
eventBus.on('song:loaded', () => {
  _loopUserOverride = false;
  _bpmUserOverride = false;
  _lastAstBpm = 120;
  playbackManager.setBpmOverride(null);
  _clearBpmOverrideDecoration();
});

const getSource = () => (editor?.getValue?.() as string) || '';

const transportControls = new TransportControls(
  {
    playButton: transportBar.playButton,
    pauseButton: transportBar.pauseButton,
    stopButton: transportBar.stopButton,
    applyButton: transportBar.applyButton,
    enableKeyboardShortcuts: false, // central ks registry owns all menu shortcuts
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
let liveMode = storage.getJSON<boolean>(StorageKey.FEATURE_HOT_RELOAD, false) ?? false;

function _applyLiveMode(enabled: boolean): void {
  liveMode = enabled;
  storage.setJSON(StorageKey.FEATURE_HOT_RELOAD, liveMode);
  transportBar.liveButton.classList.toggle('bb-live-btn--active', liveMode);
  transportBar.liveButton.title = liveMode ? 'Live play ON — click to disable' : 'Toggle live-play mode';
  if (!liveMode) clearTimeout((window as any).__bb_liveTimer);
}

(window as any).__beatbax_setLiveMode = (enabled: boolean) => {
  if (hasParseErrors && enabled) return;
  _applyLiveMode(enabled);
  opLog(outputPanel, enabled ? '⚡ Live play enabled (settings)' : '⚡ Live play disabled (settings)');
};

transportBar.liveButton.addEventListener('click', () => {
  if (hasParseErrors) return; // button is disabled but guard anyway
  _applyLiveMode(!liveMode);
  opLog(outputPanel, liveMode ? '⚡ Live play enabled' : '⚡ Live play disabled');
});

// ─── Rewind button ───────────────────────────────────────────────────────────
transportBar.rewindButton.addEventListener('click', () => {
  const wasPlaying = playbackManager.isPlaying();
  playbackManager.stop();
  if (wasPlaying) {
    setTimeout(() => playbackManager.play(getSource()), 80);
  }
});

// ─── Loop button ─────────────────────────────────────────────────────────────

/** Shared helper — sets loop state, syncs the button UI, and notifies playback manager. */
function _applyLoopMode(enabled: boolean): void {
  _loopMode = enabled;
  transportBar.loopButton.classList.toggle('bb-loop-btn--active', _loopMode);
  transportBar.loopButton.title = _loopMode ? 'Loop ON — click to disable' : 'Toggle loop playback';
  transportBar.setLoopActive(_loopMode);
  playbackManager.setLoop(_loopMode);
}

transportBar.loopButton.addEventListener('click', () => {
  _loopUserOverride = true;   // user is explicitly choosing; suppress AST sync
  _applyLoopMode(!_loopMode);
  opLog(outputPanel, _loopMode ? '⟳ Loop enabled' : '⟳ Loop disabled');
});

// Expose for Settings panel "Loop by default" toggle
(window as any).__beatbax_setLoop = (enabled: boolean) => {
  _loopUserOverride = true;   // settings change counts as a manual override
  _applyLoopMode(enabled);
  opLog(outputPanel, enabled ? '⟳ Loop enabled (settings)' : '⟳ Loop disabled (settings)');
};

// Apply stored default on startup (after loopButton exists in the DOM)
if (_loopMode) _applyLoopMode(true);

// Apply stored live mode on startup
if (liveMode) _applyLiveMode(true);

// ─── Hold-to-repeat helper (shared by BPM and VOL steppers) ──────────────────
function _attachHoldRepeat(
  btn: HTMLButtonElement,
  delta: number,
  stepFn: (delta: number) => void,
) {
  let repeatTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (repeatTimer)  { clearTimeout(repeatTimer);  repeatTimer  = null; }
    if (intervalTimer){ clearInterval(intervalTimer); intervalTimer = null; }
  };

  btn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    stepFn(delta);
    repeatTimer = setTimeout(() => {
      intervalTimer = setInterval(() => stepFn(delta), 80);
    }, 400);
  });
  btn.addEventListener('mouseup',    stop);
  btn.addEventListener('mouseleave', stop);
}

// ─── BPM nudge buttons (click + hold-to-repeat) ──────────────────────────────

/** Inject once-only CSS for the BPM override inline annotation. */
function _injectBpmOverrideStyles() {
  if (document.getElementById('bb-bpm-override-styles')) return;
  const style = document.createElement('style');
  style.id = 'bb-bpm-override-styles';
  style.textContent = `
    .bb-bpm-override-after {
      font-style: italic;
      opacity: 0.6;
      color: #f0a050;
      pointer-events: none;
    }
    [data-theme="light"] .bb-bpm-override-after {
      color: #c07020;
    }
  `;
  document.head.appendChild(style);
}
_injectBpmOverrideStyles();

/** Lazily-created decorations collection for the BPM override annotation. */
let _bpmOverrideCollection: ReturnType<typeof editor.editor.createDecorationsCollection> | null = null;

/** Find the 1-based line number of the `bpm` directive in the editor source. */
function _findBpmLine(): number {
  const source = (editor?.getValue?.() as string) || '';
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*bpm\s+\d/.test(lines[i])) return i + 1;
  }
  return -1;
}

/** Apply (or refresh) a Monaco after-line decoration showing the overridden BPM. */
function _applyBpmOverrideDecoration(bpm: number): void {
  const monacoEditor = editor?.editor;
  if (!monacoEditor) return;
  const line = _findBpmLine();
  if (line < 1) { _clearBpmOverrideDecoration(); return; }

  // `after` injected text attaches at range.endColumn on range.endLineNumber.
  // getLineMaxColumn returns (lineLength + 1) — the column just past the last
  // character — which is exactly where we want the annotation to appear.
  const model = monacoEditor.getModel();
  const endCol = model ? model.getLineMaxColumn(line) : 1;

  const decoration = {
    range: {
      startLineNumber: line,
      startColumn: endCol,
      endLineNumber: line,
      endColumn: endCol,
    },
    options: {
      showIfCollapsed: true,    // required: allows after-text on a zero-width (collapsed) range
      after: {
        content: `  ← runtime: ${bpm} BPM`,
        inlineClassName: 'bb-bpm-override-after',
      },
    },
  };

  // Always clear and recreate the collection to avoid stale-ID issues after
  // a previous clear() call left the collection in an empty-but-non-null state.
  if (_bpmOverrideCollection) {
    _bpmOverrideCollection.clear();
    _bpmOverrideCollection = null;
  }
  _bpmOverrideCollection = monacoEditor.createDecorationsCollection([decoration]);
}

/** Remove the BPM override decoration from the editor. */
function _clearBpmOverrideDecoration(): void {
  if (_bpmOverrideCollection) {
    _bpmOverrideCollection.clear();
  }
}

function _applyBpmStep(delta: number) {
  _bpmUserOverride = true;   // suppress AST re-sync until next song:loaded
  _currentBpm = Math.min(300, Math.max(20, _currentBpm + delta));
  transportBar.setBpm(_currentBpm);
  // Propagate the override to PlaybackManager so the next play() uses this tempo.
  playbackManager.setBpmOverride(_currentBpm);
  // Annotate the bpm line in the editor with a non-mutating inline hint.
  _applyBpmOverrideDecoration(_currentBpm);
}

_attachHoldRepeat(transportBar.bpmDownButton, -1, _applyBpmStep);
_attachHoldRepeat(transportBar.bpmUpButton,   +1, _applyBpmStep);

// ─── VOL rotary knob ──────────────────────────────────────────────────────────
transportBar.setVol(_masterVolPct);
playbackManager.setMasterVolume(_masterVolPct / 100);
transportBar.volKnob.onChange((v) => {
  _masterVolPct = v;
  transportBar.setVol(v);
  playbackManager.setMasterVolume(v / 100);
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
// Persisted to localStorage so it survives page reloads.
let loadedFilename = storage.get(StorageKey.LOADED_FILENAME) ?? 'song';
function setLoadedFilename(name: string): void {
  loadedFilename = name;
  storage.set(StorageKey.LOADED_FILENAME, name);
}

/**
 * Prefer metadata.name for file naming when present, normalized as lowercase
 * snake_case, with the loaded filename as fallback.
 */
function preferredSongFilenameStem(source: string): string {
  try {
    const ast = parse(source) as any;
    const metadataName = String(ast?.metadata?.name ?? '').trim();
    if (metadataName) return sanitizeFilename(metadataName.toLowerCase());
  } catch {
    // Keep save/export filename fallback behavior even when source has parse errors.
  }
  return loadedFilename;
}

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
    const parseResult = parseWithPeggy(content);
    const ast = parseResult.ast;

    // Split parser diagnostics into errors and warnings
    const errors: Array<{ component: string; message: string; loc?: any }> = [];
    const warnings: Array<{ component: string; message: string; loc?: any }> = [];
    for (const e of parseResult.errors) {
      errors.push({ component: 'parser', message: e.message, loc: e.loc });
    }
    for (const d of ((ast as any).diagnostics ?? [])) {
      const entry = { component: d.component ?? 'parser', message: d.message, loc: d.loc };
      if (d.level === 'error') errors.push(entry); else warnings.push(entry);
    }

    const publishValidation = () => {
      eventBus.emit('validation:errors', { errors });
      validationErrorsAtom.set(errors);
      eventBus.emit('validation:warnings', { warnings });
      validationWarningsAtom.set(warnings);
      const allDiags = [
        ...errors.map(e => ({ ...e, level: 'error' as const })),
        ...warnings.map(w => ({ ...w, level: 'warning' as const })),
      ];
      if (allDiags.length > 0) {
        diagnosticsManager?.setDiagnostics?.(warningsToDiagnostics(allDiags));
      } else {
        diagnosticsManager?.clear?.();
      }
    };

    // If grammar recovery produced syntax errors, skip resolver but still surface
    // all diagnostics in one pass so users can fix multiple issues at once.
    if (parseResult.hasErrors) {
      publishValidation();
      parseStatus.set('error');
      return;
    }

    // Run the resolver to surface arrange/expand warnings.
    // Use the async path when imports are present so remote/local imports
    // (github:, https://) don't throw in browser sync mode and don't
    // incorrectly mark a valid song as a parse error.
    let song: any = null;
    try {
      const resolveOpts = { onWarn: (w: any) => warnings.push(w) };
      if ((ast as any).imports?.length > 0) {
        song = await resolveSongAsync(ast as any, resolveOpts);
      } else {
        song = resolveSong(ast as any, resolveOpts);
      }
    } catch (resolveErr: any) {
      eventBus.emit('parse:error', { error: resolveErr, message: resolveErr.message ?? String(resolveErr) });
      parseStatus.set('error');
      return;
    }

    publishValidation();

    eventBus.emit('parse:success', { ast, song, sourceBpm: (ast as any).bpm ?? 120 });
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

  // Pre-validate: parse the source before handing off to the export pipeline.
  // If the song is invalid we show errors in the Problems panel and bail early
  // rather than surfacing a cryptic export-pipeline failure.
  try {
    parse(source);
  } catch (parseErr: any) {
    const msg = parseErr?.message ?? String(parseErr);
    opError(problemsPanel, `Cannot export — fix song errors first: ${msg}`, 'export');
    bottomTabs.show('problems');
    if (diagnosticsManager && parseErr.loc) {
      diagnosticsManager.setMarkers([parseErrorToDiagnostic(parseErr)]);
    }
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
  onShowSettings: () => settingsModal.open(),
  onExport: (format) => handleExport(format),
  onNew: () => {
    if (confirm('Clear the editor and start a new song?')) {
      playbackManager.stop();
      const newSong = getStarterSong(settingDefaultBpm.get());
      editor.setValue?.(newSong);
      storage.set(StorageKey.EDITOR_CONTENT, newSong);
      setLoadedFilename('song');
      menuBar.setSongName('untitled');
      opLog(outputPanel, '📄 New song');
      emitParse(newSong);
    }
  },
  onOpen: () => {
    openFilePicker({
      accept: '.bax',
      onLoad: (result) => {
        playbackManager.stop();
        setLoadedFilename(fileBaseStem(result.filename));
        menuBar.setSongName(loadedFilename);
        editor.setValue?.(result.content);
        storage.set(StorageKey.EDITOR_CONTENT, result.content);
        opLog(outputPanel, `📂 Opened ${result.filename}`);
        eventBus.emit('song:loaded', { filename: result.filename });
        menuBar.recordRecent(result.filename);
        emitParse(result.content);
      },
    });
  },
  onSave: () => {
    const content = getSource();
    if (!content.trim()) { opWarn(problemsPanel, 'Nothing to save — the editor is empty.'); return; }
    const stem = preferredSongFilenameStem(content);
    downloadText(content, `${stem}.bax`, 'text/plain');
    opLog(outputPanel, `💾 Saved ${stem}.bax`);
  },
  onSaveAs: () => {
    const suggestedStem = preferredSongFilenameStem(getSource());
    const raw = prompt('Save as:', `${suggestedStem}.bax`);
    if (!raw) return;
    const filename = raw.endsWith('.bax') ? raw : `${raw}.bax`;
    downloadText(getSource(), filename, 'text/plain');
    setLoadedFilename(fileBaseStem(filename));
    menuBar.setSongName(loadedFilename);
    opLog(outputPanel, `💾 Saved ${filename}`);
  },
  onLoadFile: (filename, content) => {
    playbackManager.stop();
    setLoadedFilename(fileBaseStem(filename));
    menuBar.setSongName(loadedFilename);
    editor.setValue?.(content);
    storage.set(StorageKey.EDITOR_CONTENT, content);
    opLog(outputPanel, `🎵 Loaded ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
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

// Keep the menu bar song name in sync with the parsed metadata.name directive.
// Falls back to the loaded filename stem when no name directive is present.
// 'song' is the internal sentinel for "no file loaded" — display as 'untitled'.
eventBus.on('parse:success', ({ ast }: any) => {
  const metaName = (ast as any)?.metadata?.name;
  menuBar.setSongName(metaName || (loadedFilename === 'song' ? 'untitled' : loadedFilename));
  toolbar?.setChip((ast as any)?.chip || 'gameboy');
  menuBar.setChip((ast as any)?.chip || 'gameboy');
  toolbar?.setExportEnabled(true);
});

eventBus.on('parse:error', () => {
  toolbar?.setExportEnabled(false);
});

// Show CodeLens preview failures in the Output tab.
eventBus.on('preview:error', ({ message }: { message: string }) => {
  opLog(outputPanel, `Preview failed: ${message}`, 'preview');
  bottomTabs.show('output');
});

// Seed MenuBar with persisted panel visibility so its toggle logic starts correct.
menuBar.seedPanelVisible({
  toolbar:             readPanelVis(StorageKey.PANEL_VIS_TOOLBAR),
  'transport-bar':     readPanelVis(StorageKey.PANEL_VIS_TRANSPORT_BAR),
  'channel-mixer':     readPanelVis(StorageKey.PANEL_VIS_CHANNEL_MIXER),
  'pattern-grid':      readPanelVis(StorageKey.PANEL_VIS_PATTERN_GRID),
  'song-visualizer':   readPanelVis(StorageKey.PANEL_VIS_SONG_VISUALIZER, false),
});
// Apply initial pattern-grid visibility
if (!readPanelVis(StorageKey.PANEL_VIS_PATTERN_GRID)) {
  patternGridContainer.style.display = 'none';
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
let commentsFolded = false;
toolbar = new Toolbar({
  container: toolbarContainer,
  eventBus,
  onLoad: (filename, content) => {
    playbackManager.stop();
    commentsFolded = false;
    toolbar?.setFoldCommentsActive(false);
    setLoadedFilename(fileBaseStem(filename));
    editor.setValue?.(content);
    storage.set(StorageKey.EDITOR_CONTENT, content);
    opLog(outputPanel, `📂 Opened ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
  },
  onExport: handleExport,
  onVerify: doVerify,
  onNew:       () => menuBar.triggerNew(),
  onSave:      () => menuBar.triggerSave(),
  onUndo:      () => editor.editor?.trigger('toolbar', 'undo', null),
  onRedo:      () => editor.editor?.trigger('toolbar', 'redo', null),
  onFormat:    () => editor.editor?.getAction('editor.action.formatDocument')?.run(),
  onSelectAll: () => editor.editor?.trigger('toolbar', 'editor.action.selectAll', null),
  onToggleTheme: () => themeManager.toggle(),
  onToggleWrap:  (wrap: boolean) => {
    settingWordWrap.set(wrap);
    editor.editor?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  },
  onToggleFoldComments: () => {
    const monacoEditor = editor.editor;
    if (!commentsFolded) {
      // Monaco has a built-in command to fold all comment ranges at once.
      monacoEditor.trigger('toolbar', 'editor.foldAllBlockComments', null);
      commentsFolded = true;
    } else {
      monacoEditor.trigger('toolbar', 'editor.unfoldAll', null);
      commentsFolded = false;
    }
    toolbar?.setFoldCommentsActive(commentsFolded);
  },
});

// Restore toolbar visibility
if (!readPanelVis(StorageKey.PANEL_VIS_TOOLBAR)) toolbar.hide();
// Sync the Wrap button active state with the persisted word-wrap setting
toolbar.setWrapActive(settingWordWrap.get());
toolbar.setFoldCommentsActive(false);
// Sync theme icon with the current theme, then keep it updated
toolbar.setThemeIcon(themeManager.currentTheme);
toolbar.setChip(parsedChip.get());
menuBar.setChip(parsedChip.get());
eventBus.on('theme:changed', ({ theme }: { theme: 'dark' | 'light' }) => {
  toolbar.setThemeIcon(theme);
  transportBar.volKnob.redraw();
});

// Apply persisted toolbar style (icons+labels or icons-only)
const storedToolbarStyle = storage.get(StorageKey.TOOLBAR_STYLE, 'icons+labels') as 'icons+labels' | 'icons';
toolbar.setStyle(storedToolbarStyle);

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
    // Clear runtime and export errors from Problems panel on successful verify
    problemsPanel.clearMessagesBySource('runtime', 'error');
    problemsPanel.clearMessagesBySource('export', 'error');
    problemsPanel.clearMessagesBySource('verify', 'error');
    opLog(outputPanel, '✔ Verification passed', 'verify');
    bottomTabs.show('output');
    toolbar.setExportEnabled(true);
    diagnosticsManager?.clearAll?.();
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
    setLoadedFilename(fileBaseStem(filename));
    editor.setValue?.(content);
    storage.set(StorageKey.EDITOR_CONTENT, content);
    opLog(outputPanel, `🗂 Dropped ${filename}`);
    eventBus.emit('song:loaded', { filename });
    menuBar.recordRecent(filename);
    emitParse(content);
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
      setLoadedFilename(fileBaseStem(filename));
      editor.setValue?.(result.content);
      storage.set(StorageKey.EDITOR_CONTENT, result.content);
      opLog(outputPanel, `🌐 Loaded from URL: ${filename}`);
      eventBus.emit('song:loaded', { filename });
      menuBar.recordRecent(filename);
      emitParse(result.content);
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
// Ctrl+, → Settings modal (standard VS Code convention; overrides Monaco's default).
monacoInst.addCommand(KeyMod.CtrlCmd | KeyCode.Comma, () => { settingsModal.open(); });
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
// Ctrl+Shift+V → Switch to Song Visualizer tab (Monaco captures this key when focused).
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => {
  rightTabs.show('channels');
});
// Ctrl+Shift+M → Toggle bottom DAW mixer strip (Monaco captures this key when focused).
// Emits through eventBus so MenuBar state stays in sync.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM, () => {
  if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
  const vis = channelMixer?.isVisible?.() ?? false;
  eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
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
ks.register({ key: 'v', ctrlKey: true, shiftKey: true, description: 'Show Song Visualizer', allowInInput: true,
  action: () => rightTabs.show('channels'),
});
ks.register({ key: 'm', ctrlKey: true, shiftKey: true, description: 'Toggle Channel Mixer', allowInInput: true,
  action: () => {
    if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
    const vis = channelMixer?.isVisible?.() ?? false;
    eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
  },
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
// Ctrl+, → open the Settings modal (standard VS Code / desktop convention).
ks.register({ key: ',', ctrlKey: true, description: 'Open Settings', allowInInput: true,
  action: () => settingsModal.open() });
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

// Refresh the embedded HelpPanel now that all shortcuts are registered.
// helpPanel was constructed before ks.register() calls so its shortcuts
// section was initially empty; refresh() re-renders the body in-place.
helpPanel?.refresh();

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
