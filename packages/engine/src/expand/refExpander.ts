import { transposePattern } from '../patterns/expand.js';
import { warn } from '../util/diag.js';
import type { SourceLocation } from '../parser/ast.js';

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
    const mOct = mod.match(/^oct\((-?\d+)\)$/i);
    if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
    if (/^rev$/i.test(mod)) { tokens = tokens.slice().reverse(); continue; }
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
    const mTrans = mod.match(/^([+-]?\d+)$/);
    if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
    const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
    if (mSem) { semitones += parseInt(mSem[1], 10); continue; }
    
    // Unknown transform - emit warning
    warn('transforms', `Unknown transform '${mod}' will be ignored. Supported transforms: oct(N), rev, slow(N), fast(N), inst(name), pan(value), semitone(N)/st(N)/trans(N), +N/-N. For repetition, use pattern*N syntax instead of :rep(N).`, { loc });
  }

  if (semitones !== 0 || octaves !== 0) {
    tokens = transposePattern(tokens, { semitones, octaves });
  }

  if (instOverride) tokens.unshift(`inst(${instOverride})`);
  if (panOverride) { tokens.unshift(`pan(${panOverride})`); tokens.push(`pan()`); }

  return { tokens, instOverride, panOverride };
}

export function expandRefToTokens(itemRef: string, expandedSeqs: Record<string, string[]>, pats: Record<string, string[]>, presets?: Record<string, string>, loc?: SourceLocation): string[] {
  const parts = itemRef.split(':');
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
