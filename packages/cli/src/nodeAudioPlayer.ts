/**
 * Node.js audio playback - hybrid approach using WAV + system player.
 * Works on Windows/Mac/Linux without requiring native compilation.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

// Type declarations for optional dependencies
// @ts-ignore - audio-play is an optional dependency without types
declare module 'audio-play';
// @ts-ignore - play-sound is an optional dependency without types
declare module 'play-sound';

function floatTo16BitPCM(float32Arr: Float32Array): Buffer {
  const buf = Buffer.alloc(float32Arr.length * 2);
  for (let i = 0; i < float32Arr.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Arr[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buf.writeInt16LE(Math.floor(s), i * 2);
  }
  return buf;
}

function createWAVBuffer(samples: Float32Array, sampleRate: number, channels: number): Buffer {
  const pcmData = floatTo16BitPCM(samples);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;
  const byteRate = sampleRate * channels * 2; // 16-bit = 2 bytes
  const blockAlign = channels * 2;

  const header = Buffer.alloc(headerSize);
  let offset = 0;

  // RIFF chunk descriptor
  header.write('RIFF', offset); offset += 4;
  header.writeUInt32LE(fileSize, offset); offset += 4;
  header.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  header.write('fmt ', offset); offset += 4;
  header.writeUInt32LE(16, offset); offset += 4;
  header.writeUInt16LE(1, offset); offset += 2;
  header.writeUInt16LE(channels, offset); offset += 2;
  header.writeUInt32LE(sampleRate, offset); offset += 4;
  header.writeUInt32LE(byteRate, offset); offset += 4;
  header.writeUInt16LE(blockAlign, offset); offset += 2;
  header.writeUInt16LE(16, offset); offset += 2;

  // data sub-chunk
  header.write('data', offset); offset += 4;
  header.writeUInt32LE(dataSize, offset);

  return Buffer.concat([header, pcmData]);
}

/**
 * Play audio with cascading fallback approach.
 * Tries methods in order: speaker → play-sound → system commands
 * (audio-play skipped on Windows as it doesn't output audio reliably)
 * @param samples Interleaved Float32 samples [-1..1]
 * @param options Audio configuration
 */
export async function playAudioBuffer(
  samples: Float32Array,
  options: { channels: number; sampleRate: number } = { channels: 1, sampleRate: 44100 }
): Promise<void> {
  const platform = process.platform;

  // Try speaker first (best performance when available)
  try {
    // @ts-ignore - speaker is an optional dependency
    const speakerModule = await import('speaker');
    const Speaker = speakerModule.default;
    console.log('Using speaker module for audio playback...');
    
    return new Promise((resolve, reject) => {
      const speaker = new Speaker({
        channels: options.channels,
        sampleRate: options.sampleRate,
        bitDepth: 16,
        signed: true,
      });

      speaker.on('error', reject);
      speaker.on('close', resolve);

      const blockSize = 4096;
      let offset = 0;

      const writeNext = () => {
        while (offset < samples.length) {
          const count = Math.min(blockSize, samples.length - offset);
          const chunk = samples.subarray(offset, offset + count);
          const pcm = floatTo16BitPCM(chunk);
          
          if (!speaker.write(pcm)) {
            offset += count;
            speaker.once('drain', writeNext);
            return;
          }
          offset += count;
        }
        speaker.end();
      };

      writeNext();
    });
  } catch (speakerErr) {
    // Continue to next fallback
  }

  // Try play-sound (wrapper around system players, works cross-platform)
  try {
    console.log('Using play-sound for audio playback...');
    // @ts-ignore - play-sound is an optional dependency without types
    const playSound = (await import('play-sound')).default;
    const player = playSound({});
    const tempFile = join(tmpdir(), `beatbax-${Date.now()}.wav`);
    const wavBuffer = createWAVBuffer(samples, options.sampleRate, options.channels);
    writeFileSync(tempFile, wavBuffer);

    return new Promise((resolve, reject) => {
      player.play(tempFile, (err: Error | null) => {
        try { unlinkSync(tempFile); } catch (e) {}
        if (err) {
          console.log('play-sound failed, trying system commands...');
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (playSoundErr) {
    // Continue to final fallback
  }

  // Final fallback: direct system commands (most reliable on Windows)
  console.log('Using system audio player...');
  const tempFile = join(tmpdir(), `beatbax-${Date.now()}.wav`);
  const wavBuffer = createWAVBuffer(samples, options.sampleRate, options.channels);
  writeFileSync(tempFile, wavBuffer);

  return new Promise((resolve, reject) => {
    let cmd: string, args: string[];

    if (platform === 'win32') {
      // Windows: Use PowerShell with Media.SoundPlayer for synchronous playback
      cmd = 'powershell';
      args = [
        '-Command',
        '& { param([string]$p) (New-Object Media.SoundPlayer $p).PlaySync() }',
        tempFile,
      ];
    } else if (platform === 'darwin') {
      cmd = 'afplay';
      args = [tempFile];
    } else {
      cmd = 'aplay';
      args = [tempFile];
    }

    const proc = spawn(cmd, args, { stdio: 'pipe' });
    
    proc.on('error', (err: Error) => {
      try { unlinkSync(tempFile); } catch (e) {}
      reject(new Error(`Failed to play audio: ${err.message}. Try installing ffplay or use --render-to <file.wav> instead.`));
    });

    proc.on('close', (code: number) => {
      try { unlinkSync(tempFile); } catch (e) {}
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Audio player exited with code ${code}`));
      }
    });
  });
}
