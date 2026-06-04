import {
  ALL_INST_PROPERTY_NAMES,
  getChipInstrumentMeta,
  getInstPropertyNamesForChip,
  parseUsedInstProperties,
} from '../src/editor/instrument-meta';

describe('instrument-meta', () => {
  test('spectrum-128 includes AY instrument types and properties', () => {
    const meta = getChipInstrumentMeta('spectrum-128');
    expect(meta.types).toEqual(['tone1', 'tone2', 'tone3']);
    expect(meta.properties.env_bass).toBeDefined();
    expect(meta.properties.tone_mix).toBeDefined();
    expect(meta.properties.env_shape).toBeDefined();
  });

  test('resolves chip aliases to spectrum metadata', () => {
    const meta = getChipInstrumentMeta('ay');
    expect(meta.types).toContain('tone1');
    expect(meta.properties.noise_frames).toBeDefined();
  });

  test('ALL_INST_PROPERTY_NAMES includes AY-specific fields', () => {
    expect(ALL_INST_PROPERTY_NAMES).toEqual(
      expect.arrayContaining(['env_bass', 'env_shape', 'tone_mix', 'noise_frames']),
    );
  });

  test('parseUsedInstProperties collects keys on inst line', () => {
    const used = parseUsedInstProperties(
      'inst hat type=tone1 vol=15 tone_mix=true noise_rate=2',
    );
    expect(used).toEqual(new Set(['type', 'vol', 'tone_mix', 'noise_rate']));
  });

  test('getInstPropertyNamesForChip lists spectrum fields', () => {
    const names = getInstPropertyNamesForChip('spectrum-128');
    expect(names).toContain('vol_env');
    expect(names).toContain('env_bass');
  });
});
