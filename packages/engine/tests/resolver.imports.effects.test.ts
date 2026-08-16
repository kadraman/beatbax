/**
 * Named `effect` presets inside imported .ins files.
 * Presets merge into the song so `<drift>` works without copying the block.
 */

import { parse } from '../src/parser/index.js';
import { resolveImports } from '../src/song/importResolver.js';
import { resolveSong } from '../src/song/resolver.js';
import { RemoteInstrumentCache } from '../src/import/remoteCache.js';
import { AST } from '../src/parser/ast.js';

const FX_INS = `
inst lead type=pulse1 duty=50 env=12,down
effect drift = vib:3,4,sine,4,1
effect majorArp = arp:4,7
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

describe('Import resolver: named effects in .ins files', () => {
  test('merges effect presets from the .ins file onto the song AST', async () => {
    const fs = mockFs({ '/project/lib/fx.ins': FX_INS });
    const ast: AST = {
      pats: {},
      insts: {},
      seqs: {},
      channels: [],
      imports: [{ source: 'local:lib/fx.ins' }],
    };

    const resolved = await resolveImports(ast, {
      baseFilePath: '/project/song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.effects?.drift).toBe('vib:3,4,sine,4,1');
    expect(resolved.effects?.majorArp).toBe('arp:4,7');
    expect(resolved.insts.lead).toBeDefined();
  });

  test('song-local effect of the same name wins (last-wins)', async () => {
    const fs = mockFs({ '/project/lib/fx.ins': FX_INS });
    const parsed = parse(`
chip gameboy
import "local:lib/fx.ins"
effect drift = vib:8,2
pat p = C4<drift>
channel 1 => inst lead pat p
`);

    const resolved = await resolveImports(parsed, {
      baseFilePath: '/project/song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });

    expect(resolved.effects?.drift).toBe('vib:8,2');
    expect(resolved.effects?.majorArp).toBe('arp:4,7');
  });

  test('expandInlinePresets uses imported effect names during resolveSong', async () => {
    const fs = mockFs({ '/project/lib/fx.ins': FX_INS });
    const parsed = parse(`
chip gameboy
import "local:lib/fx.ins"
pat p = C4<drift>
channel 1 => inst lead pat p
`);

    const resolvedAst = await resolveImports(parsed, {
      baseFilePath: '/project/song.bax',
      readFile: fs.readFile,
      fileExists: fs.fileExists,
    });
    const song = resolveSong(resolvedAst);
    const note = song.channels[0].events.find((e: { type: string }) => e.type === 'note') as {
      effects?: Array<{ type: string }>;
    };
    expect(note?.effects?.some((fx) => fx.type === 'vib')).toBe(true);
  });

  test('accepts a remote .ins file that contains effect presets', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-length', '200']]),
      text: async () => FX_INS,
    });
    const cache = new RemoteInstrumentCache({ fetchFn: mockFetch as typeof fetch });
    const bundle = await cache.fetchBundle('https://example.com/fx.ins');

    expect(bundle.effects.drift).toBe('vib:3,4,sine,4,1');
    expect(bundle.insts.lead).toBeDefined();
  });
});
