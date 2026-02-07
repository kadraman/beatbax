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

  test('resolves simple import', async () => {
    const mockFiles = {
      '/project/common.ins': 'inst lead type=pulse1 duty=50\ninst bass type=pulse2 duty=25',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:common.ins' }],
    };

    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.lead).toBeDefined();
    expect(resolved.insts.lead.type).toBe('pulse1');
    expect(resolved.insts.bass).toBeDefined();
    expect(resolved.insts.bass.type).toBe('pulse2');
  });

  test('local instruments override imported ones', async () => {
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
      imports: [{ source: 'local:common.ins' }],
    };

    const warnings: string[] = [];
    const resolved = await resolveImports(ast, {
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

  test('later imports override earlier ones', async () => {
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
        { source: 'local:common.ins' },
        { source: 'local:special.ins' },
      ],
    };

    const warnings: string[] = [];
    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
      onWarn: (msg) => warnings.push(msg),
    });

    expect(resolved.insts.lead.duty).toBe('75');
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('detects import cycles', async () => {
    const mockFiles = {
      '/project/a.ins': 'import "local:b.ins"\ninst a type=pulse1',
      '/project/b.ins': 'import "local:a.ins"\ninst b type=pulse2',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:a.ins' }],
    };

    await expect(async () => {
      await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).rejects.toThrow(/cycle/i);
  });

  test('caches imported files', async () => {
    let readCount = 0;
    const mockFiles: Record<string, string> = {
      '/project/common.ins': 'inst shared type=pulse1',
      '/project/a.ins': 'import "local:common.ins"\ninst a type=pulse1',
      '/project/b.ins': 'import "local:common.ins"\ninst b type=pulse2',
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
        { source: 'local:a.ins' },
        { source: 'local:b.ins' },
      ],
    };

    const resolved = await resolveImports(ast, {
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

  test('throws error on missing import file', async () => {
    const mockFiles = {};
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:nonexistent.ins' }],
    };

    await expect(async () => {
      await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).rejects.toThrow(/not found/i);
  });

  test('validates .ins files contain only instruments', async () => {
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
      imports: [{ source: 'local:bad.ins' }],
    };

    await expect(async () => {
      await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });
    }).rejects.toThrow(/Invalid .ins file/i);
  });

  test('strict mode treats overrides as errors', async () => {
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
      imports: [{ source: 'local:common.ins' }],
    };

    await expect(async () => {
      await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
        strictMode: true,
      });
    }).rejects.toThrow(/overrides/i);
  });

  test('handles recursive imports', async () => {
    const mockFiles = {
      '/project/base.ins': 'inst base type=pulse1',
      '/project/common.ins': 'import "local:base.ins"\ninst common type=pulse2',
      '/project/main.bax': 'import "local:common.ins"',
    };
    const fs = createMockFileSystem(mockFiles);

    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:common.ins' }],
    };

    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.base).toBeDefined();
    expect(resolved.insts.common).toBeDefined();
  });

  describe('Security: Path Traversal Prevention', () => {
    test('rejects paths with .. segments', async () => {
      const mockFiles = {
        '/etc/passwd': 'secret data',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:../../../etc/passwd' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/songs/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
        });
      }).rejects.toThrow(/path traversal.*\.\./i);
    });

    test('rejects paths with .. in the middle', async () => {
      const mockFiles = {
        '/project/secret.ins': 'inst secret type=pulse1',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:subdir/../../../secret.ins' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/songs/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
        });
      }).rejects.toThrow(/path traversal.*\.\./i);
    });

    test('rejects Unix-style absolute paths', async () => {
      const mockFiles = {
        '/etc/passwd': 'secret data',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:/etc/passwd' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
        });
      }).rejects.toThrow(/absolute paths are not allowed/i);
    });

    test('rejects Windows-style absolute paths', async () => {
      const mockFiles = {
        'C:/Windows/System32/config/sam': 'secret data',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:C:/Windows/System32/config/sam' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
        });
      }).rejects.toThrow(/absolute paths are not allowed/i);
    });

    test('rejects Windows-style absolute paths with backslashes', async () => {
      const mockFiles = {
        'D:\\secrets\\passwords.txt': 'secret data',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:D:\\secrets\\passwords.txt' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
        });
      }).rejects.toThrow(/absolute paths are not allowed/i);
    });

    test('allows relative paths in subdirectories', async () => {
      const mockFiles = {
        '/project/lib/common.ins': 'inst common type=pulse1',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:lib/common.ins' }],
      };

      const resolved = await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });

      expect(resolved.insts.common).toBeDefined();
    });

    test('allows absolute paths when allowAbsolutePaths is true', async () => {
      const mockFiles = {
        '/shared/instruments/common.ins': 'inst shared type=pulse1',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:/shared/instruments/common.ins' }],
      };

      const resolved = await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
        allowAbsolutePaths: true,
        searchPaths: ['/shared/instruments'],
      });

      expect(resolved.insts.shared).toBeDefined();
    });

    test('still rejects .. segments even with allowAbsolutePaths', async () => {
      const mockFiles = {
        '/etc/passwd': 'secret data',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:../../../etc/passwd' }],
      };

      await expect(async () => {
        await resolveImports(ast, {
          baseFilePath: '/project/songs/main.bax',
          readFile: fs.readFile,
          fileExists: fs.fileExists,
          allowAbsolutePaths: true,
        });
      }).rejects.toThrow(/path traversal.*\.\./i);
    });

    test('validates resolved paths stay within allowed directories', async () => {
      const mockFiles = {
        '/project/lib/common.ins': 'inst safe type=pulse1',
        '/outside/malicious.ins': 'inst malicious type=pulse1',
      };
      const fs = createMockFileSystem(mockFiles);

      const ast: AST = {
        pats: {},
        insts: {},
        seqs: {},
        channels: [],
        imports: [{ source: 'local:lib/common.ins' }],
      };

      // This should work - within project directory
      const resolved = await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      });

      expect(resolved.insts.safe).toBeDefined();
    });
  });
});
