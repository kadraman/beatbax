import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import { exportJSON } from '../src/export/jsonExport';

describe('JSON export includes pan and effects', () => {
  test('exports inline pan and effects attached to note events', async () => {
    const src = `
      inst sn type=noise
      pat p = C4<pan:-1.0,vib:4> D4<pan:L>
      channel 1 => inst sn pat p
    `;
    const ast = parse(src as any);
    const outPath = path.join(os.tmpdir(), `beatbax_test_${Date.now()}.json`);
    await exportJSON(ast as any, outPath, { debug: false });

    const raw = fs.readFileSync(outPath, 'utf8');
    const obj = JSON.parse(raw);
    expect(obj).toBeDefined();
    const song = obj.song;
    expect(song).toBeDefined();
    const ch = song.channels.find((c: any) => c.id === 1);
    expect(ch).toBeDefined();
    const evs = ch.events.filter((e: any) => e.type === 'note');
    expect(evs.length).toBeGreaterThanOrEqual(2);

    const ev0 = evs[0];
    expect(ev0.pan).toBeDefined();
    expect(typeof ev0.pan.value).toBe('number');
    expect(ev0.pan.value).toBeCloseTo(-1.0);
    expect(ev0.effects).toBeDefined();
    expect(Array.isArray(ev0.effects)).toBe(true);
    expect(ev0.effects[0].type).toBe('vib');

    const ev1 = evs[1];
    expect(ev1.pan).toBeDefined();
    expect(ev1.pan.enum).toBe('L');

    // cleanup
    try { fs.unlinkSync(outPath); } catch (e) {}
  });

  test('instrument default pan exported when no inline pan present', async () => {
    const src = `
      inst lead type=pulse1 pan=R
      pat p = C4 D4 E4
      channel 1 => inst lead pat p
    `;
    const ast = parse(src as any);
    const outPath = path.join(os.tmpdir(), `beatbax_test_${Date.now()}.json`);
    await exportJSON(ast as any, outPath, { debug: false });
    const obj = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const song = obj.song;
    const ch = song.channels.find((c: any) => c.id === 1);
    const evs = ch.events.filter((e: any) => e.type === 'note');
    expect(evs.length).toBeGreaterThanOrEqual(1);
    expect(evs[0].pan).toBeDefined();
    expect(evs[0].pan.enum).toBe('R');
    try { fs.unlinkSync(outPath); } catch (e) {}
  });
});
