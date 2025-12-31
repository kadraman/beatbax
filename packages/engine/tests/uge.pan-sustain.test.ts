import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import { exportJSON } from '../src/export/jsonExport';
import exportUGE from '../src/export/ugeWriter';

describe('UGE pan sustain behavior', () => {
  test('does not emit extra 8xx when sustain continues and pan unchanged', async () => {
    // Construct temporary song file
    const tmpSong = path.join(os.tmpdir(), `panning_sustain_${Date.now()}.bax`);
    const content = `chip gameboy\ninst lead type=pulse1 gb:pan=L\npat p = C4:4 _ _ _\nchannel 1 => inst lead pat p\n`;
    fs.writeFileSync(tmpSong, content);

    const ast = parse(content as any);
    const tempJson = path.join(os.tmpdir(), `panning_sustain_${Date.now()}.json`);
    await exportJSON(ast as any, tempJson, { debug: false });
    const parsed = JSON.parse(fs.readFileSync(tempJson, 'utf8'));
    const song = parsed.song;

    const outUge = path.join(os.tmpdir(), `panning_sustain_${Date.now()}.uge`);

    // Capture console output from exportUGE to read pattern count debug line
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => { logs.push(args.join(' ')); origLog.apply(console, args); };
    await exportUGE(song as any, outUge, { debug: true });
    console.log = origLog;

    const buf = fs.readFileSync(outUge);

    // Extract pattern count from logs
    let patCount: number | null = null;
    for (const l of logs) {
      const m = l.match(/Total patterns:\s*(\d+)/i);
      if (m) { patCount = parseInt(m[1], 10); break; }
    }
    expect(patCount).not.toBeNull();
    if (patCount === null) throw new Error('pattern count not found in export logs');

    // Search for effect writes ONLY in the pattern section (after pattern count u32)
    const patCountBuf = Buffer.from([patCount & 0xff, (patCount >> 8) & 0xff, (patCount >> 16) & 0xff, (patCount >> 24) & 0xff]);
    const patCountIdx = buf.indexOf(patCountBuf);
    expect(patCountIdx).toBeGreaterThanOrEqual(0);

    const patternSection = buf.slice(patCountIdx);
    const needle = Buffer.from([0x08,0x00,0x00,0x00]);
    let idx = patternSection.indexOf(needle);
    const params: number[] = [];
    while (idx >= 0) {
      params.push(patternSection.readUInt8(idx + 4));
      idx = patternSection.indexOf(needle, idx + 1);
    }

    // Expect at most one 8xx for the initial row
    expect(params.length).toBeLessThanOrEqual(1);

    // Cleanup
    try { fs.unlinkSync(outUge); } catch (e) {}
    try { fs.unlinkSync(tempJson); } catch (e) {}
    try { fs.unlinkSync(tmpSong); } catch (e) {}
  });
});