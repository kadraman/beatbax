import { describe, it, expect } from '@jest/globals';
import { applyModsToTokens } from '../src/expand/refExpander.js';
import { buildTokenSourceMeta, getLeafPats, isNonSoundingDirectiveToken, soundingTokenCount } from '../src/song/tokenSourceMeta';

describe('tokenSourceMeta', () => {
  const pats: Record<string, string[]> = {
    deep_a: ['C4'],
    deep_b: ['D4'],
    land: ['E4', 'G4'],
  };
  const seqs: Record<string, string[]> = {
    deep: ['deep_a', 'deep_b'],
    mel: ['deep', 'land'],
  };

  it('records the enclosing seq path on nested seq leaves', () => {
    const leaves = getLeafPats('deep', seqs, pats, ['mel']);
    expect(leaves).toEqual([
      { patBase: 'deep_a', count: 1, seqPath: ['mel', 'deep'] },
      { patBase: 'deep_b', count: 1, seqPath: ['mel', 'deep'] },
    ]);
  });

  it('keeps the outer seq path when the item is a pattern', () => {
    const leaves = getLeafPats('land', seqs, pats, ['mel']);
    expect(leaves).toEqual([
      { patBase: 'land', count: 2, seqPath: ['mel'] },
    ]);
  });

  it('scales nested seq names onto expanded tokens', () => {
    const meta = buildTokenSourceMeta(['deep', 'land'], 4, pats, seqs, 'mel');
    expect(meta.map(m => m.seqName)).toEqual(['deep', 'deep', 'mel', 'mel']);
    expect(meta.map(m => m.patBase)).toEqual(['deep_a', 'deep_b', 'land', 'land']);
    expect(meta.map(m => m.patternIndex)).toEqual([0, 1, 2, 2]);
    expect(meta[0].seqPath).toEqual(['mel', 'deep']);
    expect(meta[2].seqPath).toEqual(['mel']);
  });

  it('counts sounding tokens only, ignoring inst directives', () => {
    const patsWithInst: Record<string, string[]> = {
      a: ['inst lead', 'C4', '_', '_', '_'],
    };
    expect(getLeafPats('a', {}, patsWithInst, ['s'])).toEqual([
      { patBase: 'a', count: 4, seqPath: ['s'] },
    ]);
  });

  it('treats inst(name) and inst(name,N) as non-sounding directives', () => {
    expect(isNonSoundingDirectiveToken('inst(bass)')).toBe(true);
    expect(isNonSoundingDirectiveToken('inst(hat,2)')).toBe(true);
    expect(soundingTokenCount(['C6', 'C6', 'inst(hat,2)', 'C6', 'C6'])).toBe(4);
    expect(getLeafPats('a', {}, { a: ['C6', 'C6', 'inst(hat,2)', 'C6', 'C6'] }, ['s'])).toEqual([
      { patBase: 'a', count: 4, seqPath: ['s'] },
    ]);
  });

  it('walks three nested sequence levels', () => {
    const nestedSeqs = {
      ...seqs,
      form: ['mel'],
    };
    const meta = buildTokenSourceMeta(['mel'], 4, pats, nestedSeqs, 'form');
    expect(meta[0].seqPath).toEqual(['form', 'mel', 'deep']);
    expect(meta[0].seqName).toBe('deep');
    expect(meta[3].seqPath).toEqual(['form', 'mel']);
    expect(meta[3].seqName).toBe('mel');
  });

  it('applies fast(2) to the expanded stream, not each leaf independently', () => {
    const groupPats = { a: ['C4'], b: ['D4'] };
    const groupSeqs = { group: ['a', 'b'] };
    const meta = buildTokenSourceMeta(['a', 'b'], 1, groupPats, groupSeqs, 'group', ['fast(2)']);
    expect(meta).toHaveLength(1);
    expect(meta[0].patBase).toBe('a');
  });

  it('applies pal to the expanded stream for correct step attribution order', () => {
    const groupPats = { a: ['C4'], b: ['D4'] };
    const groupSeqs = { group: ['a', 'b'] };
    const meta = buildTokenSourceMeta(['a', 'b'], 3, groupPats, groupSeqs, 'group', ['pal']);
    expect(meta.map((m) => m.patBase)).toEqual(['a', 'b', 'a']);
    expect(meta.map((m) => m.patternIndex)).toEqual([0, 1, 2]);
  });

  it('applies slow to the expanded stream', () => {
    const groupPats = { a: ['C4'], b: ['D4'] };
    const groupSeqs = { group: ['a', 'b'] };
    const meta = buildTokenSourceMeta(['a', 'b'], 4, groupPats, groupSeqs, 'group', ['slow(2)']);
    expect(meta.map((m) => m.patBase)).toEqual(['a', 'a', 'b', 'b']);
  });

  it('applies item-level mods to the item stream before concatenation', () => {
    const meta = buildTokenSourceMeta(['deep', 'land:slow(2)'], 6, pats, seqs, 'mel');
    expect(meta.map((m) => m.patBase)).toEqual(['deep_a', 'deep_b', 'land', 'land', 'land', 'land']);
  });

  it('handles parenthesized groups with stream-level mods', () => {
    const groupPats = { a: ['C4'], b: ['D4'] };
    const leaves = getLeafPats('(a b):fast(2)', {}, groupPats, ['group']);
    expect(leaves).toEqual([{ patBase: 'a', count: 1, seqPath: ['group'] }]);
  });

  it('assigns distinct patternIndex to repeated pat references', () => {
    const meta = buildTokenSourceMeta(['p', 'p', 'p', 'p'], 4, { p: ['C4'] }, {}, 's');
    expect(meta.map((m) => m.patternIndex)).toEqual([0, 1, 2, 3]);
  });

  it('assigns distinct patternIndex to spaced repeat operator', () => {
    const meta = buildTokenSourceMeta(['p * 4'], 4, { p: ['C4'] }, {}, 's');
    expect(meta.map((m) => m.patternIndex)).toEqual([0, 1, 2, 3]);
  });

  describe('structural modifiers (off/lag, pick, chunk, shuffle)', () => {
    const corePats = { lead_core: ['C4', 'D4', 'E4', 'G4'] };

    function expectExactMeta(
      seqItems: string[],
      mods: string[],
      totalTokens: number,
      expectedPatBases: string[],
      outerSeqName = 'demo',
    ): void {
      const meta = buildTokenSourceMeta(seqItems, totalTokens, corePats, {}, outerSeqName, mods);
      expect(meta).toHaveLength(totalTokens);
      expect(meta.map((m) => m.patBase)).toEqual(expectedPatBases);
    }

    it('applies off/lag padding at stream level', () => {
      const offTokens = applyModsToTokens(corePats.lead_core, ['off(2)']).tokens;
      expect(offTokens).toHaveLength(6);
      expectExactMeta(['lead_core'], ['off(2)'], 6, ['.', '.', 'lead_core', 'lead_core', 'lead_core', 'lead_core']);

      const lagTokens = applyModsToTokens(corePats.lead_core, ['lag(1)']).tokens;
      expect(lagTokens).toHaveLength(5);
      expectExactMeta(['lead_core'], ['lag(1)'], 5, ['.', 'lead_core', 'lead_core', 'lead_core', 'lead_core']);
    });

    it('applies item-level off/lag before concatenation', () => {
      const meta = buildTokenSourceMeta(['lead_core:off(2)', 'lead_core'], 10, corePats, {}, 'demo');
      expect(meta).toHaveLength(10);
      expect(meta.slice(0, 2).map((m) => m.patBase)).toEqual(['.', '.']);
      expect(meta.slice(2, 6).map((m) => m.patBase)).toEqual(['lead_core', 'lead_core', 'lead_core', 'lead_core']);
      expect(meta.slice(6).map((m) => m.patBase)).toEqual(['lead_core', 'lead_core', 'lead_core', 'lead_core']);
      expect(meta[6].patternIndex).toBe(1);
    });

    it('applies pick at stream level', () => {
      const pickTokens = applyModsToTokens(corePats.lead_core, ['pick(1,3)']).tokens;
      expect(pickTokens).toEqual(['C4', 'E4']);
      expectExactMeta(['lead_core'], ['pick(1,3)'], 2, ['lead_core', 'lead_core']);
    });

    it('applies chunk at stream level', () => {
      const chunkTokens = applyModsToTokens(corePats.lead_core, ['chunk(2)']).tokens;
      expect(chunkTokens).toEqual(['D4', 'C4', 'G4', 'E4']);
      expectExactMeta(['lead_core'], ['chunk(2)'], 4, ['lead_core', 'lead_core', 'lead_core', 'lead_core']);
    });

    it('applies shuffle with deterministic reordering', () => {
      const pats = { a: ['C4'], b: ['D4'], c: ['E4'], d: ['G4'] };
      const shuffledLabels = ['a', 'b', 'c', 'd'];
      let s = 42 >>> 0;
      for (let i = shuffledLabels.length - 1; i > 0; i--) {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        const j = s % (i + 1);
        [shuffledLabels[i], shuffledLabels[j]] = [shuffledLabels[j], shuffledLabels[i]];
      }
      const meta = buildTokenSourceMeta(['a', 'b', 'c', 'd'], 4, pats, {}, 'core', ['shuffle(42)']);
      expect(meta.map((m) => m.patBase)).toEqual(shuffledLabels);
      expect(applyModsToTokens(['C4', 'D4', 'E4', 'G4'], ['shuffle(42)']).tokens).toHaveLength(4);
    });

    it('does not increment patternIndex across off/lag padding into the pattern', () => {
      const meta = buildTokenSourceMeta(['lead_core'], 6, corePats, {}, 'demo', ['off(2)']);
      expect(meta.map((m) => m.patternIndex)).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });
});
