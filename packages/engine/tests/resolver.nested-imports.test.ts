/**
 * Test nested import resolution with relative paths.
 * Verifies that imports inside .ins files resolve relative to the .ins file location,
 * not the original song file.
 */

import { describe, test, expect } from '@jest/globals';
import { resolveImports } from '../src/song/importResolver.js';
import { AST } from '../src/parser/ast.js';

describe('Nested Import Resolution', () => {
  test('resolves nested imports relative to importing .ins file', async () => {
    // Directory structure:
    // /project/
    //   main.bax -> imports "local:lib/sounds/drums.ins"
    //   lib/
    //     sounds/
    //       drums.ins -> imports "local:base.ins" (sibling file)
    //       base.ins
    
    const mockFileSystem = {
      '/project/main.bax': 'import "local:lib/sounds/drums.ins"',
      '/project/lib/sounds/drums.ins': 'import "local:base.ins"\ninst kick type=noise env=12,down',
      '/project/lib/sounds/base.ins': 'inst snare type=noise env=8,down',
    };
    
    const ast: AST = {
      imports: [{ source: 'local:lib/sounds/drums.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    const result = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: (path: string) => mockFileSystem[path as keyof typeof mockFileSystem] || '',
      fileExists: (path: string) => path in mockFileSystem,
    });

    // Both instruments should be loaded
    expect(result.insts).toHaveProperty('kick');
    expect(result.insts).toHaveProperty('snare');
    expect(result.insts.kick.type).toBe('noise');
    expect(result.insts.snare.type).toBe('noise');
  });

  test('resolves nested imports in subdirectories correctly', async () => {
    // Directory structure:
    // /project/
    //   main.bax -> imports "local:lib/presets.ins"
    //   lib/
    //     presets.ins -> imports "local:bass/sub.ins" + "local:effects/reverb.ins"
    //     bass/
    //       sub.ins
    //     effects/
    //       reverb.ins
    
    const mockFileSystem = {
      '/project/main.bax': 'import "local:lib/presets.ins"',
      '/project/lib/presets.ins': 'import "local:bass/sub.ins"\nimport "local:effects/reverb.ins"\ninst lead type=pulse1 duty=50',
      '/project/lib/bass/sub.ins': 'inst bass type=pulse2 duty=25',
      '/project/lib/effects/reverb.ins': 'inst pad type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]',
    };
    
    const ast: AST = {
      imports: [{ source: 'local:lib/presets.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    const result = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: (path: string) => mockFileSystem[path as keyof typeof mockFileSystem] || '',
      fileExists: (path: string) => path in mockFileSystem,
    });

    // All instruments should be loaded from the nested imports
    expect(result.insts).toHaveProperty('lead');
    expect(result.insts).toHaveProperty('bass');
    expect(result.insts).toHaveProperty('pad');
  });

  test('throws error when nested import uses wrong relative path', async () => {
    // This test demonstrates that imports resolve relative to the importing file,
    // not the original song file
    
    const mockFileSystem = {
      '/project/main.bax': 'import "local:lib/child.ins"',
      '/project/lib/child.ins': 'import "local:lib/parent.ins"', // Wrong! Should be "local:parent.ins"
      '/project/lib/parent.ins': 'inst base type=pulse1',
    };
    
    const ast: AST = {
      imports: [{ source: 'local:lib/child.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: (path: string) => mockFileSystem[path as keyof typeof mockFileSystem] || '',
        fileExists: (path: string) => path in mockFileSystem,
      })
    ).rejects.toThrow(/Import file not found.*lib\/parent\.ins/);
  });
});
