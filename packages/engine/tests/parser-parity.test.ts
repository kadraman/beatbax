import { parse as legacyParse } from '../src/parser';
import parseWithChevrotain from '../src/parser/chevrotain';
import fs from 'fs';
import path from 'path';

let chevAvailable = false;
beforeAll(async () => {
  try {
    await import('chevrotain');
    chevAvailable = true;
  } catch (e) {
    console.warn('chevrotain not available; skipping parity tests');
  }
});

const normalize = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(normalize);
  if (obj && typeof obj === 'object') {
    const out: any = {};
    const keys = Object.keys(obj).filter(k => k !== 'pos').sort();
    for (const k of keys) {
      out[k] = normalize(obj[k]);
    }
    return out;
  }
  return obj;
};

const findBaxFiles = (songsDir: string) => {
  if (!fs.existsSync(songsDir)) return [];
  return fs.readdirSync(songsDir).filter(f => f.endsWith('.bax')).map(f => path.join(songsDir, f));
};

describe('parser parity with Chevrotain', () => {
  test('skips if Chevrotain not available', () => {
    if (!chevAvailable) return;
  });

  const songsDir = path.resolve(__dirname, '..', '..', '..', 'songs');
  const files = findBaxFiles(songsDir).slice(0, 10); // limit to first 10 for speed

  if (files.length === 0) {
    test('no sample .bax files found — skipping parity tests', () => {
      // Don't fail the test when no sample files are present in the environment.
      // Emit a warning so CI or local runs show why parity tests were skipped.
      console.warn(`No .bax sample files found in ${songsDir}; skipping parser parity tests.`);
    });
    return;
  }

  for (const filePath of files) {
    const short = path.basename(filePath);
    test(`parity: ${short}`, async () => {
      if (!chevAvailable) return;
      const src = fs.readFileSync(filePath, 'utf8');
      const a1 = legacyParse(src);
      const res = await parseWithChevrotain(src);
      if (res.errors && res.errors.length) throw new Error('Chevrotain parser errors: ' + JSON.stringify(res.errors));
      const a2 = res.ast;
      expect(a2).toBeTruthy();
      const n1 = normalize(a1);
      const n2 = normalize(a2);
      expect(n2).toEqual(n1);
    });
  }
});
