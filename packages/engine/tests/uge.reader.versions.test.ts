import { buildUGE } from '../src/export/ugeWriter';
import {
  parseUGE,
  subpatternFromNoiseMacro,
} from '../src/import/uge/uge.reader';
import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';
import { buildUgeFixture } from './helpers/ugeFixtureWriter';

describe('UGE reader versions', () => {
  test('parses a BeatBax-exported v6 song and keeps noiseMode', () => {
    const src = `
chip gameboy
bpm 128
inst lead type=pulse1 duty=50 env=10,down,1
inst bass type=wave wave="0123456789ABCDEF0123456789ABCDEF" volume=50
inst snare type=noise gb:width=7 env=12,down,2 uge_note=C-7
pat p = C4
pat w = C3
pat n = snare
channel 1 => inst lead pat p
channel 3 => inst bass pat w
channel 4 => inst snare pat n
`;
    const song = resolveSong(parse(src) as any);
    const uge = parseUGE(Buffer.from(buildUGE(song)));
    expect(uge.version).toBe(6);
    expect(uge.dutyInstruments.find((d) => d.name === 'lead')).toBeTruthy();
    expect(uge.waveInstruments.find((d) => d.name === 'bass')?.volume).toBe(2);
    const snare = uge.noiseInstruments.find((d) => d.name === 'snare');
    expect(snare?.noiseMode).toBe(1);
  });

  test('parses v1 mixed instrument bank', () => {
    const buf = buildUgeFixture({ version: 1 });
    const uge = parseUGE(buf);
    expect(uge.version).toBe(1);
    expect(uge.dutyInstruments[0].name).toBe('Lead');
    expect(uge.dutyInstruments[0].dutyCycle).toBe(2);
    expect(uge.waveInstruments[1].name).toBe('Bass');
    expect(uge.noiseInstruments[2].name).toBe('Kick');
    expect(uge.noiseInstruments[2].noiseMode).toBe(1);
    expect(uge.wavetables).toHaveLength(16);
    expect(uge.wavetables[0]).toHaveLength(32);
  });

  test('parses v4 and migrates non-zero noise macros to subpattern rows', () => {
    const buf = buildUgeFixture({ version: 4, ticksPerRow: 6 });
    const uge = parseUGE(buf);
    expect(uge.version).toBe(4);
    expect(uge.dutyInstruments[0].name).toBe('Lead');
    expect(uge.dutyInstruments[0].freqSweepTime).toBe(3);
    expect(uge.dutyInstruments[0].sweepEnabled).toBe(1);
    expect(uge.waveInstruments[0].name).toBe('Pad');
    expect(uge.waveInstruments[0].volume).toBe(2);
    expect(uge.waveInstruments[0].waveIndex).toBe(1);
    const snare = uge.noiseInstruments[0];
    expect(snare.name).toBe('Snare');
    expect(snare.noiseMode).toBe(1);
    expect(snare.subpatternEnabled).toBe(true);
    expect(snare.rows?.[1].note).toBe(36 - 2);
    expect(snare.rows?.[2].note).toBe(36 - 4);
    const expected = subpatternFromNoiseMacro([-2, -4, 0, 0, 0, 0], 6);
    expect(snare.rows?.[expected.findIndex((r) => r.jump > 0) ?? -1].jump).toBe(6);
  });

  test('parses v5 pattern ids and wavetable hex nibbles', () => {
    const buf = buildUgeFixture({ version: 5, waveNibble: 0xb });
    const uge = parseUGE(buf);
    expect(uge.version).toBe(5);
    expect(uge.patterns[0].index).toBe(0);
    expect(uge.patterns[0].rows).toHaveLength(64);
    expect(uge.wavetables[1].every((n) => n === 0xb)).toBe(true);
  });

  test('parses v6 fixture subpattern flag and rows', () => {
    const buf = buildUgeFixture({
      version: 6,
      duty: [{ type: 0, name: 'Pluck', duty: 0, subpatternEnabled: true, subNote: 36 }],
      noise: [{ type: 2, name: 'Hat', noiseMode: 0 }],
    });
    const uge = parseUGE(buf);
    expect(uge.version).toBe(6);
    const pluck = uge.dutyInstruments[0];
    expect(pluck.name).toBe('Pluck');
    expect(pluck.subpatternEnabled).toBe(true);
    expect(pluck.rows?.[0].note).toBe(36);
    expect(uge.noiseInstruments[0].noiseMode).toBe(0);
  });

  test('skips empty noise macros on v4', () => {
    const buf = buildUgeFixture({
      version: 4,
      noise: [{ type: 2, name: 'EmptyMacro', noiseMacro: [0, 0, 0, 0, 0, 0] }],
    });
    const uge = parseUGE(buf);
    expect(uge.noiseInstruments[0].subpatternEnabled).toBeFalsy();
  });
});
