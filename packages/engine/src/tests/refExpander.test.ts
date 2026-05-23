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
    const res = applyModsToTokens(base, ['arp(4,7)']);
    expect(res.tokens).toEqual(['C4<arp:4,7>', '.', 'E4<vib:3,6,arp:4,7>', 'inst(bass)']);
  });

  test('arp(...) strips redundant leading zero', () => {
    const base = ['C4'];
    const res = applyModsToTokens(base, ['arp(0,4,7)']);
    expect(res.tokens).toEqual(['C4<arp:4,7>']);
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

  // --- Tier-2 modifier tests ---

  test('invert/inv inverts pitch contour around the first note', () => {
    // Pivot = C4 (MIDI 60). E4 (64) → 2*60-64 = 56 = G#3. G4 (67) → 2*60-67 = 53 = F3.
    const base = ['C4', 'E4', 'G4'];
    expect(applyModsToTokens(base, ['invert']).tokens).toEqual(['C4', 'G#3', 'F3']);
    expect(applyModsToTokens(base, ['inv']).tokens).toEqual(['C4', 'G#3', 'F3']);
  });

  test('invert preserves rests and non-note tokens', () => {
    const base = ['C4', '.', 'E4', 'inst(bass)'];
    expect(applyModsToTokens(base, ['invert']).tokens).toEqual(['C4', '.', 'G#3', 'inst(bass)']);
  });

  test('invert preserves inline effects on notes', () => {
    const base = ['C4', 'E4<vib:3,6>'];
    const res = applyModsToTokens(base, ['invert']);
    expect(res.tokens[0]).toBe('C4');
    expect(res.tokens[1]).toBe('G#3<vib:3,6>');
  });

  test('every(N,MOD) applies MOD to every Nth token (1-based)', () => {
    // every(2,oct(+1)): positions 2,4 get octave bump → tokens at indices 1,3
    const base = ['C4', 'D4', 'E4', 'G4'];
    const res = applyModsToTokens(base, ['every(2,oct(+1))']);
    expect(res.tokens).toEqual(['C4', 'D5', 'E4', 'G5']);
  });

  test('every(N,MOD) with simple modifier (rev excluded as no-op on single token)', () => {
    // every(3,mute): position 3 becomes a rest
    const base = ['C4', 'D4', 'E4', 'G4', 'A4', 'B4'];
    const res = applyModsToTokens(base, ['every(3,mute)']);
    expect(res.tokens).toEqual(['C4', 'D4', '.', 'G4', 'A4', '.']);
  });

  test('off(N)/lag(N) prepends N rest tokens', () => {
    const base = ['C4', 'E4'];
    expect(applyModsToTokens(base, ['off(2)']).tokens).toEqual(['.', '.', 'C4', 'E4']);
    expect(applyModsToTokens(base, ['lag(3)']).tokens).toEqual(['.', '.', '.', 'C4', 'E4']);
  });

  test('off(0) is a no-op', () => {
    const base = ['C4', 'E4'];
    expect(applyModsToTokens(base, ['off(0)']).tokens).toEqual(['C4', 'E4']);
  });

  test('pick(indices) keeps only the specified 1-based positions', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4'];
    expect(applyModsToTokens(base, ['pick(1,3,5)']).tokens).toEqual(['C4', 'E4', 'A4']);
  });

  test('pick ignores out-of-range indices', () => {
    const base = ['C4', 'D4', 'E4'];
    expect(applyModsToTokens(base, ['pick(1,2,99)']).tokens).toEqual(['C4', 'D4']);
  });

  test('chunk(N) reverses each chunk of N tokens', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4', 'B4'];
    // chunk(3): [C4,D4,E4] → [E4,D4,C4]; [G4,A4,B4] → [B4,A4,G4]
    expect(applyModsToTokens(base, ['chunk(3)']).tokens).toEqual(['E4', 'D4', 'C4', 'B4', 'A4', 'G4']);
  });

  test('chunk(N) handles non-even last chunk', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4'];
    // chunk(3): [C4,D4,E4] → [E4,D4,C4]; [G4,A4] → [A4,G4]
    expect(applyModsToTokens(base, ['chunk(3)']).tokens).toEqual(['E4', 'D4', 'C4', 'A4', 'G4']);
  });

  test('shuffle(seed) produces deterministic reordering', () => {
    const base = ['C4', 'D4', 'E4', 'G4'];
    const r1 = applyModsToTokens(base, ['shuffle(42)']).tokens;
    const r2 = applyModsToTokens(base, ['shuffle(42)']).tokens;
    // Same seed must produce the same result
    expect(r1).toEqual(r2);
    // Result is a permutation of the input (all elements present)
    expect([...r1].sort()).toEqual([...base].sort());
    // Different seed produces a different result (with overwhelming probability)
    const r3 = applyModsToTokens(base, ['shuffle(99)']).tokens;
    expect(r3).not.toEqual(r1);
  });
});
