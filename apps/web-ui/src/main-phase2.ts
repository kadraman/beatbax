/**
 * BeatBax Web UI - Phase 2 Implementation
 * BUILDS ON Phase 1: Monaco editor, diagnostics, layout
 * ADDS Phase 2: PlaybackManager, TransportControls, OutputPanel, StatusBar, ChannelState
 */

import { parse } from '@beatbax/engine/parser';
import Player from '@beatbax/engine/audio/playback';
import { resolveSong, resolveImports } from '@beatbax/engine/song';

// Phase 1 imports - Monaco editor, diagnostics, layout
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco } from './editor';
import { createDiagnosticsManager, setupDiagnosticsIntegration, parseErrorToDiagnostic, warningsToDiagnostics } from './editor/diagnostics';
import { createThreePaneLayout, createOutputPanelContent } from './ui/layout';

// Phase 2 imports - NEW playback and UI components
import { PlaybackManager } from './playback/playback-manager';
import { TransportControls } from './playback/transport-controls';
import { ChannelState } from './playback/channel-state';
import { OutputPanel } from './panels/output-panel';
import { StatusBar } from './ui/status-bar';

// Debug flag controlled by localStorage
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('beatbax-debug') === 'true';

if (DEBUG) console.log('[web-ui-phase2] Initializing Phase 2 - building on Phase 1 with 3-pane layout...');

// Make eventBus globally accessible
(window as any).__beatbax_eventBus = eventBus;

// Initialize global state
let player: Player | null = null;
let currentAST: any = null;
let editor: any = null;
let diagnosticsManager: any = null;
let rightPane: HTMLElement; // For channel controls panel

// Helper function for initial content
function getInitialContent(): string {
  try {
    const saved = localStorage.getItem('beatbax-editor-content');
    if (saved) return saved;
  } catch (e) {
    console.warn('Failed to load saved content:', e);
  }

  return `# BeatBax Phase 2 - Monaco Editor + Playback Components
# Try pressing Space to play, Escape to stop

chip gameboy
bpm 140
time 4

inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down

pat melody = C5 E5 G5 C6
pat bassline = C3 . G2 .

seq main = melody melody melody melody

channel 1 => inst lead seq main
channel 2 => inst bass seq main:oct(-2)

play
`;
}

// Configure Monaco globally (from Phase 1)
configureMonaco();
registerBeatBaxLanguage();

// Initialize layout (from Phase 1, now with 3-pane layout for Phase 2)
const appContainer = document.getElementById('app') as HTMLElement;
if (!appContainer) {
  throw new Error('App container not found');
}

// Create 3-pane split layout (Phase 2 enhancement):
// Left: Editor (top) + Output (bottom) - vertical split
// Right: Channel controls
const layout = createThreePaneLayout({
  container: appContainer,
  persist: true,
});

// Create editor in the editor pane (Phase 1 - Monaco!)
const editorPane = layout.getEditorPane();
editor = createEditor({
  container: editorPane,
  value: getInitialContent(),
  theme: 'beatbax-dark',
  language: 'beatbax',
  autoSaveDelay: 500,
});

// Create diagnostics manager (Phase 1)
diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);

// Get the output pane (bottom of left area)
const outputPane = layout.getOutputPane();

// Get the right pane for channel controls (assign to module variable)
rightPane = layout.getRightPane();

// Create status bar container at the bottom
const statusBarContainer = document.createElement('div');
statusBarContainer.id = 'status-bar';
statusBarContainer.style.cssText = `
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
`;
document.body.appendChild(statusBarContainer);

// ============================================================================
// PHASE 2 COMPONENTS - NEW!
// ============================================================================

// Initialize Phase 2 PlaybackManager
const playbackManager = new PlaybackManager(eventBus);
(window as any).__beatbax_playbackManager = playbackManager;

// Initialize Phase 2 ChannelState
const channelState = new ChannelState(eventBus);
(window as any).__beatbax_channelState = channelState;

// Initialize Phase 2 OutputPanel
const outputPanel = new OutputPanel(outputPane, eventBus);
(window as any).__beatbax_outputPanel = outputPanel;

// Initialize Phase 2 StatusBar
const statusBar = new StatusBar({ container: statusBarContainer }, eventBus);
(window as any).__beatbax_statusBar = statusBar;

// Create control buttons
const controlsDiv = document.createElement('div');
controlsDiv.style.cssText = `
  padding: 10px;
  background: #2d2d2d;
  display: flex;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid #444;
`;

// Add BeatBax logo
const logo = document.createElement('img');
logo.src = '/logo-menu-bar.png';
logo.alt = 'BeatBax';
logo.style.cssText = 'height: 50px; margin-right: 10px;';

const playBtn = document.createElement('button');
playBtn.id = 'phase2-play-btn';
playBtn.textContent = '▶ Play';
playBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer; min-width: 80px;';

const pauseBtn = document.createElement('button');
pauseBtn.id = 'phase2-pause-btn';
pauseBtn.textContent = '⏸ Pause';
pauseBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer; min-width: 80px;';

const stopBtn = document.createElement('button');
stopBtn.textContent = '⏹ Stop';
stopBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer;';

const applyBtn = document.createElement('button');
applyBtn.textContent = '🔄 Apply & Play';
applyBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer;';

const livePlayBtn = document.createElement('button');
livePlayBtn.textContent = '⚡ Live Play';
livePlayBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer; border: 2px solid transparent;';
livePlayBtn.title = 'Automatically reload and play on editor changes';

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.bax';
fileInput.style.cssText = 'margin-left: auto;';

const loadExampleBtn = document.createElement('button');
loadExampleBtn.textContent = '📄 Load Example';
loadExampleBtn.style.cssText = 'padding: 8px 16px; font-size: 14px; cursor: pointer;';

controlsDiv.appendChild(logo);
controlsDiv.appendChild(playBtn);
controlsDiv.appendChild(pauseBtn);
controlsDiv.appendChild(stopBtn);
controlsDiv.appendChild(applyBtn);
controlsDiv.appendChild(livePlayBtn);
controlsDiv.appendChild(loadExampleBtn);
controlsDiv.appendChild(fileInput);

// Insert controls before the layout
appContainer.insertBefore(controlsDiv, appContainer.firstChild);

// Initialize Phase 2 TransportControls
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
  () => editor?.getValue() || ''
);
(window as any).__beatbax_transportControls = transportControls;

// Disable play button when there are parse errors
eventBus.on('parse:error', () => {
  transportControls.setHasErrors(true);
});

// Enable play button when validation succeeds (parse succeeded)
eventBus.on('validation:warnings', () => {
  transportControls.setHasErrors(false);
});

// Live Play feature - automatically reload on editor changes
let livePlayEnabled = false;
let livePlayTimeout: number | undefined;

function updateLivePlayButton() {
  if (livePlayEnabled) {
    livePlayBtn.style.borderColor = '#4CAF50';
    livePlayBtn.style.backgroundColor = '#1b4d1b';
    livePlayBtn.textContent = '⚡ Live Play (ON)';
  } else {
    livePlayBtn.style.borderColor = 'transparent';
    livePlayBtn.style.backgroundColor = '';
    livePlayBtn.textContent = '⚡ Live Play';
  }
}

livePlayBtn.addEventListener('click', () => {
  livePlayEnabled = !livePlayEnabled;
  updateLivePlayButton();

  if (!livePlayEnabled && livePlayTimeout) {
    clearTimeout(livePlayTimeout);
    livePlayTimeout = undefined;
  }
});

// Listen to editor changes when live play is enabled
eventBus.on('editor:changed', ({ content }) => {
  if (!livePlayEnabled) return;

  // Clear existing timeout
  if (livePlayTimeout) {
    clearTimeout(livePlayTimeout);
  }

  // Debounce by 500ms to avoid constant reloading while typing
  livePlayTimeout = window.setTimeout(async () => {
    // Only apply if there are no errors and content is not empty
    if (content.trim()) {
      // Check if there are parse errors by attempting to parse
      try {
        parse(content);
        // No errors - trigger apply & play (which stops and restarts)
        const applyBtnClickEvent = new MouseEvent('click', { bubbles: true });
        applyBtn.dispatchEvent(applyBtnClickEvent);
      } catch (e) {
        // Parse error - don't auto-apply
      if (DEBUG) console.log('[live-play] Skipping auto-apply due to parse error');
      }
    }
  }, 500);
});

if (DEBUG) console.log('[web-ui-phase2] All Phase 2 components initialized');

// ============================================================================
// VALIDATION (from Phase 1 - FULL VERSION)
// ============================================================================

function validateAST(ast: any, sourceCode?: string): Array<{ component: string; message: string; loc?: any }> {
  const warnings: Array<{ component: string; message: string; loc?: any }> = [];
  const lines = sourceCode ? sourceCode.split('\n') : [];
  const validTransforms = new Set(['oct', 'inst', 'rev', 'slow', 'fast', 'transpose', 'arp']);

  // Valid instrument types per chip
  const validInstrumentTypes: Record<string, Set<string>> = {
    gameboy: new Set(['pulse1', 'pulse2', 'wave', 'noise']),
    // Future chips can be added here
  };

  // Determine active chip (default: gameboy)
  const chipName = ast.chip || 'gameboy';
  const validTypes = validInstrumentTypes[chipName] || validInstrumentTypes.gameboy;

  // Validate instrument definitions
  for (const instName in ast.insts || {}) {
    const inst = ast.insts[instName];
    if (inst && inst.type) {
      if (!validTypes.has(inst.type)) {
        warnings.push({
          component: 'validation',
          message: `Instrument '${instName}' has invalid type '${inst.type}'. Valid types for ${chipName}: ${Array.from(validTypes).join(', ')}`,
          loc: inst.loc
        });
      }
    }
  }

  for (const ch of ast.channels || []) {
    if (ch.inst && !ast.insts[ch.inst]) {
      warnings.push({
        component: 'validation',
        message: `Channel ${ch.id} references unknown inst '${ch.inst}'`,
        loc: ch.loc
      });
    }

    // Extract and validate sequence references
    const extractSeqNames = (channel: any): string[] => {
      const names: string[] = [];
      if (!channel || !channel.pat) return names;
      if (Array.isArray(channel.pat)) return [];

      const rawTokens: string[] | undefined = (channel as any).seqSpecTokens;
      if (rawTokens && rawTokens.length > 0) {
        const joined = rawTokens.join(' ');
        for (const group of joined.split(',')) {
          const g = group.trim();
          if (!g) continue;
          const itemRef = g.match(/^(.+?)\s*\*\s*(\d+)$/) ? g.match(/^(.+?)\s*\*\s*(\d+)$/)![1].trim() : g;
          const base = itemRef.split(':')[0];
          if (base) names.push(base);

          if (itemRef.indexOf(':') >= 0) {
            const transformParts = itemRef.split(':').slice(1);
            for (const transform of transformParts) {
              const transformName = transform.trim().split('(')[0];
              if (transformName && !validTransforms.has(transformName)) {
                warnings.push({
                  component: 'transforms',
                  message: `Unknown transform '${transformName}' on '${g}'. Valid transforms: oct(±N), inst(name), rev, slow, fast, transpose(±N), arp(...).`,
                  loc: ch.loc
                });
              }
            }
          }
        }
        return names.filter(Boolean);
      }

      const spec = String(channel.pat).trim();
      for (const group of spec.split(',')) {
        const g = group.trim();
        if (!g) continue;
        const itemRef = g.match(/^(.+?)\s*\*\s*(\d+)$/) ? g.match(/^(.+?)\s*\*\s*(\d+)$/)![1].trim() : g;
        const base = itemRef.split(':')[0];
        if (base) names.push(base);
      }
      return names.filter(Boolean);
    };

    const seqNames = extractSeqNames(ch);
    for (const seqName of seqNames) {
      if (!ast.seqs || !ast.seqs[seqName]) {
        if (ast.pats && ast.pats[seqName]) {
          warnings.push({
            component: 'validation',
            message: `Channel ${ch.id} references '${seqName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${seqName}'.`,
            loc: ch.loc
          });
        } else if (!ast.pats || !ast.pats[seqName]) {
          warnings.push({
            component: 'validation',
            message: `Channel ${ch.id} references unknown sequence or pattern '${seqName}'`,
            loc: ch.loc
          });
        }
      }
    }
  }

  // Validate sequences reference existing patterns
  for (const seqName in ast.seqs || {}) {
    const seq = ast.seqs[seqName];
    if (!seq) continue;

    let patternRefs: string[] = [];

    // Seq is directly an array of pattern names
    if (Array.isArray(seq)) {
      patternRefs = seq.filter(item => typeof item === 'string');
    }

    // Find the line where this sequence is defined (do this once)
    let seqLineIndex = -1;
    let seqLine = '';
    if (lines.length > 0) {
      seqLineIndex = lines.findIndex(line => {
        const trimmed = line.trim();
        return trimmed.startsWith(`seq ${seqName}`) || trimmed.startsWith(`seq ${seqName} `);
      });
      if (seqLineIndex !== -1) {
        seqLine = lines[seqLineIndex];
      }
    }

    // Track position in the line to find each occurrence
    let searchStartPos = 0;

    // Validate each pattern reference
    for (const ref of patternRefs) {
      if (!ref || typeof ref !== 'string') continue;

      // Extract base pattern name (handle "pattern*3", "pattern:transform", etc.)
      const withoutRepeat = ref.split('*')[0].trim();
      const patternName = withoutRepeat.split(':')[0].trim();

      if (patternName && patternName !== '') {
        // Check if pattern exists (also check if it might be another sequence)
        if (!ast.pats || !ast.pats[patternName]) {
          // Don't warn if it's referencing another sequence (valid in some cases)
          if (!ast.seqs || !ast.seqs[patternName]) {
            // Try to find this specific occurrence in the line
            let loc = undefined;
            if (seqLineIndex !== -1 && seqLine) {
              const patternIndex = seqLine.indexOf(patternName, searchStartPos);
              if (patternIndex !== -1) {
                searchStartPos = patternIndex + patternName.length; // Move past this occurrence
                loc = {
                  start: {
                    line: seqLineIndex + 1, // 1-indexed
                    column: patternIndex + 1 // 1-indexed
                  },
                  end: {
                    line: seqLineIndex + 1,
                    column: patternIndex + patternName.length + 1
                  }
                };
              }
            }
            warnings.push({
              component: 'validation',
              message: `Sequence '${seqName}' references unknown pattern '${patternName}'`,
              loc
            });
          }
        }
      }
    }
  }

  // Validate patterns - check instrument token references
  if (ast.patternEvents) {
    for (const [patName, events] of Object.entries(ast.patternEvents)) {
      if (!Array.isArray(events)) continue;

      for (const event of events as any[]) {
        if (event.kind === 'token' && event.value) {
          // Check if this token is an instrument name
          if (!ast.insts?.[event.value]) {
            // Skip if it's a known pattern name (could be referenced in inline syntax)
            if (!ast.pats?.[event.value]) {
              warnings.push({
                component: 'validation',
                message: `Pattern '${patName}' references undefined instrument '${event.value}'`,
                loc: event.loc
              });
            }
          }
        } else if (event.kind === 'inline-inst' && event.name) {
          // Check inline inst() syntax
          if (!ast.insts?.[event.name]) {
            warnings.push({
              component: 'validation',
              message: `Pattern '${patName}' references undefined instrument '${event.name}' in inst() modifier`,
              loc: event.loc
            });
          }
        } else if (event.kind === 'temp-inst' && event.name) {
          // Check temp inst(name,N) syntax
          if (!ast.insts?.[event.name]) {
            warnings.push({
              component: 'validation',
              message: `Pattern '${patName}' references undefined instrument '${event.name}' in inst(,N) temporary override`,
              loc: event.loc
            });
          }
        }
      }
    }
  }

  // Deduplicate warnings based on message and location
  const seen = new Set<string>();
  const uniqueWarnings = warnings.filter(w => {
    const key = `${w.message}|${w.loc?.start?.line}|${w.loc?.start?.column}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return uniqueWarnings;
}

// Initial validation
function runInitialValidation() {
  const initialContent = editor.getValue();
  if (initialContent.trim()) {
    try {
      const ast = parse(initialContent);
      const warnings = validateAST(ast, initialContent);
      if (warnings.length > 0) {
        const diagnostics = warningsToDiagnostics(warnings);
        diagnosticsManager.setDiagnostics(diagnostics);
      }
      // Always emit to sync play button state
      eventBus.emit('validation:warnings', { warnings });
    } catch (e: any) {
      const diagnostic = parseErrorToDiagnostic(e, initialContent);
      diagnosticsManager.setDiagnostics([diagnostic]);
      eventBus.emit('parse:error', { error: e, message: e.message || String(e) });
    }
  } else {
    // Empty content - emit to ensure play button is enabled
    eventBus.emit('validation:warnings', { warnings: [] });
  }
}

// Live validation (debounced)
let validationTimeout: number | undefined;
eventBus.on('editor:changed', ({ content }) => {
  if (validationTimeout) clearTimeout(validationTimeout);

  validationTimeout = window.setTimeout(() => {
    if (!content.trim()) {
      diagnosticsManager.clear();
      eventBus.emit('validation:warnings', { warnings: [] });
      return;
    }

    try {
      const ast = parse(content);
      const warnings = validateAST(ast, content);

      // Always update diagnostics and emit warnings (even if empty)
      if (warnings.length > 0) {
        const diagnostics = warningsToDiagnostics(warnings);
        diagnosticsManager.setDiagnostics(diagnostics);
      } else {
        diagnosticsManager.clear();
      }

      // Always emit to keep OutputPanel in sync
      eventBus.emit('validation:warnings', { warnings });
    } catch (e: any) {
      const diagnostic = parseErrorToDiagnostic(e, content);
      diagnosticsManager.setDiagnostics([diagnostic]);
      eventBus.emit('parse:error', { error: e, message: e.message || String(e) });
    }
  }, 500);
});

runInitialValidation();

// ============================================================================
// FILE LOADING
// ============================================================================

fileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const content = ev.target?.result as string;
    editor.setValue(content);
    eventBus.emit('editor:changed', { content });
  };
  reader.readAsText(file);
});

loadExampleBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('/songs/sample.bax');
    const content = await response.text();
    editor.setValue(content);
    eventBus.emit('editor:changed', { content });
  } catch (error) {
    console.error('Failed to load example:', error);
    outputPanel.addMessage({
      type: 'error',
      message: 'Failed to load example file',
      source: 'file-loader',
      timestamp: new Date(),
    });
  }
});

// Cursor position tracking
if (editor.editor) {
  editor.editor.onDidChangeCursorPosition?.((e: any) => {
    statusBar.setCursorPosition(e.position.lineNumber, e.position.column);
  });
}

// ============================================================================
// CHANNEL CONTROLS
// ============================================================================

function renderChannelControls(ast: any) {
  // Clear the right pane
  rightPane.innerHTML = '';

  // Create title
  const title = document.createElement('div');
  title.textContent = 'Channel Controls';
  title.style.cssText = `
    font-weight: bold;
    font-size: 16px;
    margin-bottom: 8px;
    color: #d4d4d4;
    border-bottom: 2px solid #444;
    padding-bottom: 8px;
  `;
  rightPane.appendChild(title);

  // Add explanation
  /*const subtitle = document.createElement('div');
  subtitle.textContent = 'Shows instruments used in channel';
  subtitle.style.cssText = `
    font-size: 10px;
    color: #888;
    margin-bottom: 12px;
    font-style: italic;
  `;
  rightPane.appendChild(subtitle);*/

  const channels = ast?.channels || [];
  if (channels.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = 'No channels defined';
    emptyMsg.style.cssText = 'color: #888; font-style: italic;';
    rightPane.appendChild(emptyMsg);
    return;
  }

  // Create channel list with live playback visualization
  for (const ch of channels) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #2d2d2d;
      border: 1px solid #444;
      border-radius: 4px;
      margin-bottom: 12px;
      transition: background 0.2s;
    `;

    // Channel header with indicator
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const indicator = document.createElement('div');
    indicator.id = `ch-ind-${ch.id}`;
    indicator.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #555;
      border: 2px solid #777;
      transition: all 0.15s;
    `;

    const label = document.createElement('div');
    label.textContent = `Channel ${ch.id}`;
    label.style.cssText = 'font-weight: 600; font-size: 14px; color: #d4d4d4; flex: 1;';

    header.appendChild(indicator);
    header.appendChild(label);

    // Get instrument name - extract from channel events
    const getInstrumentName = () => {
      // Try channel-level inst property first (for backward compatibility)
      if (ch.inst && ast.insts && ast.insts[ch.inst]) {
        return ch.inst;
      }

      // Extract instruments from events (Song Model format)
      if ((ch as any).events && Array.isArray((ch as any).events)) {
        const events = (ch as any).events;
        const instruments = new Set<string>();

        for (const event of events) {
          if (event.instrument && event.instrument !== 'rest') {
            instruments.add(event.instrument);
          }
        }

        if (instruments.size > 0) {
          const instList = Array.from(instruments);
          // If multiple instruments, show count
          if (instList.length > 3) {
            return `${instList[0]} +${instList.length - 1} more`;
          }
          return instList.join(', ');
        }
      }

      // No instrument found
      return `Ch${ch.id}`;
    };

    const instName = getInstrumentName();

    // Live playback info (instrument + activity status)
    const liveInfo = document.createElement('div');
    liveInfo.id = `ch-live-${ch.id}`;
    liveInfo.dataset.instName = instName; // Store for later reference
    liveInfo.style.cssText = `
      font-size: 12px;
      color: #4a9eff;
      margin-left: 24px;
      font-family: 'Consolas', 'Courier New', monospace;
      min-height: 18px;
    `;
    liveInfo.textContent = `🎵 ${instName}`;

    // Static config info (smaller, less prominent)
    const configInfo = document.createElement('div');
    configInfo.style.cssText = 'font-size: 10px; color: #666; margin-left: 24px;';

    // Show event count (since sequence names are lost after resolution)
    const eventCount = (ch as any).events?.length || (ch as any).pat?.length || 0;
    const beatCount = Math.floor(eventCount / 4); // Rough estimate assuming 4 steps per beat
    configInfo.textContent = `${eventCount} events (≈${beatCount} beats)`;

    // Visual activity bar
    const activityBar = document.createElement('div');
    activityBar.id = `ch-activity-${ch.id}`;
    activityBar.style.cssText = `
      height: 4px;
      background: linear-gradient(90deg, #4a9eff 0%, #4a9eff 0%, transparent 0%);
      border-radius: 2px;
      margin-left: 24px;
      margin-top: 4px;
      transition: background 0.1s;
    `;

    // Button container
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 8px; margin-left: 24px; margin-top: 4px;';

    const muteBtn = document.createElement('button');
    muteBtn.textContent = 'Mute';
    muteBtn.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      flex: 1;
      border: 1px solid #555;
      background: #3a3a3a;
      color: #d4d4d4;
      border-radius: 3px;
      font-size: 12px;
    `;

    const soloBtn = document.createElement('button');
    soloBtn.textContent = 'Solo';
    soloBtn.style.cssText = `
      padding: 6px 12px;
      cursor: pointer;
      flex: 1;
      border: 1px solid #555;
      background: #3a3a3a;
      color: #d4d4d4;
      border-radius: 3px;
      font-size: 12px;
    `;

    const updateButtons = () => {
      const channelInfo = channelState.getChannel(ch.id);
      if (!channelInfo) return;

      muteBtn.textContent = channelInfo.muted ? '🔇 Unmute' : '🔊 Mute';
      soloBtn.textContent = channelInfo.soloed ? '⭐ Unsolo' : '⭐ Solo';
      row.style.opacity = channelState.isAudible(ch.id) ? '1' : '0.5';

      if (channelState.isAudible(ch.id)) {
        indicator.style.background = '#4a9eff';
        indicator.style.borderColor = '#6bb6ff';
        indicator.style.boxShadow = '0 0 8px rgba(74, 158, 255, 0.6)';
      } else {
        indicator.style.background = '#555';
        indicator.style.borderColor = '#777';
        indicator.style.boxShadow = 'none';
      }

      // Update button styles
      if (channelInfo.muted) {
        muteBtn.style.background = '#c94e4e';
        muteBtn.style.borderColor = '#d66';
      } else {
        muteBtn.style.background = '#3a3a3a';
        muteBtn.style.borderColor = '#555';
      }

      if (channelInfo.soloed) {
        soloBtn.style.background = '#4a9eff';
        soloBtn.style.borderColor = '#6bb6ff';
      } else {
        soloBtn.style.background = '#3a3a3a';
        soloBtn.style.borderColor = '#555';
      }
    };

    muteBtn.addEventListener('click', () => {
      channelState.toggleMute(ch.id);
      updateButtons();
      const player = playbackManager.getPlayer();
      // Always apply to player if it exists, even if not currently playing
      // This ensures state is ready when playback starts
      if (player) {
        channelState.applyToPlayer(player);
      }
    });

    soloBtn.addEventListener('click', () => {
      channelState.toggleSolo(ch.id);
      updateButtons();
      // Update all channel displays when solo state changes
      renderChannelControls(ast);
      const player = playbackManager.getPlayer();
      // Always apply to player if it exists, even if not currently playing
      // This ensures state is ready when playback starts
      if (player) {
        channelState.applyToPlayer(player);
      }
    });

    btnContainer.appendChild(muteBtn);
    btnContainer.appendChild(soloBtn);

    row.appendChild(header);
    row.appendChild(liveInfo);
    row.appendChild(activityBar);
    row.appendChild(configInfo);
    row.appendChild(btnContainer);
    rightPane.appendChild(row);

    updateButtons();
  }
}

// Track channel activity for live visualization
const channelActivity: Map<number, { instrument: string; note: string; timeout?: number }> = new Map();

// Update channel live display with current instrument/note
function updateChannelLiveDisplay(channelId: number, instrument: string, note?: string) {
  const liveInfo = document.getElementById(`ch-live-${channelId}`);
  const activityBar = document.getElementById(`ch-activity-${channelId}`);
  const indicator = document.getElementById(`ch-ind-${channelId}`);

  if (liveInfo) {
    const displayText = note
      ? `🎵 ${instrument} : ${note}`
      : `🎵 ${instrument}`;
    liveInfo.textContent = displayText;
    liveInfo.style.color = '#4affaf';
  }

  if (activityBar) {
    // Animate activity bar
    activityBar.style.background = 'linear-gradient(90deg, #4affaf 0%, #4affaf 100%, transparent 100%)';

    // Clear previous timeout
    const existing = channelActivity.get(channelId);
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }

    // Fade out after 200ms
    const timeout = window.setTimeout(() => {
      if (activityBar) {
        activityBar.style.background = 'linear-gradient(90deg, #4a9eff 0%, #4a9eff 0%, transparent 0%)';
      }
      if (liveInfo && liveInfo.textContent.startsWith('🎵')) {
        liveInfo.style.color = '#4a9eff';
      }
    }, 200);

    channelActivity.set(channelId, { instrument, note: note || '', timeout });
  }

  if (indicator && channelState.isAudible(channelId)) {
    // Pulse the indicator
    indicator.style.transform = 'scale(1.2)';
    setTimeout(() => {
      if (indicator) indicator.style.transform = 'scale(1)';
    }, 100);
  }
}

// Hook into Player to track note events (we'll need to modify PlaybackManager or listen to a custom event)
// For now, simulate by polling the player state during playback
let playbackVisualizationInterval: number | undefined;

// Start live visualization updates
function startPlaybackVisualization() {
  if (playbackVisualizationInterval) return;

  let tickCount = 0;
  playbackVisualizationInterval = window.setInterval(() => {
    const player = playbackManager.getPlayer();
    if (!player || !playbackManager.isPlaying()) {
      stopPlaybackVisualization();
      return;
    }

    // Show activity on all audible channels
    if (currentAST?.channels) {
      for (const ch of currentAST.channels) {
        if (channelState.isAudible(ch.id)) {
          const activityBar = document.getElementById(`ch-activity-${ch.id}`);
          const indicator = document.getElementById(`ch-ind-${ch.id}`);
          const liveInfo = document.getElementById(`ch-live-${ch.id}`);

          // Pulse effect every few ticks
          if (tickCount % 4 === 0 && activityBar) {
            const progress = Math.min(100, ((tickCount % 16) / 16) * 100);
            activityBar.style.background = `linear-gradient(90deg, #4affaf 0%, #4affaf ${progress}%, transparent ${progress}%)`;
          }

          // Update live info with stored instrument name + playing indicator
          if (liveInfo) {
            const instName = liveInfo.dataset.instName || 'unknown';
            liveInfo.textContent = `▶ ${instName}`; // Show play icon during playback
            liveInfo.style.color = '#4affaf';
          }
        }
      }
    }

    tickCount++;
  }, 100);
}

// Stop live visualization updates
function stopPlaybackVisualization() {
  if (playbackVisualizationInterval) {
    clearInterval(playbackVisualizationInterval);
    playbackVisualizationInterval = undefined;
  }

  // Reset all channel displays to idle state
  if (currentAST?.channels) {
    for (const ch of currentAST.channels) {
      const liveInfo = document.getElementById(`ch-live-${ch.id}`);
      const activityBar = document.getElementById(`ch-activity-${ch.id}`);

      if (liveInfo) {
        const instName = liveInfo.dataset.instName || 'unknown';
        liveInfo.textContent = `🎵 ${instName}`; // Show music note when idle
        liveInfo.style.color = '#4a9eff';
      }
      if (activityBar) {
        activityBar.style.background = 'linear-gradient(90deg, #4a9eff 0%, #4a9eff 0%, transparent 0%)';
      }
    }
  }

  channelActivity.clear();
}

// Listen to parse success to render channel controls
eventBus.on('parse:success', ({ ast }) => {
  renderChannelControls(ast);
  currentAST = ast;

  const player = playbackManager.getPlayer();
  if (player) {
    channelState.applyToPlayer(player);
  }
});

// Listen to playback started - start live visualization
eventBus.on('playback:started', () => {
  const player = playbackManager.getPlayer();
  if (player) {
    channelState.applyToPlayer(player);
  }
  startPlaybackVisualization();

  // DEBUG: Check button state after playback starts
  /*console.log('[DEBUG] Playback started, button state:', {
    id: playBtn.id,
    disabled: playBtn.disabled,
    textContent: playBtn.textContent,
    pointerEvents: playBtn.style.pointerEvents,
    display: playBtn.style.display,
    parentElement: playBtn.parentElement?.tagName
  });

  // DEBUG: Monitor button clicks
  setTimeout(() => {
    console.log('[DEBUG] 1 second after playback start, button state:', {
      disabled: playBtn.disabled,
      textContent: playBtn.textContent,
      onclick: typeof playBtn.onclick,
      hasEventListener: playBtn.getAttribute('data-has-listener')
    });

    const rect = playBtn.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(playBtn);
    console.log('[DEBUG] Button position and style:', {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity,
      pointerEvents: computedStyle.pointerEvents,
      zIndex: computedStyle.zIndex
    });

    // Check what element is actually at the button's center position
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const elementAtCenter = document.elementFromPoint(centerX, centerY);
    console.log('[DEBUG] Element at button center position:', {
      tag: elementAtCenter?.tagName,
      id: elementAtCenter?.id,
      isSameAsButton: elementAtCenter === playBtn
    });

    console.log('[DEBUG] Try clicking the button now and watch for click events');
  }, 1000);*/
});

// Listen to playback stopped - stop live visualization
eventBus.on('playback:stopped', () => {
  stopPlaybackVisualization();
});

if (DEBUG) console.log('[web-ui-phase2] Phase 2 setup complete! Monaco editor + Phase 2 components integrated.');
console.log('[web-ui-phase2] Keyboard shortcuts: Space = Play/Pause, Escape = Stop, Ctrl+Enter = Apply & Play');
console.log('[web-ui-phase2] Debug mode: Set localStorage.setItem("beatbax-debug", "true") and reload to see detailed logs');

// DEBUG: Add global click listener to see ALL clicks
/*document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  console.log('[DEBUG] Click detected anywhere!', {
    target: target.tagName,
    id: target.id,
    text: target.textContent?.substring(0, 30),
    classes: target.className,
    x: e.clientX,
    y: e.clientY
  });

  if (target.id === 'phase2-play-btn' || target.textContent?.includes('Play') || target.textContent?.includes('Pause')) {
    console.log('[DEBUG] >>> This click is on the play/pause button!');
  }
}, true); // Use capture phase to catch before any stopPropagation
*/
// DEBUG: Add mousemove listener to check what's under the cursor
/*let lastLoggedElement: HTMLElement | null = null;
document.addEventListener('mousemove', (e) => {
  const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;

  // Only log when hovering over play button area
  if (elementAtPoint && (
    elementAtPoint.id === 'phase2-play-btn' ||
    elementAtPoint.textContent?.includes('Play') ||
    elementAtPoint.textContent?.includes('Pause')
  )) {
    if (elementAtPoint !== lastLoggedElement) {
      console.log('[DEBUG] Element under cursor:', {
        tag: elementAtPoint.tagName,
        id: elementAtPoint.id,
        text: elementAtPoint.textContent?.substring(0, 20),
        zIndex: window.getComputedStyle(elementAtPoint).zIndex,
        pointerEvents: window.getComputedStyle(elementAtPoint).pointerEvents
      });
      lastLoggedElement = elementAtPoint;
    }
  } else {
    lastLoggedElement = null;
  }
});*/

// Parse and display initial content on page load
try {
  const initialContent = editor?.getValue();
  if (initialContent) {
    const ast = parse(initialContent);

    // Run AST validation (same as live validation does)
    const astWarnings = validateAST(ast, initialContent);

    // Collect warnings during resolution
    const resolveWarnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];
    const resolved = resolveSong(ast, {
      onWarn: (w: any) => {
        resolveWarnings.push(w);
      }
    });

    // Combine all warnings
    const allWarnings = [...astWarnings, ...resolveWarnings];

    currentAST = resolved;
    renderChannelControls(resolved);

    // Emit all warnings found
    eventBus.emit('validation:warnings', { warnings: allWarnings });
  }
} catch (err) {
  console.warn('[web-ui-phase2] Could not parse initial content:', err);
  // Clear any stale warnings
  eventBus.emit('validation:warnings', { warnings: [] });
}

// Listen to editor changes and update channel controls
// Debounced to avoid excessive re-parsing during typing
// Note: Validation warnings are handled by the separate validation handler above
let editorChangeTimeout: number | null = null;
eventBus.on('editor:changed', ({ content }) => {
  if (editorChangeTimeout !== null) {
    clearTimeout(editorChangeTimeout);
  }

  editorChangeTimeout = window.setTimeout(() => {
    try {
      const ast = parse(content);
      const resolved = resolveSong(ast);

      currentAST = resolved;
      renderChannelControls(resolved);
    } catch (err) {
      // Parse error - validation handler will manage warnings
    }
  }, 1000); // Update channel controls 1 second after user stops typing
});
