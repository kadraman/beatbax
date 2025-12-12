import { parse } from '../src/parser';

describe('play AST smoke', () => {
  test('parser.parse is available', () => {
    expect(typeof parse).toBe('function');
  });
});
