/**
 * Scale context for the editor status bar and other UI that needs
 * "which notes are allowed for the pattern I'm editing?"
 */

import {
  isCursorInsidePatBody,
  normalizeScaleConfig,
  scaleLockPitchClasses,
  type ScaleConfig,
  type ScaleLock,
} from '../input/midi-step-entry';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface PatternLockBinding {
  channelId: number;
  lock: ScaleLock;
}

export interface ScaleContext {
  patternName: string;
  scale: ScaleConfig;
  bindings: PatternLockBinding[];
  /** Pitch-class spellings allowed under the primary (first) lock, if any. */
  allowedNames: string;
}

export interface ScaleContextStatusLabel {
  text: string;
  title: string;
}

function normalizePatternRef(token: string): string {
  return String(token ?? '').split(':')[0].trim().replace(/\s*\*\s*\d+$/, '');
}

function stripRepeat(base: string): string {
  const m = base.match(/^(.+?)\*(\d+)$/);
  return m ? m[1].trim() : base;
}

/**
 * Whether a sequence item list references a pattern, directly or through
 * nested seq definitions (matches engine expandSequenceEntries reachability).
 */
export function sequenceItemsReferencePattern(
  ast: any,
  items: string[],
  patternName: string,
  visiting: Set<string> = new Set(),
): boolean {
  if (!patternName || !Array.isArray(items)) return false;
  const seqs = ast?.seqs ?? {};

  for (const it of items) {
    if (!it || String(it).trim() === '') continue;

    let base = stripRepeat(normalizePatternRef(it));

    const mGroup = base.match(/^\((.*)\)$/s);
    if (mGroup) {
      const innerParts = mGroup[1].trim().match(/[^\s]+/g) || [];
      if (sequenceItemsReferencePattern(ast, innerParts, patternName, visiting)) {
        return true;
      }
      continue;
    }

    if (base === patternName) return true;

    if (Object.prototype.hasOwnProperty.call(seqs, base)) {
      if (visiting.has(base)) continue;
      visiting.add(base);
      const nested = seqs[base];
      const found =
        Array.isArray(nested) &&
        sequenceItemsReferencePattern(ast, nested, patternName, visiting);
      visiting.delete(base);
      if (found) return true;
    }
  }

  return false;
}

function channelSeqRefs(ch: any): string[] {
  if (Array.isArray(ch?.seqSpecTokens)) return ch.seqSpecTokens;
  if (typeof ch?.pat === 'string') return ch.pat.split(/[\s,]+/);
  return [];
}

/** Whether a channel's seq references a pattern (directly or via nested seqs). */
export function channelReferencesPattern(ast: any, ch: any, patternName: string): boolean {
  if (!patternName) return false;
  return sequenceItemsReferencePattern(ast, channelSeqRefs(ch), patternName);
}

/** All channel locks that apply to a named pattern, in channel order. */
export function resolvePatternLockBindings(ast: any, patternName: string): PatternLockBinding[] {
  if (!ast?.channels || !patternName) return [];
  const bindings: PatternLockBinding[] = [];
  const channels = [...(ast.channels as any[])].sort(
    (a, b) => Number(a.id ?? 0) - Number(b.id ?? 0),
  );
  for (const ch of channels) {
    const lock = ch?.lock as ScaleLock | undefined;
    if (!lock) continue;
    if (channelReferencesPattern(ast, ch, patternName)) {
      bindings.push({ channelId: Number(ch.id), lock });
    }
  }
  return bindings;
}

/** First matching channel lock — matches MIDI step-entry snap behaviour. */
export function resolvePrimaryPatternLock(ast: any, patternName: string): ScaleLock | undefined {
  return resolvePatternLockBindings(ast, patternName)[0]?.lock;
}

export function pitchClassesToNames(pitchClasses: Set<number>): string {
  return Array.from(pitchClasses)
    .sort((a, b) => a - b)
    .map((pc) => NOTE_NAMES[((pc % 12) + 12) % 12])
    .join(', ');
}

function formatLockLabel(bindings: PatternLockBinding[]): string {
  if (bindings.length === 0) return '';
  if (bindings.length === 1) return bindings[0].lock;
  const uniqueLocks = new Set(bindings.map((b) => b.lock));
  if (uniqueLocks.size === 1) return bindings[0].lock;
  return bindings.map((b) => `ch ${b.channelId} ${b.lock}`).join(', ');
}

function formatBindingsTooltip(bindings: PatternLockBinding[]): string {
  if (bindings.length === 0) return '';
  return bindings.map((b) => `Channel ${b.channelId}: lock=${b.lock}`).join('\n');
}

/**
 * Resolve scale/lock context for the current editor cursor.
 * Returns null when no scale is declared or the cursor is outside a pat body.
 */
export function resolveScaleContext(
  ast: any,
  lineText: string,
  column: number,
): ScaleContext | null {
  const scale = normalizeScaleConfig(ast?.scale);
  if (!scale) return null;
  if (!isCursorInsidePatBody(lineText, column)) return null;

  const patternMatch = lineText.match(/^\s*pat\s+([^\s=]+)\s*=/);
  const patternName = patternMatch?.[1]?.trim();
  if (!patternName) return null;

  const bindings = resolvePatternLockBindings(ast, patternName);
  const primaryLock = bindings[0]?.lock;
  const allowed = primaryLock
    ? scaleLockPitchClasses(scale.root, scale.mode, primaryLock)
    : scaleLockPitchClasses(scale.root, scale.mode, 'scale');
  const allowedNames = allowed ? pitchClassesToNames(allowed) : '';

  return {
    patternName,
    scale,
    bindings,
    allowedNames,
  };
}

/** One-line label for the status bar scale context section. */
export function formatScaleContextStatusLabel(ctx: ScaleContext): ScaleContextStatusLabel {
  const scaleLabel = `${ctx.scale.root} ${ctx.scale.mode}`;
  const patLabel = `Pat ${ctx.patternName}`;

  if (ctx.bindings.length === 0) {
    return {
      text: `${scaleLabel} · ${patLabel} (no lock)`,
      title: `${patLabel} — ${scaleLabel}. No channel lock applies to this pattern yet.`,
    };
  }

  const lockLabel = formatLockLabel(ctx.bindings);
  const text = `${scaleLabel} · ${lockLabel} · ${ctx.allowedNames}`;
  const bindingLines = formatBindingsTooltip(ctx.bindings);
  const title = [
    `${patLabel} — ${scaleLabel}`,
    bindingLines,
    ctx.allowedNames ? `Allowed pitch classes: ${ctx.allowedNames} (any octave)` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { text, title };
}
