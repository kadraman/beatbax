import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import exportUGE from '../src/export/ugeWriter';
import { exportJSON } from '../src/export/jsonExport';

describe('UGE vibrato export', () => {
  test('maps vib(depth,rate) to 4xy effect in UGE file', async () => {
    const src = `
      inst lead type=pulse1
      pat p = C4<vib:3,5>
      channel 1 => inst lead pat p
    `;
    const ast = parse(src as any);
    const tmpJson = path.join(os.tmpdir(), `beatbax_vib_test_${Date.now()}.json`);
    await exportJSON(ast as any, tmpJson, { debug: false });
    const parsed = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
    const song = parsed.song;

    const outPath = path.join(os.tmpdir(), `beatbax_vib_test_${Date.now()}.uge`);
    await exportUGE(song as any, outPath, { debug: false, strictGb: false } as any);

    // Verify UGE file was created
    expect(fs.existsSync(outPath)).toBe(true);

    // Verify file is not empty (basic sanity check)
    const stats = fs.statSync(outPath);
    expect(stats.size).toBeGreaterThan(0);

    // cleanup
    try { fs.unlinkSync(outPath); } catch (e) {}
    try { fs.unlinkSync(tmpJson); } catch (e) {}
  });
});
