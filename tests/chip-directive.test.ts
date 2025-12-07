import { parse } from '../src/parser';

describe('chip directive', () => {
  test('parses chip gameboy', () => {
    const ast = parse('chip gameboy\n');
    expect(ast.chip).toBe('gameboy');
  });

  test('parses chip=gameboy with spacing', () => {
    const ast = parse('  chip=gameboy\n');
    expect(ast.chip).toBe('gameboy');
  });
});
