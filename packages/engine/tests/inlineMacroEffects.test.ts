import { describe, expect, it } from '@jest/globals';
import { mergeInlineMacroEffectsIntoInst, applyInlineRenderEffects } from '../src/audio/inlineMacroEffects.js';

describe('mergeInlineMacroEffectsIntoInst', () => {
  const baseInst = { name: 'lead', type: 'tone1', vol: 12 };

  it('merges pitch_env and arp_env payloads into instrument copy', () => {
    const effects = [
      { type: 'pitch_env', params: ['[0,2,0,-2,0]'] },
      { type: 'vib', params: [4, 5, 'sine', 0, 4] },
    ];
    const { effectiveInst, remainingEffects } = mergeInlineMacroEffectsIntoInst(baseInst, effects);

    expect(effectiveInst.pitch_env).toBe('[0,2,0,-2,0]');
    expect(effectiveInst.vol).toBe(12);
    expect(remainingEffects).toHaveLength(1);
    expect(remainingEffects[0].type).toBe('vib');
  });

  it('filters baked macros from remaining effects', () => {
    const effects = [
      { type: 'vol_env', params: ['[12,11,10|11]'] },
      { type: 'arp_env', params: ['[0,4,7|0]'] },
      { type: 'noise_rate_env', params: ['[0,1,2|0]'] },
      { type: 'cut', params: [1] },
    ];
    const { effectiveInst, remainingEffects } = mergeInlineMacroEffectsIntoInst(baseInst, effects);

    expect(effectiveInst.vol_env).toBe('[12,11,10|11]');
    expect(effectiveInst.arp_env).toBe('[0,4,7|0]');
    expect(effectiveInst.noise_rate_env).toBe('[0,1,2|0]');
    expect(remainingEffects).toEqual([{ type: 'cut', params: [1] }]);
  });

  it('returns original inst when no macro effects present', () => {
    const { effectiveInst, remainingEffects } = mergeInlineMacroEffectsIntoInst(baseInst, [
      { type: 'bend', params: [-7, 'exp', 0, 1] },
    ]);
    expect(effectiveInst).toBe(baseInst);
    expect(remainingEffects).toHaveLength(1);
  });
});

describe('applyInlineRenderEffects', () => {
  const baseInst = { name: 'lead', type: 'tone2', vol: 12 };

  it('bakes volSlide onto instrument and removes it from remaining effects', () => {
    const effects = [
      { type: 'volSlide', params: [-4, 8] },
      { type: 'port', params: [8] },
    ];
    const { effectiveInst, remainingEffects } = applyInlineRenderEffects(baseInst, effects);

    expect(effectiveInst.__volSlide).toEqual({ delta: -4, steps: 8 });
    expect(effectiveInst.vol).toBe(12);
    expect(remainingEffects).toEqual([{ type: 'port', params: [8] }]);
  });

  it('combines macro merge with volSlide baking', () => {
    const effects = [
      { type: 'pitch_env', params: ['[0,2,0]'] },
      { type: 'volSlide', params: [-2] },
    ];
    const { effectiveInst, remainingEffects } = applyInlineRenderEffects(baseInst, effects);

    expect(effectiveInst.pitch_env).toBe('[0,2,0]');
    expect(effectiveInst.__volSlide).toEqual({ delta: -2 });
    expect(remainingEffects).toEqual([]);
  });
});
