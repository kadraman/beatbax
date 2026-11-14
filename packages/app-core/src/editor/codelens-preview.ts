/**
 * CodeLens Pattern & Instrument Preview
 *
 * Registers a Monaco CodeLens provider for the 'beatbax' language that adds
 * "▶ Preview" / "⬛ Stop" inline actions above `pat`, `seq`, `section` (and role
 * lines), `inst`, and `effect` definition lines.
 *
 * Pattern instrument resolution priority:
 *   1. First inline `inst` token inside the pattern's own event list
 *   2. Channel whose seq tree contains this pattern (nested seqs included)
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
import { parse, parseWithPeggy } from '@beatbax/engine/parser';
import { resolveImports, resolveSong } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import { chipRegistry } from '@beatbax/engine/chips';
import type { EventBus } from '../utils/event-bus.js';
import { buildImportResolverOptions } from '../import/import-resolver-options.js';
import { findChannelForNamedItem } from './preview-channel-resolve.js';
import {
  hitOneshotPreviewTiming,
  resolvePreviewChannel,
} from './instrument-editor-schema.js';
import { FeatureFlag, isFeatureEnabled } from '../utils/feature-flags.js';
import {
  settingCodeLensPatterns,
  settingCodeLensSequences,
  settingCodeLensInstruments,
  settingCodeLensEffects,
} from '../stores/settings.store.js';
import { INSTRUMENT_EDITOR_EDIT_SOURCE } from './editor-change-origin.js';

export interface CodeLensCategoryFlags {
  patterns: boolean;
  sequences: boolean;
  instruments: boolean;
  effects: boolean;
}

/**
 * Per-category CodeLens preview toggles. The master `editor.codelens` setting
 * is applied separately through Monaco's `codeLens` editor option.
 */
export function getCodeLensCategoryFlags(): CodeLensCategoryFlags {
  return {
    patterns: settingCodeLensPatterns.get(),
    sequences: settingCodeLensSequences.get(),
    instruments: settingCodeLensInstruments.get(),
    effects: settingCodeLensEffects.get(),
  };
}

// ---------------------------------------------------------------------------
// Instrument resolution
// ---------------------------------------------------------------------------

function resolvePreviewInstrument(patternName: string, ast: any): string | null {
  // 1. First inline `inst` event inside the pattern's structured event list
  const events: any[] = ast.patternEvents?.[patternName] ?? [];
  for (const ev of events) {
    if (ev.kind === 'inline-inst' && ev.name) return ev.name as string;
  }

  // 2. Channel whose seq tree contains this pattern (walk nested seqs).
  //    One-level lookup misses `channel 3 => seq wave` / `seq wave = deep_w` /
  //    `seq deep_w = wave_i` and falls back to the first kit inst (pulse 1).
  const found = findChannelForNamedItem(ast, patternName);
  if (found) return found.inst;

  // 3. Fallback: first declared instrument in the file
  const first = Object.keys(ast.insts ?? {})[0];
  return first ?? null;
}

export function resolveAuditionInstrumentForLine(lineText: string, ast: any): string | null {
  const instMatch = lineText.match(/^\s*inst\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (instMatch) return instMatch[1];

  const patMatch = lineText.match(/^\s*pat\s+([A-Za-z0-9_-]+)\s*=/);
  if (!patMatch) return null;

  return resolvePreviewInstrument(patMatch[1], ast);
}

/**
 * Parse source for preview/audition playback. Unlike `parse()`, tolerates recoverable
 * syntax errors (e.g. empty `pat foo =`) when instruments/chip are still available.
 */
export function parseSourceForPreview(source: string): any | null {
  const result = parseWithPeggy(source);
  if (!result.hasErrors) return result.ast;

  const ast = result.ast;
  const hasInsts = ast?.insts && Object.keys(ast.insts).length > 0;
  const hasChip = Boolean(ast?.chip);
  if (hasInsts || hasChip) return ast;
  return null;
}

/**
 * Parse the buffer for a CodeLens preview click, then merge `import` kits.
 * Desktop/web `resolveSong` cannot call `resolveImportsSync` (browser bundle);
 * Play already uses this async merge — preview must too.
 */
export async function parseAndResolveForPreview(
  source: string,
  eventBus: Pick<EventBus, 'emit'>,
  options?: { tolerateErrors?: boolean },
): Promise<any | null> {
  let ast: any | null;
  if (options?.tolerateErrors) {
    ast = parseSourceForPreview(source);
  } else {
    try {
      ast = parse(source);
    } catch {
      return null;
    }
  }
  if (!ast) return null;

  if (Array.isArray(ast.imports) && ast.imports.length > 0) {
    try {
      ast = await resolveImports(ast, buildImportResolverOptions());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      eventBus.emit('preview:error', { message: `Import failed: ${message}` });
      return null;
    }
  }
  return ast;
}

// ---------------------------------------------------------------------------
// Preview playback
// ---------------------------------------------------------------------------

function hostCanReadLocalSamples(): boolean {
  if (typeof window === 'undefined') return true;
  return typeof (window as unknown as { electronAPI?: { readFileSync?: unknown } }).electronAPI?.readFileSync === 'function';
}

function isLocalDmcInstrument(instDef: any): instDef is { dmc_sample: string } {
  return String(instDef?.type ?? '').toLowerCase() === 'dmc'
    && typeof instDef?.dmc_sample === 'string'
    && instDef.dmc_sample.startsWith('local:');
}

interface PreviewState {
  player: Player;
  /** Namespaced key: 'pat:<name>', 'loop:<name>', or 'inst:<name>' */
  key: string;
  stopTimer: number;
  /** Set on loop previews; call to prevent the next loop iteration. */
  cancelLoop?: () => void;
}

/** Map instrument type → channel id (1-5). Channel 5 is the NES DMC channel.
 * The result is clamped to the active chip's channel count so that chips with
 * fewer than 4 channels (e.g. AY-3-8910 has 3) still receive a valid id.
 */
function instChannelId(instName: string, ast: any): number {
  const type = ast.insts?.[instName]?.type;
  const rawChip = (ast.chip ?? 'gameboy').toLowerCase();
  return resolvePreviewChannel(type, rawChip);
}

async function startPatternPreview(
  patternName: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const instName = resolvePreviewInstrument(patternName, rawAst);
  if (!instName) return null;

  // Prefer the song channel that actually plays this pattern so a wave bass
  // preview hits channel 3, not pulse 1. Fall back to type→channel when the
  // pattern is only referenced inline (DCM) or not wired to a channel yet.
  const found = findChannelForNamedItem(rawAst, patternName);
  const channelId = found?.id ?? instChannelId(instName, rawAst);

  // Minimal single-channel AST so the resolver only expands this one pattern
  const previewAst = {
    ...rawAst,
    channels: [{ id: channelId, inst: instName, pat: patternName }],
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
  const found = findChannelForNamedItem(ast, seqName);
  if (found) return found.inst;

  // Fallback: first declared instrument
  const first = Object.keys(ast.insts ?? {})[0];
  return first ?? null;
}

async function startSeqPreview(
  seqName: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const instName = resolveSeqInstrument(seqName, rawAst);
  if (!instName) return null;

  const found = findChannelForNamedItem(rawAst, seqName);
  const previewAst = {
    ...rawAst,
    channels: [{ id: found?.id ?? instChannelId(instName, rawAst), inst: instName, pat: seqName }],
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
  const totalSteps = Math.max(1, songModel.channels?.[0]?.events?.length ?? 1);
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

/** Generated seq name for a section role after composition expand (`intro_mel`). */
export function sectionRoleSeqName(sectionName: string, role: string): string {
  return `${sectionName}_${role}`;
}

/**
 * Role seq names for a section: prefer authored `ast.sections`, else scan
 * expanded `ast.seqs` keys matching `<section>_*`.
 */
export function listSectionRoleSeqNames(sectionName: string, ast: any): string[] {
  const section = ast?.sections?.[sectionName];
  if (section?.roles && Array.isArray(section.roles) && section.roles.length > 0) {
    return section.roles
      .map((r: { role?: string }) => (r?.role ? sectionRoleSeqName(sectionName, String(r.role)) : ''))
      .filter(Boolean);
  }
  const prefix = `${sectionName}_`;
  return Object.keys(ast?.seqs ?? {})
    .filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes('_'))
    .sort();
}

/** Multi-channel preview of one authored section (all roles, bound instruments). */
async function startSectionPreview(
  sectionName: string,
  rawAst: any,
  onDone: () => void,
): Promise<PreviewState | null> {
  const roleSeqs = listSectionRoleSeqNames(sectionName, rawAst);
  if (roleSeqs.length === 0) return null;

  const channels: Array<{ id: number; inst: string; pat: string }> = [];
  const usedIds = new Set<number>();
  for (const seqName of roleSeqs) {
    if (!rawAst.seqs?.[seqName] && !rawAst.pats?.[seqName]) continue;
    const found = findChannelForNamedItem(rawAst, seqName);
    const instName = found?.inst
      ?? Object.keys(rawAst.insts ?? {})[0]
      ?? null;
    if (!instName) continue;
    let id = found?.id ?? instChannelId(instName, rawAst);
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    channels.push({ id, inst: instName, pat: seqName });
  }
  if (channels.length === 0) return null;

  const previewAst = {
    ...rawAst,
    channels,
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
  const totalSteps = Math.max(
    1,
    ...(songModel.channels ?? []).map((ch: any) => ch?.events?.length ?? 0),
  );
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

  return { player, key: `section:${sectionName}`, stopTimer };
}

// Notes shown as individual clickable buttons above each `inst` line.
const INST_PREVIEW_NOTES = ['C3', 'C4', 'C5', 'C6', 'C7'];

/** Options for {@link startInstNotePreview} / {@link triggerInstNotePreview}. */
export interface InstNotePreviewOptions {
  /**
   * Hold-to-play: schedule a long sustained note and only stop on
   * {@link stopInstPreview} (or a long safety timeout). Use for mini-keyboard
   * / MIDI note-on. CodeLens clicks leave this false (≈2 s oneshot).
   */
  sustain?: boolean;
  /**
   * `note` (default) — melodic pattern note.
   * `hit` — named instrument token so noise/DMC use instrument props (`uge_note`, `noise_period`, …).
   */
  mode?: 'note' | 'hit';
  /**
   * Temporary instrument props for audition only (e.g. `{ uge_note: 'C-7' }`).
   * When the named instrument is missing from the AST, a full patch (including
   * `type`) defines it for this preview only — used by New-instrument candidates.
   */
  instPatch?: Record<string, unknown>;
}

/**
 * A few milliseconds ahead of the audio clock. Full-song playback keeps the
 * 100 ms arming lead; a preview key should not pay that on every note.
 */
const INST_NOTE_SCHEDULE_LEAD_SECONDS = 0.005;

/** Steps at bpm 60 (≈1 s/step) while a key is held; release stops earlier. */
const INST_NOTE_SUSTAIN_STEPS = 180;
const INST_NOTE_ONESHOT_MS = 2000;
const INST_NOTE_SUSTAIN_SAFETY_MS = INST_NOTE_SUSTAIN_STEPS * 1000 + 500;

function buildInstPreviewPatternEvents(
  instName: string,
  note: string,
  steps: number,
  mode: 'note' | 'hit',
): any[] {
  if (mode === 'hit') {
    const events: any[] = [{ kind: 'token', value: instName, raw: instName }];
    if (steps > 1) {
      events.push({ kind: 'rest', value: '_', duration: steps - 1, raw: '_'.repeat(steps - 1) });
    }
    return events;
  }
  return [{ kind: 'note', value: note, duration: steps, raw: `${note}:${steps}` }];
}

/** Play a single note or named hit with the instrument; auto-stops after decay. */
async function startInstNotePreview(
  instName: string,
  note: string,
  rawAst: any,
  onDone: () => void,
  options?: InstNotePreviewOptions,
  isCancelled?: () => boolean,
  player?: Player,
  /** False once a newer note owns `player`. Omitted means this call owns it. */
  ownsPlayer?: () => boolean,
): Promise<PreviewState | null> {
  const sustain = options?.sustain === true;
  const mode = options?.mode === 'hit' ? 'hit' : 'note';
  const baseInst = rawAst.insts?.[instName];
  const effectiveInst = options?.instPatch && baseInst
    ? { ...baseInst, ...options.instPatch }
    : options?.instPatch && !baseInst
      ? { ...options.instPatch }
      : baseInst;
  // Named hits (DMC / noise / uge_note): play for sample or envelope end, not button hold.
  const hitOneshot = mode === 'hit' && !sustain;
  const hitTiming = hitOneshot ? hitOneshotPreviewTiming(effectiveInst) : null;
  const steps = sustain
    ? INST_NOTE_SUSTAIN_STEPS
    : hitTiming
      ? hitTiming.steps
      : 1;
  const bpm = sustain ? 60 : hitTiming ? hitTiming.bpm : 60;
  const insts = effectiveInst && (options?.instPatch || baseInst)
    ? { ...rawAst.insts, [instName]: effectiveInst }
    : rawAst.insts;
  // Resolve after patching so a draft type change (e.g. tone3 → noise) targets
  // the correct hardware channel when live-edit is off.
  const channelId = instChannelId(instName, { ...rawAst, insts });

  const previewKey = mode === 'hit'
    ? `inst-hit:${instName}:${String(options?.instPatch?.uge_note ?? note ?? 'hit')}`
    : `inst-note:${instName}:${note}`;

  const previewAst = {
    chip:  rawAst.chip ? chipRegistry.resolve(String(rawAst.chip).toLowerCase()) : (rawAst.chip ?? 'gameboy'),
    bpm,   // hit oneshots raise bpm so one step ≈ envelope length (vol_env is ~60 Hz)
    insts,
    patternEvents: {
      __inst_note__: buildInstPreviewPatternEvents(instName, note, steps, mode),
    },
    pats:  { __inst_note__: [] as string[] },
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

  if (isCancelled?.()) return null;

  const previewPlayer = player ?? new Player(_sharedCtx ?? undefined);
  try {
    await previewPlayer.playAST(songModel as any, {
      scheduleLeadSeconds: INST_NOTE_SCHEDULE_LEAD_SECONDS,
    });
  } catch {
    return null;
  }

  if (isCancelled?.()) {
    // A private player is always this call's. A shared player may already be
    // playing a newer key, and stopping it would cut that note off.
    if (ownsPlayer?.() !== false) {
      try { previewPlayer.stop(); } catch (_e) { /* ignore */ }
    }
    return null;
  }

  // Melodic oneshot: short CodeLens cap. Hit oneshot: sized to vol_env / DMC sample.
  // Sustain: long safety net; release may stop earlier (melodic hold path only).
  const stopAfterMs = sustain
    ? INST_NOTE_SUSTAIN_SAFETY_MS
    : hitTiming
      ? hitTiming.stopAfterMs
      : INST_NOTE_ONESHOT_MS;
  const stopTimer = window.setTimeout(() => {
    try { previewPlayer.stop(); } catch (_e) { /* ignore */ }
    onDone();
  }, stopAfterMs);

  previewPlayer.onComplete = () => {
    clearTimeout(stopTimer);
    onDone();
  };

  return { player: previewPlayer, key: previewKey, stopTimer };
}

// ---------------------------------------------------------------------------
// Effect preview
// ---------------------------------------------------------------------------

/**
 * Picks the best instrument to demonstrate an effect:
 * pulse1 > pulse2 > wave > noise (prefer melodic channels).
 * For sweep effects, pulse1 is required (hardware sweep lives on ch1 only).
 */
export function resolveEffectPreviewInstrument(ast: any, preferType?: string): string | null {
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
let _sectionPreviewTrigger: ((sectionName: string) => void) | null = null;
let _sectionLoopTrigger: ((sectionName: string) => void) | null = null;
let _sectionRolePreviewTrigger: ((sectionName: string, role: string) => void) | null = null;
let _sectionRoleLoopTrigger: ((sectionName: string, role: string) => void) | null = null;
let _instNotePreviewTrigger: ((instName: string, note: string, options?: InstNotePreviewOptions) => void) | null = null;
let _stepEntryAuditionTrigger: ((lineText: string, note: string) => void) | null = null;
let _effectPreviewTrigger: ((effectName: string) => void) | null = null;
let _effectSlowPreviewTrigger: ((effectName: string) => void) | null = null;
let _effectLoopTrigger: ((effectName: string) => void) | null = null;
let _stopTrigger: (() => void) | null = null;
let _editInstrumentTrigger: ((instName: string) => void) | null = null;
let _commandsRegistered = false;
let _codeLensSetupDispose: (() => void) | null = null;

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

export function ensureAudioCtxReady(): void {
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
  monaco.editor.registerCommand('beatbax.previewSection', (_acc: any, sectionName: string) => {
    _sectionPreviewTrigger?.(sectionName);
  });
  monaco.editor.registerCommand('beatbax.loopSection', (_acc: any, sectionName: string) => {
    _sectionLoopTrigger?.(sectionName);
  });
  monaco.editor.registerCommand('beatbax.previewSectionRole', (_acc: any, sectionName: string, role: string) => {
    _sectionRolePreviewTrigger?.(sectionName, role);
  });
  monaco.editor.registerCommand('beatbax.loopSectionRole', (_acc: any, sectionName: string, role: string) => {
    _sectionRoleLoopTrigger?.(sectionName, role);
  });
  monaco.editor.registerCommand('beatbax.previewInstNote', (_acc: any, instName: string, note: string) => {
    _instNotePreviewTrigger?.(instName, note);
  });
  monaco.editor.registerCommand('beatbax.editInstrument', (_acc: any, instName: string) => {
    _editInstrumentTrigger?.(instName);
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

/**
 * True after a non-ephemeral editor `parse:success` (AST available).
 * Validation errors still emit parse:success with `valid: false`; CodeLens
 * stays on in that case. Module-scoped so setup can seed if the first parse
 * finished before the provider registered.
 */
let lastEditorParseHadAst = false;

export function setupCodeLensPreview(
  _editor: monaco.editor.IStandaloneCodeEditor,
  eventBus: EventBus,
  getSource: () => string,
): () => void {
  _codeLensSetupDispose?.();
  _codeLensSetupDispose = null;

  ensureCommandsRegistered();

  // Seed from the latest editor parse — scheduleInitialParse can finish before
  // this provider is registered, so waiting only for the next parse:success
  // would leave lenses blank until the user edits.
  let hasParsedAst = lastEditorParseHadAst;
  let previewState: PreviewState | null = null;
  /** One player for keyboard / MIDI / CodeLens instrument notes. */
  let instAuditionPlayer: Player | null = null;
  /** Bumped when a newer instrument note takes the shared player. */
  let instAuditionEpoch = 0;
  let previewAstCache: { source: string; tolerateErrors: boolean; ast: any } | null = null;
  /** Bumped by {@link stopPreview} so in-flight starts cannot assign a player after release. */
  let previewGeneration = 0;

  // Simple change-event emitter for the CodeLens provider to subscribe to
  type ProviderListener = (e: any) => any;
  let changeListeners: ProviderListener[] = [];
  // `notifyChange` fires listeners with the provider instance (IEvent<this> contract)
  let providerInstance: monaco.languages.CodeLensProvider;
  const notifyChange = () => changeListeners.forEach(l => l(providerInstance));

  function previewIsCurrent(generation: number): boolean {
    return generation === previewGeneration;
  }

  /** Stop a player that was created after the generation was invalidated (never assigned). */
  function abandonUnassignedPreview(state: PreviewState | null): void {
    if (!state) return;
    clearTimeout(state.stopTimer);
    state.cancelLoop?.();
    state.player.onComplete = undefined;
    try { state.player.stop(); } catch (_e) { /* ignore */ }
  }

  function beginPreview(): number {
    stopPreview();
    return previewGeneration;
  }

  function assignPreviewIfCurrent(
    generation: number,
    state: PreviewState | null,
    failMessage: string,
  ): void {
    if (!previewIsCurrent(generation)) {
      abandonUnassignedPreview(state);
      return;
    }
    if (!state) {
      failPreview(failMessage);
      return;
    }
    previewState = state;
    notifyChange();
  }

  // ── Stop any running preview ──────────────────────────────────────────────
  function stopPreview(): void {
    previewGeneration += 1;
    if (!previewState) return;
    clearTimeout(previewState.stopTimer);
    previewState.cancelLoop?.();
    try { previewState.player.stop(); } catch (_e) { /* ignore */ }
    previewState = null;
    notifyChange();
  }

  function failPreview(message: string): void {
    eventBus.emit('preview:error', { message });
  }

  function getInstAuditionPlayer(): Player {
    if (!instAuditionPlayer) instAuditionPlayer = new Player(_sharedCtx ?? undefined);
    return instAuditionPlayer;
  }

  async function astForPreview(tolerateErrors = false): Promise<any | null> {
    const source = getSource();
    if (
      previewAstCache
      && previewAstCache.source === source
      && previewAstCache.tolerateErrors === tolerateErrors
    ) {
      return previewAstCache.ast;
    }
    const ast = await parseAndResolveForPreview(source, eventBus, { tolerateErrors });
    if (ast && getSource() === source) {
      previewAstCache = { source, tolerateErrors, ast };
    } else if (getSource() === source) {
      previewAstCache = null;
    }
    return ast;
  }

  // ── Wire module-level command bridges to this instance ──────────────────
  _previewTrigger = async (patternName: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    if (previewState?.key === `pat:${patternName}`) { stopPreview(); return; }
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startPatternPreview(patternName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: no instrument found for pattern '${patternName}'.`,
    );
  };

  _instNotePreviewTrigger = async (instName: string, note: string, options?: InstNotePreviewOptions) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    const generation = beginPreview(); // always stop current note and restart (allows re-clicking same note)
    const auditionEpoch = ++instAuditionEpoch;
    const isCancelled = () => !previewIsCurrent(generation);
    const rawAst = await astForPreview();
    if (isCancelled() || !rawAst) return;

    const baseInst = rawAst.insts?.[instName];
    // Full instPatch may define a temporary instrument (New-instrument candidate).
    const instDef = options?.instPatch
      ? (baseInst ? { ...baseInst, ...options.instPatch } : { ...options.instPatch })
      : baseInst;
    if (!instDef) {
      failPreview(`Preview unavailable: instrument '${instName}' is not defined.`);
      return;
    }
    const canReadLocal = hostCanReadLocalSamples();
    const localDmc = isLocalDmcInstrument(instDef);
    if (localDmc && !canReadLocal) {
      eventBus.emit('preview:error', {
        message: `Preview unavailable: 'local:' DMC samples cannot be accessed in the browser. Use @nes/<name> or https:// instead.`,
      });
      return;
    }
    if (localDmc) {
      const plugin = chipRegistry.get(chipRegistry.resolve(String(rawAst.chip || 'nes').toLowerCase()));
      try {
        await plugin?.resolveSampleAsset?.(instDef.dmc_sample);
      } catch (err: unknown) {
        if (isCancelled()) return;
        const message = err instanceof Error ? err.message : String(err);
        failPreview(`Preview unavailable: ${message}`);
        return;
      }
      if (isCancelled()) return;
    }

    if (isCancelled()) return;
    const state = await startInstNotePreview(instName, note, rawAst, () => {
      previewState = null;
      notifyChange();
    }, options, isCancelled, getInstAuditionPlayer(), () => auditionEpoch === instAuditionEpoch);
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: instrument '${instName}' is not defined.`,
    );
  };

  _stepEntryAuditionTrigger = async (lineText: string, note: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    const generation = beginPreview();
    const auditionEpoch = ++instAuditionEpoch;
    const isCancelled = () => !previewIsCurrent(generation);

    const rawAst = await astForPreview(true);
    if (isCancelled() || !rawAst) return;

    const instName = resolveAuditionInstrumentForLine(lineText, rawAst);
    if (!instName) {
      failPreview('Preview unavailable: no instrument found for this line.');
      return;
    }

    const instDef = rawAst.insts?.[instName];
    if (isLocalDmcInstrument(instDef) && !hostCanReadLocalSamples()) {
      eventBus.emit('preview:error', {
        message: `Preview unavailable: 'local:' DMC samples cannot be accessed in the browser. Use @nes/<name> or https:// instead.`,
      });
      return;
    }

    if (isCancelled()) return;
    const state = await startInstNotePreview(instName, note, rawAst, () => {
      previewState = null;
      notifyChange();
    }, undefined, isCancelled, getInstAuditionPlayer(), () => auditionEpoch === instAuditionEpoch);
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: instrument '${instName}' is not defined.`,
    );
  };

  _loopTrigger = async (patternName: string) => {
    ensureAudioCtxReady(); // synchronous — must stay before any await
    if (previewState?.key === `loop:${patternName}`) { stopPreview(); return; }
    const generation = beginPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    // Each iteration re-parses the source so live edits are picked up.
    async function playNext(): Promise<void> {
      if (cancelled || !previewIsCurrent(generation)) return;
      const rawAst = await astForPreview();
      if (!rawAst || cancelled || !previewIsCurrent(generation)) return;
      // One-shot guard prevents double-fire if both timer and onComplete fire.
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled || !previewIsCurrent(generation)) return;
        fired = true;
        void playNext();
      };
      const state = await startPatternPreview(patternName, rawAst, onIterationDone);
      if (!state || cancelled || !previewIsCurrent(generation)) {
        abandonUnassignedPreview(state);
        if (!state && !cancelled && previewIsCurrent(generation)) {
          failPreview(`Preview unavailable: no instrument found for pattern '${patternName}'.`);
        }
        return;
      }
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
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startSeqPreview(seqName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: no instrument found for sequence '${seqName}'.`,
    );
  };

  _seqLoopTrigger = async (seqName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `seq-loop:${seqName}`) { stopPreview(); return; }
    const generation = beginPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    async function playNext(): Promise<void> {
      if (cancelled || !previewIsCurrent(generation)) return;
      const rawAst = await astForPreview();
      if (!rawAst || cancelled || !previewIsCurrent(generation)) return;
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled || !previewIsCurrent(generation)) return;
        fired = true;
        void playNext();
      };
      const state = await startSeqPreview(seqName, rawAst, onIterationDone);
      if (!state || cancelled || !previewIsCurrent(generation)) {
        abandonUnassignedPreview(state);
        if (!state && !cancelled && previewIsCurrent(generation)) {
          failPreview(`Preview unavailable: no instrument found for sequence '${seqName}'.`);
        }
        return;
      }
      state.key = `seq-loop:${seqName}`;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _sectionRolePreviewTrigger = async (sectionName: string, role: string) => {
    ensureAudioCtxReady();
    const seqName = sectionRoleSeqName(sectionName, role);
    const key = `section-role:${sectionName}:${role}`;
    if (previewState?.key === key) { stopPreview(); return; }
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startSeqPreview(seqName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    if (state) state.key = key;
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: no instrument found for section role '${sectionName}.${role}'.`,
    );
  };

  _sectionRoleLoopTrigger = async (sectionName: string, role: string) => {
    ensureAudioCtxReady();
    const seqName = sectionRoleSeqName(sectionName, role);
    const key = `section-role-loop:${sectionName}:${role}`;
    if (previewState?.key === key) { stopPreview(); return; }
    const generation = beginPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    async function playNext(): Promise<void> {
      if (cancelled || !previewIsCurrent(generation)) return;
      const rawAst = await astForPreview();
      if (!rawAst || cancelled || !previewIsCurrent(generation)) return;
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled || !previewIsCurrent(generation)) return;
        fired = true;
        void playNext();
      };
      const state = await startSeqPreview(seqName, rawAst, onIterationDone);
      if (!state || cancelled || !previewIsCurrent(generation)) {
        abandonUnassignedPreview(state);
        if (!state && !cancelled && previewIsCurrent(generation)) {
          failPreview(`Preview unavailable: no instrument found for section role '${sectionName}.${role}'.`);
        }
        return;
      }
      state.key = key;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _sectionPreviewTrigger = async (sectionName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `section:${sectionName}`) { stopPreview(); return; }
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startSectionPreview(sectionName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: section '${sectionName}' has no playable roles.`,
    );
  };

  _sectionLoopTrigger = async (sectionName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `section-loop:${sectionName}`) { stopPreview(); return; }
    const generation = beginPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    async function playNext(): Promise<void> {
      if (cancelled || !previewIsCurrent(generation)) return;
      const rawAst = await astForPreview();
      if (!rawAst || cancelled || !previewIsCurrent(generation)) return;
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled || !previewIsCurrent(generation)) return;
        fired = true;
        void playNext();
      };
      const state = await startSectionPreview(sectionName, rawAst, onIterationDone);
      if (!state || cancelled || !previewIsCurrent(generation)) {
        abandonUnassignedPreview(state);
        if (!state && !cancelled && previewIsCurrent(generation)) {
          failPreview(`Preview unavailable: section '${sectionName}' has no playable roles.`);
        }
        return;
      }
      state.key = `section-loop:${sectionName}`;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _effectPreviewTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect:${effectName}`) { stopPreview(); return; }
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startEffectPreview(effectName, rawAst, () => {
      previewState = null;
      notifyChange();
    });
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: no instrument found for effect '${effectName}'.`,
    );
  };

  _effectSlowPreviewTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect-slow:${effectName}`) { stopPreview(); return; }
    const generation = beginPreview();
    const rawAst = await astForPreview();
    if (!previewIsCurrent(generation) || !rawAst) return;
    const state = await startEffectPreview(effectName, rawAst, () => {
      previewState = null;
      notifyChange();
    }, { stepsOverride: 16, keyPrefix: 'effect-slow' });
    assignPreviewIfCurrent(
      generation,
      state,
      `Preview unavailable: no instrument found for effect '${effectName}'.`,
    );
  };

  _effectLoopTrigger = async (effectName: string) => {
    ensureAudioCtxReady();
    if (previewState?.key === `effect-loop:${effectName}`) { stopPreview(); return; }
    const generation = beginPreview();

    let cancelled = false;
    const cancel = () => { cancelled = true; };

    async function playNext(): Promise<void> {
      if (cancelled || !previewIsCurrent(generation)) return;
      const rawAst = await astForPreview();
      if (!rawAst || cancelled || !previewIsCurrent(generation)) return;
      let fired = false;
      const onIterationDone = () => {
        if (fired || cancelled || !previewIsCurrent(generation)) return;
        fired = true;
        void playNext();
      };
      const state = await startEffectPreview(effectName, rawAst, onIterationDone);
      if (!state || cancelled || !previewIsCurrent(generation)) {
        abandonUnassignedPreview(state);
        if (!state && !cancelled && previewIsCurrent(generation)) {
          failPreview(`Preview unavailable: no instrument found for effect '${effectName}'.`);
        }
        return;
      }
      state.key = `effect-loop:${effectName}`;
      state.cancelLoop = cancel;
      previewState = state;
      notifyChange();
    }

    await playNext();
  };

  _stopTrigger = () => stopPreview();
  _editInstrumentTrigger = (instName: string) => {
    eventBus.emit('instrument-editor:open', { name: instName });
  };

  // ── EventBus subscriptions ────────────────────────────────────────────────
  const unsubParseSuccess = eventBus.on('parse:success', (payload) => {
    if (payload.ephemeral) return;
    // Gate on AST availability, not zero validation errors — a missing channel
    // inst should not blank Preview/Edit on every definition in the file.
    lastEditorParseHadAst = true;
    hasParsedAst = true;
    notifyChange();
  });
  // Playback also emits parse:error; do not clear hasParsedAst here or a failed
  // Play would wipe editor CodeLens until the next successful editor parse.
  const unsubParseError = eventBus.on('parse:error', () => {
    stopPreview();
  });
  const unsubPlaybackStarted = eventBus.on('playback:started', () => stopPreview());
  // Instrument Editor Apply/Delete focuses the modal after writeback. Monaco
  // cancels a pending CodeLens provide on blur, so re-notify after focus settles.
  let codeLensFocusRefreshTimer: number | null = null;
  const unsubEditorChanged = eventBus.on('editor:changed', ({ origin }) => {
    if (origin !== INSTRUMENT_EDITOR_EDIT_SOURCE) return;
    if (codeLensFocusRefreshTimer !== null) window.clearTimeout(codeLensFocusRefreshTimer);
    codeLensFocusRefreshTimer = window.setTimeout(() => {
      codeLensFocusRefreshTimer = null;
      notifyChange();
    }, 0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => notifyChange());
    });
  });
  const unsubCategoryFlags = [
    settingCodeLensPatterns,
    settingCodeLensSequences,
    settingCodeLensInstruments,
    settingCodeLensEffects,
  ].map((setting) => setting.listen(() => {
    // Hiding a category would also hide the Stop lens of a preview it owns.
    stopPreview();
    notifyChange();
  }));

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
      if (!hasParsedAst) return { lenses: [], dispose: () => {} };

      const lenses: monaco.languages.CodeLens[] = [];
      const lineCount = model.getLineCount();
      const categories = getCodeLensCategoryFlags();
      // Track `section name { … }` so role lines get lenses gated by sequences.
      let openSectionName: string | null = null;
      let sectionBraceDepth = 0;

      for (let ln = 1; ln <= lineCount; ln++) {
        const line = model.getLineContent(ln);

        // ── section header (block or Beginner `use`) ─────────────────────
        const sectionUseMatch = line.match(/^\s*section\s+([A-Za-z_][A-Za-z0-9_]*)\s+use\b/);
        const sectionBlockMatch = line.match(/^\s*section\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (sectionUseMatch || (sectionBlockMatch && line.includes('{'))) {
          const sectionName = (sectionUseMatch ?? sectionBlockMatch)![1];
          if (categories.sequences) {
            const activeKey = previewState?.key;
            const isActive = activeKey === `section:${sectionName}`
              || activeKey === `section-loop:${sectionName}`;
            if (isActive) {
              const isLooping = activeKey === `section-loop:${sectionName}`;
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-stop-${sectionName}`,
                command: { id: 'beatbax.stopPreview', title: isLooping ? '⬛ Stop  ↺' : '⬛ Stop', arguments: [] },
              });
            } else {
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-preview-${sectionName}`,
                command: { id: 'beatbax.previewSection', title: '▶ Preview', arguments: [sectionName] },
              });
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-loop-${sectionName}`,
                command: { id: 'beatbax.loopSection', title: '↺ Loop', arguments: [sectionName] },
              });
            }
          }
          if (sectionUseMatch) {
            // One-liner — no role-line body to track.
            openSectionName = null;
            sectionBraceDepth = 0;
            continue;
          }
          // Count braces on the header line, then keep scanning for role lines.
          openSectionName = sectionName;
          sectionBraceDepth = 0;
          for (const ch of line) {
            if (ch === '{') sectionBraceDepth += 1;
            else if (ch === '}') sectionBraceDepth -= 1;
          }
          if (sectionBraceDepth <= 0) {
            openSectionName = null;
            sectionBraceDepth = 0;
          }
          continue;
        }

        if (openSectionName) {
          for (const ch of line) {
            if (ch === '{') sectionBraceDepth += 1;
            else if (ch === '}') sectionBraceDepth -= 1;
          }
          const roleMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (roleMatch && categories.sequences) {
            const role = roleMatch[1];
            const sectionName = openSectionName;
            const activeKey = previewState?.key;
            const isActive = activeKey === `section-role:${sectionName}:${role}`
              || activeKey === `section-role-loop:${sectionName}:${role}`;
            if (isActive) {
              const isLooping = activeKey === `section-role-loop:${sectionName}:${role}`;
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-role-stop-${sectionName}-${role}`,
                command: { id: 'beatbax.stopPreview', title: isLooping ? '⬛ Stop  ↺' : '⬛ Stop', arguments: [] },
              });
            } else {
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-role-preview-${sectionName}-${role}`,
                command: {
                  id: 'beatbax.previewSectionRole',
                  title: '▶ Preview',
                  arguments: [sectionName, role],
                },
              });
              lenses.push({
                range: new monaco.Range(ln, 1, ln, 1),
                id: `bb-section-role-loop-${sectionName}-${role}`,
                command: {
                  id: 'beatbax.loopSectionRole',
                  title: '↺ Loop',
                  arguments: [sectionName, role],
                },
              });
            }
          }
          if (sectionBraceDepth <= 0) {
            openSectionName = null;
            sectionBraceDepth = 0;
          }
          // Role / brace lines are not pat/seq/inst/effect headers.
          continue;
        }

        // ── pat definitions ──────────────────────────────────────────────
        const patMatch = line.match(/^\s*pat\s+([A-Za-z0-9_-]+)\s*=/);
        if (patMatch) {
          if (!categories.patterns) continue;
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
          if (!categories.sequences) continue;
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
          if (isFeatureEnabled(FeatureFlag.INSTRUMENT_EDITOR)) {
            lenses.push({
              range: new monaco.Range(ln, 1, ln, 1),
              id: `bb-inst-edit-${instName}`,
              command: { id: 'beatbax.editInstrument', title: 'Edit', arguments: [instName] },
            });
          }
          if (!categories.instruments) continue;
          // Sample-based instruments (type=dmc) get a single ▶ Sample button
          // instead of individual note buttons — DMC samples have no meaningful pitch.
          const isSampleBased = /\btype\s*=\s*dmc\b/i.test(line);
          if (isSampleBased) {
            const activeKey = previewState?.key;
            const isActive =
              typeof activeKey === 'string' &&
              (activeKey.startsWith(`inst-note:${instName}:`) ||
                activeKey.startsWith(`inst-hit:${instName}:`));
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
          if (!categories.effects) continue;
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
  const providerRegistration = monaco.languages.registerCodeLensProvider('beatbax', providerInstance);
  // First provide may have run with hasParsedAst still false, or the initial
  // parse:success may have landed before onDidChange was hooked up.
  queueMicrotask(() => notifyChange());

  const dispose = (): void => {
    stopPreview();
    unsubParseSuccess();
    unsubParseError();
    unsubEditorChanged();
    unsubPlaybackStarted();
    unsubCategoryFlags.forEach((unsub) => unsub());
    if (codeLensFocusRefreshTimer !== null) {
      window.clearTimeout(codeLensFocusRefreshTimer);
      codeLensFocusRefreshTimer = null;
    }
    providerRegistration.dispose();
    changeListeners = [];
    if (_codeLensSetupDispose === dispose) {
      _previewTrigger = null;
      _loopTrigger = null;
      _seqPreviewTrigger = null;
      _seqLoopTrigger = null;
      _sectionPreviewTrigger = null;
      _sectionLoopTrigger = null;
      _sectionRolePreviewTrigger = null;
      _sectionRoleLoopTrigger = null;
      _instNotePreviewTrigger = null;
      _stepEntryAuditionTrigger = null;
      _effectPreviewTrigger = null;
      _effectSlowPreviewTrigger = null;
      _effectLoopTrigger = null;
      _stopTrigger = null;
      _editInstrumentTrigger = null;
      _codeLensSetupDispose = null;
    }
  };

  _codeLensSetupDispose = dispose;
  return dispose;
}

export function triggerInstNotePreview(
  instName: string,
  note: string,
  options?: InstNotePreviewOptions,
): void {
  _instNotePreviewTrigger?.(instName, note, options);
}

export function stopInstPreview(): void {
  _stopTrigger?.();
}

export function triggerStepEntryAudition(lineText: string, note: string): void {
  _stepEntryAuditionTrigger?.(lineText, note);
}

export function triggerEffectPreview(effectName: string): void {
  _effectPreviewTrigger?.(effectName);
}
