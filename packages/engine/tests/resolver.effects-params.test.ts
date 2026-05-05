import { parseEffectParams, parseEffectsInline } from '../src/song/resolver';

describe('parseEffectParams helper', () => {
  test('filters empty params and converts numbers', () => {
    expect(parseEffectParams('1,,2, ,3')).toEqual([1, 2, 3]);
    expect(parseEffectParams(', ,')).toEqual([]);
    expect(parseEffectParams('foo, , 5')).toEqual(['foo', 5]);
    expect(parseEffectParams('')).toEqual([]);
    expect(parseEffectParams(undefined as any)).toEqual([]);
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

  test('parseEffectsInline keeps macro effect args intact', () => {
    const parsed = parseEffectsInline('pitch_env:[0,2,0,-2,0],cut:1');
    const pitch = parsed.effects.find(e => e.type === 'pitch_env');
    const cut = parsed.effects.find(e => e.type === 'cut');

    expect(pitch).toBeDefined();
    expect(pitch!.params).toEqual(['[0,2,0,-2,0]']);
    expect(cut).toBeDefined();
    expect(cut!.params).toEqual([1]);
  });
});
