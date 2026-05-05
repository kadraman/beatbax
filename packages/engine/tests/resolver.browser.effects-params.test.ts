import { parseEffectsInline } from '../src/song/resolver.browser';

describe('resolver.browser parseEffectsInline', () => {
  test('keeps bracketed macro effect args intact', () => {
    const parsed = parseEffectsInline('pitch_env:[0,2,0,-2,0],cut:1');
    const pitch = parsed.effects.find(e => e.type === 'pitch_env');
    const cut = parsed.effects.find(e => e.type === 'cut');

    expect(pitch).toBeDefined();
    expect(pitch!.params).toEqual(['[0,2,0,-2,0]']);
    expect(cut).toBeDefined();
    expect(cut!.params).toEqual([1]);
  });
});
