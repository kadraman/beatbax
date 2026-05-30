import { transposePattern } from '../patterns/expand.js';
import { noteToMidi, midiToNote } from '../util/music.js';
import { applyModsToTokens } from '../expand/refExpander.js';
import { splitTopLevel } from '../expand/splitTopLevel.js';
import { expandSequenceItems } from '../sequences/expand.js';
import type {
  AST,
  ChannelNode,
  ParseDiagnostic,
  PatternEvent,
  ScaleDirective,
  ScaleEnforcement,
  ScaleLock,
  SourceLocation,
} from './ast.js';
import {
  buildLockPitchClasses,
  normalizeLock,
  normalizeScaleDirective,
} from './scale-awareness.js';

/** Where a heard note originates before/through sequence transforms. */
export interface ScaleNoteProvenance {
  patternName: string;
  sourceNote: string;
  loc?: SourceLocation;
  /** Sequence transforms applied after the pattern, in application order. */
  modifiers: string[];
  /** Sequence names from channel → pattern (outermost first). */
  seqPath: string[];
}

export interface ExpandedScaleNote {
  heardNote: string;
  prov: ScaleNoteProvenance;
}

type TokenEntry = { token: string; prov: ScaleNoteProvenance | null };

function pitchClassSetToNames(pitchClasses: Set<number>): string {
  return Array.from(pitchClasses)
    .sort((a, b) => a - b)
    .map((pc) => midiToNote(60 + pc).replace(/-?\d+$/, ''))
    .join(', ');
}

function cloneProv(prov: ScaleNoteProvenance): ScaleNoteProvenance {
  return {
    patternName: prov.patternName,
    sourceNote: prov.sourceNote,
    loc: prov.loc,
    modifiers: [...prov.modifiers],
    seqPath: [...prov.seqPath],
  };
}

function cloneEntries(entries: TokenEntry[]): TokenEntry[] {
  return entries.map((e) => ({
    token: e.token,
    prov: e.prov ? cloneProv(e.prov) : null,
  }));
}

function appendModifier(entries: TokenEntry[], mod: string): void {
  for (const entry of entries) {
    if (entry.prov) entry.prov.modifiers.push(mod);
  }
}

/** Extract the note name from an expanded token (ignores inline effects and inst tokens). */
export function noteNameFromExpandedToken(token: string): string | null {
  if (!token || token === '.' || token === '_' || token === '-') return null;
  if (/^inst[\s(]/i.test(token)) return null;
  const match = token.match(/^([^<\s]+)/);
  if (!match) return null;
  const base = match[1];
  return noteToMidi(base) === null ? null : base;
}

function buildPatternEntries(
  ast: AST,
  patternName: string,
  seqPath: string[],
): TokenEntry[] {
  const events = ast.patternEvents?.[patternName];
  if (events && events.length > 0) {
    const out: TokenEntry[] = [];
    for (const ev of events) {
      out.push(...patternEventToEntries(ev, patternName, seqPath));
    }
    return out;
  }

  const tokens = ast.pats?.[patternName] ?? [];
  return tokens.map((token) => {
    const note = noteNameFromExpandedToken(token);
    return {
      token,
      prov: note
        ? {
            patternName,
            sourceNote: note,
            modifiers: [],
            seqPath: [...seqPath],
          }
        : null,
    };
  });
}

function patternEventToEntries(
  ev: PatternEvent,
  patternName: string,
  seqPath: string[],
): TokenEntry[] {
  if (ev.kind === 'note') {
    const base = ev.value ?? (ev as PatternEvent & { raw?: string }).raw ?? '';
    const token =
      ev.effects && ev.effects.length > 0
        ? base + ev.effects.map((fx) => `<${fx}>`).join('')
        : base;
    const dur = ev.duration && ev.duration > 0 ? ev.duration : 1;
    const prov: ScaleNoteProvenance = {
      patternName,
      sourceNote: base,
      loc: ev.loc,
      modifiers: [],
      seqPath: [...seqPath],
    };
    const entries: TokenEntry[] = [{ token, prov }];
    for (let i = 1; i < dur; i++) entries.push({ token: '_', prov: null });
    return entries;
  }
  if (ev.kind === 'rest') {
    const token = ev.value ?? (ev as PatternEvent & { raw?: string }).raw ?? '.';
    const dur = ev.duration && ev.duration > 0 ? ev.duration : 1;
    const entries: TokenEntry[] = [{ token, prov: null }];
    for (let i = 1; i < dur; i++) entries.push({ token: '_', prov: null });
    return entries;
  }
  return [];
}

/** Keep provenance arrays aligned while applying the same structural ops as applyModsToTokens. */
function applyModsToEntries(
  entriesIn: TokenEntry[],
  mods: string[],
  presets?: Record<string, string>,
): TokenEntry[] {
  let entries = cloneEntries(entriesIn);
  let semitones = 0;
  let octaves = 0;

  for (const mod of mods) {
    if (presets && Object.prototype.hasOwnProperty.call(presets, mod)) {
      appendModifier(entries, mod);
      const tokens = applyModsToTokens(entries.map((e) => e.token), [mod], presets).tokens;
      entries = entries.map((e, i) => ({ token: tokens[i] ?? e.token, prov: e.prov }));
      continue;
    }

    const mRot = mod.match(/^rot(?:ate)?\(([+-]?\d+)\)$/i);
    if (mRot) {
      appendModifier(entries, mod);
      const len = entries.length;
      if (len > 0) {
        const n = parseInt(mRot[1], 10);
        const shift = ((n % len) + len) % len;
        if (shift !== 0) entries = entries.slice(shift).concat(entries.slice(0, shift));
      }
      continue;
    }
    if (/^rev$/i.test(mod)) {
      appendModifier(entries, mod);
      entries = entries.slice().reverse();
      continue;
    }
    if (/^pal(?:indrome)?$/i.test(mod)) {
      appendModifier(entries, mod);
      entries =
        entries.length <= 1
          ? entries.slice()
          : entries.concat(cloneEntries(entries.slice(0, -1)).reverse());
      continue;
    }
    const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
    if (mSlow) {
      appendModifier(entries, mod);
      const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
      const out: TokenEntry[] = [];
      for (const entry of entries) {
        for (let r = 0; r < factor; r++) out.push({ token: entry.token, prov: entry.prov ? cloneProv(entry.prov) : null });
      }
      entries = out;
      continue;
    }
    const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
    if (mFast) {
      appendModifier(entries, mod);
      const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
      entries = entries.filter((_, idx) => idx % factor === 0);
      continue;
    }
    if (/^inst\(/i.test(mod) || /^pan\(/i.test(mod)) {
      appendModifier(entries, mod);
      continue;
    }
    if (/^(mute|rest)$/i.test(mod)) {
      appendModifier(entries, mod);
      entries = entries.map((e) => (e.prov ? { token: '.', prov: e.prov } : e));
      continue;
    }
    const mOct = mod.match(/^oct\(([+-]?\d+)\)$/i);
    if (mOct) {
      appendModifier(entries, mod);
      octaves += parseInt(mOct[1], 10);
      continue;
    }
    const mTrans = mod.match(/^([+-]?\d+)$/);
    if (mTrans) {
      appendModifier(entries, mod);
      semitones += parseInt(mTrans[1], 10);
      continue;
    }
    const mSem = mod.match(/^semitone\(([+-]?\d+)\)$/i)
      || mod.match(/^st\(([+-]?\d+)\)$/i)
      || mod.match(/^trans\(([+-]?\d+)\)$/i)
      || mod.match(/^transpose\(([+-]?\d+)\)$/i);
    if (mSem) {
      appendModifier(entries, mod);
      semitones += parseInt(mSem[1], 10);
      continue;
    }

    const mOff = mod.match(/^(?:off|lag)\((\d+)\)$/i);
    if (mOff) {
      appendModifier(entries, mod);
      const n = parseInt(mOff[1], 10);
      if (n > 0) {
        const padding: TokenEntry[] = Array.from({ length: n }, () => ({ token: '.', prov: null }));
        entries = padding.concat(entries);
      }
      continue;
    }
    const mPick = mod.match(/^pick\(([^)]+)\)$/i);
    if (mPick) {
      appendModifier(entries, mod);
      const indices = mPick[1].split(',').map((s) => parseInt(s.trim(), 10) - 1);
      entries = indices.filter((i) => i >= 0 && i < entries.length).map((i) => entries[i]);
      continue;
    }
    const mChunk = mod.match(/^chunk\((\d+)\)$/i);
    if (mChunk) {
      appendModifier(entries, mod);
      const n = parseInt(mChunk[1], 10);
      if (n >= 1) {
        const out: TokenEntry[] = [];
        for (let i = 0; i < entries.length; i += n) {
          out.push(...cloneEntries(entries.slice(i, i + n)).reverse());
        }
        entries = out;
      }
      continue;
    }
    if (/^shuffle\(/i.test(mod)) {
      appendModifier(entries, mod);
      const tokens = applyModsToTokens(entries.map((e) => e.token), [mod], presets).tokens;
      const provs = entries.map((e) => e.prov);
      entries = tokens.map((token, i) => ({ token, prov: provs[i] ? cloneProv(provs[i]!) : null }));
      continue;
    }

    // Pitch/token rewrites delegated to applyModsToTokens for one step, provenance preserved per index.
    if (/^arp\(/i.test(mod) || /^clamp\(/i.test(mod) || /^fold\(/i.test(mod) || /^inv/i.test(mod) || /^every\(/i.test(mod)) {
      appendModifier(entries, mod);
      const before = entries.map((e) => e.token);
      const after = applyModsToTokens(before, [mod], presets).tokens;
      entries = after.map((token, i) => ({ token, prov: entries[i]?.prov ? cloneProv(entries[i].prov!) : null }));
      continue;
    }
  }

  if (semitones !== 0 || octaves !== 0) {
    const shifted = transposePattern(
      entries.map((e) => e.token),
      { semitones, octaves },
    );
    entries = shifted.map((token, i) => ({ token, prov: entries[i]?.prov ?? null }));
  }

  return entries;
}

function expandSequenceEntries(
  items: string[],
  ast: AST,
  seqPathPrefix: string[],
  visiting: Set<string> = new Set(),
): TokenEntry[] {
  const pats = ast.pats ?? {};
  const seqs = ast.seqs ?? {};
  const presets = (ast as any).effects as Record<string, string> | undefined;
  const out: TokenEntry[] = [];

  for (const it of items) {
    if (!it || it.trim() === '') continue;
    const parts = splitTopLevel(it, ':');
    const base = parts[0];
    const mods = parts.slice(1);

    let repeat = 1;
    const mRepBase = base.match(/^(.+?)\*(\d+)$/);
    let realBase = base;
    if (mRepBase) {
      realBase = mRepBase[1];
      repeat = parseInt(mRepBase[2], 10);
    }

    let entries: TokenEntry[] = [];
    const mGroup = realBase.match(/^\((.*)\)$/s);
    if (mGroup) {
      const inner = mGroup[1].trim();
      const innerParts = inner.match(/[^\s]+/g) || [];
      entries = expandSequenceEntries(innerParts, ast, seqPathPrefix, visiting);
    } else if (pats[realBase]) {
      entries = buildPatternEntries(ast, realBase, seqPathPrefix);
    } else if (Object.prototype.hasOwnProperty.call(seqs, realBase)) {
      if (visiting.has(realBase)) {
        entries = [];
      } else {
        visiting.add(realBase);
        entries = expandSequenceEntries(seqs[realBase] as string[], ast, [...seqPathPrefix, realBase], visiting);
        visiting.delete(realBase);
      }
    } else {
      entries = [{ token: realBase, prov: null }];
    }

    entries = applyModsToEntries(entries, mods, presets);
    for (let r = 0; r < repeat; r++) {
      out.push(...cloneEntries(entries));
    }
  }

  return out;
}

function expandChannelEntries(ast: AST, channel: ChannelNode): TokenEntry[] {
  const pats = ast.pats ?? {};
  const seqs = ast.seqs ?? {};
  const presets = (ast as any).effects as Record<string, string> | undefined;
  const chAny = channel as ChannelNode & { seqSpecTokens?: string[] };
  const seqSpecTokens = Array.isArray(chAny.seqSpecTokens) ? chAny.seqSpecTokens : [];

  if (seqSpecTokens.length > 0) {
    return expandSequenceEntries(seqSpecTokens, ast, []);
  }

  if (Array.isArray(channel.pat)) {
    return channel.pat.map((token) => {
      const note = noteNameFromExpandedToken(token);
      return {
        token,
        prov: note
          ? { patternName: '(channel)', sourceNote: note, modifiers: [], seqPath: [] }
          : null,
      };
    });
  }

  if (typeof channel.pat === 'string' && channel.pat.trim()) {
    const spec = channel.pat.trim();
    const parts = spec.split(':');
    const base = parts[0].trim();
    const mods = parts.slice(1);

    if (pats[base]) {
      return applyModsToEntries(buildPatternEntries(ast, base, []), mods, presets);
    }
    if (seqs[base]) {
      let entries = expandSequenceEntries(seqs[base] as string[], ast, [base]);
      if (mods.length > 0) entries = applyModsToEntries(entries, mods, presets);
      return entries;
    }
  }

  return [];
}

/** Expand channel playback and retain note provenance for scale-lock diagnostics. */
export function expandChannelNotesWithProvenance(ast: AST, channel: ChannelNode): ExpandedScaleNote[] {
  const notes: ExpandedScaleNote[] = [];
  for (const entry of expandChannelEntries(ast, channel)) {
    if (!entry.prov) continue;
    const heardNote = noteNameFromExpandedToken(entry.token);
    if (!heardNote) continue;
    notes.push({ heardNote, prov: entry.prov });
  }
  return notes;
}

export function formatScaleLockViolationMessage(
  note: ExpandedScaleNote,
  lock: ScaleLock,
  channelId: number,
  scaleLabel: string,
  allowedNames: string,
  occurrenceCount = 1,
): string {
  const { prov } = note;
  const path =
    prov.seqPath.length > 0
      ? ` via seq ${prov.seqPath.join(' → ')}`
      : '';
  const modChain =
    prov.modifiers.length > 0
      ? ` becomes ${note.heardNote} after ${prov.modifiers.join(', ')}`
      : '';
  const repeatSuffix =
    occurrenceCount > 1
      ? ` (occurs ${occurrenceCount} times in channel ${channelId} playback)`
      : '';

  if (prov.modifiers.length > 0 && prov.sourceNote !== note.heardNote) {
    return (
      `Note ${prov.sourceNote} in pat '${prov.patternName}'${path}${modChain}, ` +
      `outside lock "${lock}" for channel ${channelId} (${scaleLabel} ${lock} = ${allowedNames}).${repeatSuffix}`
    );
  }

  if (prov.modifiers.length > 0) {
    return (
      `Note ${prov.sourceNote} in pat '${prov.patternName}'${path}${modChain}, ` +
      `outside lock "${lock}" for channel ${channelId} (${scaleLabel} ${lock} = ${allowedNames}).${repeatSuffix}`
    );
  }

  return (
    `Note ${note.heardNote} in pat '${prov.patternName}'${path} is outside lock "${lock}" ` +
    `for channel ${channelId} (${scaleLabel} ${lock} = ${allowedNames}).${repeatSuffix}`
  );
}

/** Stable key for deduplicating repeated playback of the same pattern note. */
export function scaleLockViolationKey(
  note: ExpandedScaleNote,
  lock: ScaleLock,
  channelId: number,
): string {
  const { prov } = note;
  const loc = prov.loc?.start;
  const locKey = loc ? `${loc.line}:${loc.column}:${prov.loc?.end?.line ?? loc.line}:${prov.loc?.end?.column ?? loc.column}` : 'no-loc';
  return [
    channelId,
    lock,
    prov.patternName,
    prov.sourceNote,
    note.heardNote,
    prov.modifiers.join(','),
    prov.seqPath.join('→'),
    locKey,
  ].join('|');
}

/** Expand a channel to final tokens (no provenance). */
export function expandChannelTokens(ast: AST, channel: ChannelNode): string[] {
  const pats = ast.pats ?? {};
  const seqs = ast.seqs ?? {};
  const insts = ast.insts ?? {};
  const presets = (ast as any).effects as Record<string, string> | undefined;
  const chAny = channel as ChannelNode & { seqSpecTokens?: string[] };
  const seqSpecTokens = Array.isArray(chAny.seqSpecTokens) ? chAny.seqSpecTokens : [];
  if (seqSpecTokens.length > 0) {
    return expandSequenceItems(seqSpecTokens, pats, insts, undefined, presets, seqs);
  }
  if (Array.isArray(channel.pat)) return channel.pat.slice();
  if (typeof channel.pat === 'string' && channel.pat.trim()) {
    const parts = channel.pat.trim().split(':');
    const base = parts[0].trim();
    const mods = parts.slice(1);
    if (pats[base]) return applyModsToTokens(pats[base].slice(), mods, presets).tokens;
    if (seqs[base]) {
      let tokens = expandSequenceItems(seqs[base] as string[], pats, insts, undefined, presets, seqs);
      if (mods.length > 0) tokens = applyModsToTokens(tokens, mods, presets).tokens;
      return tokens;
    }
  }
  return [];
}

function levelForEnforcement(enforcement: ScaleEnforcement): ParseDiagnostic['level'] | null {
  if (enforcement === 'off') return null;
  return enforcement === 'error' ? 'error' : 'warning';
}

export function validateScaleLocks(ast: AST): ParseDiagnostic[] {
  const diagnostics: ParseDiagnostic[] = [];
  const scale = ast.scale;
  if (!scale) return diagnostics;

  const severity = levelForEnforcement(scale.enforcement);
  if (!severity) return diagnostics;

  const normalizedScale = normalizeScaleDirective(scale.root, scale.mode, scale.enforcement);
  if (!normalizedScale) return diagnostics;

  const scaleLabel = `${normalizedScale.root} ${normalizedScale.mode}`;

  for (const ch of ast.channels ?? []) {
    const lock = normalizeLock((ch as any).lock as string | undefined);
    if (!lock) continue;

    const instName = ch.inst;
    const instType = instName ? String((ast.insts as any)?.[instName]?.type ?? '').toLowerCase() : '';
    if (instType === 'noise') continue;

    const allowed = buildLockPitchClasses(normalizedScale, lock);
    if (!allowed) continue;
    const allowedNames = pitchClassSetToNames(allowed);
    const grouped = new Map<string, { note: ExpandedScaleNote; count: number }>();

    for (const note of expandChannelNotesWithProvenance(ast, ch)) {
      const midi = noteToMidi(note.heardNote);
      if (midi === null) continue;
      const pitchClass = ((midi % 12) + 12) % 12;
      if (allowed.has(pitchClass)) continue;

      const key = scaleLockViolationKey(note, lock, ch.id);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, { note, count: 1 });
      }
    }

    for (const { note, count } of grouped.values()) {
      diagnostics.push({
        level: severity,
        component: 'scale-lock',
        message: formatScaleLockViolationMessage(note, lock, ch.id, scaleLabel, allowedNames, count),
        loc: note.prov.loc,
      });
    }
  }

  return diagnostics;
}

export type { ScaleDirective };
