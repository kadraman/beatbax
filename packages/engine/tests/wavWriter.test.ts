import { writeWAV } from '../src/export/wavWriter';

describe('wavWriter', () => {
  test('writeWAV produces a buffer with correct RIFF header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const opts = {
      sampleRate: 44100,
      bitDepth: 16 as const,
      channels: 1 as const
    };
    
    const buffer = writeWAV(samples, opts);
    
    // Check RIFF header
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');
    
    // Check fmt chunk size
    expect(buffer.readUInt32LE(16)).toBe(16);
    // Check AudioFormat (1 = PCM)
    expect(buffer.readUInt16LE(20)).toBe(1);
    // Check channels
    expect(buffer.readUInt16LE(22)).toBe(1);
    // Check sample rate
    expect(buffer.readUInt32LE(24)).toBe(44100);
    // Check bit depth
    expect(buffer.readUInt16LE(34)).toBe(16);
    
    // Check data chunk
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
    // Check data size (5 samples * 2 bytes = 10)
    expect(buffer.readUInt32LE(40)).toBe(10);
    
    // Total size should be 44 (header) + 10 (data) = 54
    expect(buffer.length).toBe(54);
  });

  test('writeWAV handles 24-bit depth', () => {
    const samples = new Float32Array([0, 1]);
    const opts = {
      sampleRate: 48000,
      bitDepth: 24 as const,
      channels: 2 as const
    };
    
    const buffer = writeWAV(samples, opts);
    expect(buffer.readUInt16LE(34)).toBe(24);
    expect(buffer.readUInt16LE(22)).toBe(2);
    // 2 samples * 3 bytes/sample = 6 bytes
    expect(buffer.readUInt32LE(40)).toBe(6);
    expect(buffer.length).toBe(44 + 6);
  });
});
