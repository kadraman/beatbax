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
    // Capture console output from exportUGE to observe mapping debug message
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => { logs.push(args.join(' ')); origLog.apply(console, args); };
    await exportUGE(song as any, outPath, { debug: true, strictGb: false } as any);
    console.log = origLog;

    // cleanup
    try { fs.unlinkSync(outPath); } catch (e) {}
    try { fs.unlinkSync(tmpJson); } catch (e) {}

    // Assert exportUGE logged vibrato mapping
    const joined = logs.join('\n');
    expect(joined.indexOf('Mapped vib') >= 0 || joined.indexOf('vib -> 4xy') >= 0).toBe(true);
  });
});
