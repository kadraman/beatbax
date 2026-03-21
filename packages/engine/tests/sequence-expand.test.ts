import * as seqs from '../src/sequences/expand';
import { parse } from '../src/parser';

describe('sequence expand (smoke)', () => {
  test('expandAllSequences is available', () => {
    expect(typeof seqs.expandAllSequences === 'function').toBeTruthy();
  });
});

describe('expandSequenceItems — seq-to-seq references', () => {
  const pats: Record<string, string[]> = {
    A: ['C4', 'D4'],
    B: ['E4', 'F4'],
    C: ['G4'],
  };

  test('a seq referencing another seq flattens both into one token stream', () => {
    const seqDefs: Record<string, string[]> = {
      inner: ['A', 'B'],
      outer: ['inner', 'C'],
    };
    const result = seqs.expandAllSequences(seqDefs, pats);
    // outer should be A + B + C = [C4, D4, E4, F4, G4]
    expect(result.outer).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
    // inner itself is unaffected
    expect(result.inner).toEqual(['C4', 'D4', 'E4', 'F4']);
  });

  test('deeply nested seq references are fully expanded', () => {
    const seqDefs: Record<string, string[]> = {
      s1: ['A'],
      s2: ['s1', 'B'],
      s3: ['s2', 'C'],
    };
    const result = seqs.expandAllSequences(seqDefs, pats);
    expect(result.s3).toEqual(['C4', 'D4', 'E4', 'F4', 'G4']);
  });

  test('seq reference can carry transforms (e.g. oct)', () => {
    const seqDefs: Record<string, string[]> = {
      melody: ['A'],
      // Note: raw applyModsToTokens regex accepts plain integers (no + prefix);
      // the + prefix is handled by the peggy parser layer, not this code path.
      shifted: ['melody:oct(1)'],
    };
    const result = seqs.expandAllSequences(seqDefs, pats);
    // C4/D4 transposed up one octave → C5/D5
    expect(result.shifted).toEqual(['C5', 'D5']);
  });

  test('seq reference with repetition expands the referenced seq N times', () => {
    const seqDefs: Record<string, string[]> = {
      riff: ['A'],
      loop: ['riff*2'],
    };
    const result = seqs.expandAllSequences(seqDefs, pats);
    expect(result.loop).toEqual(['C4', 'D4', 'C4', 'D4']);
  });
});

describe('expandSequenceItems — circular reference detection', () => {
  const pats: Record<string, string[]> = { A: ['C4'] };

  test('direct self-reference is skipped without throwing or hanging', () => {
    const seqDefs: Record<string, string[]> = {
      self: ['self', 'A'],
    };
    // Must not throw and must not hang
    let result: Record<string, string[]> | undefined;
    expect(() => { result = seqs.expandAllSequences(seqDefs, pats); }).not.toThrow();
    // The 'self' reference recursively expands ['self', 'A'] with 'self' in the
    // visiting set: the inner 'self' is skipped (→[]) and inner 'A' yields [C4].
    // Then the outer 'A' item also expands to [C4]. Final: [C4, C4].
    expect(result!.self).toEqual(['C4', 'C4']);
  });

  test('mutual cycle (A→B→A) is detected and skipped safely', () => {
    const seqDefs: Record<string, string[]> = {
      seqA: ['seqB'],
      seqB: ['seqA'],
    };
    let result: Record<string, string[]> | undefined;
    expect(() => { result = seqs.expandAllSequences(seqDefs, pats); }).not.toThrow();
    // Both sequences contain only the cycle — they produce empty arrays
    expect(result!.seqA).toEqual([]);
    expect(result!.seqB).toEqual([]);
  });

  test('longer cycle (A→B→C→A) is detected and broken', () => {
    const seqDefs: Record<string, string[]> = {
      seqX: ['seqY'],
      seqY: ['seqZ'],
      seqZ: ['seqX', 'A'],
    };
    let result: Record<string, string[]> | undefined;
    expect(() => { result = seqs.expandAllSequences(seqDefs, pats); }).not.toThrow();
    // When expanding seqZ from the top-level, the seqX reference walks the cycle
    // (seqX→seqY→seqZ) until seqZ is already in the visiting set; the inner
    // seqX is skipped (→[]) and the inner 'A' yields [C4] — giving seqX=[C4].
    // The outer 'A' item in seqZ then produces another [C4]. Final: [C4, C4].
    expect(result!.seqZ).toEqual(['C4', 'C4']);
  });

  test('non-cyclic sibling seqs are unaffected when another pair is cyclic', () => {
    const seqDefs: Record<string, string[]> = {
      cycle1: ['cycle2'],
      cycle2: ['cycle1'],
      clean: ['A'],
    };
    let result: Record<string, string[]> | undefined;
    expect(() => { result = seqs.expandAllSequences(seqDefs, pats); }).not.toThrow();
    expect(result!.clean).toEqual(['C4']);
  });
});
