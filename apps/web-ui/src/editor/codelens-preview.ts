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

/** Map instrument type → channel id (1-5). Channel 5 is the NES DMC channel. */
function instChannelId(instName: string, ast: any): number {
  switch ((ast.insts?.[instName]?.type ?? '').toLowerCase()) {
    case 'pulse2': return 2;
    case 'wave':   return 3;
    case 'noise':  return 4;
    case 'dmc':    return 5;
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
    channels: [{ id: instChannelId(instName, rawAst), inst: instName, pat: patternName }],
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
    channels: [{ id: instChannelId(instName, rawAst), inst: instName, pat: seqName }],
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
// Effect preview
// ---------------------------------------------------------------------------

/**
 * Picks the best instrument to demonstrate an effect:
 * pulse1 > pulse2 > wave > noise (prefer melodic channels).
 * For sweep effects, pulse1 is required (hardware sweep lives on ch1 only).
 */
function resolveEffectPreviewInstrument(ast: any, preferType?: string): string | null {
  const insts = Object.entries(ast.insts ?? {}) as [string, any][];
  const order = preferType
    ? [preferType, 'pulse1', 'pulse2', 'wave', 'noise'].filter((v, i, a) => a.indexOf(v) === i)
    : ['pulse1', 'pulse2', 'wave', 'noise'];
  for (const typePref of order) {
    const found = insts.find(([, v]) => (v.type ?? '').toLowerCase() === typePref);
    if (found) return found[0];
  }
  const first = Object.keys(ast.insts ?? {})[0];
  return first ?? null;
}

/**
 * Flat (non-decaying) GB-style envelope: max volume held for the full note
 * duration. Used for effect previews that require sustained sound to be
 * clearly audible (vib, trem, port, bend, sweep, volSlide, echo).
 */
const SUSTAIN_ENVELOPE = { mode: 'gb', initial: 15, direction: 'flat', period: 0 } as const;

/**
 * Returns a copy of `ast.insts` with the named instrument's envelope patched
 * to SUSTAIN_ENVELOPE so the note is clearly held for the full duration.
 * All other instrument properties are preserved unchanged.
 */
function patchInstForSustain(insts: Record<string, any>, instName: string): Record<string, any> {
  return {
    ...insts,
    [instName]: { ...insts[instName], env: SUSTAIN_ENVELOPE },
  };
}

/**
 * Returns true for effect types whose audio is only audible (or most clearly
 * heard) on a fully sustained, non-decaying note.
 */
function effectNeedsSustain(type: string): boolean {
  return ['vib', 'trem', 'port', 'bend', 'sweep', 'volSlide', 'echo'].includes(type);
}

// ---------------------------------------------------------------------------
// Effect-aware token generation
// ---------------------------------------------------------------------------

/**
 * Resolve the primary/dominant built-in effect type for a name.
 * For user-defined presets, inspect the RHS string to find the first effect
 * keyword; for built-ins, return the name directly.
 */
function resolveEffectType(effectName: string, ast: any): string {
  const BUILTINS = ['vib', 'port', 'arp', 'volSlide', 'trem', 'pan', 'echo', 'retrig', 'sweep', 'bend'];
  if (BUILTINS.includes(effectName)) return effectName;
  const rhs: string | undefined = ast.effects?.[effectName];
  if (rhs) {
    const m = rhs.match(/^([a-zA-Z][a-zA-Z0-9_-]*)/);
    if (m) return m[1];
  }
  return effectName;
}

/**
 * Expand note+step pairs into an individual-token array.
 * Each `[note, steps]` pair produces one note token followed by `steps-1`
 * `_` (held-rest) tokens — matching how the pattern expander handles `:N`.
 * The effect suffix `<fx>` is appended to the note token, UNLESS the note
 * string already contains `<` (to allow callers to pre-embed or omit effects).
 */
function buildEffectTokens(pairs: Array<[string, number]>, fx: string): string[] {
  const out: string[] = [];
  for (const [note, steps] of pairs) {
    // If the note already contains an angle bracket (pre-embedded effect or
    // explicitly no-effect anchor), use it verbatim.
    const token = note.includes('<') || note === note.trimEnd() && !note.match(/^[A-Ga-g]/) ? note : `${note}<${fx}>`;
    out.push(token);
    for (let i = 1; i < steps; i++) out.push('_');
  }
  return out;
}

/**
 * Return tokens and total step count for the given effect, tuned so audio
 * feedback matches the nature of the effect:
 *
 * | Effect type         | Strategy                                                          |
 * |---------------------|-------------------------------------------------------------------|
 * | arp                 | 4-step held notes × 4 — arp cycles are audible                   |
 * | retrig              | 2-step notes × 4 — rapid retrigger is clear                      |
 * | port                | plain C3 anchor (2 steps), then G4/C5/G3 slides × 4 steps each   |
 * | bend                | 4-step notes × 3 at wide intervals — per-note pitch bend heard   |
 * | vib / trem          | 8-step notes × 2 — long sustain for oscillation                  |
 * | sweep               | 8-step notes × 2 — full sweep range is heard                     |
 * | volSlide / echo     | 4-step notes × 4 — enough for time-based effect                  |
 * | pan                 | 2-step notes × 4 — panning is immediate                          |
 * | default / unknown   | 2-step notes × 4                                                  |
 */
function effectPreviewConfig(
  effectName: string,
  ast: any,
  stepsOverride?: number,
): { tokens: string[]; totalSteps: number } {
  const type = resolveEffectType(effectName, ast);

  type Pair = [string, number];
  let pairs: Pair[];
  switch (type) {
    case 'arp':
      // Held notes so the arp has time to cycle through chord tones
      pairs = [['C4', stepsOverride ?? 4], ['E4', stepsOverride ?? 4], ['G4', stepsOverride ?? 4], ['C5', stepsOverride ?? 4]];
      break;
    case 'retrig':
      // Short notes — rapid re-triggers are the point
      pairs = [['C4', stepsOverride ?? 2], ['E4', stepsOverride ?? 2], ['G4', stepsOverride ?? 2], ['C5', stepsOverride ?? 2]];
      break;
    case 'port': {
      // Portamento slides FROM the previous note's pitch TO the current note.
      // The first note in the sequence has no previous pitch, so we emit a
      // plain anchor note (no effect) to establish an initial pitch; every
      // subsequent note then slides from the previous stop.
      // Wide intervals (5th, octave, down-6th) make the glide clearly audible.
      // Default is 8 steps per slide (was 4) to give the portamento enough time
      // to complete; ▶ Slow uses 16 steps for very slow or wide-range slides.
      const anchorTokens: string[] = ['C3', '_'];
      const stepsPerSlide = stepsOverride ?? 8;
      const slidePairs: Array<[string, number]> = [['G4', stepsPerSlide], ['C5', stepsPerSlide], ['E3', stepsPerSlide]];
      const slideTokens = buildEffectTokens(slidePairs, effectName);
      const tokens = [...anchorTokens, ...slideTokens];
      return { tokens, totalSteps: anchorTokens.length + slidePairs.reduce((s, [, n]) => s + n, 0) };
    }
    case 'bend':
      // Pitch bend is applied per-note (no dependency on previous pitch).
      // Wide-interval starting notes (low to high) make each individual bend
      // clearly audible even on a short listen.
      // Default is 8 steps per note (was 4) to allow the bend to fully develop;
      // ▶ Slow uses 16 steps for deep or slow bends.
      pairs = [['C3', stepsOverride ?? 8], ['G3', stepsOverride ?? 8], ['C4', stepsOverride ?? 8], ['G4', stepsOverride ?? 8]];
      break;
    case 'vib':
    case 'trem':
      // Long sustained notes so the oscillation is clearly audible
      pairs = [['C4', stepsOverride ?? 8], ['G4', stepsOverride ?? 8]];
      break;
    case 'sweep':
      // Long single note per hit so the full hardware sweep range is heard
      pairs = [['C4', stepsOverride ?? 8], ['C5', stepsOverride ?? 8]];
      break;
    case 'volSlide':
    case 'echo':
      // Moderate length — time-based effect needs room to breathe
      pairs = [['C4', stepsOverride ?? 4], ['E4', stepsOverride ?? 4], ['G4', stepsOverride ?? 4], ['C5', stepsOverride ?? 4]];
      break;
    case 'pan':
      // Panning is immediate; short notes are fine
      pairs = [['C4', stepsOverride ?? 2], ['G4', stepsOverride ?? 2], ['C5', stepsOverride ?? 2], ['G4', stepsOverride ?? 2]];
      break;
    default:
      pairs = [['C4', stepsOverride ?? 2], ['E4', stepsOverride ?? 2], ['G4', stepsOverride ?? 2], ['C5', stepsOverride ?? 2]];
  }

  const tokens = buildEffectTokens(pairs, effectName);
  const totalSteps = pairs.reduce((sum, [, s]) => sum + s, 0);
  return { tokens, totalSteps };
}

/**
 * Preview a named effect preset (or built-in inline effect) by playing a
 * short note sequence with the effect applied. Note lengths are chosen based
 * on the effect type so the audio feedback is appropriate:
 *   - arp        → 4-step held notes (arp cycles are audible)
 *   - vib/trem   → 8-step sustained notes (oscillation is clear)
 *   - port/bend  → 4-step notes (slide between pitches is heard)
 *   - sweep      → 8-step single notes (full sweep range)
 *   - others     → 2-step short notes
 */
async function startEffectPreview(
  effectName: string,
  rawAst: any,
  onDone: () => void,
  options?: { stepsOverride?: number; keyPrefix?: string },
): Promise<PreviewState | null> {
  const type = resolveEffectType(effectName, rawAst);

  // sweep is a hardware feature of pulse channel 1 only — force pulse1.
  const preferType = type === 'sweep' ? 'pulse1' : undefined;
  const instName = resolveEffectPreviewInstrument(rawAst, preferType);
  if (!instName) return null;

  const { tokens, totalSteps } = effectPreviewConfig(effectName, rawAst, options?.stepsOverride);

  // For effects that require a fully sustained note to be audible, override
  // the instrument's envelope with a flat (non-decaying) GB envelope so the
  // sound is held clearly for the full note duration regardless of how the
  // song's instrument was configured.
  const insts = effectNeedsSustain(type)
    ? patchInstForSustain(rawAst.insts ?? {}, instName)
    : rawAst.insts;

  const previewAst = {
    ...rawAst,
    insts,
    pats:  { ...rawAst.pats,  __fx_preview__: tokens },
    seqs:  { ...rawAst.seqs  },
    channels: [{ id: instChannelId(instName, rawAst), inst: instName, pat: '__fx_preview__' }],
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
  const barDurationMs = (60_000 / bpm) * stepsPerBar;
  const barsNeeded = Math.max(1, Math.ceil(totalSteps / stepsPerBar));
  // 800 ms decay tail so effects like echo/vib have room to breathe after the last note.
  const durationMs = barDurationMs * barsNeeded + 800;

  const stopTimer = window.setTimeout(() => {
    try { player.stop(); } catch (_e) { /* ignore */ }
    onDone();
  }, durationMs);

  player.onComplete = () => {
    clearTimeout(stopTimer);
    onDone();
  };

  const keyPrefix = options?.keyPrefix ?? 'effect';
  return { player, key: `${keyPrefix}:${effectName}`, stopTimer };
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
let _effectPreviewTrigger: ((effectName: string) => void) | null = null;
let _effectSlowPreviewTrigger: ((effectName: string) => void) | null = null;
let _effectLoopTrigger: ((effectName: string) => void) | null = null;
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
  monaco.editor.registerCommand('beatbax.previewEffect', (_acc: any, effectName: string) => {
    _effectPreviewTrigger?.(effectName);
  });
  monaco.editor.registerCommand('beatbax.previewEffectSlow', (_acc: any, effectName: string) => {
    _effectSlowPreviewTrigger?.(effectName);
  });
  monaco.editor.registerCommand('beatbax.loopEffect', (_acc: any, effectName: string) => {
    _effectLoopTrigger?.(effectName);
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

  _effectPreviewTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect:${effectName}`) { stopPreview(); return; }
    stopPreview();
    let rawAst: any;
    try { rawAst = parse(getSource()); } catch { return; }
    const state = await startEffectPreview(effectName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    previewState = state;
    notifyChange();
  };

  _effectSlowPreviewTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect-slow:${effectName}`) { stopPreview(); return; }
    stopPreview();
    let rawAst: any;
    try { rawAst = parse(getSource()); } catch { return; }
    const state = await startEffectPreview(effectName, rawAst, () => {
      previewState = null;
      notifyChange();
    }, { stepsOverride: 16, keyPrefix: 'effect-slow' });
    previewState = state;
    notifyChange();
  };

  _effectLoopTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect-loop:${effectName}`) { stopPreview(); return; }
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
      const state = await startEffectPreview(effectName, rawAst, onIterationDone);
      if (!state || cancelled) return;
      state.key = `effect-loop:${effectName}`;
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

        // ── inst definitions ──────────────────────────────────────────────
        const instMatch = line.match(/^\s*inst\s+([A-Za-z0-9_-]+)\s+/);
        if (instMatch) {
          const instName = instMatch[1];
          // Sample-based instruments (type=dmc) get a single ▶ Sample button
          // instead of individual note buttons — DMC samples have no meaningful pitch.
          const isSampleBased = /\btype=dmc\b/.test(line);
          if (isSampleBased) {
            const activeKey = previewState?.key;
            const isActive = activeKey === `inst-note:${instName}:C4`;
            if (isActive) {
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-inst-sample-stop-${instName}`,
                command: { id: 'beatbax.stopPreview', title: '⬛ Stop', arguments: [] },
              });
            } else {
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-inst-sample-${instName}`,
                command: { id: 'beatbax.previewInstNote', title: '▶ Sample', arguments: [instName, 'C4'] },
              });
            }
          } else {
            for (const note of INST_PREVIEW_NOTES) {
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-inst-${instName}-${note}`,
                command: { id: 'beatbax.previewInstNote', title: note, arguments: [instName, note] },
              });
            }
          }
          continue;
        }

        // ── effect definitions ────────────────────────────────────────────
        const effectMatch = line.match(/^\s*effect\s+([A-Za-z0-9_-]+)\s*=/);
        if (effectMatch) {
          const effectName = effectMatch[1];
          const activeKey = previewState?.key;
          const isActive = activeKey === `effect:${effectName}` || activeKey === `effect-loop:${effectName}` || activeKey === `effect-slow:${effectName}`;
          if (isActive) {
            const isLooping = activeKey === `effect-loop:${effectName}`;
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-effect-stop-${effectName}`,
              command: { id: 'beatbax.stopPreview', title: isLooping ? '⬛ Stop  ↺' : '⬛ Stop', arguments: [] },
            });
          } else {
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-effect-preview-${effectName}`,
              command: { id: 'beatbax.previewEffect', title: '▶ Preview', arguments: [effectName] },
            });
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-effect-slow-${effectName}`,
              command: { id: 'beatbax.previewEffectSlow', title: '▶ Slow', arguments: [effectName] },
            });
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-effect-loop-${effectName}`,
              command: { id: 'beatbax.loopEffect', title: '↺ Loop', arguments: [effectName] },
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
