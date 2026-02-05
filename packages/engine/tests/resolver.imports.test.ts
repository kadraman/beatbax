/**
 * Tests for import resolution logic
 */

import { resolveImports } from '../src/song/importResolver.js';
import { AST } from '../src/parser/ast.js';

describe('Import Resolver', () => {
  // Mock file system
  const createMockFileSystem = (files: Record<string, string>) => {
    return {
      readFile: (path: string) => {
        if (files[path]) {
          return files[path];
        }
        throw new Error(`File not found: ${path}`);
      },
      fileExists: (path: string) => path in files,
    };
  };

  test('resolves simple import', () => {
    const mockFiles = {
      '/project/common.ins': 'inst lead type=pulse1 duty=50\ninst bass type=pulse2 duty=25',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'common.ins' }],
    };

    const resolved = resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.lead).toBeDefined();
    expect(resolved.insts.lead.type).toBe('pulse1');
    expect(resolved.insts.bass).toBeDefined();
    expect(resolved.insts.bass.type).toBe('pulse2');
  });

  test('local instruments override imported ones', () => {
    const mockFiles = {
      '/project/common.ins': 'inst lead type=pulse1 duty=50',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {
        lead: { type: 'pulse1', duty: '75' }, // local override
      },
      seqs: {},
      channels: [],
      imports: [{ source: 'common.ins' }],
    };

    const warnings: string[] = [];
    const resolved = resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
      onWarn: (msg) => warnings.push(msg),
    });

    // Local definition should win
    expect(resolved.insts.lead.duty).toBe('75');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('overrides');
  });

  test('later imports override earlier ones', () => {
    const mockFiles = {
      '/project/common.ins': 'inst lead type=pulse1 duty=50',
      '/project/special.ins': 'inst lead type=pulse1 duty=75',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [
        { source: 'common.ins' },
        { source: 'special.ins' },
      ],
    };

    const warnings: string[] = [];
    const resolved = resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
      onWarn: (msg) => warnings.push(msg),
    });

    expect(resolved.insts.lead.duty).toBe('75');
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('detects import cycles', () => {
    const mockFiles = {
      '/project/a.ins': 'import "b.ins"\ninst a type=pulse1',
      '/project/b.ins': 'import "a.ins"\ninst b type=pulse2',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'a.ins' }],
    };

    expect(() => {
      resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).toThrow(/cycle/i);
  });

  test('caches imported files', () => {
    let readCount = 0;
    const mockFiles: Record<string, string> = {
      '/project/common.ins': 'inst shared type=pulse1',
      '/project/a.ins': 'import "common.ins"\ninst a type=pulse1',
      '/project/b.ins': 'import "common.ins"\ninst b type=pulse2',
    };

    const readFile = (path: string) => {
      readCount++;
      if (mockFiles[path]) {
        return mockFiles[path];
      }
      throw new Error(`File not found: ${path}`);
    };

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [
        { source: 'a.ins' },
        { source: 'b.ins' },
      ],
    };

    const resolved = resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile,
      fileExists: (path) => path in mockFiles,
    });

    expect(resolved.insts.shared).toBeDefined();
    expect(resolved.insts.a).toBeDefined();
    expect(resolved.insts.b).toBeDefined();

    // common.ins should only be read once due to caching
    expect(readCount).toBe(3); // a.ins, b.ins, common.ins (once)
  });

  test('throws error on missing import file', () => {
    const mockFiles = {};
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'nonexistent.ins' }],
    };

    expect(() => {
      resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).toThrow(/not found/i);
  });

  test('validates .ins files contain only instruments', () => {
    const mockFiles = {
      '/project/bad.ins': `
inst lead type=pulse1
pat melody = C5 E5 G5
`,
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'bad.ins' }],
    };

    expect(() => {
      resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).toThrow(/Invalid .ins file/i);
  });

  test('strict mode treats overrides as errors', () => {
    const mockFiles = {
      '/project/common.ins': 'inst lead type=pulse1 duty=50',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {
        lead: { type: 'pulse1', duty: '75' },
      },
      seqs: {},
      channels: [],
      imports: [{ source: 'common.ins' }],
    };

    expect(() => {
      resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
        strictMode: true,
      });
    }).toThrow(/overrides/i);
  });

  test('handles recursive imports', () => {
    const mockFiles = {
      '/project/base.ins': 'inst base type=pulse1',
      '/project/common.ins': 'import "base.ins"\ninst common type=pulse2',
      '/project/main.bax': 'import "common.ins"',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'common.ins' }],
    };

    const resolved = resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.base).toBeDefined();
    expect(resolved.insts.common).toBeDefined();
  });
});
