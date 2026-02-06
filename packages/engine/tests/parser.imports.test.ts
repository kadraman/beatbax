/**
 * Tests for import directive parsing
 */

import { parse } from '../src/parser/index.js';

describe('Parser: Import Directive', () => {
  test('parses single import statement', () => {
    const source = `import "common.ins"`;
    const ast = parse(source);

    expect(ast.imports).toBeDefined();
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports![0].source).toBe('common.ins');
    expect(ast.imports![0].loc).toBeDefined();
  });

  test('parses multiple import statements', () => {
    const source = `
import "common.ins"
import "drums.ins"
import "bass.ins"
`;
    const ast = parse(source);

    expect(ast.imports).toBeDefined();
    expect(ast.imports).toHaveLength(3);
    expect(ast.imports![0].source).toBe('common.ins');
    expect(ast.imports![1].source).toBe('drums.ins');
    expect(ast.imports![2].source).toBe('bass.ins');
  });

  test('parses import with relative path', () => {
    const source = `import "lib/instruments/gameboy.ins"`;
    const ast = parse(source);

    expect(ast.imports).toBeDefined();
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports![0].source).toBe('lib/instruments/gameboy.ins');
  });

  test('parses import with single quotes', () => {
    const source = `import 'common.ins'`;
    const ast = parse(source);

    expect(ast.imports).toBeDefined();
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports![0].source).toBe('common.ins');
  });

  test('parses imports mixed with other directives', () => {
    const source = `
chip gameboy
import "common.ins"
bpm 120
import "drums.ins"

inst lead type=pulse1 duty=50

pat melody = C5 E5 G5
`;
    const ast = parse(source);

    expect(ast.imports).toBeDefined();
    expect(ast.imports).toHaveLength(2);
    expect(ast.imports![0].source).toBe('common.ins');
    expect(ast.imports![1].source).toBe('drums.ins');
    expect(ast.chip).toBe('gameboy');
    expect(ast.bpm).toBe(120);
    expect(ast.insts.lead).toBeDefined();
    expect(ast.pats.melody).toBeDefined();
  });

  test('handles empty imports array when no imports', () => {
    const source = `
chip gameboy
bpm 120

inst lead type=pulse1 duty=50
`;
    const ast = parse(source);

    expect(ast.imports).toBeUndefined();
  });
});
