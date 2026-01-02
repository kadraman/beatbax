import parseWithChevrotain from '../src/parser/chevrotain';

let chevAvailable = false;
beforeAll(async () => {
  try { await import('chevrotain'); chevAvailable = true; } catch (e) { console.warn('chevrotain not available; skipping modifier tests'); }
});

describe('chevrotain modifiers', () => {
  test('pattern modifiers (oct and rev) applied via transformer', async () => {
    if (!chevAvailable) return;
    const input = `pat P:oct(-1):rev = C4 D4 E4 F4\n`;
    const { errors, ast } = await parseWithChevrotain(input);
    expect(errors).toEqual([]);
    if (!ast) throw new Error('AST null');
    const base = ast.pats.P; // expanded
    expect(Array.isArray(base)).toBe(true);
    // apply same transforms locally to compute expected
    const { expandPattern, transposePattern } = await import('../src/patterns/expand');
    let expected = expandPattern('C4 D4 E4 F4');
    expected = transposePattern(expected, { octaves: -1, semitones: 0 });
    expected = expected.slice().reverse();
    expect(base).toEqual(expected);
  });
});