/**
 * BeatBax Web UI — main entry point
 * Bootstraps the full IDE: Monaco editor, diagnostics, layout, playback, exports,
 * MenuBar, ThemeManager, EditorState, keyboard shortcuts, and advanced IDE chrome.
 */

// Polyfill Buffer for engine compatibility in browser (must be first)
import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

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
} from './editor/diagnostics';
import { setupCodeLensPreview } from './editor/codelens-preview';
import { setupGlyphMargin } from './editor/glyph-margin';
import { setupCommandPalette } from './editor/command-palette';
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
layoutHost.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column; padding-bottom: 24px;';
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

const outputPane = layout.getOutputPane();

// ─── Bottom pane: tabbed panel (Problems | Output) ───────────────────────────
// Reset outputPane styles for use as a flex tab container.
outputPane.style.padding = '0';
outputPane.style.overflow = 'hidden';
outputPane.style.display = 'flex';
outputPane.style.flexDirection = 'column';
outputPane.style.fontFamily = '';
outputPane.style.fontSize = '';

const bottomTabStyle = document.createElement('style');
bottomTabStyle.textContent = `
  .bb-bottom-tab-bar { display: flex; flex-shrink: 0; background: var(--header-bg, #252526); border-bottom: 1px solid var(--border-color, #3c3c3c); }
  .bb-bottom-tab { display: flex; align-items: center; gap: 4px; padding: 6px 8px 6px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted, #888); cursor: pointer; transition: color 0.15s, border-color 0.15s; white-space: nowrap; }
  .bb-bottom-tab:hover { color: var(--text-color, #d4d4d4); background: var(--button-hover-bg, #2a2d2e); }
  .bb-bottom-tab--active { color: var(--text-color, #d4d4d4); border-bottom-color: #569cd6; }
  .bb-bottom-tab--hidden { display: none; }
  .bb-bottom-tab__label { flex: 1; }
  .bb-bottom-tab__close { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 3px; font-size: 11px; line-height: 1; color: var(--text-muted, #888); opacity: 0; transition: opacity 0.1s, background 0.1s; pointer-events: none; }
  .bb-bottom-tab:hover .bb-bottom-tab__close,
  .bb-bottom-tab--active .bb-bottom-tab__close { opacity: 1; pointer-events: auto; }
  .bb-bottom-tab__close:hover { background: var(--button-hover-bg, #3a3a3a); color: var(--text-color, #d4d4d4); }
  .bb-bottom-tab-content { flex: 1 1 0; overflow: hidden; display: none; flex-direction: column; }
  .bb-bottom-tab-content--active { display: flex; }
  .bb-tab-badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 16px; height: 16px; padding: 0 4px;
    background: #0e639c; color: #fff;
    border-radius: 8px; font-size: 11px; font-weight: 700; line-height: 1;
    vertical-align: middle; margin-left: 4px; position: relative; top: -1px;
  }
`;
document.head.appendChild(bottomTabStyle);

type BottomTabId = 'problems' | 'output';
const BOTTOM_TAB_LABELS: Record<BottomTabId, string> = { problems: 'Problems', output: 'Output' };
const BOTTOM_TAB_ORDER: BottomTabId[] = ['problems', 'output'];
let activeBottomTab: BottomTabId | null = 'problems';
const bottomTabOpen: Record<BottomTabId, boolean> = { problems: true, output: true };
const bottomTabButtons: Partial<Record<BottomTabId, HTMLButtonElement>> = {};
const bottomTabContents: Partial<Record<BottomTabId, HTMLElement>> = {};

/** Show a bottom tab (open + activate). If already open, just activate it. */
const showBottomTab = (tab: BottomTabId): void => {
  bottomTabOpen[tab] = true;
  bottomTabButtons[tab]?.classList.remove('bb-bottom-tab--hidden');
  layout.setOutputPaneVisible(true);
  switchBottomTab(tab);
};

/** Activate a tab that is already open. Does not open a closed tab. */
const switchBottomTab = (tab: BottomTabId): void => {
  activeBottomTab = tab;
  for (const t of BOTTOM_TAB_ORDER) {
    bottomTabButtons[t]?.classList.toggle('bb-bottom-tab--active', t === tab);
    bottomTabContents[t]?.classList.toggle('bb-bottom-tab-content--active', t === tab);
  }
};

/** Close a tab. Switches to nearest open neighbour, or hides entire pane + splitter. */
const closeBottomTab = (tab: BottomTabId): void => {
  bottomTabOpen[tab] = false;
  bottomTabButtons[tab]?.classList.remove('bb-bottom-tab--active');
  bottomTabButtons[tab]?.classList.add('bb-bottom-tab--hidden');
  bottomTabContents[tab]?.classList.remove('bb-bottom-tab-content--active');
  if (activeBottomTab === tab) {
    const next = BOTTOM_TAB_ORDER.find(t => t !== tab && bottomTabOpen[t]);
    if (next) {
      switchBottomTab(next);
    } else {
      activeBottomTab = null;
      layout.setOutputPaneVisible(false);
    }
  }
};

const bottomTabBar = document.createElement('div');
bottomTabBar.className = 'bb-bottom-tab-bar';
outputPane.appendChild(bottomTabBar);

for (const t of BOTTOM_TAB_ORDER) {
  const btn = document.createElement('button');
  btn.className = 'bb-bottom-tab';
  btn.title = BOTTOM_TAB_LABELS[t];

  const labelSpan = document.createElement('span');
  labelSpan.className = 'bb-bottom-tab__label';
  labelSpan.textContent = BOTTOM_TAB_LABELS[t];

  const closeBtn = document.createElement('span');
  closeBtn.className = 'bb-bottom-tab__close';
  closeBtn.textContent = '✕';
  closeBtn.title = `Close ${BOTTOM_TAB_LABELS[t]}`;
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeBottomTab(t); });

  btn.append(labelSpan, closeBtn);
  btn.addEventListener('click', () => showBottomTab(t));
  bottomTabButtons[t] = btn;
  bottomTabBar.appendChild(btn);

  const content = document.createElement('div');
  content.className = 'bb-bottom-tab-content';
  bottomTabContents[t] = content;
  outputPane.appendChild(content);
}
switchBottomTab('problems');

const problemsContainer = document.createElement('div');
problemsContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
bottomTabContents['problems']!.appendChild(problemsContainer);

const outputLogsContainer = document.createElement('div');
outputLogsContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
bottomTabContents['output']!.appendChild(outputLogsContainer);

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
setupGlyphMargin(editor.editor, eventBus, channelState);
const playbackManager = new PlaybackManager(eventBus, channelState);
const problemsPanel = new OutputPanel(problemsContainer, eventBus, { singleTab: 'problems' });
const outputPanel = new OutputPanel(outputLogsContainer, eventBus, { singleTab: 'output' });
const statusBar = withErrorBoundary('StatusBar', () => new StatusBar({ container: statusBarContainer }, eventBus), statusBarContainer);

// Install global error handlers now that panels are ready.
// Uncaught errors and unhandled rejections are forwarded as error messages.
installGlobalErrorHandlers((message, _err) => {
  problemsPanel.addMessage({
    type: 'error',
    message: `Uncaught error: ${message}`,
    source: 'runtime',
    timestamp: new Date(),
  });
  showBottomTab('problems');
});

// Auto-show the relevant bottom tab when events arrive.
eventBus.on('parse:error', () => showBottomTab('problems'));
eventBus.on('validation:errors', ({ errors }) => { if (errors.length > 0) showBottomTab('problems'); });
eventBus.on('validation:warnings', ({ warnings }) => { if (warnings.length > 0) showBottomTab('problems'); });
eventBus.on('playback:started', () => showBottomTab('output'));

// ─── Problems tab badge ───────────────────────────────────────────────────────
let problemsBadgeErrors = 0;
let problemsBadgeWarnings = 0;

function updateProblemsTabBadge(): void {
  const labelSpan = bottomTabButtons['problems']?.querySelector<HTMLElement>('.bb-bottom-tab__label');
  if (!labelSpan) return;
  const total = problemsBadgeErrors + problemsBadgeWarnings;
  if (total > 0) {
    labelSpan.innerHTML = `Problems <span class="bb-tab-badge">${total}</span>`;
  } else {
    labelSpan.textContent = 'Problems';
  }
}

eventBus.on('validation:errors',   ({ errors })   => { problemsBadgeErrors   = errors.length;   updateProblemsTabBadge(); });
eventBus.on('validation:warnings', ({ warnings }) => { problemsBadgeWarnings = warnings.length; updateProblemsTabBadge(); });
eventBus.on('parse:error',         ()             => { problemsBadgeErrors   = 1;               updateProblemsTabBadge(); });

// ─── Right pane: tabbed panel (Channel Mixer | Help | Shortcuts) ────────
const rightTabStyle = document.createElement('style');
rightTabStyle.textContent = `
  .bb-right-tabs { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .bb-right-tab-bar { display: flex; flex-shrink: 0; background: var(--header-bg, #252526); border-bottom: 1px solid var(--border-color, #3c3c3c); }
  .bb-right-tab { display: flex; align-items: center; gap: 4px; flex: 1; padding: 7px 6px 7px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-muted, #888); cursor: pointer; transition: color 0.15s, border-color 0.15s; white-space: nowrap; overflow: hidden; }
  .bb-right-tab:hover { color: var(--text-color, #d4d4d4); background: var(--button-hover-bg, #2a2d2e); }
  .bb-right-tab--active { color: var(--text-color, #d4d4d4); border-bottom-color: #569cd6; }
  .bb-right-tab--hidden { display: none; }
  .bb-right-tab__label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
  .bb-right-tab__close { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 3px; font-size: 11px; line-height: 1; color: var(--text-muted, #888); opacity: 0; transition: opacity 0.1s, background 0.1s; pointer-events: none; }
  .bb-right-tab:hover .bb-right-tab__close,
  .bb-right-tab--active .bb-right-tab__close { opacity: 1; pointer-events: auto; }
  .bb-right-tab__close:hover { background: var(--button-hover-bg, #3a3a3a); color: var(--text-color, #d4d4d4); }
  .bb-right-tab-content { flex: 1 1 0; overflow: hidden; display: none; flex-direction: column; }
  .bb-right-tab-content--active { display: flex; }
  .bb-right-tabs--empty .bb-right-tab-content { display: none !important; }
`;
document.head.appendChild(rightTabStyle);

type RightTabId = 'channels' | 'help' | 'shortcuts' | 'ai';
const RIGHT_TAB_LABELS: Record<RightTabId, string> = {
  channels: 'Mixer',
  help: 'Help',
  shortcuts: 'Shortcuts',
  ai: 'AI Copilot',
};
const RIGHT_TAB_ORDER: RightTabId[] = ['channels', 'help', 'shortcuts', 'ai'];
let activeRightTab: RightTabId | null = 'channels';
const rightTabOpen: Record<RightTabId, boolean> = { channels: true, help: true, shortcuts: true, ai: false };
const rightTabButtons: Partial<Record<RightTabId, HTMLButtonElement>> = {};
const rightTabContents: Partial<Record<RightTabId, HTMLElement>> = {};

/** Show a tab (make it open+active). If it is already open, just activate it. */
const showRightTab = (tab: RightTabId): void => {
  rightTabOpen[tab] = true;
  rightTabButtons[tab]?.classList.remove('bb-right-tab--hidden');
  layout.setRightPaneVisible(true);
  switchRightTab(tab);
};

/** Activate a tab that is already open. Does not open a closed tab. */
const switchRightTab = (tab: RightTabId): void => {
  activeRightTab = tab;
  rightTabs.classList.remove('bb-right-tabs--empty');
  for (const t of RIGHT_TAB_ORDER) {
    rightTabButtons[t]?.classList.toggle('bb-right-tab--active', t === tab);
    rightTabContents[t]?.classList.toggle('bb-right-tab-content--active', t === tab);
  }
};

/** Close a tab. Switches to the nearest open neighbour, or marks pane empty. */
const closeRightTab = (tab: RightTabId): void => {
  rightTabOpen[tab] = false;
  rightTabButtons[tab]?.classList.remove('bb-right-tab--active');
  rightTabButtons[tab]?.classList.add('bb-right-tab--hidden');
  rightTabContents[tab]?.classList.remove('bb-right-tab-content--active');

  if (activeRightTab === tab) {
    // Find next open tab to activate
    const next = RIGHT_TAB_ORDER.find(t => t !== tab && rightTabOpen[t]);
    if (next) {
      switchRightTab(next);
    } else {
      activeRightTab = null;
      rightTabs.classList.add('bb-right-tabs--empty');
      // Collapse right pane and its splitter
      layout.setRightPaneVisible(false);
    }
  }
};

const rightTabs = document.createElement('div');
rightTabs.className = 'bb-right-tabs';
rightPane.appendChild(rightTabs);

const rightTabBar = document.createElement('div');
rightTabBar.className = 'bb-right-tab-bar';
rightTabs.appendChild(rightTabBar);

for (const t of RIGHT_TAB_ORDER) {
  const btn = document.createElement('button');
  btn.className = 'bb-right-tab';
  btn.title = RIGHT_TAB_LABELS[t];

  const labelSpan = document.createElement('span');
  labelSpan.className = 'bb-right-tab__label';
  labelSpan.textContent = RIGHT_TAB_LABELS[t];

  const closeBtn = document.createElement('span');
  closeBtn.className = 'bb-right-tab__close';
  closeBtn.textContent = '✕';
  closeBtn.title = `Close ${RIGHT_TAB_LABELS[t]}`;
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeRightTab(t); });

  btn.append(labelSpan, closeBtn);
  btn.addEventListener('click', () => showRightTab(t));
  rightTabButtons[t] = btn;
  rightTabBar.appendChild(btn);

  const content = document.createElement('div');
  content.className = 'bb-right-tab-content';
  rightTabContents[t] = content;
  rightTabs.appendChild(content);
}
switchRightTab('channels');

// ─── Unified Channel Panel (ChannelMixer) in the channels tab ──────────────
// The ChannelMixer lives in a dedicated scoped div so its render() (which
// clears innerHTML on every parse:success) never conflicts with sibling nodes.
const ccContainer = document.createElement('div');
ccContainer.id = 'bb-channel-controls-host';
ccContainer.style.cssText = 'flex: 1 1 0; overflow-y: auto;';
rightTabContents['channels']!.appendChild(ccContainer);

const channelMixer = withErrorBoundary(
  'ChannelMixer',
  () => new ChannelMixer({ container: ccContainer, eventBus, channelState }),
  ccContainer,
);

// ─── HelpPanel — embedded in the help tab ──────────────────────────────────
// shortcutsContainer is created here but its HelpPanel is instantiated after
// ks.mount() so that getShortcuts() returns the full registered list.
const helpContainer = document.createElement('div');
helpContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
rightTabContents['help']!.appendChild(helpContainer);

const shortcutsContainer = document.createElement('div');
shortcutsContainer.style.cssText = 'flex: 1 1 0; overflow: hidden; display: flex; flex-direction: column;';
rightTabContents['shortcuts']!.appendChild(shortcutsContainer);

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
rightTabContents['ai']!.appendChild(aiContainer);

// Initially hide the AI tab button — shown only when feature flag is on.
const aiTabBtn = rightTabButtons['ai'];
if (aiTabBtn) aiTabBtn.classList.add('bb-right-tab--hidden');

let chatPanel: ChatPanel | null = null;

function getChatPanel(): ChatPanel {
  if (!chatPanel) {
    chatPanel = new ChatPanel({
      container: aiContainer,
      eventBus,
      getEditorContent: () => (editor?.getValue?.() as string) || '',
      getDiagnostics: () => {
        // Gather current diagnostics from the diagnosticsManager
        const dm = diagnosticsManager;
        if (!dm) return [];
        // DiagnosticsManager doesn't expose a getDiagnostics() getter,
        // so we collect from the eventBus-driven validation state instead.
        return (window as any).__beatbax_lastDiagnostics ?? [];
      },
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
    });
  }
  return chatPanel;
}

// Cache last diagnostics so getChatPanel can access them.
(window as any).__beatbax_lastDiagnostics = [];
eventBus.on('validation:errors', ({ errors }) => {
  (window as any).__beatbax_lastDiagnostics = errors.map((e: any) => ({
    message: e.message,
    severity: 'error' as const,
    startLine: e.loc?.start?.line ?? 1,
    startColumn: e.loc?.start?.column ?? 1,
  }));
});
eventBus.on('validation:warnings', ({ warnings }) => {
  const existing = ((window as any).__beatbax_lastDiagnostics ?? []).filter((d: any) => d.severity !== 'warning');
  (window as any).__beatbax_lastDiagnostics = [
    ...existing,
    ...warnings.map((w: any) => ({
      message: w.message,
      severity: 'warning' as const,
      startLine: w.loc?.start?.line ?? 1,
      startColumn: w.loc?.start?.column ?? 1,
    })),
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
    rightTabOpen['ai'] = true;
    getChatPanel(); // ensure panel is created
    showRightTab('ai');
  } else {
    closeRightTab('ai');
    aiTabBtn?.classList.add('bb-right-tab--hidden');
    rightTabOpen['ai'] = false;
  }
}

// Initialise AI tab visibility on page load (in case flag is already set).
if (isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
  aiTabBtn?.classList.remove('bb-right-tab--hidden');
  rightTabOpen['ai'] = true;
  getChatPanel();
}

// Toggle panel visibility via panel:toggled
eventBus.on('panel:toggled', ({ panel, visible }) => {
  if (panel === 'output') {
    visible ? showBottomTab('output') : closeBottomTab('output');
  }
  if (panel === 'problems') {
    visible ? showBottomTab('problems') : closeBottomTab('problems');
  }
  if (panel === 'channel-mixer') {
    visible ? showRightTab('channels') : closeRightTab('channels');
  }
  if (panel === 'help') {
    visible ? showRightTab('help') : closeRightTab('help');
  }
  if (panel === 'shortcuts') {
    visible ? showRightTab('shortcuts') : closeRightTab('shortcuts');
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

(window as any).__beatbax_channelState = channelState;
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
// Inject live-button pulse animation once.
const liveBtnStyle = document.createElement('style');
liveBtnStyle.textContent = `
  .bb-live-btn { border: 2px solid transparent; border-radius: 4px; transition: border-color 0.2s; }
  .bb-live-btn--active {
    border-color: #4caf50;
    animation: bb-live-pulse 1.4s ease-in-out infinite;
  }
  @keyframes bb-live-pulse {
    0%, 100% { box-shadow: 0 0 4px 2px rgba(76,175,80,0.35); }
    50%       { box-shadow: 0 0 12px 4px rgba(76,175,80,0.75); }
  }
`;
document.head.appendChild(liveBtnStyle);

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
      return;
    }

    // Emit errors (disables Play button, shows in Problems > Errors)
    eventBus.emit('validation:errors', { errors });

    // Emit warnings (informational only)
    eventBus.emit('validation:warnings', { warnings });

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
  } catch (err: any) {
    eventBus.emit('parse:error', { error: err, message: err.message ?? String(err) });
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
      showBottomTab('problems');
    }
  } else {
    opError(problemsPanel, `Export failed: ${result.error?.message ?? 'unknown error'}`, 'export');
    showBottomTab('problems');
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
  onShowShortcuts: () => showRightTab('shortcuts'),
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
    showBottomTab('output');
    diagnosticsManager?.clearAll?.();
    toolbar.setExportEnabled(true);
  } catch (err: any) {
    opError(problemsPanel, `✗ Verification failed: ${err.message ?? err}`, 'verify');
    showBottomTab('problems');
    if (diagnosticsManager && err.loc) {
      diagnosticsManager.setMarkers([parseErrorToDiagnostic(err)]);
    }
    toolbar.setExportEnabled(false);
  }
}

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
// Shift+F1 → Switch to Help tab (F1 alone is Monaco's own Command Palette — leave that alone)
monacoInst.addCommand(KeyMod.Shift | KeyCode.F1, () => { showRightTab('help'); });
// Ctrl+Shift+/ is Monaco's "Toggle Block Comment" so Ctrl+? cannot be used.
// Alt+Shift+K (K for Keyboard shortcuts) is free in all browsers and Monaco.
monacoInst.addCommand(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyK, () => { showRightTab('shortcuts'); });
// Ctrl+Shift+L → Theme toggle.
// Monaco binds Ctrl+Shift+L to "Select All Occurrences" by default; registering
// here via addCommand overrides that default while Monaco has focus.
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, () => { menuBar.triggerToggleTheme(); });
// Ctrl+Shift+Y → Switch to Channel Mixer tab (Monaco captures this key when focused).
monacoInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY, () => {
  showRightTab('channels');
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
    if (activeRightTab === 'help') switchRightTab('channels');
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
ks.register({ key: 'Escape', description: 'Stop playback', allowInInput: false,
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
  action: () => showBottomTab('output'),
});
ks.register({ key: 'p', altKey: true, shiftKey: true, description: 'Show Problems panel', allowInInput: true,
  action: () => showBottomTab('problems'),
});
ks.register({ key: 'y', altKey: true, shiftKey: true, description: 'Show Channel Mixer tab', allowInInput: true,
  action: () => showRightTab('channels'),
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
  action: () => showRightTab('help') });
ks.register({ key: 'h', altKey: true, shiftKey: true, description: 'Show Help tab', allowInInput: true,
  action: () => showRightTab('help') });
// Alt+Shift+K → switch directly to the Keyboard Shortcuts tab.
ks.register({ key: 'k', altKey: true, shiftKey: true, description: 'Show Keyboard Shortcuts tab', allowInInput: true,
  action: () => showRightTab('shortcuts') });

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
  onToggleMute: (channelId) => channelState.toggleMute(channelId),
  onToggleSolo: (channelId) => channelState.toggleSolo(channelId),
  onStopPreview: () => monacoInst.trigger('', 'beatbax.stopPreview', null),
  onPlayRaw: (src, chunkInfo) => {
    if (chunkInfo && Object.keys(chunkInfo).length > 0) {
      eventBus.emit('preview:chunkInfo', { chunkInfo });
    }
    showBottomTab('output');
    playbackManager.play(src);
  },
});

// ─── Shortcuts panel — instantiated after ks.mount() so the full registered ─
// shortcut list is available when HelpPanel first renders the section.
const shortcutsPanel = withErrorBoundary('ShortcutsPanel', () => new HelpPanel({
  container: shortcutsContainer,
  eventBus,
  embedded: true,
  singleSection: 'shortcuts',
  defaultVisible: true,
  getShortcuts: () => ks.list(),
}), appContainer);
(window as any).__beatbax_shortcutsPanel = shortcutsPanel;

log.debug('BeatBax initialised ✓');

} catch (fatalError) {
  showFatalError(fatalError);
}
