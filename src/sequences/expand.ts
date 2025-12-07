import { transposePattern } from '../patterns/expand';

/**
 * Expand sequence definitions into flat token arrays by resolving pattern
 * references and applying sequence-level transforms (oct, rev, slow, fast,
 * semitone transposition, and inst(name) override which is emitted as an
 * `inst(name)` token preceding the pattern tokens).
 */
export function expandSequenceItems(items: string[], pats: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (!it || it.trim() === '') continue;
    const parts = it.split(':');
    const base = parts[0];
    const mods = parts.slice(1);

    // Resolve base to tokens (if pattern exists), otherwise treat as literal token
    let tokens: string[] = pats[base] ? pats[base].slice() : [base];

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

    out.push(...tokens);
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
