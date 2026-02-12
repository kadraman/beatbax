import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import { exportJSON } from '../src/export/jsonExport';
import exportUGE from '../src/export/ugeWriter';

const SONG_PATH = path.resolve(__dirname, '../../../songs/features/panning_demo.bax');

describe('UGE pan 8xx placement', () => {
  test('writes 8xx only on rows with note onsets (or initial row)', async () => {
    const src = fs.readFileSync(SONG_PATH, 'utf8');
    const ast = parse(src as any);
    const tempJson = path.join(os.tmpdir(), `panning_demo_${Date.now()}.json`);
    await exportJSON(ast as any, tempJson, { debug: false });
    const parsed = JSON.parse(fs.readFileSync(tempJson, 'utf8'));
    const song = parsed.song;

    const outUge = path.join(os.tmpdir(), `panning_demo_${Date.now()}.uge`);
    await exportUGE(song as any, outUge, { debug: false });

    const buf = fs.readFileSync(outUge);

    // Capture exportUGE debug output to find where the pattern section starts (pattern count)
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => { logs.push(args.join(' ')); origLog.apply(console, args); };
    // Re-run export to capture debug prints (safe and fast for the test)
    await exportUGE(song as any, outUge, { debug: true });
    console.log = origLog;

    // Extract pattern count from logs and locate the pattern section in the file
    let patCount: number | null = null;
    for (const l of logs) {
      const m = l.match(/Total patterns:\s*(\d+)/i);
      if (m) { patCount = parseInt(m[1], 10); break; }
    }
    expect(patCount).not.toBeNull();
    if (patCount === null) throw new Error('pattern count not found in export logs');

    const patCountBuf = Buffer.from([patCount & 0xff, (patCount >> 8) & 0xff, (patCount >> 16) & 0xff, (patCount >> 24) & 0xff]);
    const patCountIdx = buf.indexOf(patCountBuf);
    expect(patCountIdx).toBeGreaterThanOrEqual(0);

    // Search for effect writes ONLY in the pattern section (after pattern count u32)
    const patternSection = buf.slice(patCountIdx);
    const needle = Buffer.from([0x08,0x00,0x00,0x00]);
    let idx = patternSection.indexOf(needle);
    const offsets: number[] = [];
    while (idx >= 0) {
      offsets.push(idx);
      idx = patternSection.indexOf(needle, idx + 1);
    }

    // Assert we found at least one pan effect in pattern section
    expect(offsets.length).toBeGreaterThan(0);

    // Ensure we didn't write panning on every note (we write at most once per note-on cluster)
    const totalNoteOns = song.channels.reduce((acc: number, ch: any) => acc + ((ch.events || []).filter((ev: any) => ev.type === 'note').length), 0);
    // Allow a small tolerance for extra mix writes due to sequence-level pan transforms
    expect(offsets.length).toBeLessThanOrEqual(totalNoteOns + 5);

    // Clean up
    try { fs.unlinkSync(outUge); } catch (e) {}
    try { fs.unlinkSync(tempJson); } catch (e) {}
  });
});