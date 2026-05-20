import { applyModsToTokens } from '../expand/refExpander.js';

describe('applyModsToTokens', () => {
  test('oct(+N) accepts explicit plus sign', () => {
    const base = ['C4', 'E4', 'G4'];
    const res = applyModsToTokens(base, ['oct(+1)']);
    expect(res.tokens).toEqual(['C5', 'E5', 'G5']);
  });

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

  test('rot/rotate performs cyclic left shift', () => {
    const base = ['A', 'B', 'C', 'D'];
    expect(applyModsToTokens(base, ['rot(1)']).tokens).toEqual(['B', 'C', 'D', 'A']);
    expect(applyModsToTokens(base, ['rotate(2)']).tokens).toEqual(['C', 'D', 'A', 'B']);
  });

  test('pal/palindrome mirrors sequence without duplicating pivot', () => {
    const base = ['A', 'B', 'C'];
    expect(applyModsToTokens(base, ['pal']).tokens).toEqual(['A', 'B', 'C', 'B', 'A']);
    expect(applyModsToTokens(base, ['palindrome']).tokens).toEqual(['A', 'B', 'C', 'B', 'A']);
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

  test('arp(...) applies inline arp effect only to notes', () => {
    const base = ['C4', '.', 'E4<vib:3,6>', 'inst(bass)'];
    const res = applyModsToTokens(base, ['arp(0,4,7)']);
    expect(res.tokens).toEqual(['C4<arp:0,4,7>', '.', 'E4<vib:3,6,arp:0,4,7>', 'inst(bass)']);
  });

  test('clamp(min,max) clips notes into range', () => {
    const base = ['A2', 'C4', 'E6'];
    const res = applyModsToTokens(base, ['clamp(C3,C5)']);
    expect(res.tokens).toEqual(['C3', 'C4', 'C5']);
  });

  test('fold(min,max) octave-wraps notes into range', () => {
    const base = ['A2', 'C4', 'E6'];
    const res = applyModsToTokens(base, ['fold(C3,C5)']);
    expect(res.tokens).toEqual(['A3', 'C4', 'E5']);
  });

  test('mute/rest replace notes with rests but preserve non-notes', () => {
    const base = ['C4', '.', 'inst(bass)', 'E4<vib:3,6>'];
    expect(applyModsToTokens(base, ['mute']).tokens).toEqual(['.', '.', 'inst(bass)', '.']);
    expect(applyModsToTokens(base, ['rest']).tokens).toEqual(['.', '.', 'inst(bass)', '.']);
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

  test('transpose(+N) alias applies semitone shift', () => {
    const base = ['C4', 'E4', 'G4'];
    const res = applyModsToTokens(base, ['transpose(+2)']);
    expect(res.tokens).toEqual(['D4', 'F#4', 'A4']);
  });
});
