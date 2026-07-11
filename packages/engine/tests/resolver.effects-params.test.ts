import { parseEffectParams, parseEffectsInline, resolveSong } from '../src/song/resolver';
import { parse } from '../src/parser/index.js';

describe('parseEffectParams helper', () => {
  test('preserves positional empty params and converts numbers', () => {
    expect(parseEffectParams('1,,2, ,3')).toEqual([1, '', 2, '', 3]);
    expect(parseEffectParams(', ,')).toEqual(['', '', '']);
    expect(parseEffectParams('foo, , 5')).toEqual(['foo', '', 5]);
    expect(parseEffectParams('')).toEqual([]);
    expect(parseEffectParams(undefined as any)).toEqual([]);
  });

  test('preserves skipped waveform slot for vibrato durationRows', () => {
    expect(parseEffectParams('6,5,,2')).toEqual([6, 5, '', 2]);
    expect(parseEffectParams('3,6,,8')).toEqual([3, 6, '', 8]);
  });

  test('preserves bracketed macro payload as one parameter', () => {
    expect(parseEffectParams('[0,2,0,-2,0]')).toEqual(['[0,2,0,-2,0]']);
    expect(parseEffectParams('[0,1,2|0],4')).toEqual(['[0,1,2|0]', 4]);
  });

  test('parseEffectsInline uses helper and returns no empty params', () => {
    const parsed = parseEffectsInline('fx:1,bar:baz,pan:L');
    const fx = parsed.effects.find(e => e.type === 'fx');
    expect(fx).toBeDefined();
    expect(fx!.params).toEqual([1]);
    const bar = parsed.effects.find(e => e.type === 'bar');
    expect(bar).toBeDefined();
    expect(bar!.params).toEqual(['baz']);
    expect(parsed.pan).toBeDefined();
    expect(parsed.pan.enum).toBe('L');
  });

  test('parseEffectsInline preserves skipped vibrato waveform for durationRows', () => {
    const parsed = parseEffectsInline('vib:6,5,,2');
    const vib = parsed.effects.find(e => e.type === 'vib');
    expect(vib).toBeDefined();
    expect(vib!.params).toEqual([6, 5, '', 2]);
    expect(vib!.paramsStr).toBe('6,5,,2');
  });

  test('parseEffectsInline keeps macro effect args intact', () => {
    const parsed = parseEffectsInline('pitch_env:[0,2,0,-2,0],cut:1');
    const pitch = parsed.effects.find(e => e.type === 'pitch_env');
    const cut = parsed.effects.find(e => e.type === 'cut');

    expect(pitch).toBeDefined();
    expect(pitch!.params).toEqual(['[0,2,0,-2,0]']);
    expect(cut).toBeDefined();
    expect(cut!.params).toEqual([1]);
  });

  test('resolveSong keeps durationRows when waveform slot is skipped', () => {
    const src = 'bpm 120\npat p = C4<vib:6,5,,2>\nchannel 1 => inst lead pat p\n';
    const song = resolveSong(parse(src));
    const ev = (song.channels[0] as any).events[0];
    const vib = ev.effects.find((e: any) => e.type === 'vib');
    expect(vib).toBeDefined();
    expect(vib.params).toEqual([6, 5, '', 2]);
    expect(vib.durationSec).toBeGreaterThan(0);
  });
});
