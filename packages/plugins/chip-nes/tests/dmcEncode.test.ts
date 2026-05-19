import { describe, test, expect } from '@jest/globals';
import { decodeDMC } from '../src/dmc.js';
import { getNesClockRegion, setNesClockRegion } from '../src/periodTables.js';
import {
  encodeDMC,
  encodeDMCFromPCM,
  getMaxEncodedByteLength,
  getMaxSourceSampleCountForDmc,
  packBitsLSBFirst,
  trimDmcByteLength,
  formatDmcInstrumentLine,
} from '../src/dmcEncode.js';

describe('packBitsLSBFirst', () => {
  test('packs 8 bits LSB-first into one byte', () => {
    expect(packBitsLSBFirst([1, 0, 1, 0, 1, 0, 1, 0])).toEqual(new Uint8Array([0x55]));
  });

  test('all ones produces 0xFF', () => {
    expect(packBitsLSBFirst(new Array(8).fill(1))).toEqual(new Uint8Array([0xff]));
  });
});

describe('encodeDMC', () => {
  test('0xFF decodes as eight consecutive up steps per byte', () => {
    const encoded = encodeDMC(new Array(8).fill(127));
    expect(encoded[0]).toBe(0xff);
    const decoded = decodeDMC(encoded);
    expect(decoded.length).toBe(8);
    for (let i = 1; i < decoded.length; i++) {
      expect(decoded[i]).toBeGreaterThan(decoded[i - 1]);
    }
  });

  test('round-trip on short sine burst', () => {
    const len = 200;
    const targets: number[] = [];
    for (let i = 0; i < len; i++) {
      targets.push(Math.round(64 + 40 * Math.sin((i / len) * Math.PI * 4)));
    }
    const encoded = encodeDMC(targets);
    const decoded = decodeDMC(encoded);
    expect(decoded.length).toBe(len);
    let err = 0;
    for (let i = 0; i < len; i++) {
      const expected = (targets[i] - 64) / 64;
      err += Math.abs(decoded[i] - expected);
    }
    expect(err / len).toBeLessThan(0.15);
  });
});

describe('encodeDMCFromPCM', () => {
  test('does not change the global NES clock region', () => {
    const previousRegion = setNesClockRegion('ntsc');
    try {
      const sr = 44100;
      const samples = new Float32Array(sr / 100);
      samples.fill(0.25);

      encodeDMCFromPCM(samples, sr, { region: 'pal', rateIndex: 15, trim: false });

      expect(getNesClockRegion()).toBe('ntsc');
    } finally {
      setNesClockRegion(previousRegion);
    }
  });

  test('produces non-empty output for a short tone', () => {
    const sr = 44100;
    const samples = new Float32Array(sr / 100);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((i / samples.length) * Math.PI * 2) * 0.8;
    }
    const result = encodeDMCFromPCM(samples, sr, { rateIndex: 15, trim: false });
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.rateIndex).toBe(15);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  test('maxBytes caps output length', () => {
    const sr = 44100;
    const samples = new Float32Array(sr);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 0.01);
    const result = encodeDMCFromPCM(samples, sr, { rateIndex: 7, maxBytes: 64, trim: true });
    expect(result.byteLength).toBeLessThanOrEqual(64);
  });

  test('caps working source length before resampling', () => {
    expect(getMaxEncodedByteLength(64, false)).toBe(64);
    expect(getMaxEncodedByteLength(64, true)).toBe(49);
    expect(getMaxSourceSampleCountForDmc(3, 2, 4, false)).toBe(48);
    expect(getMaxSourceSampleCountForDmc(64, 8363.42, 44100, true)).toBe(2068);
  });

  test('silence trimming removes quiet tails by default', () => {
    const sr = 44100;
    const samples = new Float32Array(Math.floor(sr * 0.25));
    for (let i = 0; i < Math.floor(sr * 0.04); i++) {
      samples[i] = Math.sin(i * 0.1) * 0.8;
    }

    const trimmed = encodeDMCFromPCM(samples, sr, { rateIndex: 15 });
    const untrimmed = encodeDMCFromPCM(samples, sr, { rateIndex: 15, trimSilence: false });
    expect(trimmed.byteLength).toBeLessThan(untrimmed.byteLength);
  });

  test('maxDurationMs caps source length before encoding', () => {
    const sr = 44100;
    const samples = new Float32Array(Math.floor(sr * 0.3));
    samples.fill(0.5);

    const capped = encodeDMCFromPCM(samples, sr, { rateIndex: 15, trimSilence: false, maxDurationMs: 50 });
    const uncapped = encodeDMCFromPCM(samples, sr, { rateIndex: 15, trimSilence: false });
    expect(capped.byteLength).toBeLessThan(uncapped.byteLength);
  });
});

describe('trimDmcByteLength', () => {
  test('aligns to NES length register formula', () => {
    expect(trimDmcByteLength(100)).toBe(97);
    expect(trimDmcByteLength(1)).toBe(1);
    expect(trimDmcByteLength(4096, 4096)).toBeLessThanOrEqual(4096);
  });
});

describe('formatDmcInstrumentLine', () => {
  test('includes dmc_rate and dmc_loop', () => {
    const line = formatDmcInstrumentLine({
      instName: 'kick',
      sampleRef: 'local:kick.dmc',
      dmcRate: 7,
      dmcLoop: false,
    });
    expect(line).toContain('dmc_rate=7');
    expect(line).toContain('dmc_loop=false');
    expect(line).toContain('local:kick.dmc');
  });

  test('strips leading digits from instrument names', () => {
    const line = formatDmcInstrumentLine({
      instName: '909_kick',
      sampleRef: 'local:kick.dmc',
      dmcRate: 7,
      dmcLoop: false,
    });
    expect(line).toContain('inst _kick type=dmc');
  });

  test('encodes spaces in local sample refs', () => {
    const line = formatDmcInstrumentLine({
      instName: 'kick',
      sampleRef: 'local:samples/kick sample.dmc',
      dmcRate: 7,
      dmcLoop: false,
    });
    expect(line).toContain('dmc_sample="local:samples/kick%20sample.dmc"');
    expect(line).not.toContain('kick sample.dmc');
  });

  test('dmc_loop true', () => {
    const line = formatDmcInstrumentLine({
      instName: 'drone',
      sampleRef: 'local:drone.dmc',
      dmcRate: 15,
      dmcLoop: true,
    });
    expect(line).toContain('dmc_loop=true');
  });
});
