/**
 * Native `subpat` declarations inside imported .ins files.
 * Named tables merge into the song so `subpat=library_name` works without copying the block.
 */

import { parse } from '../src/parser/index.js';
import { parseWithPeggy } from '../src/parser/peggy/index.js';
import { resolveImports } from '../src/song/importResolver.js';
import { RemoteInstrumentCache } from '../src/import/remoteCache.js';
import { AST } from '../src/parser/ast.js';

const KICK_INS = `
subpat kick_body =
  .
  +0 vol:10
  -2 vol:8
  halt

inst kick type=noise gb:width=7 uge_note=C-6 subpat=kick_body
`;

const BASS_INS = `
subpat bass_pluck =
  +0
  -1
  halt

inst kit_bass type=wave volume=100 subpat=bass_pluck
`;

function mockFs(files: Record<string, string>) {
  return {
    readFile: (path: string) => {
      if (files[path]) return files[path];
      throw new Error(`File not found: ${path}`);
    },
    fileExists: (path: string) => path in files,
  };
}

describe('Import resolver: native subpat in .ins files', () => {
  test('bakes subpatRows onto instruments defined in the .ins file', async () => {
    const fs = mockFs({ '/project/lib/drums.ins': KICK_INS });
    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:lib/drums.ins' }],
    };

    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.kick).toBeDefined();
    expect(resolved.insts.kick.subpat).toBe('kick_body');
    expect(resolved.insts.kick.subpatRows?.length).toBeGreaterThan(0);
    expect(resolved.subpatterns?.kick_body).toBeDefined();
  });

  test('lets the song attach an imported subpat name to a local instrument', async () => {
    const fs = mockFs({ '/project/lib/drums.ins': KICK_INS });
    const parsed = parse(`
chip gameboy
import "local:lib/drums.ins"
inst extra type=noise gb:width=7 uge_note=C-6 subpat=kick_body
`);

    const resolved = await resolveImports(parsed, {
      baseFilePath: '/project/song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.insts.extra.subpat).toBe('kick_body');
    expect(resolved.insts.extra.subpatRows?.length).toBeGreaterThan(0);
    expect(resolved.subpatterns?.kick_body).toBeDefined();
  });

  test('missing subpat= is a warning when the file has imports, not a parse error', () => {
    const { ast, hasErrors } = parseWithPeggy(`
chip gameboy
import "local:lib/drums.ins"
inst extra type=noise gb:width=7 uge_note=C-6 subpat=kick_body
`);
    expect(hasErrors).toBe(false);
    expect(ast.insts.extra.subpatRows).toBeUndefined();
    expect(
      (ast.diagnostics ?? []).some(
        (d) => d.level === 'warning' && /subpat='kick_body' is not defined/.test(d.message),
      ),
    ).toBe(true);
  });

  test('still rejects chip, bpm, and pat in a .ins file', async () => {
    const fs = mockFs({
      '/project/lib/bad.ins': `
chip gameboy
bpm 128
inst test type=pulse1 duty=50
pat melody = C5 E5 G5
`,
    });
    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:lib/bad.ins' }],
    };

    await expect(
      resolveImports(ast, {
        baseFilePath: '/project/song.bax',
        readFile: fs.readFile,
        fileExists: fs.fileExists,
      }),
    ).rejects.toThrow(/inst", "import", "subpat", and "effect"/);
  });

  test('accepts a remote .ins file that contains native subpat', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '200']]),
      text: async () => BASS_INS,
    });
    const cache = new RemoteInstrumentCache({ fetchFn: mockFetch as typeof fetch });
    const bundle = await cache.fetchBundle('https://example.com/kit.ins');

    expect(bundle.insts.kit_bass.subpatRows?.length).toBeGreaterThan(0);
    expect(bundle.subpatterns.bass_pluck).toBeDefined();
  });
});
