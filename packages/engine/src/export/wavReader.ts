/**
 * Pure Node.js WAV file reader (PCM only, no WebAudio dependency).
 * Supports 16-bit LE PCM, mono or stereo (stereo is downmixed to mono).
 */

export interface ReadWAVResult {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

function readAscii(buf: Buffer, offset: number, len: number): string {
  return buf.toString('ascii', offset, offset + len);
}

/**
 * Read a PCM WAV file into normalized mono Float32 samples in [-1, 1].
 */
export function readWAV(buffer: Buffer | Uint8Array): ReadWAVResult {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 44) {
    throw new Error('WAV file too small to be valid');
  }
  if (readAscii(buf, 0, 4) !== 'RIFF' || readAscii(buf, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF WAVE file');
  }

  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = readAscii(buf, offset, 4);
    const size = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (id === 'fmt ') fmtOffset = chunkStart;
    else if (id === 'data') {
      dataOffset = chunkStart;
      dataSize = size;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error('WAV missing fmt or data chunk');
  }

  const audioFormat = buf.readUInt16LE(fmtOffset);
  const channels = buf.readUInt16LE(fmtOffset + 2);
  const sampleRate = buf.readUInt32LE(fmtOffset + 4);
  const bitsPerSample = buf.readUInt16LE(fmtOffset + 14);

  if (audioFormat !== 1) {
    throw new Error(`Unsupported WAV format: audio format ${audioFormat} (only PCM format 1 is supported)`);
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV bit depth: ${bitsPerSample} (only 16-bit PCM is supported)`);
  }
  if (channels < 1 || channels > 2) {
    throw new Error(`Unsupported channel count: ${channels} (only mono or stereo)`);
  }

  const end = Math.min(dataOffset + dataSize, buf.length);
  const bytesPerFrame = (bitsPerSample / 8) * channels;
  const availableBytes = Math.max(0, end - dataOffset);
  const frameCount = Math.floor(Math.min(dataSize, availableBytes) / bytesPerFrame);
  const samples = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const base = dataOffset + i * bytesPerFrame;
    if (base + bytesPerFrame > end) break;
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const s = buf.readInt16LE(base + ch * 2);
      sum += s / 32768;
    }
    samples[i] = sum / channels;
  }

  return { samples, sampleRate, channels };
}
