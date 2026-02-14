import { parse } from '@beatbax/engine/parser';
import Player from '@beatbax/engine/audio/playback';
import { resolveSong, resolveImports } from '@beatbax/engine/song';

// Helper to format parse errors with file location information
function formatParseError(err: any, filename?: string): string {
  if (!err) return `Parse error: Unknown error`;

  const message = err.message || String(err);

  // Check if this is a Peggy parser error with location information
  if (err.location && err.location.start) {
    const line = err.location.start.line;
    const column = err.location.start.column;
    const prefix = filename ? filename : 'source';
    return `Parse error in ${prefix} at line ${line}, column ${column}: ${message}`;
  }

  // Fallback for other errors
  const prefix = filename ? ` in ${filename}` : '';
  return `Parse error${prefix}: ${message}`;
}

// Core demo wiring (adapted from demo/boot.ts)
console.log('[web-ui] main module loaded');
const fileInput = document.getElementById('file') as HTMLInputElement | null;
const srcArea = document.getElementById('src') as HTMLTextAreaElement | null;
const playBtn = document.getElementById('play') as HTMLButtonElement | null;
const stopBtn = document.getElementById('stop') as HTMLButtonElement | null;
const applyBtn = document.getElementById('apply') as HTMLButtonElement | null;
const exportWavBtn = document.getElementById('exportWav') as HTMLButtonElement | null;
const liveCheckbox = document.getElementById('live') as HTMLInputElement | null;
const status = document.getElementById('status') as HTMLElement | null;
const showHelpBtn = document.getElementById('showHelp') as HTMLButtonElement | null;
const helpPanel = document.getElementById('helpPanel') as HTMLDivElement | null;
const helpText = document.getElementById('helpText') as HTMLDivElement | null;
const closeHelpBtn = document.getElementById('closeHelp') as HTMLButtonElement | null;
const helpIcon = document.getElementById('helpIcon') as HTMLButtonElement | null;
const layoutEl = document.getElementById('layout') as HTMLDivElement | null;
const persistCheckbox = document.getElementById('persistHelp') as HTMLInputElement | null;
const warningsPanel = document.getElementById('warnings') as HTMLDivElement | null;
const warningsList = document.getElementById('warningsList') as HTMLDivElement | null;
const clearWarningsBtn = document.getElementById('clearWarnings') as HTMLButtonElement | null;
const errorsPanel = document.getElementById('errors') as HTMLDivElement | null;
const errorsList = document.getElementById('errorsList') as HTMLDivElement | null;
const clearErrorsBtn = document.getElementById('clearErrors') as HTMLButtonElement | null;
let player: any = null;
let currentAST: any = null;
let currentErrors: Array<{ message: string; loc?: any }> = []; // Track displayed errors to avoid duplicates

// Error display functions
function showErrors(errors: Array<{ message: string; loc?: any }>) {
  console.log('[web-ui] showErrors called with', errors.length, 'errors');

  if (!errorsPanel || !errorsList) {
    console.warn('[web-ui] Error elements not found in DOM');
    return;
  }
  if (errors.length === 0) {
    errorsPanel.style.display = 'none';
    currentErrors = [];
    return;
  }

  // Deduplicate - only add errors not already in currentErrors
  for (const newError of errors) {
    const isDuplicate = currentErrors.some(existing =>
      existing.message === newError.message &&
      existing.loc?.start?.line === newError.loc?.start?.line
    );

    if (!isDuplicate) {
      currentErrors.push(newError);

      // Add to DOM
      const div = document.createElement('div');
      div.style.marginBottom = '4px';

      let locStr = '';
      if (newError.loc && newError.loc.start) {
        const line = newError.loc.start.line;
        const col = newError.loc.start.column || 0;
        locStr = ` (line ${line}, col ${col})`;
      }

      div.textContent = `${newError.message}${locStr}`;
      errorsList.appendChild(div);
    }
  }

  errorsPanel.style.display = 'block';
}

function clearErrors() {
  if (errorsPanel) errorsPanel.style.display = 'none';
  if (errorsList) errorsList.innerHTML = '';
  currentErrors = [];
}

clearErrorsBtn?.addEventListener('click', clearErrors);

// Warning display functions
function showWarnings(warnings: Array<{ component: string; message: string; file?: string; loc?: any }>) {
  console.log('[web-ui] showWarnings called with', warnings.length, 'warnings');
  console.log('[web-ui] warningsPanel:', !!warningsPanel, 'warningsList:', !!warningsList);

  if (!warningsPanel || !warningsList) {
    console.warn('[web-ui] Warning elements not found in DOM');
    return;
  }
  if (warnings.length === 0) {
    warningsPanel.style.display = 'none';
    return;
  }

  warningsList.innerHTML = '';
  for (const w of warnings) {
    const div = document.createElement('div');
    div.style.marginBottom = '4px';

    let locStr = '';
    if (w.loc && w.loc.start) {
      const line = w.loc.start.line;
      const col = w.loc.start.column || 0;
      locStr = ` (line ${line}, col ${col})`;
    }

    div.textContent = `[${w.component}] ${w.message}${locStr}`;
    warningsList.appendChild(div);
  }

  console.log('[web-ui] Setting warningsPanel display to block');
  warningsPanel.style.display = 'block';
}

function clearWarnings() {
  if (warningsPanel) warningsPanel.style.display = 'none';
  if (warningsList) warningsList.innerHTML = '';
}

clearWarningsBtn?.addEventListener('click', clearWarnings);

// Validation function (similar to CLI)
function validateAST(ast: any): Array<{ component: string; message: string; loc?: any }> {
  const warnings: Array<{ component: string; message: string; loc?: any }> = [];

  // Valid transform names
  const validTransforms = new Set(['oct', 'inst', 'rev', 'slow', 'fast']);

  // Validate channels
  for (const ch of ast.channels || []) {
    // Check instrument references
    if (ch.inst && !ast.insts[ch.inst]) {
      warnings.push({
        component: 'validation',
        message: `Channel ${ch.id} references unknown inst '${ch.inst}'`,
        loc: ch.loc
      });
    }

    // Extract sequence names from channel and validate transforms
    const extractSeqNames = (channel: any): string[] => {
      const names: string[] = [];
      if (!channel || !channel.pat) return names;
      if (Array.isArray(channel.pat)) return []; // inline pattern tokens

      const rawTokens: string[] | undefined = (channel as any).seqSpecTokens;
      if (rawTokens && rawTokens.length > 0) {
        const joined = rawTokens.join(' ');
        for (const group of joined.split(',')) {
          const g = group.trim();
          if (!g) continue;
          if (g.indexOf('*') >= 0) {
            const m = g.match(/^(.+?)\s*\*\s*(\d+)$/);
            const itemRef = m ? m[1].trim() : g;
            const base = itemRef.split(':')[0];
            if (base) names.push(base);

            // Check transforms in the itemRef
            if (itemRef.indexOf(':') >= 0) {
              const transformParts = itemRef.split(':').slice(1);
              for (const transform of transformParts) {
                const transformName = transform.trim().split('(')[0];
                if (transformName && !validTransforms.has(transformName)) {
                  warnings.push({
                    component: 'transforms',
                    message: `Unknown transform '${transformName}' on '${g}'. Valid transforms: oct(±N), inst(name), rev, slow, fast. For repetition, use pattern*N syntax.`,
                    loc: ch.loc
                  });
                }
              }
            }
          } else {
            const parts = g.split(/\s+/).map((s: string) => s.trim()).filter(Boolean);
            for (const p of parts) {
              names.push(p.split(':')[0]);

              // Check transforms in each part
              if (p.indexOf(':') >= 0) {
                const transformParts = p.split(':').slice(1);
                for (const transform of transformParts) {
                  const transformName = transform.trim().split('(')[0];
                  if (transformName && !validTransforms.has(transformName)) {
                    warnings.push({
                      component: 'transforms',
                      message: `Unknown transform '${transformName}' on '${p}'. Valid transforms: oct(±N), inst(name), rev, slow, fast. For repetition, use pattern*N syntax.`,
                      loc: ch.loc
                    });
                  }
                }
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
        const mRep = g.match(/^(.+?)\s*\*\s*(\d+)$/);
        const itemRef = mRep ? mRep[1].trim() : g;
        const base = itemRef.split(':')[0];
        if (base) names.push(base);

        // Check transforms in string format
        if (itemRef.indexOf(':') >= 0) {
          const transformParts = itemRef.split(':').slice(1);
          for (const transform of transformParts) {
            const transformName = transform.trim().split('(')[0];
            if (transformName && !validTransforms.has(transformName)) {
              warnings.push({
                component: 'transforms',
                message: `Unknown transform '${transformName}' on '${g}'. Valid transforms: oct(±N), inst(name), rev, slow, fast. For repetition, use pattern*N syntax.`,
                loc: ch.loc
              });
            }
          }
        }
      }
      return names.filter(Boolean);
    };

    const seqNames = extractSeqNames(ch);
    for (const seqName of seqNames) {
      // Check both sequences and patterns (inline pattern lists use pattern names)
      if (!ast.seqs || !ast.seqs[seqName]) {
        // If not a sequence, check if it's a pattern (common mistake)
        if (ast.pats && ast.pats[seqName]) {
          warnings.push({
            component: 'validation',
            message: `Channel ${ch.id} references '${seqName}' as a sequence, but it's a pattern. Create a sequence first: 'seq myseq = ${seqName}' or use comma-separated patterns with channel directive.`,
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

  // Validate sequences - check pattern references
  if (ast.seqs) {
    for (const [seqName, items] of Object.entries(ast.seqs)) {
      if (!Array.isArray(items)) continue;
      
      for (const item of items as any[]) {
        if (item.name && !ast.pats?.[item.name]) {
          warnings.push({
            component: 'validation',
            message: `Sequence '${seqName}' references undefined pattern '${item.name}'`,
            loc: item.loc
          });
        }
      }
    }
  }

  return warnings;
}

// quick debug: report that DOM nodes were found
try {
  console.log('[web-ui] elements', {
    fileInput: !!fileInput,
    srcArea: !!srcArea,
    playBtn: !!playBtn,
    stopBtn: !!stopBtn,
    applyBtn: !!applyBtn
  });
} catch (e) {}

// Add a minimal click-only listener so we can confirm the Play button fires
playBtn?.addEventListener('click', () => {
  console.log('[web-ui] Play button clicked (debug handler)');
});

// Active indicator CSS
try {
  const styleId = 'beatbax-demo-indicator-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `\n.ch-ind-active { background: lime !important; box-shadow: 0 0 6px rgba(0,255,0,0.9) !important; border-color: #6f6 !important; }\n`;
    document.head.appendChild(s);
  }
} catch (e) {}

async function ensureMarked(): Promise<any> {
  if ((window as any).marked) return (window as any).marked;
  return new Promise((resolve, reject) => {
    try {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      s.async = true;
      s.onload = () => resolve((window as any).marked || null);
      s.onerror = (e) => reject(new Error('Failed to load marked from CDN'));
      document.head.appendChild(s);
    } catch (e) { reject(e); }
  });
}

async function loadHelpFromText(text: string) {
  if (!helpText) return;
  const lines = text.split(/\r?\n/).filter(l => /^\s*#/.test(l));
  const cleaned = lines.map(l => {
    const s = l.replace(/^\s*/, '');
    if (/^#{2,}\s/.test(s)) return s;
    return s.replace(/^#\s?/, '');
  }).join('\n');
  try {
    const mk = await ensureMarked();
    const parser = mk || (window as any).marked;
    if (parser && typeof parser.parse === 'function') {
      const html = parser.parse(cleaned || '');
      helpText.innerHTML = html || '<div>No help comments found in sample.</div>';
    } else {
      helpText.textContent = cleaned || 'No help comments found in sample.';
    }
  } catch (e) {
    helpText.textContent = cleaned || 'No help comments found in sample.';
  }
}

function showHelpPanel(visible: boolean) {
  if (!helpPanel || !layoutEl) return;
  if (visible) layoutEl.classList.add('help-open'); else layoutEl.classList.remove('help-open');
  const showBtn = document.getElementById('showHelp');
  if (showBtn) showBtn.textContent = visible ? 'Hide Help' : 'Show Help';
}

function applyPersistedShow() {
  try {
    const pref = localStorage.getItem('beatbax.helpPersist');
    if (persistCheckbox) persistCheckbox.checked = pref === 'true';
    const shouldShow = pref === 'true' ? true : false;
    showHelpPanel(shouldShow);
  } catch (e) { showHelpPanel(false); }
}

async function autoLoadFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    let song = params.get('song');
    const autoplay = params.get('autoplay');
    if (!song) song = '/songs/sample.bax';
    const resp = await fetch(song);
    if (!resp.ok) return;
    const t = await resp.text();
    if (srcArea) srcArea.value = t;
    try { await loadHelpFromText(t); applyPersistedShow(); } catch (e) {}
    try { const ast = parse(t); currentAST = ast; renderChannelControls(ast); } catch (e) {}
    if (autoplay === '1') playBtn?.click();
  } catch (e) { console.warn('autoLoadFromQuery failed', e); }
}

autoLoadFromQuery();

fileInput?.addEventListener('change', async (ev) => {
  const f = (ev as any).target.files[0];
  if (!f) return;
  const txt = await f.text();
  if (srcArea) srcArea.value = txt;
  try { const ast = parse(txt); currentAST = ast; renderChannelControls(ast); } catch (e) {}
});

document.getElementById('loadExample')?.addEventListener('click', async () => {
  try {
    const resp = await fetch('/songs/sample.bax');
    const t = await resp.text();
    if (srcArea) srcArea.value = t;
    try { await loadHelpFromText(t); applyPersistedShow(); } catch (e) {}
    try { const ast = parse(t); currentAST = ast; renderChannelControls(ast); } catch (e) {}
  } catch (e) { if (srcArea) srcArea.value = 'Could not load example from ../songs/sample.bax'; }
});

playBtn?.addEventListener('click', async () => {
  console.log('[web-ui] Play handler start');
  clearErrors();
  clearWarnings();
  const warnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];

  try {
    status && (status.textContent = 'Parsing...');
    const src = srcArea ? srcArea.value : '';
    console.log('[web-ui] source length', src.length);
    const ast = parse(src);
    console.log('[web-ui] parsed AST', ast && typeof ast === 'object' ? Object.keys(ast) : typeof ast);
    console.log('[web-ui] AST imports:', (ast as any).imports);
    console.log('[web-ui] AST instruments before resolve:', Object.keys((ast as any).insts || {}));
    console.log('[web-ui] source preview:\n', String(src).slice(0, 800));

    console.log('[web-ui] Calling resolveSong...');

    // Resolve imports first to get updated AST with all instruments
    let resolvedAST = ast;
    if ((ast as any).imports && (ast as any).imports.length > 0) {
      try {
        resolvedAST = await resolveImports(ast as any, {
          onWarn: (message: string, loc?: any) => {
            warnings.push({ component: 'import-resolver', message, loc });
          },
        });
        console.log('[web-ui] Imports resolved, instruments:', Object.keys((resolvedAST as any).insts || {}));
      } catch (importErr: any) {
        console.error('[web-ui] Import resolution failed:', importErr);
        // Import errors are critical - show in error panel
        showErrors([{ message: `Import failed: ${importErr.message || String(importErr)}` }]);
        status && (status.textContent = 'Failed');
        if (exportWavBtn) exportWavBtn.disabled = true;
        return; // Stop processing if import fails
      }
    }

    // Validate AST after imports are resolved (so instrument checks are accurate)
    const validationWarnings = validateAST(resolvedAST);
    warnings.push(...validationWarnings);

    const resolved = resolveSong(resolvedAST as any, { onWarn: (w: any) => warnings.push(w) });
    console.log('[web-ui] Resolved ISM channels=', (resolved as any).channels ? (resolved as any).channels.length : 0);
    console.log('[web-ui] Resolved AST instruments after resolve:', Object.keys((resolved as any).insts || {}));
    if ((resolved as any).channels) {
      for (const ch of (resolved as any).channels) {
        console.log('[web-ui] channel', ch.id, 'events=', (ch.events || ch.pat || []).length);
      }
    }

    // Show warnings if any
    showWarnings(warnings);

    currentAST = ast;
    status && (status.textContent = 'Starting AudioContext...');
    if (!player) player = new Player();
    (window as any).__beatbax_player = player;
    // Ensure AudioContext is resumed within user gesture
    try {
      if (player && player.ctx && typeof player.ctx.resume === 'function') {
        console.log('[web-ui] resuming AudioContext');
        await player.ctx.resume();
        console.log('[web-ui] AudioContext state after resume=', player.ctx.state);
      }
    } catch (e) { console.warn('resume failed', e); }
    // log scheduling events
    const prevHook = (player as any).onSchedule;
    (player as any).onSchedule = function (args: any) {
      try { console.log('[web-ui] onSchedule', args); } catch (e) {}
      try { if (typeof prevHook === 'function') prevHook(args); } catch (e) {}
    };
    attachScheduleHook(player);
    renderChannelControls(ast);
    console.log('[web-ui] calling player.playAST');
    if ((resolved as any).channels && (resolved as any).channels.length > 0) {
      await player.playAST(resolved as any);
    } else {
      console.warn('[web-ui] resolved ISM contains no channels — using fallback test AST to verify audio');
      const testAst: any = {
        chip: 'gameboy',
        bpm: 128,
        insts: { test: { type: 'pulse1', duty: 50, env: 'gb:12,down,1' } },
        channels: [{ id: 1, inst: 'test', pat: ['C5', '.', '.', '.'] }]
      };
      await player.playAST(testAst);
    }
    console.log('[web-ui] player.playAST returned');
    status && (status.textContent = 'Playing');
    if (exportWavBtn) exportWavBtn.disabled = false;
  } catch (e: any) {
    console.error('[web-ui] Play handler error', e);
    const errorMsg = formatParseError(e);
    // Show error prominently in errors panel
    showErrors([{ message: errorMsg }]);
    status && (status.textContent = 'Failed');
    if (exportWavBtn) exportWavBtn.disabled = true;
  }
});

stopBtn?.addEventListener('click', () => {
  try {
    const p = (window as any).__beatbax_player || player;
    if (p && typeof p.stop === 'function') p.stop();
    status && (status.textContent = 'Stopped');
  } catch (e) { console.error(e); status && (status.textContent = 'Error stopping playback'); }
});

applyBtn?.addEventListener('click', async () => {
  clearErrors();
  clearWarnings();
  const warnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];

  try {
    const p2 = (window as any).__beatbax_player || player;
    if (p2 && typeof p2.stop === 'function') p2.stop();
    status && (status.textContent = 'Applying...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
    console.log('[web-ui][apply] AST imports:', (ast as any).imports);
    console.log('[web-ui][apply] AST instruments before resolve:', Object.keys((ast as any).insts || {}));

    currentAST = ast;
    renderChannelControls(ast);
    if (!player) player = new Player();
    (window as any).__beatbax_player = player;
    try {
      if (player && player.ctx && typeof player.ctx.resume === 'function') {
        console.log('[web-ui] resuming AudioContext (apply)');
        await player.ctx.resume();
      }
    } catch (e) { console.warn('resume failed during apply', e); }
    attachScheduleHook(player);
    console.log('[web-ui][apply] Calling resolveSong...');

    // Resolve imports first to get updated AST with all instruments
    let resolvedAST = ast;
    if ((ast as any).imports && (ast as any).imports.length > 0) {
      try {
        resolvedAST = await resolveImports(ast as any, {
          onWarn: (message: string, loc?: any) => {
            warnings.push({ component: 'import-resolver', message, loc });
          },
        });
      } catch (importErr: any) {
        console.error('[web-ui][apply] Import resolution failed:', importErr);
        // Import errors are critical - show in error panel
        showErrors([{ message: `Import failed: ${importErr.message || String(importErr)}` }]);
        status && (status.textContent = 'Failed');
        if (exportWavBtn) exportWavBtn.disabled = true;
        return; // Stop processing if import fails
      }
    }

    // Validate AST after imports are resolved
    const validationWarnings = validateAST(resolvedAST);
    warnings.push(...validationWarnings);

    const resolved = resolveSong(resolvedAST as any, { onWarn: (w: any) => warnings.push(w) });
    console.log('[web-ui][apply] Resolved instruments:', Object.keys((resolved as any).insts || {}));

    // Show warnings if any
    showWarnings(warnings);

    console.log('[web-ui] apply: calling player.playAST');
    await player.playAST(resolved as any);
    status && (status.textContent = 'Playing');
    if (exportWavBtn) exportWavBtn.disabled = false;
  } catch (e: any) {
    console.error(e);
    const errorMsg = formatParseError(e);
    showErrors([{ message: errorMsg }]);
    status && (status.textContent = 'Failed');
    if (exportWavBtn) exportWavBtn.disabled = true;
  }
});

exportWavBtn?.addEventListener('click', async () => {
  try {
    status && (status.textContent = 'Rendering WAV...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
  // Note: WAV export doesn't support imports yet - would need to call resolveImports first
  const resolved = resolveSong(ast as any);
    for (const ch of resolved.channels || []) {
      if (ch.events && ch.events.length > maxTicks) {
        maxTicks = ch.events.length;
      }
    }
    const bpm = (ast as any).bpm || 120;
    const secondsPerBeat = 60 / bpm;
    const tickSeconds = secondsPerBeat / 4;
    const duration = Math.ceil(maxTicks * tickSeconds) + 1;

    // Create an offline context
    const OfflineAudioContextCtor = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
    const sampleRate = 44100;
    const lengthInSamples = Math.ceil(duration * sampleRate);
    const offlineCtx = new OfflineAudioContextCtor(2, lengthInSamples, sampleRate);

    // Create a player
    const offlinePlayer = new Player(offlineCtx, { buffered: false });

    // Manually process scheduler queue after playAST schedules events
    const scheduler = (offlinePlayer as any).scheduler;
    if (scheduler && scheduler.queue) {
      // Override tick to process ALL events immediately
      scheduler.tick = function() {
        // Process all queued events regardless of time
        while ((this as any).queue && (this as any).queue.length > 0) {
          const ev = (this as any).queue.shift();
          try {
            ev.fn();
          } catch (e) {
            console.error('Scheduled function error', e);
          }
        }
      };
    }

    // Play the AST (this schedules all events)
    await offlinePlayer.playAST(resolved);

    // Force process all scheduled events
    if (scheduler && typeof scheduler.tick === 'function') {
      scheduler.tick();
    }

    // Render to buffer
    const audioBuffer = await offlineCtx.startRendering();

    // Convert to WAV
    const wav = audioBufferToWav(audioBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beatbax-browser-export.wav';
    a.click();
    URL.revokeObjectURL(url);

    status && (status.textContent = 'WAV exported!');
  } catch (e: any) {
    console.error('Export error:', e);
    const errorMsg = formatParseError(e);
    status && (status.textContent = errorMsg);
  }
});

// Helper to convert AudioBuffer to WAV file
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const data = new Float32Array(buffer.length * numChannels);
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      data[i * numChannels + ch] = buffer.getChannelData(ch)[i];
    }
  }

  const dataLength = data.length * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function debounce(fn: (...args: any[]) => void, wait = 300) {
  let t: any = null;
  return (...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

const liveApply = debounce(async () => {
  if (!liveCheckbox || !liveCheckbox.checked) return;
  clearErrors();
  clearWarnings();
  const warnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];

  try {
    if (player) player.stop();
    status && (status.textContent = 'Applying (live)...');
    const src = srcArea ? srcArea.value : '';
    const ast = parse(src);
    console.log('[web-ui][liveApply] AST imports:', (ast as any).imports);
    console.log('[web-ui][liveApply] AST instruments before resolve:', Object.keys((ast as any).insts || {}));

    currentAST = ast;
    renderChannelControls(ast);
    if (!player) player = new Player();
    (window as any).__beatbax_player = player;
    try {
      if (player && player.ctx && typeof player.ctx.resume === 'function') {
        console.log('[web-ui] resuming AudioContext (liveApply)');
        await player.ctx.resume();
      }
    } catch (e) { console.warn('resume failed during live apply', e); }
    attachScheduleHook(player);
    console.log('[web-ui][liveApply] Calling resolveSong...');

    // Resolve imports first to get updated AST with all instruments
    let resolvedAST = ast;
    if ((ast as any).imports && (ast as any).imports.length > 0) {
      try {
        resolvedAST = await resolveImports(ast as any, {
          onWarn: (message: string, loc?: any) => {
            warnings.push({ component: 'import-resolver', message, loc });
          },
        });
      } catch (importErr: any) {
        console.error('[web-ui][liveApply] Import resolution failed:', importErr);
        // Import errors are critical - show in error panel
        showErrors([{ message: `Import failed: ${importErr.message || String(importErr)}` }]);
        status && (status.textContent = 'Live Failed');
        if (exportWavBtn) exportWavBtn.disabled = true;
        return; // Stop processing if import fails
      }
    }

    // Validate AST after imports are resolved
    const validationWarnings = validateAST(resolvedAST);
    warnings.push(...validationWarnings);

    const resolved = resolveSong(resolvedAST as any, { onWarn: (w: any) => warnings.push(w) });
    console.log('[web-ui][liveApply] Resolved instruments:', Object.keys((resolved as any).insts || {}));

    // Show warnings if any
    showWarnings(warnings);

    console.log('[web-ui] liveApply: calling player.playAST');
    await player.playAST(resolved as any);
    status && (status.textContent = 'Playing (live)');
    if (exportWavBtn) exportWavBtn.disabled = false;
  } catch (e: any) {
    console.error(e);
    const errorMsg = e && e.message ? e.message : String(e);
    showErrors([{ message: errorMsg }]);
    status && (status.textContent = 'Live Failed');
    if (exportWavBtn) exportWavBtn.disabled = true;
  }
}, 350);

srcArea?.addEventListener('input', () => { if (liveCheckbox && liveCheckbox.checked) liveApply(); });

function renderChannelControls(ast: any) {
  const container = document.getElementById('channelControls') as HTMLDivElement | null;
  if (!container) return;
  container.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Channels:';
  container.appendChild(title);
  for (const ch of (ast.channels || [])) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.marginTop = '6px';
    const indicator = document.createElement('div');
    indicator.id = `ch-ind-${ch.id}`;
    indicator.style.width = '12px';
    indicator.style.height = '12px';
    indicator.style.borderRadius = '6px';
    indicator.style.background = 'transparent';
    indicator.style.border = '1px solid #666';
    indicator.style.marginRight = '6px';
    indicator.style.transition = 'background 120ms ease';
    const label = document.createElement('div');
    label.textContent = `Channel ${ch.id}`;
    const count = document.createElement('div');
    count.id = `ch-count-${ch.id}`;
    count.textContent = '0';
    count.style.minWidth = '24px';
    count.style.textAlign = 'center';
    count.style.marginLeft = '6px';
    const mute = document.createElement('button');
    mute.textContent = 'Mute';
    const solo = document.createElement('button');
    solo.textContent = 'Solo';
    mute.addEventListener('click', () => {
      if (!player) player = new Player();
      player.toggleChannelMute(ch.id);
      updateButtons();
    });
    solo.addEventListener('click', () => {
      if (!player) player = new Player();
      player.toggleChannelSolo(ch.id);
      updateButtons();
    });
    row.appendChild(indicator);
    row.appendChild(label);
    const bpmEl = document.createElement('div');
    bpmEl.id = `ch-bpm-${ch.id}`;
    bpmEl.style.minWidth = '64px';
    bpmEl.style.textAlign = 'right';
    bpmEl.style.marginLeft = '8px';
    const masterBpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : 120;
    const effBpm = (typeof (ch as any).speed === 'number') ? Math.round(masterBpm * (ch as any).speed) : masterBpm;
    bpmEl.textContent = `BPM: ${effBpm}`;
    row.appendChild(bpmEl);
    row.appendChild(count);
    row.appendChild(mute);
    row.appendChild(solo);
    container.appendChild(row);

    function updateButtons() {
      const isMuted = player && player.muted && player.muted.has(ch.id);
      const isSolo = player && player.solo === ch.id;
      mute.textContent = isMuted ? 'Unmute' : 'Mute';
      solo.textContent = isSolo ? 'Unsolo' : 'Solo';
      if (player && player.solo !== null && player.solo !== ch.id) row.style.opacity = '0.5'; else row.style.opacity = '1';
      try {
        const b = document.getElementById(`ch-bpm-${ch.id}`);
        if (b) {
          const master = (ast && typeof ast.bpm === 'number') ? ast.bpm : 120;
          const effective = (typeof (ch as any).speed === 'number') ? Math.round(master * (ch as any).speed) : master;
          b.textContent = `BPM: ${effective}`;
        }
      } catch (e) {}
    }
    updateButtons();
  }
}

function attachScheduleHook(p: any) {
  if (!p) return;
  const prev = (p as any).onSchedule;
  (p as any).onSchedule = (args: { chId: number; inst?: any; token?: string; time?: number; dur?: number }) => {
    try {
      // preserve previous hook
      try { if (typeof prev === 'function') prev(args); } catch (_) {}
      const token = (args && args.token) ? String(args.token) : '';
      let shouldLight = false;
      if (token) {
        const t = token.trim();
        if (t === '.' || /^inst\(/i.test(t) || /^rest$/i.test(t)) shouldLight = false; else shouldLight = true;
      } else if (args && args.inst && args.inst.type) {
        shouldLight = /pulse|wave|noise/i.test(String(args.inst.type));
      }
      if (!shouldLight) return;
      const el = document.getElementById(`ch-ind-${args.chId}`);
      if (!el) return;
      el.classList.add('ch-ind-active');
      setTimeout(() => { try { el.classList.remove('ch-ind-active'); } catch (e) {} }, 180);
      try {
        const c = document.getElementById(`ch-count-${args.chId}`);
        if (c) {
          const n = parseInt(c.textContent || '0', 10) || 0;
          c.textContent = String(n + 1);
        }
      } catch (e) {}
    } catch (e) {}
  };
}

loadHelpFromText('').then(() => applyPersistedShow()).catch(() => {});

