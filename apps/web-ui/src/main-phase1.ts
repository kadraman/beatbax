/**
 * BeatBax Web UI - Main Entry Point
 * Phase 1: Modular architecture with Monaco editor and split layout
 */

import { parse } from '@beatbax/engine/parser';
import Player from '@beatbax/engine/audio/playback';
import { resolveSong, resolveImports } from '@beatbax/engine/song';

// Import new modules
import { eventBus } from './utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco } from './editor';
import { createDiagnosticsManager, setupDiagnosticsIntegration, parseErrorToDiagnostic, warningsToDiagnostics } from './editor/diagnostics';
import { createLayout, createOutputPanelContent } from './ui/layout';

console.log('[web-ui] Phase 1 - Modular architecture loading...');

// Initialize global state
let player: Player | null = null;
let currentAST: any = null;
let editor: any = null;
let diagnosticsManager: any = null;

// Configure Monaco globally
configureMonaco();
registerBeatBaxLanguage();

// Initialize layout
const appContainer = document.getElementById('app') as HTMLElement;
if (!appContainer) {
  throw new Error('App container not found');
}

// Create split layout
const layout = createLayout({
  container: appContainer,
  editorSize: 70,
  outputSize: 30,
  persist: true,
});

// Create editor in the editor pane
const editorPane = layout.getEditorPane();
editor = createEditor({
  container: editorPane,
  value: getInitialContent(),
  theme: 'beatbax-dark',
  language: 'beatbax',
  autoSaveDelay: 500,
});

// Create diagnostics manager
diagnosticsManager = createDiagnosticsManager(editor.editor);
setupDiagnosticsIntegration(diagnosticsManager);

// Create output panel
const outputPane = layout.getOutputPane();
const outputPanel = createOutputPanelContent(outputPane);

// Run initial validation on page load
const initialContent = editor.getValue();
if (initialContent.trim()) {
  try {
    const ast = parse(initialContent);
    const warnings = validateAST(ast, initialContent);
    if (warnings.length > 0) {
      const diagnostics = warningsToDiagnostics(warnings);
      diagnosticsManager.setDiagnostics(diagnostics);
      eventBus.emit('validation:warnings', { warnings });
    }
  } catch (e: any) {
    const diagnostic = parseErrorToDiagnostic(e);
    diagnosticsManager.setDiagnostics([diagnostic]);
    eventBus.emit('parse:error', { error: e, message: e.message || String(e) });
  }
}

// Add live validation on editor changes (debounced)
let validationTimeout: number | undefined;
eventBus.on('editor:changed', ({ content }) => {
  if (validationTimeout) {
    clearTimeout(validationTimeout);
  }
  
  validationTimeout = window.setTimeout(() => {
    if (!content.trim()) {
      diagnosticsManager.clear();
      return;
    }
    
    try {
      const ast = parse(content);
      const warnings = validateAST(ast, content);
      
      if (warnings.length > 0) {
        const diagnostics = warningsToDiagnostics(warnings);
        diagnosticsManager.setDiagnostics(diagnostics);
      } else {
        diagnosticsManager.clear();
      }
    } catch (e: any) {
      const diagnostic = parseErrorToDiagnostic(e);
      diagnosticsManager.setDiagnostics([diagnostic]);
    }
  }, 500); // 500ms debounce
});

// Create control buttons (temporary - will be moved to toolbar module later)
const controlsDiv = document.createElement('div');
controlsDiv.style.padding = '10px';
controlsDiv.style.backgroundColor = '#2d2d2d';
controlsDiv.style.display = 'flex';
controlsDiv.style.gap = '10px';

const playBtn = document.createElement('button');
playBtn.textContent = '▶ Play';
playBtn.style.padding = '8px 16px';

const stopBtn = document.createElement('button');
stopBtn.textContent = '⏹ Stop';
stopBtn.style.padding = '8px 16px';

const statusDiv = document.createElement('div');
statusDiv.textContent = 'Ready';
statusDiv.style.padding = '8px';
statusDiv.style.marginLeft = 'auto';

controlsDiv.appendChild(playBtn);
controlsDiv.appendChild(stopBtn);
controlsDiv.appendChild(statusDiv);

// Insert controls before the layout
appContainer.insertBefore(controlsDiv, appContainer.firstChild);

// Validation function (from original main.ts)
function validateAST(ast: any, sourceCode?: string): Array<{ component: string; message: string; loc?: any }> {
  const warnings: Array<{ component: string; message: string; loc?: any }> = [];
  const lines = sourceCode ? sourceCode.split('\n') : [];
  const validTransforms = new Set(['oct', 'inst', 'rev', 'slow', 'fast', 'transpose', 'arp']);

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

  return warnings;
}

// Play button handler
playBtn.addEventListener('click', async () => {
  try {
    outputPanel.clearErrors();
    outputPanel.clearWarnings();
    statusDiv.textContent = 'Parsing...';
    
    const src = editor.getValue();
    eventBus.emit('parse:started', undefined);
    
    const ast = parse(src);
    eventBus.emit('parse:success', { ast });
    
    currentAST = ast;
    statusDiv.textContent = 'Resolving...';
    
    const warnings: Array<{ component: string; message: string; loc?: any }> = [];
    
    // Resolve imports if present
    let resolvedAST = ast;
    if ((ast as any).imports && (ast as any).imports.length > 0) {
      try {
        resolvedAST = await resolveImports(ast as any, {
          onWarn: (message: string, loc?: any) => {
            warnings.push({ component: 'import-resolver', message, loc });
          },
        });
      } catch (importErr: any) {
        const error = new Error(`Import failed: ${importErr.message || String(importErr)}`);
        eventBus.emit('parse:error', { error, message: error.message });
        statusDiv.textContent = 'Import failed';
        return;
      }
    }
    
    // Validate AST
    const sourceCode = editor.getValue();
    const validationWarnings = validateAST(resolvedAST, sourceCode);
    warnings.push(...validationWarnings);
    
    if (warnings.length > 0) {
      // Show warnings in Monaco editor
      const diagnostics = warningsToDiagnostics(warnings);
      diagnosticsManager.setDiagnostics(diagnostics);
      // Emit event for output panel
      eventBus.emit('validation:warnings', { warnings });
    } else {
      // Clear any existing warnings
      diagnosticsManager.clear();
    }
    
    // Resolve song
    const resolved = resolveSong(resolvedAST as any, { 
      onWarn: (w: any) => warnings.push(w) 
    });
    
    statusDiv.textContent = 'Playing...';
    
    // Create or reuse player
    if (!player) {
      player = new Player();
    }
    
    // Resume AudioContext
    if (player.ctx && typeof player.ctx.resume === 'function') {
      await player.ctx.resume();
    }
    
    // Start playback
    await player.playAST(resolved as any);
    eventBus.emit('playback:started', undefined);
    statusDiv.textContent = 'Playing';
    
  } catch (e: any) {
    console.error('[web-ui] Play error:', e);
    const error = e instanceof Error ? e : new Error(String(e));
    eventBus.emit('parse:error', { error, message: error.message });
    statusDiv.textContent = 'Error';
    
    // Show error in diagnostics
    const diagnostic = parseErrorToDiagnostic(e);
    diagnosticsManager.setDiagnostics([diagnostic]);
  }
});

// Stop button handler
stopBtn.addEventListener('click', () => {
  if (player) {
    player.stop();
    eventBus.emit('playback:stopped', undefined);
    statusDiv.textContent = 'Stopped';
  }
});

// Get initial content
function getInitialContent(): string {
  // Try to load from localStorage
  try {
    const saved = localStorage.getItem('beatbax-editor-content');
    if (saved) {
      return saved;
    }
  } catch (e) {
    console.warn('Failed to load saved content:', e);
  }
  
  // Default content
  return `chip gameboy

bpm 128
time 4

inst lead type=pulse1 duty=50 env=12,down
inst bass type=pulse2 duty=25 env=10,down

pat melody = C5 E5 G5 C6
pat bass_pat = C3 . G2 .

seq main = melody bass_pat

channel 1 => inst lead seq main
channel 2 => inst bass seq main:oct(-1)

play
`;
}

// Save content to localStorage
eventBus.on('editor:changed', ({ content }) => {
  try {
    localStorage.setItem('beatbax-editor-content', content);
  } catch (e) {
    console.warn('Failed to save content:', e);
  }
});

// Expose for debugging
(window as any).__beatbax = {
  editor,
  layout,
  diagnosticsManager,
  eventBus,
  player: () => player,
};

console.log('[web-ui] Phase 1 initialization complete ✓');
