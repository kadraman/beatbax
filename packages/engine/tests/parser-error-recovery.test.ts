import { parse, parseWithPeggy } from '../src/parser';

describe('parser error recovery', () => {
  test('collects multiple syntax errors in one pass', () => {
    const source = [
      'saq',
      'inst lead type=pulse1 duty=50 env=12,down',
      'patt melody = C5 E5 G5',
      'pat ok = C4 D4',
      'seq main = ok',
      'channel 1 => inst lead seq main',
    ].join('\n');

    const result = parseWithPeggy(source);

    expect(result.hasErrors).toBe(true);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toContain("'saq'");
    expect(result.errors[1].message).toContain("'patt'");
    expect(result.ast.insts.lead).toBeDefined();
    expect(result.ast.seqs.main).toEqual(['ok']);
  });

  test('preserves recovery error locations', () => {
    const source = 'chip gameboy\nsaq\npat main = C4';
    const result = parseWithPeggy(source);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].loc?.start.line).toBe(2);
    expect(result.errors[0].loc?.start.column).toBe(1);
  });

  test('detects missing channel => operator as syntax recovery error', () => {
    const source = 'channel 1 inst lead seq main';
    const result = parseWithPeggy(source);

    expect(result.hasErrors).toBe(true);
    expect(result.errors[0].message).toContain("missing '=>'");
  });

  test('parse() remains backward-compatible by throwing first syntax error', () => {
    const source = 'saq\npat ok = C4';

    expect(() => parse(source)).toThrow("Unknown keyword 'saq'");
  });
});
