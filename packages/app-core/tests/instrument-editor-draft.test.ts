import {
  instrumentDraftFingerprint,
  instrumentDraftPreviewPatch,
  isInstrumentDraftDirty,
  stripInstrumentDraftMeta,
} from '../src/editor/instrument-editor-draft';

describe('instrument editor draft helpers (099)', () => {
  test('stripInstrumentDraftMeta drops __loc', () => {
    expect(stripInstrumentDraftMeta({
      type: 'tone3',
      vol: 12,
      __loc: { line: 1, column: 1 },
    })).toEqual({ type: 'tone3', vol: 12 });
  });

  test('isInstrumentDraftDirty ignores __loc-only differences', () => {
    const a = { type: 'pulse1', vol: 10, __loc: { line: 1 } };
    const b = { type: 'pulse1', vol: 10, __loc: { line: 99 } };
    expect(isInstrumentDraftDirty(a, b)).toBe(false);
    expect(isInstrumentDraftDirty(a, { ...b, vol: 11 })).toBe(true);
  });

  test('isInstrumentDraftDirty short-circuits on same reference', () => {
    const a = { type: 'pulse1', vol: 10 };
    expect(isInstrumentDraftDirty(a, a)).toBe(false);
  });

  test('fingerprint is key-order independent', () => {
    expect(instrumentDraftFingerprint({ vol: 1, type: 'noise' }))
      .toBe(instrumentDraftFingerprint({ type: 'noise', vol: 1 }));
  });

  test('preview patch is meta-stripped draft props', () => {
    expect(instrumentDraftPreviewPatch({
      type: 'tone3',
      tone_mix: true,
      vol_env: [12, 0],
      __loc: { line: 3 },
    })).toEqual({
      type: 'tone3',
      tone_mix: true,
      vol_env: [12, 0],
    });
  });
});
