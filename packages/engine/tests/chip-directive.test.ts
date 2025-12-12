import { parse } from '../src/parser';

describe('chip directive', () => {
  test('chip directive is parsed without error', () => {
    const src = `chip gameboy`;
    const ast = parse(src);
    expect(ast.chip).toBeDefined();
  });
});
