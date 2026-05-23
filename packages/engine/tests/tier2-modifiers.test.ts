import { applyModsToTokens } from '../src/expand/refExpander.js';

describe('tier-2 modifiers', () => {
  // -----------------------------------------------------------------------
  // invert / inv
  // -----------------------------------------------------------------------

  test('invert inverts pitch contour around the first note (pivot)', () => {
    // Pivot = C4 (MIDI 60).
    // D4 (62) → 2*60-62 = 58 = A#3
    // E4 (64) → 2*60-64 = 56 = G#3
    // G4 (67) → 2*60-67 = 53 = F3
    const base = ['C4', 'D4', 'E4', 'G4'];
    expect(applyModsToTokens(base, ['invert']).tokens).toEqual(['C4', 'A#3', 'G#3', 'F3']);
    expect(applyModsToTokens(base, ['inv']).tokens).toEqual(['C4', 'A#3', 'G#3', 'F3']);
  });

  test('invert preserves rests and non-note tokens unchanged', () => {
    const base = ['C4', '.', 'E4', 'inst(bass)'];
    expect(applyModsToTokens(base, ['invert']).tokens).toEqual(['C4', '.', 'G#3', 'inst(bass)']);
  });

  test('invert preserves inline effects on transposed notes', () => {
    const base = ['C4', 'E4<vib:3,6>'];
    const res = applyModsToTokens(base, ['invert']);
    expect(res.tokens[0]).toBe('C4');
    expect(res.tokens[1]).toBe('G#3<vib:3,6>');
  });

  test('invert on single note is a no-op', () => {
    expect(applyModsToTokens(['C4'], ['invert']).tokens).toEqual(['C4']);
  });

  // -----------------------------------------------------------------------
  // every(N, MOD)
  // -----------------------------------------------------------------------

  test('every(2,oct(+1)) bumps every 2nd token up by one octave (1-based)', () => {
    // Positions 2 and 4 (indices 1 and 3) get oct(+1)
    const base = ['C4', 'D4', 'E4', 'G4'];
    expect(applyModsToTokens(base, ['every(2,oct(+1))']).tokens).toEqual(['C4', 'D5', 'E4', 'G5']);
  });

  test('every(3,mute) silences every 3rd token', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4', 'B4'];
    expect(applyModsToTokens(base, ['every(3,mute)']).tokens).toEqual(['C4', 'D4', '.', 'G4', 'A4', '.']);
  });

  test('every(1,oct(-1)) shifts all tokens', () => {
    const base = ['C4', 'D4', 'E4'];
    expect(applyModsToTokens(base, ['every(1,oct(-1))']).tokens).toEqual(['C3', 'D3', 'E3']);
  });

  // -----------------------------------------------------------------------
  // off(N) / lag(N)
  // -----------------------------------------------------------------------

  test('off(N) prepends N rest tokens before the pattern', () => {
    const base = ['C4', 'E4'];
    expect(applyModsToTokens(base, ['off(2)']).tokens).toEqual(['.', '.', 'C4', 'E4']);
  });

  test('lag(N) is an alias for off(N)', () => {
    const base = ['C4', 'E4'];
    expect(applyModsToTokens(base, ['lag(3)']).tokens).toEqual(['.', '.', '.', 'C4', 'E4']);
  });

  test('off(0) is a no-op', () => {
    const base = ['C4', 'E4'];
    expect(applyModsToTokens(base, ['off(0)']).tokens).toEqual(['C4', 'E4']);
  });

  // -----------------------------------------------------------------------
  // pick(1,3,5,...)
  // -----------------------------------------------------------------------

  test('pick(1,3,5) keeps only specified 1-based positions', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4'];
    expect(applyModsToTokens(base, ['pick(1,3,5)']).tokens).toEqual(['C4', 'E4', 'A4']);
  });

  test('pick(2,4) keeps offbeat positions', () => {
    const base = ['C4', 'D4', 'E4', 'G4'];
    expect(applyModsToTokens(base, ['pick(2,4)']).tokens).toEqual(['D4', 'G4']);
  });

  test('pick ignores out-of-range indices silently', () => {
    const base = ['C4', 'D4', 'E4'];
    expect(applyModsToTokens(base, ['pick(1,2,99)']).tokens).toEqual(['C4', 'D4']);
  });

  test('pick preserves rest tokens by index', () => {
    const base = ['C4', '.', 'E4', 'G4'];
    expect(applyModsToTokens(base, ['pick(1,2)']).tokens).toEqual(['C4', '.']);
  });

  // -----------------------------------------------------------------------
  // chunk(N)
  // -----------------------------------------------------------------------

  test('chunk(2) reverses every pair of tokens', () => {
    const base = ['C4', 'D4', 'E4', 'G4'];
    // [C4,D4] → [D4,C4]; [E4,G4] → [G4,E4]
    expect(applyModsToTokens(base, ['chunk(2)']).tokens).toEqual(['D4', 'C4', 'G4', 'E4']);
  });

  test('chunk(3) reverses each group of 3; last partial chunk also reversed', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4'];
    // [C4,D4,E4] → [E4,D4,C4]; [G4,A4] → [A4,G4]
    expect(applyModsToTokens(base, ['chunk(3)']).tokens).toEqual(['E4', 'D4', 'C4', 'A4', 'G4']);
  });

  test('chunk(1) is a no-op (single-element chunks reverse to themselves)', () => {
    const base = ['C4', 'D4', 'E4'];
    expect(applyModsToTokens(base, ['chunk(1)']).tokens).toEqual(['C4', 'D4', 'E4']);
  });

  // -----------------------------------------------------------------------
  // shuffle(seed)
  // -----------------------------------------------------------------------

  test('shuffle(seed) produces a deterministic permutation', () => {
    const base = ['C4', 'D4', 'E4', 'G4'];
    const r1 = applyModsToTokens(base, ['shuffle(42)']).tokens;
    const r2 = applyModsToTokens(base, ['shuffle(42)']).tokens;
    expect(r1).toEqual(r2);
    expect([...r1].sort()).toEqual([...base].sort());
  });

  test('different seeds produce different orderings', () => {
    const base = ['C4', 'D4', 'E4', 'G4', 'A4', 'B4'];
    const r1 = applyModsToTokens(base, ['shuffle(1)']).tokens;
    const r2 = applyModsToTokens(base, ['shuffle(2)']).tokens;
    expect(r1).not.toEqual(r2);
  });

  test('shuffle(seed) preserves rest tokens as part of the permutation', () => {
    const base = ['C4', '.', 'E4', 'G4'];
    const res = applyModsToTokens(base, ['shuffle(10)']).tokens;
    expect(res.filter(t => t === '.')).toHaveLength(1);
    expect(res.length).toBe(4);
  });
});
