/**
 * Unit tests for ftm-macros.ts
 * Covers all macro builders and deduplication per the famitracker-export.md spec.
 */

import {
  parseMacroField,
  buildVolumeMacro,
  buildArpMacro,
  buildPitchMacro,
  buildDutyMacro,
  buildInstrumentMacros,
  deduplicateMacros,
} from '../src/ftm-macros.js';

describe('parseMacroField', () => {
  test('parses array directly', () => {
    expect(parseMacroField([1, 2, 3])).toEqual({ values: [1, 2, 3], loop: -1 });
  });

  test('parses string with loop point', () => {
    expect(parseMacroField('[1,2,3,4,5,6,7,8,9,10|9]')).toEqual({
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      loop: 9,
    });
  });

  test('parses string without loop point', () => {
    expect(parseMacroField('[15,12,8,4,2,1]')).toEqual({
      values: [15, 12, 8, 4, 2, 1],
      loop: -1,
    });
  });

  test('parses string without brackets', () => {
    expect(parseMacroField('0,4,7|0')).toEqual({ values: [0, 4, 7], loop: 0 });
  });

  test('returns null for undefined', () => {
    expect(parseMacroField(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(parseMacroField('[]')).toBeNull();
  });
});

describe('buildVolumeMacro', () => {
  test('vol_env=[1,2,3,4,5,6,7,8,9,10|9] → VOLUME macro with loop=9', () => {
    const macro = buildVolumeMacro({ vol_env: '[1,2,3,4,5,6,7,8,9,10|9]' });
    expect(macro).not.toBeNull();
    expect(macro!.type).toBe('VOLUME');
    expect(macro!.values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(macro!.loop).toBe(9);
  });

  test('vol_env=[15,12,8,4,2,1] (no loop) → VOLUME macro loop=-1 one-shot decay', () => {
    const macro = buildVolumeMacro({ vol_env: [15, 12, 8, 4, 2, 1] });
    expect(macro).not.toBeNull();
    expect(macro!.values).toEqual([15, 12, 8, 4, 2, 1]);
    expect(macro!.loop).toBe(-1);
  });

  test('env=15,down + env_period=2 → decay sequence with 3 frames per level', () => {
    const macro = buildVolumeMacro({ env: '15,down', env_period: '2' });
    expect(macro).not.toBeNull();
    // Each level 15..0 repeated 3 times (period+1 = 2+1 = 3)
    expect(macro!.values.slice(0, 6)).toEqual([15, 15, 15, 14, 14, 14]);
    expect(macro!.values[macro!.values.length - 1]).toBe(0);
    expect(macro!.loop).toBe(-1);
  });

  test('env=12,flat → single-entry macro with loop=0', () => {
    const macro = buildVolumeMacro({ env: '12,flat' });
    expect(macro).not.toBeNull();
    expect(macro!.values).toEqual([12]);
    expect(macro!.loop).toBe(0);
  });

  test('vol=9 → single-entry constant macro', () => {
    const macro = buildVolumeMacro({ vol: '9' });
    expect(macro).not.toBeNull();
    expect(macro!.values).toEqual([9]);
    expect(macro!.loop).toBe(0);
  });

  test('no volume fields → null', () => {
    expect(buildVolumeMacro({})).toBeNull();
  });
});

describe('buildArpMacro', () => {
  test('arp_env=[0,4,7|0] → ARPEGGIO loop=0 with values [0,4,7]', () => {
    const macro = buildArpMacro({ arp_env: '[0,4,7|0]' });
    expect(macro).not.toBeNull();
    expect(macro!.type).toBe('ARPEGGIO');
    expect(macro!.values).toEqual([0, 4, 7]);
    expect(macro!.loop).toBe(0);
  });

  test('returns null when no arp_env', () => {
    expect(buildArpMacro({})).toBeNull();
  });
});

describe('buildPitchMacro', () => {
  test('pitch_env=[5,4,3,2,1,0,0,0] → PITCH values ×16, loop=-1', () => {
    const macro = buildPitchMacro({ pitch_env: [5, 4, 3, 2, 1, 0, 0, 0] });
    expect(macro).not.toBeNull();
    expect(macro!.type).toBe('PITCH');
    expect(macro!.values).toEqual([80, 64, 48, 32, 16, 0, 0, 0]);
    expect(macro!.loop).toBe(-1);
  });

  test('returns null when no pitch_env', () => {
    expect(buildPitchMacro({})).toBeNull();
  });
});

describe('buildDutyMacro', () => {
  test('duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0] → DUTYSEQ with loop=0', () => {
    const macro = buildDutyMacro({
      duty_env: '[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0]',
    });
    expect(macro).not.toBeNull();
    expect(macro!.type).toBe('DUTYSEQ');
    expect(macro!.values).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(macro!.loop).toBe(0);
  });

  test('constant duty=50 → single-entry DUTYSEQ index=2', () => {
    const macro = buildDutyMacro({ duty: '50' });
    expect(macro).not.toBeNull();
    expect(macro!.values).toEqual([2]);
  });

  test('returns null when no duty fields', () => {
    expect(buildDutyMacro({})).toBeNull();
  });
});

describe('buildInstrumentMacros channel compatibility', () => {
  test('arp_env on triangle → ARPEGGIO written (valid)', () => {
    const result = buildInstrumentMacros({ arp_env: '[0,4,7|0]' }, 'triangle', 'arp_tri');
    expect(result.macros.ARPEGGIO).toBeDefined();
    expect(result.warnings).toHaveLength(0);
  });

  test('vol_env on triangle → VOLUME written with warning', () => {
    const result = buildInstrumentMacros({ vol_env: '[15,12,8,4,2,1]', type: 'triangle' }, 'triangle', 'tri');
    expect(result.macros.VOLUME).toBeDefined();
    expect(result.warnings.some((w) => w.includes('triangle'))).toBe(true);
  });

  test('pitch_env on noise → macro skipped, warning emitted', () => {
    const result = buildInstrumentMacros(
      { pitch_env: [5, 4, 3, 2, 1, 0] },
      'noise',
      'noise_inst',
    );
    expect(result.macros.PITCH).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('noise'))).toBe(true);
  });

  test('duty_env on triangle → macro skipped, warning emitted', () => {
    const result = buildInstrumentMacros(
      { duty_env: '[2,2,0,0|0]' },
      'triangle',
      'tri_duty',
    );
    expect(result.macros.DUTYSEQ).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('triangle'))).toBe(true);
  });
});

describe('deduplicateMacros', () => {
  test('two instruments with identical vol_env share one macro index', () => {
    const m1 = buildVolumeMacro({ vol_env: [15, 12, 8, 4, 2, 1] })!;
    const m2 = buildVolumeMacro({ vol_env: [15, 12, 8, 4, 2, 1] })!;
    m1.index = -1;
    m2.index = -1;

    deduplicateMacros([m1, m2]);

    expect(m1.index).toBe(m2.index);
  });

  test('different vol_env sequences get different indices', () => {
    const m1 = buildVolumeMacro({ vol_env: [15, 12, 8] })!;
    const m2 = buildVolumeMacro({ vol_env: [10, 8, 5] })!;
    m1.index = -1;
    m2.index = -1;

    deduplicateMacros([m1, m2]);

    expect(m1.index).not.toBe(m2.index);
  });

  test('macros of different types get independent index sequences', () => {
    const vol = buildVolumeMacro({ vol_env: [10, 8] })!;
    const arp = buildArpMacro({ arp_env: '[0,4,7|0]' })!;
    vol.index = -1;
    arp.index = -1;

    deduplicateMacros([vol, arp]);

    expect(vol.index).toBe(0);
    expect(arp.index).toBe(0);
  });
});
