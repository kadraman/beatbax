import { parseBaxBool, parseBaxNumber } from '../src/bax-values.js';
import { resolveAyMixerRouting } from '../src/channel-backend.js';

describe('parseBaxBool', () => {
  test('parses string true/false from parser', () => {
    expect(parseBaxBool('true')).toBe(true);
    expect(parseBaxBool('false')).toBe(false);
  });

  test('parses native booleans', () => {
    expect(parseBaxBool(true)).toBe(true);
    expect(parseBaxBool(false)).toBe(false);
  });
});

describe('resolveAyMixerRouting with parser string values', () => {
  test('kick instrument from ay_percussion_demo.bax', () => {
    const inst = {
      type: 'tone3',
      vol: '15',
      tone: 'true',
      tone_mix: 'true',
      noise_rate: '24',
    };
    expect(resolveAyMixerRouting(inst as any)).toEqual({
      toneEnable: true,
      noiseEnable: true,
    });
  });

  test('snare instrument from ay_percussion_demo.bax', () => {
    const inst = {
      type: 'tone2',
      vol: '14',
      tone_mix: 'true',
      noise_rate: '8',
    };
    expect(resolveAyMixerRouting(inst as any)).toEqual({
      toneEnable: false,
      noiseEnable: true,
    });
  });
});

describe('parseBaxNumber', () => {
  test('parses string numbers', () => {
    expect(parseBaxNumber('10')).toBe(10);
  });
});
