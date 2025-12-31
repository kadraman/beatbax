/**
 * Pure Node.js WAV file writer (no WebAudio dependency)
 * Supports PCM16, PCM24, PCM32 bit depths
 */
import { SongModel } from '../song/songModel.js';
import { renderSongToPCM, RenderOptions } from '../audio/pcmRenderer.js';

export interface WavOptions {
  sampleRate: number;
  bitDepth: 16 | 24 | 32;
  channels: 1 | 2;
}

function floatTo16BitPCM(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buf.writeInt16LE(Math.floor(s), i * 2);
  }
  return buf;
}

function floatTo24BitPCM(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(samples.length * 3);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x800000 : s * 0x7FFFFF;
    const val = Math.floor(s);
    buf.writeIntLE(val, i * 3, 3);
  }
  return buf;
}

function floatTo32BitPCM(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(samples.length * 4);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x80000000 : s * 0x7FFFFFFF;
    buf.writeInt32LE(Math.floor(s), i * 4);
  }
  return buf;
}

export function writeWAV(samples: Float32Array, opts: WavOptions): Buffer {
  const { sampleRate, bitDepth, channels } = opts;
  
  let pcmData: Buffer;
  if (bitDepth === 16) pcmData = floatTo16BitPCM(samples);
  else if (bitDepth === 24) pcmData = floatTo24BitPCM(samples);
  else pcmData = floatTo32BitPCM(samples);

  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);

  const header = Buffer.alloc(headerSize);
  let offset = 0;

  // RIFF chunk descriptor
  header.write('RIFF', offset); offset += 4;
  header.writeUInt32LE(fileSize, offset); offset += 4;
  header.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  header.write('fmt ', offset); offset += 4;
  header.writeUInt32LE(16, offset); offset += 4; // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, offset); offset += 2;  // AudioFormat (1 = PCM)
  header.writeUInt16LE(channels, offset); offset += 2;
  header.writeUInt32LE(sampleRate, offset); offset += 4;
  header.writeUInt32LE(byteRate, offset); offset += 4;
  header.writeUInt16LE(blockAlign, offset); offset += 2;
  header.writeUInt16LE(bitDepth, offset); offset += 2;

  // data sub-chunk
  header.write('data', offset); offset += 4;
  header.writeUInt32LE(dataSize, offset);

  return Buffer.concat([header, pcmData]);
}

export async function exportWAV(samples: Float32Array, outputPath: string, opts: WavOptions, metaOpts?: { debug?: boolean }): Promise<void> {
  const { writeFileSync } = await import('fs');
  const wavBuffer = writeWAV(samples, opts);
  if (metaOpts?.debug) {
    console.log(`[DEBUG] WAV: ${opts.sampleRate}Hz, ${opts.bitDepth}-bit, ${opts.channels}ch`);
  }
  writeFileSync(outputPath, wavBuffer);
}

/**
 * Render a song model to PCM and export as a WAV file.
 */
export async function exportWAVFromSong(song: SongModel, outputPath: string, options: RenderOptions & Partial<WavOptions> = {}, metaOpts?: { debug?: boolean }) {
  const sampleRate = options.sampleRate || 44100;
  const samples = renderSongToPCM(song, {
    ...options,
    sampleRate,
    channels: 2 // Always stereo for now to match browser
  });

  if (metaOpts && metaOpts.debug) {
    // Compute simple left/right energy for first 10000 frames to sanity-check panning
    const frames = Math.min(10000, Math.floor(samples.length / 2));
    let left = 0, right = 0;
    for (let i = 0; i < frames; i++) {
      left += Math.abs(samples[i * 2 + 0]);
      right += Math.abs(samples[i * 2 + 1]);
    }
    console.log(`[DEBUG] WAV pre-write: frames=${frames} leftSum=${left.toFixed(6)} rightSum=${right.toFixed(6)}`);
    if (Math.abs(left - right) < 1e-9) {
      console.warn('[WARN] left and right channel energy appear identical — check panning/resolution');
    }
  }
  
  await exportWAV(samples, outputPath, {
    sampleRate,
    bitDepth: options.bitDepth || 16,
    channels: 2
  }, metaOpts);
}
