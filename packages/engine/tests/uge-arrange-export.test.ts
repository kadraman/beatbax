import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';
import { exportUGE } from '../src/export/ugeWriter';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, existsSync } from 'fs';

describe('UGE export with arrange', () => {
  test('exportUGE can consume arranged song and produce file', async () => {
    const src = `
      pat L = C4
      pat B = D3
      seq lead = L
      seq bass = B
      inst leadInst type=pulse1
      inst bassInst type=pulse2
      arrange main = lead | bass | . | .
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const out = join(tmpdir(), 'test_arrange.uge');
    // Ensure no throw
    await expect(exportUGE(song as any, out, { debug: false, strictGb: false })).resolves.toBeUndefined();
    expect(existsSync(out)).toBe(true);
    // Cleanup
    try { writeFileSync(out, ''); } catch (e) { /* ignore */ }
  });
});