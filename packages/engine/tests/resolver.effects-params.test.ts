import { parseEffectParams, parseEffectsInline } from '../src/song/resolver';

describe('parseEffectParams helper', () => {
  test('filters empty params and converts numbers', () => {
    expect(parseEffectParams('1,,2, ,3')).toEqual([1, 2, 3]);
    expect(parseEffectParams(', ,')).toEqual([]);
    expect(parseEffectParams('foo, , 5')).toEqual(['foo', 5]);
    expect(parseEffectParams('')).toEqual([]);
    expect(parseEffectParams(undefined as any)).toEqual([]);
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
});
