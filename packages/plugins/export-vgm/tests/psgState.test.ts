/**
 * Unit tests for SN76489 shadow PSG state.
 */

import {
  SN76489State,
  GG_STEREO_DEFAULT,
  ATTENUATION_MUTE,
} from '../src/backends/psgState.js';
import { toneLatchByte, toneDataByte, volumeLatchByte, noiseControlByte } from '../src/constants.js';

describe('SN76489State — tone period', () => {
  it('returns latch + data bytes on first write', () => {
    const psg = new SN76489State();
    const bytes = psg.applyTonePeriod(0, 60);
    expect(bytes).toEqual([toneLatchByte(0, 60), toneDataByte(60)]);
  });

  it('returns empty array when period unchanged', () => {
    const psg = new SN76489State();
    psg.applyTonePeriod(0, 100);
    expect(psg.applyTonePeriod(0, 100)).toEqual([]);
  });

  it('returns bytes again when period changes', () => {
    const psg = new SN76489State();
    psg.applyTonePeriod(0, 100);
    const bytes = psg.applyTonePeriod(0, 200);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('clamps period to 0-1023', () => {
    const psg = new SN76489State();
    psg.applyTonePeriod(0, -5);
    expect(psg.getCurrentPeriod(0)).toBe(0);

    const psg2 = new SN76489State();
    psg2.applyTonePeriod(0, 9999);
    expect(psg2.getCurrentPeriod(0)).toBe(1023);
  });

  it('returns empty for out-of-range channel', () => {
    const psg = new SN76489State();
    expect(psg.applyTonePeriod(3, 100)).toEqual([]);
    expect(psg.applyTonePeriod(-1, 100)).toEqual([]);
  });
});

describe('SN76489State — volume', () => {
  it('returns volume latch byte on first write', () => {
    const psg = new SN76489State();
    const bytes = psg.applyVolume(0, 5);
    expect(bytes).toEqual([volumeLatchByte(0, 5)]);
  });

  it('returns empty when attenuation unchanged', () => {
    const psg = new SN76489State();
    psg.applyVolume(1, 10);
    expect(psg.applyVolume(1, 10)).toEqual([]);
  });

  it('works for noise channel (index 3)', () => {
    const psg = new SN76489State();
    const bytes = psg.applyVolume(3, 15);
    expect(bytes).toEqual([0xFF]); // 11110000 | 15 = 0xFF
  });

  it('clamps attenuation to 0-15', () => {
    const psg = new SN76489State();
    psg.applyVolume(0, 20);
    expect(psg.getCurrentVolume(0)).toBe(15);

    const psg2 = new SN76489State();
    psg2.applyVolume(0, -1);
    expect(psg2.getCurrentVolume(0)).toBe(0);
  });
});

describe('SN76489State — noise control', () => {
  it('returns noise byte on first write', () => {
    const psg = new SN76489State();
    const bytes = psg.applyNoiseControl(true, 2);
    expect(bytes).toEqual([noiseControlByte(true, 2)]);
  });

  it('returns empty when noise control unchanged', () => {
    const psg = new SN76489State();
    psg.applyNoiseControl(false, 1);
    expect(psg.applyNoiseControl(false, 1)).toEqual([]);
  });

  it('periodic noise rate 1 encodes correctly', () => {
    const psg = new SN76489State();
    const bytes = psg.applyNoiseControl(false, 1);
    // 0xE0 | 0 (periodic) | 1 = 0xE1
    expect(bytes).toEqual([0xE1]);
  });

  it('white noise rate 2 encodes correctly', () => {
    const psg = new SN76489State();
    const bytes = psg.applyNoiseControl(true, 2);
    // 0xE0 | 0x04 (white) | 2 = 0xE6
    expect(bytes).toEqual([0xE6]);
  });
});

describe('SN76489State — GG stereo', () => {
  it('returns stereo byte on first write', () => {
    const psg = new SN76489State();
    const result = psg.applyGgStereo(0xAB);
    expect(result).toBe(0xAB);
  });

  it('returns -1 when stereo unchanged', () => {
    const psg = new SN76489State();
    psg.applyGgStereo(0xFF);
    expect(psg.applyGgStereo(0xFF)).toBe(-1);
  });
});

describe('SN76489State — flush', () => {
  it('returns initial defaults for all channels', () => {
    const psg = new SN76489State();
    const { psgBytes, ggStereo } = psg.flush();
    expect(ggStereo).toBe(GG_STEREO_DEFAULT);
    // psgBytes: 1 noise + 4 volumes + 3×2 periods = 1 + 4 + 6 = 11
     // psgBytes: 4 volumes + 3×2 periods = 4 + 6 = 10
     // (noise control is NOT written in flush to avoid pre-initializing with a wrong default;
     //  the first note-on will establish the correct noise control)
     expect(psgBytes.length).toBe(10);
  });

  it('all channels start muted (attenuation 15)', () => {
    const psg = new SN76489State();
    const { psgBytes } = psg.flush();
     // Volume bytes are at indices 0-3 in psgBytes (no noise control byte before them)
    // vol ch0 = 0x9F (90 | 0F), ch1 = 0xBF, ch2 = 0xDF, ch3 = 0xFF
     expect(psgBytes[0]).toBe(0x9F); // ch0 muted
     expect(psgBytes[1]).toBe(0xBF); // ch1 muted
     expect(psgBytes[2]).toBe(0xDF); // ch2 muted
     expect(psgBytes[3]).toBe(0xFF); // ch3 muted
  });

  it('subsequent applyVolume returns empty (state set by flush)', () => {
    const psg = new SN76489State();
    psg.flush();
    // After flush, volumes are ATTENUATION_MUTE = 15
    expect(psg.applyVolume(0, ATTENUATION_MUTE)).toEqual([]);
    expect(psg.applyVolume(1, ATTENUATION_MUTE)).toEqual([]);
    expect(psg.applyVolume(2, ATTENUATION_MUTE)).toEqual([]);
    expect(psg.applyVolume(3, ATTENUATION_MUTE)).toEqual([]);
  });
});
