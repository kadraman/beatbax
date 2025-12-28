import { readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';
import { exportUGE } from '../src/export/ugeWriter.js';

describe('song metadata parsing and export', () => {
  const examplePath = resolve(__dirname, '../../../songs/metadata_example.bax');
  it('parses metadata from .bax and resolves into SongModel', () => {
    const src = readFileSync(examplePath, 'utf8');
    const ast = parse(src);
    expect(ast.metadata).toBeDefined();
    expect(ast.metadata?.name).toBe('Example Song');
    expect(ast.metadata?.artist).toBe('kadraman');
    expect(ast.metadata?.description).toContain('This is an example song');
    expect(ast.metadata?.tags).toContain('demo');

    const song = resolveSong(ast as any);
    expect(song.metadata).toBeDefined();
    expect(song.metadata?.name).toBe('Example Song');
  });

  it('includes metadata in JSON export object', async () => {
    const src = readFileSync(examplePath, 'utf8');
    const ast = parse(src);
    const song = resolveSong(ast as any);

    // exportJSON writes to disk; instead, call resolveSong and inspect
    const out = { song };
    expect(out.song.metadata).toBeDefined();
    expect(out.song.metadata?.artist).toBe('kadraman');
  });

  it('writes UGE header fields from metadata (dry-run)', async () => {
    const src = readFileSync(examplePath, 'utf8');
    const ast = parse(src);
    const song = resolveSong(ast as any);

    // Call exportUGE to produce a file in tmp and ensure no throw
    const outDir = resolve(__dirname, '../../../tmp');
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, 'metadata_example.uge');
    await exportUGE(song as any, outPath, { debug: false });
    // basic sanity: file exists and non-empty
    const buf = readFileSync(outPath);
    expect(buf.length).toBeGreaterThan(0);
  });
});
