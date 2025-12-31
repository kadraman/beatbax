import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from '../src/parser/index';
import { exportJSON } from '../src/export/jsonExport';
import exportUGE from '../src/export/ugeWriter';

const SONG_TEMPLATE = `chip gameboy

inst pad type=wave pan=0.25
pat p = C4:4
channel 1 => inst pad pat p
`;

describe('UGE strict-gb flag', () => {
  test('exportUGE throws when strictGB=true and numeric pan present', async () => {
    const ast = parse(SONG_TEMPLATE as any);
    const tempJson = path.join(os.tmpdir(), `strict_gb_${Date.now()}.json`);
    await exportJSON(ast as any, tempJson, { debug: false });
    const song = JSON.parse(fs.readFileSync(tempJson, 'utf8')).song;

    const outUge = path.join(os.tmpdir(), `strict_gb_${Date.now()}.uge`);
    await expect(exportUGE(song as any, outUge, { debug: false, strictGb: true })).rejects.toThrow('Numeric');
    try { fs.unlinkSync(tempJson); } catch (e) {}
  });

  test('exportUGE succeeds when strictGB=false for numeric pan', async () => {
    const ast = parse(SONG_TEMPLATE as any);
    const tempJson = path.join(os.tmpdir(), `strict_gb_${Date.now()}.json`);
    await exportJSON(ast as any, tempJson, { debug: false });
    const song = JSON.parse(fs.readFileSync(tempJson, 'utf8')).song;

    const outUge = path.join(os.tmpdir(), `strict_gb_${Date.now()}.uge`);
    await exportUGE(song as any, outUge, { debug: false, strictGb: false });
    expect(fs.existsSync(outUge)).toBeTruthy();
    try { fs.unlinkSync(tempJson); } catch (e) {}
    try { fs.unlinkSync(outUge); } catch (e) {}
  });
});
