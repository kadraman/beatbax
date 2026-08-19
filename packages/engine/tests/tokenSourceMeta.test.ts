import { describe, it, expect } from '@jest/globals';
import { buildTokenSourceMeta, getLeafPats } from '../src/song/tokenSourceMeta';

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
});
