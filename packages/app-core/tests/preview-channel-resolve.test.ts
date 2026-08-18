import {
  seqTokenBase,
  seqTreeContains,
  findChannelForNamedItem,
  findChannelForNamedItemInSource,
} from '../src/editor/preview-channel-resolve';

const DEPTHS_SOURCE = `
chip gameboy
import "local:lib/adventure.ins"
pat wave_i = E3:2 . . . . . . B3:2 . . . . . .
pat deep_a = E4:8 .:8
seq deep_w = wave_i wave_i
seq wave = deep_w
seq mel = deep_a
channel 1 => inst adv_lead seq mel lock=scale
channel 3 => inst adv_wave_dark seq wave lock=scale
play auto repeat
`;

describe('preview-channel-resolve', () => {
  it('seqTokenBase strips transforms and repeats', () => {
    expect(seqTokenBase('wave_i')).toBe('wave_i');
    expect(seqTokenBase('hook:oct(-1)')).toBe('hook');
    expect(seqTokenBase('ost*8')).toBe('ost');
  });

  it('walks nested seqs to the leaf pattern', () => {
    const seqs = {
      wave: ['deep_w', 'land_w'],
      deep_w: ['wave_i', 'wave_bVI'],
      land_w: ['wave_iv'],
    };
    expect(seqTreeContains(['wave'], 'wave_i', seqs)).toBe(true);
    expect(seqTreeContains(['wave'], 'deep_a', seqs)).toBe(false);
  });

  it('breaks seq cycles', () => {
    const seqs = { a: ['b'], b: ['a'] };
    expect(seqTreeContains(['a'], 'missing', seqs)).toBe(false);
  });

  it('finds the wave channel for a nested cave-bass pattern on the AST', () => {
    const ast = {
      seqs: {
        mel: ['deep_a'],
        deep_w: ['wave_i', 'wave_bVI'],
        wave: ['deep_w'],
      },
      channels: [
        { id: 1, inst: 'adv_lead', seqSpecTokens: ['mel'] },
        { id: 3, inst: 'adv_wave_dark', seqSpecTokens: ['wave'] },
      ],
    };
    expect(findChannelForNamedItem(ast, 'wave_i')).toEqual({
      id: 3,
      inst: 'adv_wave_dark',
    });
    expect(findChannelForNamedItem(ast, 'deep_w')).toEqual({
      id: 3,
      inst: 'adv_wave_dark',
    });
    expect(findChannelForNamedItem(ast, 'deep_a')).toEqual({
      id: 1,
      inst: 'adv_lead',
    });
  });

  it('finds the same mapping from source text (command-palette path)', () => {
    expect(findChannelForNamedItemInSource(DEPTHS_SOURCE, 'wave_i')).toEqual({
      id: 3,
      inst: 'adv_wave_dark',
    });
    expect(findChannelForNamedItemInSource(DEPTHS_SOURCE, 'wave')).toEqual({
      id: 3,
      inst: 'adv_wave_dark',
    });
    expect(findChannelForNamedItemInSource(DEPTHS_SOURCE, 'deep_a')).toEqual({
      id: 1,
      inst: 'adv_lead',
    });
  });
});
