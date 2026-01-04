import { transposePattern } from '../patterns/expand.js';

export interface ModResult {
  tokens: string[];
  instOverride?: string | null;
  panOverride?: string | undefined;
}

export function applyModsToTokens(tokensIn: string[], mods: string[]): ModResult {
  let tokens = tokensIn.slice();
  let semitones = 0;
  let octaves = 0;
  let instOverride: string | null = null;
  let panOverride: string | undefined = undefined;

  for (const mod of mods) {
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
  }

  if (semitones !== 0 || octaves !== 0) {
    tokens = transposePattern(tokens, { semitones, octaves });
  }

  if (instOverride) tokens.unshift(`inst(${instOverride})`);
  if (panOverride) { tokens.unshift(`pan(${panOverride})`); tokens.push(`pan()`); }

  return { tokens, instOverride, panOverride };
}

export function expandRefToTokens(itemRef: string, expandedSeqs: Record<string, string[]>, pats: Record<string, string[]>): string[] {
  const parts = itemRef.split(':');
  const base = parts[0];
  const mods = parts.slice(1);

  if (expandedSeqs[base]) {
    const res = applyModsToTokens(expandedSeqs[base].slice(), mods);
    return res.tokens;
  }

  if (pats[base]) {
    const res = applyModsToTokens(pats[base].slice(), mods);
    return res.tokens;
  }

  return [itemRef];
}

export default { applyModsToTokens, expandRefToTokens };
