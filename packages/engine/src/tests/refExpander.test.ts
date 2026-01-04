import { applyModsToTokens } from '../expand/refExpander.js';

describe('applyModsToTokens', () => {
  test('octave and semitone transposition', () => {
    const base = ['C4', 'E4', 'G4'];
    const res = applyModsToTokens(base, ['oct(-1)', '+12']);
    // oct(-1) should lower octave by 1 (C3,E3,G3), then +12 semitones brings back to C4 etc.
    expect(res.tokens).toEqual(['C4', 'E4', 'G4']);
  });

  test('rev reversal', () => {
    const base = ['A','B','C'];
    const res = applyModsToTokens(base, ['rev']);
    expect(res.tokens).toEqual(['C','B','A']);
  });

  test('slow repeats tokens', () => {
    const base = ['X','Y'];
    const res = applyModsToTokens(base, ['slow(3)']);
    expect(res.tokens).toEqual(['X','X','X','Y','Y','Y']);
  });

  test('fast takes every nth token', () => {
    const base = ['a','b','c','d','e','f'];
    const res = applyModsToTokens(base, ['fast(2)']);
    expect(res.tokens).toEqual(['a','c','e']);
  });

  test('inst override and pan', () => {
    const base = ['note1','note2'];
    const res = applyModsToTokens(base, ['inst(bass)', 'pan(L)']);
    // inst override should be prepended, pan should wrap with pan() at end
    expect(res.tokens[0]).toBe('inst(bass)');
    expect(res.tokens[res.tokens.length - 1]).toBe('pan()');
  });

  test('no-op when base missing tokens', () => {
    const base: string[] = [];
    const res = applyModsToTokens(base, ['oct(1)']);
    expect(Array.isArray(res.tokens)).toBe(true);
  });
});
