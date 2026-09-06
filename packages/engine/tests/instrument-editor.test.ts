import { parse } from '../src/parser/index.js';
import { serializeInstrument, parseInstrumentBody, formatInstrumentFieldValue } from '../src/instruments/serialize.js';
import { generateWaveformPreset, samplesToHex } from '../src/instruments/waveform.js';
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
});

describe('waveform presets', () => {
  it('fills 32 samples in 0–15', () => {
    const sine = generateWaveformPreset('sine', 32, 0, 15);
    expect(sine).toHaveLength(32);
    expect(Math.max(...sine)).toBeLessThanOrEqual(15);
    expect(Math.min(...sine)).toBeGreaterThanOrEqual(0);
    expect(samplesToHex(sine)).toHaveLength(32);
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
});
