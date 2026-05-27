import { transposePattern } from '../patterns/expand.js';
import { midiToNote, noteToMidi } from '../util/music.js';
import { normalizeArpOffsets } from '../util/arpOffsets.js';
import { warn } from '../util/diag.js';
import type { SourceLocation } from '../parser/ast.js';
import { splitTopLevel } from './splitTopLevel.js';

export interface ModResult {
  tokens: string[];
  instOverride?: string | null;
  panOverride?: string | undefined;
}
function extractEffectType(effectPart: string): string {
  if (!effectPart) return '';
  const parts = String(effectPart).split(':').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[1].toLowerCase(); // e.g. gb:pan:L -> pan
  return parts[0].toLowerCase();
}

function mergeEffectsIntoToken(token: string, presetRhs: string): string {
  if (!presetRhs || typeof token !== 'string') return token;
  const m = token.match(/^([^<]+)(<([^>]*)>)?$/);
  if (!m) return token;
  const base = m[1];
  const existing = m[3] || '';
  const existingParts = existing.split(',').map(s => s.trim()).filter(Boolean);
  const presetParts = String(presetRhs).split(/\s+/).map(s => s.trim()).filter(Boolean);
  const keep: string[] = existingParts.slice();
  const existingTypes = new Set(existingParts.map(p => extractEffectType(p)));
  for (const pp of presetParts) {
    const type = extractEffectType(pp);
    if (!existingTypes.has(type)) {
      keep.push(pp);
      existingTypes.add(type);
    }
  }
  if (keep.length === 0) return base;
  return `${base}<${keep.join(',')}>`;
}

function parseRangeNotes(rawMin: string, rawMax: string): { minMidi: number; maxMidi: number } | null {
  const minMidiRaw = noteToMidi(rawMin.trim());
  const maxMidiRaw = noteToMidi(rawMax.trim());
  if (minMidiRaw === null || maxMidiRaw === null) return null;
  return minMidiRaw <= maxMidiRaw
    ? { minMidi: minMidiRaw, maxMidi: maxMidiRaw }
    : { minMidi: maxMidiRaw, maxMidi: minMidiRaw };
}

function mapNotes(tokens: string[], fn: (midi: number, base: string, effectPart: string) => string): string[] {
  return tokens.map(t => {
    if (typeof t !== 'string' || t === '.' || t === '_' || t === '-') return t;
    const m = t.match(/^([^<]+)(<([^>]*)>)?$/);
    if (!m) return t;
    const base = m[1];
    const effectPart = m[2] || '';
    const midi = noteToMidi(base);
    if (midi === null) return t;
    return fn(midi, base, effectPart);
  });
}

function parseArpOffsets(raw: string): number[] | null {
  const offsets = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => Number.parseInt(s, 10));
  if (offsets.length === 0 || offsets.some(n => Number.isNaN(n))) return null;
  return normalizeArpOffsets(offsets);
}

/** Apply a modifier to one token for every(N,MOD); must stay token-local. */
function applyEveryInnerMod(
  token: string,
  innerMod: string,
  presets?: Record<string, string>,
  loc?: SourceLocation,
): string {
  const res = applyModsToTokens([token], [innerMod], presets, loc);
  const instSet = res.instOverride != null && res.instOverride !== '';
  const panSet = res.panOverride !== undefined;
  if (res.tokens.length !== 1 || instSet || panSet) {
    warn(
      'transforms',
      `every(...) inner modifier '${innerMod}' must produce exactly one token with no inst/pan override (got ${res.tokens.length} token(s)${instSet ? ', inst override' : ''}${panSet ? ', pan override' : ''}). Token left unchanged.`,
      { loc },
    );
    return token;
  }
  return res.tokens[0];
}

export function applyModsToTokens(tokensIn: string[], mods: string[], presets?: Record<string, string>, loc?: SourceLocation): ModResult {
  let tokens = tokensIn.slice();
  let semitones = 0;
  let octaves = 0;
  let instOverride: string | null = null;
  let panOverride: string | undefined = undefined;

  for (const mod of mods) {
    // Named effect preset: if `mod` matches a preset name, apply its RHS
    // as per-note inline effects (append to each note token unless the
    // note already has an inline effect of the same type).
    if (presets && Object.prototype.hasOwnProperty.call(presets, mod)) {
      const presetRhs = presets[mod];
      tokens = tokens.map(t => {
        if (typeof t !== 'string') return t;
        // don't apply to rests or sustain tokens
        if (t === '.' || t === '_' || t === '-') return t;
        return mergeEffectsIntoToken(t, presetRhs);
      });
      continue;
    }
    const mOct = mod.match(/^oct\(([+-]?\d+)\)$/i);
    if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
    const mRot = mod.match(/^rot(?:ate)?\(([+-]?\d+)\)$/i);
    if (mRot) {
      const len = tokens.length;
      if (len > 0) {
        const n = parseInt(mRot[1], 10);
        const shift = ((n % len) + len) % len;
        if (shift !== 0) tokens = tokens.slice(shift).concat(tokens.slice(0, shift));
      }
      continue;
    }
    if (/^rev$/i.test(mod)) { tokens = tokens.slice().reverse(); continue; }
    if (/^pal(?:indrome)?$/i.test(mod)) {
      tokens = tokens.length <= 1 ? tokens.slice() : tokens.concat(tokens.slice(0, -1).reverse());
      continue;
    }
    const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
    if (mSlow) {
      const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
      const outArr: string[] = [];
      for (const tt of tokens) for (let r = 0; r < factor; r++) outArr.push(tt);
      tokens = outArr;
      continue;
    }
    const mFast = mod.match(/^fast(?:\((\d+)\))?$/i);
    if (mFast) {
      const factor = mFast[1] ? parseInt(mFast[1], 10) : 2;
      tokens = tokens.filter((_, idx) => idx % factor === 0);
      continue;
    }
    const mInst = mod.match(/^inst\(([^)]+)\)$/i);
    if (mInst) { instOverride = mInst[1]; continue; }
    const mPan = mod.match(/^pan\(([^)]*)\)$/i);
    if (mPan) { panOverride = mPan[1].trim(); continue; }
    if (/^(mute|rest)$/i.test(mod)) {
      tokens = mapNotes(tokens, () => '.');
      continue;
    }
    const mArp = mod.match(/^arp\(([^)]*)\)$/i);
    if (mArp) {
      const offsets = parseArpOffsets(mArp[1]);
      if (offsets) {
        tokens = tokens.map(t => {
          if (typeof t !== 'string' || t === '.' || t === '_' || t === '-') return t;
          const m = t.match(/^([^<]+)(<([^>]*)>)?$/);
          if (!m) return t;
          if (noteToMidi(m[1]) === null) return t;
          return mergeEffectsIntoToken(t, `arp:${offsets.join(',')}`);
        });
        continue;
      }
    }
    const mClamp = mod.match(/^clamp\(([^,]+),([^)]*)\)$/i);
    if (mClamp) {
      const range = parseRangeNotes(mClamp[1], mClamp[2]);
      if (range) {
        tokens = mapNotes(tokens, (midi, _base, effectPart) => {
          const clamped = Math.max(range.minMidi, Math.min(range.maxMidi, midi));
          return `${midiToNote(clamped)}${effectPart}`;
        });
        continue;
      }
    }
    const mFold = mod.match(/^fold\(([^,]+),([^)]*)\)$/i);
    if (mFold) {
      const range = parseRangeNotes(mFold[1], mFold[2]);
      if (range) {
        tokens = mapNotes(tokens, (midi, _base, effectPart) => {
          let folded = midi;
          if (folded < range.minMidi) {
            folded += Math.ceil((range.minMidi - folded) / 12) * 12;
          }
          if (folded > range.maxMidi) {
            folded -= Math.ceil((folded - range.maxMidi) / 12) * 12;
          }
          folded = Math.max(range.minMidi, Math.min(range.maxMidi, folded));
          return `${midiToNote(folded)}${effectPart}`;
        });
        continue;
      }
    }
    const mTrans = mod.match(/^([+-]?\d+)$/);
    if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
    const mSem = mod.match(/^semitone\(([+-]?\d+)\)$/i)
      || mod.match(/^st\(([+-]?\d+)\)$/i)
      || mod.match(/^trans\(([+-]?\d+)\)$/i)
      || mod.match(/^transpose\(([+-]?\d+)\)$/i);
    if (mSem) { semitones += parseInt(mSem[1], 10); continue; }

    // --- Tier-2 modifiers ---

    // invert / inv: invert pitch contour around the first note (pivot).
    // Each subsequent note's interval from the pivot is negated.
    if (/^inv(?:ert)?$/i.test(mod)) {
      let pivot: number | null = null;
      tokens = tokens.map(t => {
        if (typeof t !== 'string' || t === '.' || t === '_' || t === '-') return t;
        const m = t.match(/^([^<]+)(<[^>]*>)?$/);
        if (!m) return t;
        const base = m[1];
        const effectPart = m[2] || '';
        const midi = noteToMidi(base);
        if (midi === null) return t;
        if (pivot === null) { pivot = midi; return t; }
        return `${midiToNote(2 * pivot - midi)}${effectPart}`;
      });
      continue;
    }

    // every(N, MOD): apply MOD to every Nth token (1-based: positions N, 2N, 3N, ...).
    const mEvery = mod.match(/^every\((\d+),(.+)\)$/i);
    if (mEvery) {
      const n = parseInt(mEvery[1], 10);
      const innerMod = mEvery[2].trim();
      if (n >= 1 && innerMod) {
        tokens = tokens.map((t, i) => {
          if ((i + 1) % n !== 0) return t;
          return applyEveryInnerMod(t, innerMod, presets, loc);
        });
      }
      continue;
    }

    // off(N) / lag(N): prepend N rest tokens before the pattern.
    const mOff = mod.match(/^(?:off|lag)\((\d+)\)$/i);
    if (mOff) {
      const n = parseInt(mOff[1], 10);
      if (n > 0) tokens = Array(n).fill('.').concat(tokens);
      continue;
    }

    // pick(1,3,5,...): keep only the specified 1-based indices (out-of-range ignored).
    const mPick = mod.match(/^pick\(([^)]+)\)$/i);
    if (mPick) {
      const indices = mPick[1].split(',').map(s => parseInt(s.trim(), 10) - 1);
      tokens = indices.filter(i => i >= 0 && i < tokens.length).map(i => tokens[i]);
      continue;
    }

    // chunk(N): split tokens into chunks of N and reverse each chunk.
    const mChunk = mod.match(/^chunk\((\d+)\)$/i);
    if (mChunk) {
      const n = parseInt(mChunk[1], 10);
      if (n >= 1) {
        const out: string[] = [];
        for (let i = 0; i < tokens.length; i += n) {
          out.push(...tokens.slice(i, i + n).reverse());
        }
        tokens = out;
      }
      continue;
    }

    // shuffle(seed): deterministic Fisher-Yates shuffle using a seeded LCG.
    // A seed is required to guarantee reproducible export.
    const mShuffle = mod.match(/^shuffle\((\d+)\)$/i);
    if (mShuffle) {
      const arr = tokens.slice();
      let s = parseInt(mShuffle[1], 10) >>> 0;
      for (let i = arr.length - 1; i > 0; i--) {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        const j = s % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      tokens = arr;
      continue;
    }

    // Unknown transform - emit warning
    warn('transforms', `Unknown transform '${mod}' will be ignored. Supported transforms: oct(N), rot(N)/rotate(N), rev, pal/palindrome, slow(N), fast(N), arp(...), clamp(min,max), fold(min,max), mute/rest, inst(name), pan(value), semitone(N)/st(N)/trans(N)/transpose(N), +N/-N, invert/inv, every(N,MOD), off(N)/lag(N), pick(...), chunk(N), shuffle(seed). For repetition, use pattern*N syntax instead of :rep(N).`, { loc });
  }

  if (semitones !== 0 || octaves !== 0) {
    tokens = transposePattern(tokens, { semitones, octaves });
  }

  if (instOverride) tokens.unshift(`inst(${instOverride})`);
  if (panOverride) { tokens.unshift(`pan(${panOverride})`); tokens.push(`pan()`); }

  return { tokens, instOverride, panOverride };
}

export function expandRefToTokens(itemRef: string, expandedSeqs: Record<string, string[]>, pats: Record<string, string[]>, presets?: Record<string, string>, loc?: SourceLocation): string[] {
  const parts = splitTopLevel(itemRef, ':');
  const base = parts[0];
  const mods = parts.slice(1);

  if (expandedSeqs[base]) {
    const res = applyModsToTokens(expandedSeqs[base].slice(), mods, presets, loc);
    return res.tokens;
  }

  if (pats[base]) {
    const res = applyModsToTokens(pats[base].slice(), mods, presets, loc);
    return res.tokens;
  }

  return [itemRef];
}

export default { applyModsToTokens, expandRefToTokens };
