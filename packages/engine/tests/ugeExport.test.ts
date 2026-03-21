import exportUGE, { exportUGE as exportUGENamed } from '../src/export/ugeWriter';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { readUGEFile } from '../src/import/uge/uge.reader';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('UGE export', () => {
  test('exportUGE default export exists', () => {
    expect(typeof exportUGE).toBe('function');
  });
});

// ─── Wavetable round-trip tests ───────────────────────────────────────────────

function buildSongWithWaveInst(waveValue: string): any {
  const src = `
chip gameboy
bpm 120

inst w1 type=wave wave=${waveValue}

pat dummy = C4
seq s = dummy
channel 3 => inst w1 seq s
`;
  const ast = parse(src);
  return resolveSong(ast as any);
}

describe('UGE exporter — wave hex-string wavetable', () => {
  const file = join(tmpdir(), 'test_wave_hex.uge');

  afterEach(() => {
    if (existsSync(file)) unlinkSync(file);
  });

  test('32-nibble hex string is correctly written and round-trips through the UGE reader', async () => {
    const hex = '0478ABBB986202467776420146777631';
    const expected = hex.split('').map(c => parseInt(c, 16));

    const song = buildSongWithWaveInst(`"${hex}"`);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    // Wavetable slot 0 should exactly match the parsed nibbles
    expect(uge.wavetables[0]).toEqual(expected);
  });

  test('all-zeros hex string produces an all-zero wavetable', async () => {
    const hex = '0'.repeat(32);
    const song = buildSongWithWaveInst(`"${hex}"`);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    expect(uge.wavetables[0]).toEqual(new Array(32).fill(0));
  });

  test('all-max (F×32) hex string produces a flat-top wavetable', async () => {
    const hex = 'F'.repeat(32);
    const expected = new Array(32).fill(15);
    const song = buildSongWithWaveInst(`"${hex}"`);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    expect(uge.wavetables[0]).toEqual(expected);
  });

  test('nibble values are clamped to 0–15 when written', async () => {
    // Write via array override to inject out-of-range values through the writer path
    const src = `
chip gameboy
inst w1 type=wave wave=[255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255]
pat dummy = C4
seq s = dummy
channel 3 => inst w1 seq s
`;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    // All nibbles should be clamped to 15 (0xFF → 0x0F)
    expect(uge.wavetables[0]).toEqual(new Array(32).fill(15));
  });

  test('16-element array is tiled to fill 32 nibbles', async () => {
    // A 16-sample array [0..15] should appear twice in the 32-nibble table
    const half = Array.from({ length: 16 }, (_, i) => i);
    const expected = [...half, ...half];
    const src = `
chip gameboy
inst w1 type=wave wave=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
pat dummy = C4
seq s = dummy
channel 3 => inst w1 seq s
`;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    expect(uge.wavetables[0]).toEqual(expected);
  });

  test('invalid wave string falls back to all-zero wavetable without throwing', async () => {
    // Build song manually with a deliberately malformed wave string
    // so the writer's JSON.parse fallback fails and warns
    const src = `
chip gameboy
inst w1 type=wave wave="not_a_valid_wave"
pat dummy = C4
seq s = dummy
channel 3 => inst w1 seq s
`;
    const ast = parse(src);
    const song = resolveSong(ast as any);

    // Must not throw
    await expect(exportUGENamed(song, file, { debug: false })).resolves.not.toThrow();

    const uge = readUGEFile(file);
    // Falls back to zeros on invalid data
    expect(uge.wavetables[0]).toEqual(new Array(32).fill(0));
  });

  test('missing wave field produces all-zero wavetable', async () => {
    const src = `
chip gameboy
inst w1 type=wave
pat dummy = C4
seq s = dummy
channel 3 => inst w1 seq s
`;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    expect(uge.wavetables[0]).toEqual(new Array(32).fill(0));
  });

  test('unused wavetable slots (beyond defined instruments) remain all zeros', async () => {
    const hex = '0123456789ABCDEF0123456789ABCDEF';
    const song = buildSongWithWaveInst(`"${hex}"`);
    await exportUGENamed(song, file, { debug: false });

    const uge = readUGEFile(file);
    // Slots 1–15 should all be zeros (no instrument assigned)
    for (let i = 1; i < 16; i++) {
      expect(uge.wavetables[i]).toEqual(new Array(32).fill(0));
    }
  });
});
