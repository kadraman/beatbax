/**
 * Tests for path segment validation in import resolution.
 * Verifies that ".." is checked as a path segment, not as a substring.
 */

import { parse } from '../src/parser';
import { resolveImports } from '../src/song/importResolver';
import { AST } from '../src/parser/ast';

describe('Import Path Segment Validation', () => {
  test('allows filenames containing ".." as substring', async () => {
    const mockFileSystem: Record<string, string> = {
      '/test/lib/drums..backup.ins': 'inst kick type=noise env=15,down',
      '/test/lib/file..old.ins': 'inst snare type=noise env=12,down',
      '/test/main.bax': 'import "local:lib/drums..backup.ins"\nimport "local:lib/file..old.ins"',
    };

    const ast: AST = {
      imports: [
        { source: 'local:lib/drums..backup.ins' },
        { source: 'local:lib/file..old.ins' }
      ],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    const result = await resolveImports(ast, {
      baseFilePath: '/test/main.bax',
      readFile: (path: string) => {
        if (mockFileSystem[path]) return mockFileSystem[path];
        throw new Error(`File not found: ${path}`);
      },
      fileExists: (path: string) => path in mockFileSystem,
    });

    expect(result.insts).toHaveProperty('kick');
    expect(result.insts).toHaveProperty('snare');
  });

  test('rejects ".." as path segment at start', async () => {
    const ast: AST = {
      imports: [{ source: 'local:../parent/file.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/test/main.bax',
        readFile: () => '',
        fileExists: () => false,
      })
    ).rejects.toThrow('path traversal using ".." is not allowed');
  });

  test('rejects ".." as path segment in middle', async () => {
    const ast: AST = {
      imports: [{ source: 'local:lib/../sibling/file.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/test/main.bax',
        readFile: () => '',
        fileExists: () => false,
      })
    ).rejects.toThrow('path traversal using ".." is not allowed');
  });

  test('rejects ".." as path segment at end', async () => {
    const ast: AST = {
      imports: [{ source: 'local:lib/..' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/test/main.bax',
        readFile: () => '',
        fileExists: () => false,
      })
    ).rejects.toThrow('path traversal using ".." is not allowed');
  });

  test('rejects multiple ".." segments', async () => {
    const ast: AST = {
      imports: [{ source: 'local:../../grandparent/file.ins' }],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/test/main.bax',
        readFile: () => '',
        fileExists: () => false,
      })
    ).rejects.toThrow('path traversal using ".." is not allowed');
  });

  test('allows paths with dots that are not ".."', async () => {
    const mockFileSystem: Record<string, string> = {
      '/test/lib/.hidden.ins': 'inst hidden type=pulse1 duty=50 env=12,down',
      '/test/lib/file.v2.ins': 'inst v2 type=pulse2 duty=25 env=10,down',
      '/test/main.bax': '',
    };

    const ast: AST = {
      imports: [
        { source: 'local:lib/.hidden.ins' },
        { source: 'local:lib/file.v2.ins' }
      ],
      insts: {},
      pats: {},
      seqs: {},
      channels: [],
    };

    const result = await resolveImports(ast, {
      baseFilePath: '/test/main.bax',
      readFile: (path: string) => {
        if (mockFileSystem[path]) return mockFileSystem[path];
        throw new Error(`File not found: ${path}`);
      },
      fileExists: (path: string) => path in mockFileSystem,
    });

    expect(result.insts).toHaveProperty('hidden');
    expect(result.insts).toHaveProperty('v2');
  });
});
