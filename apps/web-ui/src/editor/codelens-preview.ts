/**
 * CodeLens Pattern & Instrument Preview
 *
 * Registers a Monaco CodeLens provider for the 'beatbax' language that adds
 * "▶ Preview <name>" / "⬛ Stop  <name>" inline actions above every `pat` and
 * `inst` definition line.
 *
 * Pattern instrument resolution priority:
 *   1. First inline `inst` token inside the pattern's own event list
 *   2. First channel whose seq/pat references this pattern (borrows its inst)
 *   3. Fallback: the first declared instrument in the file
 *
 * Instrument preview plays a fixed ascending scale: C3 C4 C5 C6 C7, choosing
 * the correct Game Boy channel (1=pulse1, 2=pulse2, 3=wave, 4=noise) from the
 * instrument's `type` field so the right APU channel is used.
 *
 * Clicking "▶ Preview" plays the pattern or instrument in isolation.
 * Clicking "⬛ Stop" (shown only while that item is previewing) stops it.
 * Only one preview plays at a time; starting a new one stops the previous.
 * The preview also auto-stops once the estimated duration elapses.
 */

import * as monaco from 'monaco-editor';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import type { EventBus } from '../utils/event-bus';

// ---------------------------------------------------------------------------
// Instrument resolution
// ---------------------------------------------------------------------------

function resolvePreviewInstrument(patternName: string, ast: any): string | null {
  // 1. First inline `inst` event inside the pattern's structured event list
  const events: any[] = ast.patternEvents?.[patternName] ?? [];
  for (const ev of events) {
    if (ev.kind === 'inline-inst' && ev.name) return ev.name as string;
  }

  // 2. First channel that references this pattern (directly or via a named seq)
  for (const ch of (ast.channels ?? []) as any[]) {
    if (!ch.inst) continue;

    // Prefer parser-provided `seqSpecTokens` which preserve the original
    // sequence/pattern references. These are the most reliable source for
    // determining whether this channel references `patternName`.
    const seqSpec: string[] | undefined = (ch as any).seqSpecTokens;
    if (Array.isArray(seqSpec) && ast.seqs) {
      for (const seqToken of seqSpec) {
        const seqName = (seqToken || '').split(':')[0].trim();
        const seqItems: any[] = ast.seqs[seqName] ?? [];
        const refsPattern = seqItems.some((item: any) => {
          const name = typeof item === 'string' ? item.split(':')[0].trim() : (item?.name ?? '');
          return name === patternName;
        });
        if (refsPattern) return ch.inst as string;
      }
    }

    // If the parser left a raw string in `pat` (e.g. a single pattern/seq
    // reference), check that too. Do NOT rely on `Array.isArray(ch.pat)` as
    // the parser often normalizes that into expanded token arrays.
    if (typeof ch.pat === 'string' && ast.seqs) {
      if (ch.pat.split(':')[0].trim() === patternName) return ch.inst as string;
      const seqTokens = ch.pat.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean);
      for (const seqToken of seqTokens) {
        const seqName = seqToken.split(':')[0].trim();
        const seqItems: any[] = ast.seqs[seqName] ?? [];
        const refsPattern = seqItems.some((item: any) => {
          const name = typeof item === 'string' ? item.split(':')[0].trim() : (item?.name ?? '');
          return name === patternName;
        });
        if (refsPattern) return ch.inst as string;
      }
    }
  }

  // 3. Fallback: first declared instrument in the file
  const first = Object.keys(ast.insts ?? {})[0];
  return first ?? null;
}

// ---------------------------------------------------------------------------
// Preview playback
// ---------------------------------------------------------------------------

interface PreviewState {
  player: Player;
  /** Namespaced key: 'pat:<name>', 'loop:<name>', or 'inst:<name>' */
  key: string;
  stopTimer: number;
  /** Set on loop previews; call to prevent the next loop iteration. */
  cancelLoop?: () => void;
}

/** Map instrument type → Game Boy channel id (1-4). */
function instChannelId(instName: string, ast: any): number {
  switch ((ast.insts?.[instName]?.type ?? '').toLowerCase()) {
    case 'pulse2': return 2;
    case 'wave':   return 3;
    case 'noise':  return 4;
    default:       return 1;
  }
}

async function startPatternPreview(
  patternName: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const instName = resolvePreviewInstrument(patternName, rawAst);
  if (!instName) return null;

  // Minimal single-channel AST so the resolver only expands this one pattern
  const previewAst = {
    ...rawAst,
    channels: [{ id: 1, inst: instName, pat: patternName }],
    play: { auto: false },
  };

  let songModel: any;
  try {
    songModel = resolveSong(previewAst as any);
  } catch {
    return null;
  }

  let player: Player;
  try {
    player = new Player(_sharedCtx ?? undefined);
    await player.playAST(songModel as any);
  } catch {
    return null;
  }

  const bpm: number = rawAst.bpm ?? 120;
  const stepsPerBar: number = rawAst.stepsPerBar ?? rawAst.time ?? 4;
  const rawTokens: string[] = rawAst.pats?.[patternName] ?? [];
  const barDurationMs = (60_000 / bpm) * stepsPerBar;
  const barsNeeded = Math.max(1, Math.ceil(rawTokens.length / stepsPerBar));
  const durationMs = barDurationMs * barsNeeded + 500; // 0.5 s decay tail

  const stopTimer = window.setTimeout(() => {
    try { player.stop(); } catch (_e) { /* ignore */ }
    onDone();
  }, durationMs);

  player.onComplete = () => {
    clearTimeout(stopTimer);
    onDone();
  };

  return { player, key: `pat:${patternName}`, stopTimer };
}

// ---------------------------------------------------------------------------
// Sequence preview
// ---------------------------------------------------------------------------

function resolveSeqInstrument(seqName: string, ast: any): string | null {
  // 1. First channel that directly references this sequence. Channels may
  // expose the raw RHS as `seqSpecTokens` (array) or as `pat` (string) when
  // the parser didn't create a dedicated `seq` property — check both.
  for (const ch of (ast.channels ?? []) as any[]) {
    if (!ch.inst) continue;

    const seqSpec: string[] | undefined = (ch as any).seqSpecTokens;
    if (Array.isArray(seqSpec)) {
      for (const token of seqSpec) {
        const name = (token || '').split(':')[0].trim();
        if (name === seqName) return ch.inst as string;
      }
    }

    if (typeof ch.pat === 'string') {
      const tokens = ch.pat.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean);
      for (const token of tokens) {
        const name = token.split(':')[0].trim();
        if (name === seqName) return ch.inst as string;
      }
    }
  }

  // 2. Fallback: first declared instrument
  const first = Object.keys(ast.insts ?? {})[0];
  return first ?? null;
}

/** Total step count across all patterns referenced in a seq, for duration estimation. */
function seqTotalSteps(seqName: string, ast: any): number {
  const items: any[] = ast.seqs?.[seqName] ?? [];
  let total = 0;
  for (const item of items) {
    const patName = typeof item === 'string' ? item.split(':')[0].trim() : (item?.name ?? '');
    const tokens: string[] = ast.pats?.[patName] ?? [];
    total += tokens.length;
  }
  return Math.max(1, total);
}

async function startSeqPreview(
  seqName: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const instName = resolveSeqInstrument(seqName, rawAst);
  if (!instName) return null;

  const previewAst = {
    ...rawAst,
    channels: [{ id: 1, inst: instName, pat: seqName }],
    play: { auto: false },
  };

  let songModel: any;
  try {
    songModel = resolveSong(previewAst as any);
  } catch {
    return null;
  }

  let player: Player;
  try {
    player = new Player(_sharedCtx ?? undefined);
    await player.playAST(songModel as any);
  } catch {
    return null;
  }

  const bpm: number = rawAst.bpm ?? 120;
  const stepsPerBar: number = rawAst.stepsPerBar ?? rawAst.time ?? 4;
  const totalSteps = seqTotalSteps(seqName, rawAst);
  const barDurationMs = (60_000 / bpm) * stepsPerBar;
  const barsNeeded = Math.max(1, Math.ceil(totalSteps / stepsPerBar));
  const durationMs = barDurationMs * barsNeeded + 500;

  const stopTimer = window.setTimeout(() => {
    try { player.stop(); } catch (_e) { /* ignore */ }
    onDone();
  }, durationMs);

  player.onComplete = () => {
    clearTimeout(stopTimer);
    onDone();
  };

  return { player, key: `seq:${seqName}`, stopTimer };
}

// Notes shown as individual clickable buttons above each `inst` line.
const INST_PREVIEW_NOTES = ['C3', 'C4', 'C5', 'C6', 'C7'];

/** Play a single note with the named instrument; auto-stops after the note decays. */
async function startInstNotePreview(
  instName: string,
  note: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const channelId = instChannelId(instName, rawAst);

  const previewAst = {
    chip:  rawAst.chip ?? 'gameboy',
    bpm:   60,   // 1 beat = 1 s at 60 BPM — gives envelope plenty of time
    insts: rawAst.insts,
    pats:  { __inst_note__: [note] },
    seqs:  {},
    channels: [{ id: channelId, inst: instName, pat: '__inst_note__' }],
    play: { auto: false },
  };

  let songModel: any;
  try {
    songModel = resolveSong(previewAst as any);
  } catch {
    return null;
  }

  let player: Player;
  try {
    player = new Player(_sharedCtx ?? undefined);
    await player.playAST(songModel as any);
  } catch {
    return null;
  }

  // Safety fallback: 2 s is more than enough for any GB envelope to decay
  const stopTimer = window.setTimeout(() => {
    try { player.stop(); } catch (_e) { /* ignore */ }
    onDone();
  }, 2000);

  player.onComplete = () => {
    clearTimeout(stopTimer);
    onDone();
  };

  return { player, key: `inst-note:${instName}:${note}`, stopTimer };
}
// ---------------------------------------------------------------------------
// Module-level command bridge
// Monaco commands are registered globally; we delegate to the active instance
// via these module-level refs (only one instance is ever created in main.ts).
// ---------------------------------------------------------------------------

let _previewTrigger: ((patternName: string) => void) | null = null;
let _loopTrigger: ((patternName: string) => void) | null = null;
let _seqPreviewTrigger: ((seqName: string) => void) | null = null;
let _seqLoopTrigger: ((seqName: string) => void) | null = null;
let _instNotePreviewTrigger: ((instName: string, note: string) => void) | null = null;
let _stopTrigger: (() => void) | null = null;
let _commandsRegistered = false;

// ---------------------------------------------------------------------------
// Shared AudioContext
//
// Browsers auto-suspend a new AudioContext until .resume() is called from
// within a user-gesture handler. We create and resume the context
// SYNCHRONOUSLY at the start of each command handler (before any awaits) so
// the gesture token is still live. The same context is reused for every
// playback instance via Player(ctx) — no per-call context churn.
// ---------------------------------------------------------------------------
let _sharedCtx: any = null;

function ensureAudioCtxReady(): void {
  const Ctor = typeof window !== 'undefined'
    ? ((window as any).AudioContext ?? (window as any).webkitAudioContext)
    : null;
  if (!Ctor) return;
  if (!_sharedCtx) _sharedCtx = new Ctor();
  // Synchronous resume — caller MUST be inside a user-gesture handler.
  // Call `resume()` as fire-and-forget but handle rejection to avoid
  // unhandled Promise rejections and lints. The call remains synchronous
  // from the caller's perspective (no await) so it must be inside a
  // user-gesture handler.
  if (_sharedCtx.state === 'suspended') void _sharedCtx.resume().catch((err: any) => {
    // Non-fatal; log for diagnostics. Avoid throwing.
    // eslint-disable-next-line no-console
    console.warn('AudioContext.resume() failed', err);
  });
}

function ensureCommandsRegistered(): void {
  if (_commandsRegistered) return;
  _commandsRegistered = true;
  monaco.editor.registerCommand('beatbax.previewPattern', (_acc: any, patternName: string) => {
    _previewTrigger?.(patternName);
  });
  monaco.editor.registerCommand('beatbax.loopPattern', (_acc: any, patternName: string) => {
    _loopTrigger?.(patternName);
  });
  monaco.editor.registerCommand('beatbax.previewSeq', (_acc: any, seqName: string) => {
    _seqPreviewTrigger?.(seqName);
  });
  monaco.editor.registerCommand('beatbax.loopSeq', (_acc: any, seqName: string) => {
    _seqLoopTrigger?.(seqName);
  });
  monaco.editor.registerCommand('beatbax.previewInstNote', (_acc: any, instName: string, note: string) => {
    _instNotePreviewTrigger?.(instName, note);
  });
  monaco.editor.registerCommand('beatbax.stopPreview', (_acc: any) => {
    _stopTrigger?.();
  });
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

export function setupCodeLensPreview(
  _editor: monaco.editor.IStandaloneCodeEditor,
  eventBus: EventBus,
  getSource: () => string,
): void {
  ensureCommandsRegistered();

  let hasValidParse = false;
  let previewState: PreviewState | null = null;

  // Simple change-event emitter for the CodeLens provider to subscribe to
  type ProviderListener = (e: any) => any;
  let changeListeners: ProviderListener[] = [];
  // `notifyChange` fires listeners with the provider instance (IEvent<this> contract)
  let providerInstance: monaco.languages.CodeLensProvider;
  const notifyChange = () => changeListeners.forEach(l => l(providerInstance));

  // ── Stop any running preview ──────────────────────────────────────────────
  function stopPreview(): void {
    if (!previewState) return;
    clearTimeout(previewState.stopTimer);
    previewState.cancelLoop?.();
    try { previewState.player.stop(); } catch (_e) { /* ignore */ }
    previewState = null;
    notifyChange();
  }

  // ── Wire module-level command bridges to this instance ──────────────────
  _previewTrigger = async (patternName: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    if (previewState?.key === `pat:${patternName}`) { stopPreview(); return; }
    stopPreview();
    let rawAst: any;
    try { rawAst = parse(getSource()); } catch { return; }
    const state = await startPatternPreview(patternName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    previewState = state;
    notifyChange();
  };

  _instNotePreviewTrigger = async (instName: string, note: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    stopPreview(); // always stop current note and restart (allows re-clicking same note)
    let rawAst: any;
    try { rawAst = parse(getSource()); } catch { return; }
    const state = await startInstNotePreview(instName, note, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    previewState = state;
    notifyChange();
  };

  _loopTrigger = async (patternName: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    if (previewState?.key === `loop:${patternName}`) { stopPreview(); return; }
    stopPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    // Each iteration re-parses the source so live edits are picked up.
    async function playNext(): Promise<void> {
      if (cancelled) return;
      let rawAst: any;
      try { rawAst = parse(getSource()); } catch { return; }
      // One-shot guard prevents double-fire if both timer and onComplete fire.
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled) return;
        fired = true;
        void playNext();
      };
      const state = await startPatternPreview(patternName, rawAst, onIterationDone);
      if (!state || cancelled) return;
      state.key = `loop:${patternName}`;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _seqPreviewTrigger = async (seqName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `seq:${seqName}`) { stopPreview(); return; }
    stopPreview();
    let rawAst: any;
    try { rawAst = parse(getSource()); } catch { return; }
    const state = await startSeqPreview(seqName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    previewState = state;
    notifyChange();
  };

  _seqLoopTrigger = async (seqName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `seq-loop:${seqName}`) { stopPreview(); return; }
    stopPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    async function playNext(): Promise<void> {
      if (cancelled) return;
      let rawAst: any;
      try { rawAst = parse(getSource()); } catch { return; }
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled) return;
        fired = true;
        void playNext();
      };
      const state = await startSeqPreview(seqName, rawAst, onIterationDone);
      if (!state || cancelled) return;
      state.key = `seq-loop:${seqName}`;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _stopTrigger = () => stopPreview();

  // ── EventBus subscriptions ────────────────────────────────────────────────
  eventBus.on('parse:success', () => { hasValidParse = true;  notifyChange(); });
  eventBus.on('parse:error',   () => { hasValidParse = false; stopPreview(); });
  eventBus.on('playback:started', () => stopPreview());

  // ── Register CodeLens provider ────────────────────────────────────────────
  providerInstance = {
    onDidChange(
      listener: ProviderListener,
      _thisArgs?: any,
      _disposables?: monaco.IDisposable[],
    ): monaco.IDisposable {
      changeListeners.push(listener);
      return { dispose: () => { changeListeners = changeListeners.filter(l => l !== listener); } };
    },

    provideCodeLenses(model): monaco.languages.CodeLensList {
      if (!hasValidParse) return { lenses: [], dispose: () => {} };

      const lenses: monaco.languages.CodeLens[] = [];
      const lineCount = model.getLineCount();

      for (let ln = 1; ln <= lineCount; ln++) {
        const line = model.getLineContent(ln);

        // ── pat definitions ──────────────────────────────────────────────
        const patMatch = line.match(/^\s*pat\s+([A-Za-z0-9_-]+)\s*=/);
        if (patMatch) {
          const patternName = patMatch[1];
          const activeKey = previewState?.key;
          const isActive = activeKey === `pat:${patternName}` || activeKey === `loop:${patternName}`;
          if (isActive) {
            const isLooping = activeKey === `loop:${patternName}`;
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-pat-stop-${patternName}`,
              command: { id: 'beatbax.stopPreview', title: isLooping ? '⬛ Stop  ↺' : '⬛ Stop', arguments: [] },
            });
          } else {
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-pat-preview-${patternName}`,
              command: { id: 'beatbax.previewPattern', title: '▶ Preview', arguments: [patternName] },
            });
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-pat-loop-${patternName}`,
              command: { id: 'beatbax.loopPattern', title: '↺ Loop', arguments: [patternName] },
            });
          }
          continue;
        }

        // ── seq definitions ──────────────────────────────────────────────
        const seqMatch = line.match(/^\s*seq\s+([A-Za-z0-9_-]+)\s*=/);
        if (seqMatch) {
          const seqName = seqMatch[1];
          const activeKey = previewState?.key;
          const isActive = activeKey === `seq:${seqName}` || activeKey === `seq-loop:${seqName}`;
          if (isActive) {
            const isLooping = activeKey === `seq-loop:${seqName}`;
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-seq-stop-${seqName}`,
              command: { id: 'beatbax.stopPreview', title: isLooping ? '⬛ Stop  ↺' : '⬛ Stop', arguments: [] },
            });
          } else {
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-seq-preview-${seqName}`,
              command: { id: 'beatbax.previewSeq', title: '▶ Preview', arguments: [seqName] },
            });
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-seq-loop-${seqName}`,
              command: { id: 'beatbax.loopSeq', title: '↺ Loop', arguments: [seqName] },
            });
          }
          continue;
        }

        // ── inst definitions — one clickable lens per preview note ─────────
        const instMatch = line.match(/^\s*inst\s+([A-Za-z0-9_-]+)\s+/);
        if (instMatch) {
          const instName = instMatch[1];
          for (const note of INST_PREVIEW_NOTES) {
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-inst-${instName}-${note}`,
              command: { id: 'beatbax.previewInstNote', title: note, arguments: [instName, note] },
            });
          }
        }
      }

      return { lenses, dispose: () => {} };
    },

    resolveCodeLens(_model, codeLens): monaco.languages.CodeLens {
      return codeLens;
    },
  };
  monaco.languages.registerCodeLensProvider('beatbax', providerInstance);
}
