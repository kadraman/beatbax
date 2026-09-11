import { parse } from '../src/parser/index.js';
import { serializeInstrument, parseInstrumentBody, formatInstrumentFieldValue } from '../src/instruments/serialize.js';
import {
  generateWaveformPreset,
  samplesToHex,
  parseWaveHexInput,
  normalizeWaveSamples,
} from '../src/instruments/waveform.js';
import { formatMacro, parseMacro } from '../src/util/music.js';
import { gameboyPlugin } from '../src/chips/gameboy/plugin.js';
import { nesPlugin } from '../src/chips/nes/plugin.js';

describe('serializeInstrument', () => {
  it('pretty-prints env CSV instead of JSON objects', () => {
    const ast = parse(`
chip gameboy
inst lead type=pulse1 duty=50 env={"level":12,"direction":"down","period":1,"format":"gb"}
pat a = C5
channel 1 => inst lead pat a
`);
    const line = serializeInstrument('lead', ast.insts.lead);
    expect(line).toContain('inst lead');
    expect(line).toContain('type=pulse1');
    expect(line).toContain('env=12,down');
    expect(line).not.toContain('"level"');
  });

  it('formats env objects for editor field display', () => {
    expect(formatInstrumentFieldValue('env', { level: 12, direction: 'down', period: 1 })).toBe('12,down');
    expect(formatInstrumentFieldValue('env', { level: 8, direction: 'up', period: 3 })).toBe('8,up,3');
    expect(formatInstrumentFieldValue('width', { value: 7, format: 'gb' })).toBe('7');
    expect(formatInstrumentFieldValue('env', '15,flat')).toBe('15,flat');
  });

  it('quotes sharp note values so # is not treated as a comment', () => {
    const line = serializeInstrument('lead', { type: 'pulse1', note: 'C#4' });
    expect(line).toContain('note="C#4"');
    const noise = serializeInstrument('kick', { type: 'noise', uge_note: 'C#7' });
    expect(noise).toContain('uge_note="C#7"');
  });

  it('round-trips wave arrays and macros with loop points', () => {
    const src = `
chip gameboy
inst bass type=wave wave=[0,5,11,15,15,15,15,15,11,5,0,0,0,0,0,0] volume=100 vol_env=[15,12,8,4|0]
pat a = C3
channel 3 => inst bass pat a
`;
    const ast = parse(src);
    const line = serializeInstrument('bass', ast.insts.bass);
    expect(line).toMatch(/wave=\[0,5,11,15/);
    expect(line).toContain('vol_env=[15,12,8,4|0]');
    const again = parse(`chip gameboy\n${line}\npat a = C3\nchannel 3 => inst bass pat a\n`);
    expect(again.insts.bass.type).toBe('wave');
    expect(parseMacro(again.insts.bass.vol_env)?.loopPoint).toBe(0);
  });
});

describe('parseInstrumentBody', () => {
  it('parses preset snippets without an inst prefix', () => {
    const node = parseInstrumentBody('type=pulse1 duty=50 env=12,down gm=81');
    expect(node.type).toBe('pulse1');
    expect(node.duty).toBe('50');
    expect(node.env).toBe('12,down');
  });

  it('treats empty list values as empty arrays, not [0]', () => {
    const node = parseInstrumentBody('type=wave wave=[] vol_env=[]');
    expect(node.wave).toEqual([]);
    expect(node.vol_env).toEqual([]);
    const line = serializeInstrument('bass', node);
    expect(line).toBe('inst bass type=wave');
    expect(line).not.toContain('wave=');
    expect(line).not.toContain('vol_env=');
  });
});

describe('waveform presets', () => {
  it('fills 32 samples in 0–15', () => {
    const sine = generateWaveformPreset('sine', 32, 0, 15);
    expect(sine).toHaveLength(32);
    expect(Math.max(...sine)).toBeLessThanOrEqual(15);
    expect(Math.min(...sine)).toBeGreaterThanOrEqual(0);
    expect(samplesToHex(sine)).toHaveLength(32);
  });

  it('pads short hex input with zeros and strips non-hex', () => {
    const short = parseWaveHexInput('89A', 32);
    expect(short.hex).toBe(`89A${'0'.repeat(29)}`);
    expect(short.samples).toEqual([8, 9, 10, ...new Array(29).fill(0)]);

    const spaced = parseWaveHexInput('ab cd', 8);
    expect(spaced.hex).toBe('ABCD0000');
    expect(spaced.samples).toEqual([10, 11, 12, 13, 0, 0, 0, 0]);

    const empty = parseWaveHexInput('', 4);
    expect(empty.hex).toBe('0000');
    expect(empty.samples).toEqual([0, 0, 0, 0]);
  });

  it('normalizes against schema length/min/max instead of GB 32', () => {
    expect(normalizeWaveSamples([1, 2, 3], 4, 0, 7)).toEqual([1, 2, 3, 0]);
    expect(normalizeWaveSamples([0, 9, 20, 3, 4, 5], 4, 0, 7)).toEqual([0, 7, 7, 3]);
    expect(normalizeWaveSamples('[2,4,6]', 4, 1, 8)).toEqual([2, 4, 6, 1]);
    expect(normalizeWaveSamples('ABCD', 4, 0, 15)).toEqual([10, 11, 12, 13]);
    expect(normalizeWaveSamples(null, 3, 2, 5)).toEqual([2, 2, 2]);
    // Must not tile a short table out to 32 Game Boy slots.
    expect(normalizeWaveSamples([1, 2], 8, 0, 15)).toHaveLength(8);
    expect(normalizeWaveSamples([1, 2], 8, 0, 15)).toEqual([1, 2, 0, 0, 0, 0, 0, 0]);
  });
});

describe('formatMacro', () => {
  it('omits the pipe when there is no loop', () => {
    expect(formatMacro({ values: [15, 12, 8], loopPoint: -1 })).toBe('[15,12,8]');
    expect(formatMacro({ values: [0, 4, 7], loopPoint: 0 })).toBe('[0,4,7|0]');
  });
});

describe('chip instrumentEditor schemas', () => {
  it('declares Game Boy waveform and NES has no waveform', () => {
    expect(gameboyPlugin.instrumentEditor?.waveform?.length).toBe(32);
    expect(gameboyPlugin.instrumentEditor?.types.map((t) => t.id)).toEqual(['pulse1', 'pulse2', 'wave', 'noise']);
    expect(nesPlugin.instrumentEditor?.waveform).toBeUndefined();
    expect(nesPlugin.instrumentEditor?.types.some((t) => t.id === 'dmc')).toBe(true);
  });

  it('uses envelope/sweep widgets for hardware GB/NES fields', () => {
    const gbEnv = gameboyPlugin.instrumentEditor?.fields.find((f) => f.name === 'env');
    const gbSweep = gameboyPlugin.instrumentEditor?.fields.find((f) => f.name === 'sweep');
    const nesEnv = nesPlugin.instrumentEditor?.fields.find((f) => f.name === 'env');
    const nesSweep = nesPlugin.instrumentEditor?.fields.find((f) => f.name === 'sweep');
    expect(gbEnv?.widget).toBe('envelope');
    expect(gbSweep?.widget).toBe('sweep');
    expect(gbSweep?.storage).toBeUndefined();
    expect(nesEnv?.widget).toBe('envelope');
    expect(nesEnv?.storage).toBe('discrete');
    expect(nesSweep?.widget).toBe('sweep');
    expect(nesSweep?.storage).toBe('discrete');
    expect(gameboyPlugin.instrumentEditor?.macros.some((m) => m.name === 'vol_env')).toBe(true);
    expect(nesPlugin.instrumentEditor?.macros.some((m) => m.signed)).toBe(true);
  });

  it('aligns NES schema fields with validateInstrument language names', () => {
    const names = new Set(nesPlugin.instrumentEditor?.fields.map((f) => f.name));
    expect(names.has('dmc_sample')).toBe(true);
    expect(names.has('sample')).toBe(false);
    expect(names.has('linear')).toBe(true);
    expect(names.has('noise_mode')).toBe(true);
    expect(names.has('noise_period')).toBe(true);
    expect(names.has('dmc_rate')).toBe(true);
    expect(names.has('dmc_loop')).toBe(true);
    expect(names.has('dmc_level')).toBe(true);
    expect(names.has('sweep_en')).toBe(false);
  });

  it('declares DMC sample as a sample widget backed by bundledSamples', () => {
    const dmcSample = nesPlugin.instrumentEditor?.fields.find((f) => f.name === 'dmc_sample');
    expect(dmcSample?.widget).toBe('sample');
    expect(nesPlugin.bundledSamples).toBeDefined();
    const refs = Object.keys(nesPlugin.bundledSamples!)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `@nes/${key}`);
    expect(refs).toContain('@nes/kick');
    expect(refs).toContain('@nes/snare');
    expect(refs).toContain('@nes/bass_c2');
  });
});
