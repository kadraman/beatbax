import { transposePattern } from '../patterns/expand.js';

/**
 * Expand sequence definitions into flat token arrays by resolving pattern
 * references and applying sequence-level transforms (oct, rev, slow, fast,
 * semitone transposition, and inst(name) override which is emitted as an
 * `inst(name)` token preceding the pattern tokens).
 */
const splitTopLevel = (s: string, sep = ':'): string[] => {
  const out: string[] = [];
  let cur = '';
  let inS = false;
  let inD = false;
  let bracket = 0;
  let paren = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inD) { inS = !inS; cur += ch; continue; }
    if (ch === '"' && !inS) { inD = !inD; cur += ch; continue; }
    if (inS || inD) { cur += ch; continue; }
    if (ch === '[') { bracket++; cur += ch; continue; }
    if (ch === ']') { if (bracket > 0) bracket--; cur += ch; continue; }
    if (ch === '(') { paren++; cur += ch; continue; }
    if (ch === ')') { if (paren > 0) paren--; cur += ch; continue; }
    if (ch === sep && bracket === 0 && paren === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
};

export function expandSequenceItems(items: string[], pats: Record<string, string[]>, _missingWarned?: Set<string>): string[] {
  const out: string[] = [];
  const missingWarned = _missingWarned || new Set<string>();

  for (const it of items) {
    if (!it || it.trim() === '') continue;
    const parts = splitTopLevel(it, ':');
    const base = parts[0];
    const mods = parts.slice(1);

    // Support repetition syntax in sequence items: base may be "name*2" or a group "(A B)*2"
    let repeat = 1;
    const mRepBase = base.match(/^(.+?)\*(\d+)$/);
    let realBase = base;
    if (mRepBase) {
      realBase = mRepBase[1];
      repeat = parseInt(mRepBase[2], 10);
    }

    // If this is a parenthesized group, expand inner items recursively
    let tokens: string[] = [];
    const mGroup = realBase.match(/^\((.*)\)$/s);
    if (mGroup) {
      const inner = mGroup[1].trim();
      const innerParts = inner.match(/[^\s]+/g) || [];
      tokens = expandSequenceItems(innerParts, pats, missingWarned);
    } else if (pats[realBase]) {
      tokens = pats[realBase].slice();
    } else {
      tokens = [realBase];
      if (realBase && !missingWarned.has(realBase)) {
        missingWarned.add(realBase);
        console.warn(`[BeatBax Parser] Warning: sequence item '${realBase}' referenced but no pattern named '${realBase}' was found.`);
      }
    }

    let semitones = 0;
    let octaves = 0;
    let instOverride: string | null = null;

    for (const mod of mods) {
      const mOct = mod.match(/^oct\((-?\d+)\)$/i);
      if (mOct) { octaves += parseInt(mOct[1], 10); continue; }
      if (/^rev$/i.test(mod)) { tokens = tokens.slice().reverse(); continue; }
      const mSlow = mod.match(/^slow(?:\((\d+)\))?$/i);
      if (mSlow) {
        const factor = mSlow[1] ? parseInt(mSlow[1], 10) : 2;
        const outTokens: string[] = [];
        for (const t of tokens) for (let r = 0; r < factor; r++) outTokens.push(t);
        tokens = outTokens;
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
      const mTrans = mod.match(/^([+-]?\d+)$/);
      if (mTrans) { semitones += parseInt(mTrans[1], 10); continue; }
      const mSem = mod.match(/^semitone\((-?\d+)\)$/i) || mod.match(/^st\((-?\d+)\)$/i) || mod.match(/^trans\((-?\d+)\)$/i);
      if (mSem) { semitones += parseInt(mSem[1], 10); continue; }
    }

    if (semitones !== 0 || octaves !== 0) {
      tokens = transposePattern(tokens, { semitones: semitones, octaves: octaves });
    }

    if (instOverride) {
      out.push(`inst(${instOverride})`);
    }

    for (let r = 0; r < repeat; r++) {
      out.push(...tokens);
    }
  }
  return out;
}

export function expandAllSequences(seqs: Record<string, string[]>, pats: Record<string, string[]>): Record<string, string[]> {
  const res: Record<string, string[]> = {};
  for (const [name, items] of Object.entries(seqs)) {
    res[name] = expandSequenceItems(items, pats);
  }
  return res;
}

export default { expandSequenceItems, expandAllSequences };
