import { describe, test, expect } from '@jest/globals';
import { readWAV } from '../src/export/wavReader';
import { writeWAV } from '../src/export/wavWriter';

describe('readWAV', () => {
  test('reads a normal PCM WAV buffer', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const wav = writeWAV(samples, { sampleRate: 44100, bitDepth: 16, channels: 1 });

    const result = readWAV(wav);

    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(1);
    expect(result.samples.length).toBe(samples.length);
    expect(result.samples[1]).toBeCloseTo(0.5, 4);
    expect(result.samples[2]).toBeCloseTo(-0.5, 4);
  });

  test('sizes output to the bytes actually present when data is truncated', () => {
    const samples = new Float32Array([0, 0.25, 0.5, 0.75]);
    const wav = writeWAV(samples, { sampleRate: 44100, bitDepth: 16, channels: 1 });
    const truncated = wav.subarray(0, wav.length - 2);

    const result = readWAV(truncated);

    expect(result.samples.length).toBe(samples.length - 1);
    expect(result.samples[0]).toBeCloseTo(0, 4);
    expect(result.samples[1]).toBeCloseTo(0.25, 4);
    expect(result.samples[2]).toBeCloseTo(0.5, 4);
  });
});
