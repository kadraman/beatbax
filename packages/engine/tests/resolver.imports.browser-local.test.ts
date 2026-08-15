import { AST } from '../src/parser/ast.js';
import { resolveImports } from '../src/song/importResolver.browser.js';
import {
  joinLocalPath,
  relativeLocalPath,
  resolveLocalImportPath,
} from '../src/import/localImportPath.js';

function createMockFileSystem(files: Record<string, string>) {
  return {
    readFile: (path: string) => {
      if (files[path]) return files[path];
      throw new Error(`File not found: ${path}`);
    },
    fileExists: (path: string) => path in files,
  };
}

function emptyAst(imports: Array<{ source: string }>, insts: AST['insts'] = {}): AST {
  return {
    pats: {},
    insts,
    seqs: {},
    channels: [],
    imports,
  };
}

describe('localImportPath', () => {
  test('joins Windows song paths to lib/*.ins', () => {
    expect(joinLocalPath('C:\\music', 'lib/adventure.ins')).toBe('C:/music/lib/adventure.ins');
    expect(relativeLocalPath('C:/music', 'C:/music/lib/adventure.ins')).toBe('lib/adventure.ins');
  });

  test('resolves local: relative to the song file', () => {
    const resolved = resolveLocalImportPath('local:lib/adventure.ins', {
      baseFilePath: 'C:\\music\\song.bax',
      fileExists: (p) => p === 'C:/music/lib/adventure.ins',
    });
    expect(resolved).toBe('C:/music/lib/adventure.ins');
  });

  test('rejects parent-directory traversal', () => {
    expect(() =>
      resolveLocalImportPath('local:../secrets.ins', {
        baseFilePath: '/project/main.bax',
        fileExists: () => true,
      }),
    ).toThrow(/path traversal/);
  });
});

describe('Browser import resolver — local files', () => {
  test('still blocks local imports without a filesystem', async () => {
    const ast = emptyAst([{ source: 'local:lib/adventure.ins' }]);
    await expect(resolveImports(ast, { baseFilePath: '/project/main.bax' })).rejects.toThrow(
      /Local imports are not supported in the browser/,
    );
  });

  test('loads local: imports when readFile/fileExists are provided', async () => {
    const fs = createMockFileSystem({
      '/project/lib/adventure.ins': 'inst lead type=pulse1 duty=50\ninst bass type=pulse2 duty=25',
    });
    const ast = emptyAst([{ source: 'local:lib/adventure.ins' }]);
    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/main.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });
    expect(resolved.insts.lead?.type).toBe('pulse1');
    expect(resolved.insts.bass?.type).toBe('pulse2');
    expect(resolved.imports).toEqual([]);
  });

  test('loads local: imports from a Windows song path', async () => {
    const fs = createMockFileSystem({
      'C:/music/lib/adventure.ins': 'inst hero type=pulse1 duty=50',
    });
    const ast = emptyAst([{ source: 'local:lib/adventure.ins' }]);
    const resolved = await resolveImports(ast, {
      baseFilePath: 'C:\\music\\song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });
    expect(resolved.insts.hero?.type).toBe('pulse1');
  });

  test('explains when the song has not been saved', async () => {
    const fs = createMockFileSystem({
      '/project/lib/adventure.ins': 'inst lead type=pulse1',
    });
    const ast = emptyAst([{ source: 'local:lib/adventure.ins' }]);
    await expect(
      resolveImports(ast, {
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      }),
    ).rejects.toThrow(/has not been saved to disk/);
  });

  test('uses window.electronAPI when options omit readFile', async () => {
    const previous = (globalThis as { window?: unknown }).window;
    const existsSync = jest.fn().mockReturnValue(true);
    const readFileSync = jest.fn().mockReturnValue('inst lead type=pulse1 duty=50');
    (globalThis as { window: unknown }).window = {
      electronAPI: { readFileSync, existsSync },
    };
    try {
      const ast = emptyAst([{ source: 'local:lib/adventure.ins' }]);
      const resolved = await resolveImports(ast, {
        baseFilePath: '/project/main.bax',
      });
      expect(resolved.insts.lead?.type).toBe('pulse1');
      expect(existsSync).toHaveBeenCalledWith('/project/lib/adventure.ins');
      expect(readFileSync).toHaveBeenCalledWith('/project/lib/adventure.ins', 'utf-8');
    } finally {
      if (previous === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous;
      }
    }
  });
});
