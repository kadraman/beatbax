/**
 * PCM audio preview rendered from the AY register log.
 *
 * This module synthesises audio samples from a deterministic register log
 * (produced by RegisterArbitrator + AyChipSimulator), which ensures that
 * PCM preview and future VGM/PT3 export both consume the same data source.
 *
 * The AY-3-8912 generates square waves for each tone channel. Amplitude is
 * derived from R8–R10 (fixed attenuation or hardware envelope routing).
 */
import { AyChipSimulator } from './ay-chip.js';
import { AY_BUZZ_BASS_LOUDNESS_COMPENSATION } from './periodTables.js';
import type { RegisterLogEntry } from './register-log.js';

/** Mix gain for a single AY channel (3 channels summed). */
const CHANNEL_GAIN = 0.28;

/**
 * Render PCM audio from a register log entry sequence.
 *
 * @param entries    - Ordered register log entries (one per 50 Hz tick).
 * @param sampleRate - Output sample rate in Hz.
 * @param ayClockHz  - AY chip clock (1,773,400 for Spectrum; 1,000,000 for CPC).
 * @returns           A mono Float32Array of interleaved samples.
 */
export function renderFromRegisterLog(
  entries: readonly RegisterLogEntry[],
  sampleRate: number,
  ayClockHz: number
): Float32Array {
  if (entries.length === 0) return new Float32Array(0);

  // Samples per 50 Hz tick
  const samplesPerTick = Math.round(sampleRate / 50);
  const totalSamples = entries.length * samplesPerTick;
  const output = new Float32Array(totalSamples);

  const chip = new AyChipSimulator();
  chip.reset();

  // Phase accumulators for the three tone channels (A/B/C)
  const phase: [number, number, number] = [0, 0, 0];

  // AY tone period → audio frequency: f = ayClockHz / (16 × period)
  function periodToFreq(period: number): number {
    if (period <= 0) return 0;
    return ayClockHz / (16 * period);
  }

  let outOffset = 0;

  for (const entry of entries) {
    // Write registers into chip
    for (let r = 0; r < 16; r++) {
      chip.writeRegister(r, entry.regs[r]);
    }

    const regs = entry.regs;
    const mixer = regs[7] & 0x3f;

    const chipClocksPerSample = Math.max(1, Math.round(ayClockHz / sampleRate));

    // Render samplesPerTick samples for this tick
    for (let s = 0; s < samplesPerTick && outOffset < totalSamples; s++, outOffset++) {
      chip.step(chipClocksPerSample);
      const levels = chip.getOutputLevels();
      let sample = 0;

      for (let ch = 0; ch < 3; ch++) {
        const ampReg = regs[8 + ch] & 0x1f;
        const envMode = (ampReg & 0x10) !== 0;
        const fixedAmp = ampReg & 0x0f;
        const envLevel = ch === 0 ? levels.levelA : ch === 1 ? levels.levelB : levels.levelC;
        const amp = envMode
          ? Math.min(15, Math.round(envLevel * AY_BUZZ_BASS_LOUDNESS_COMPENSATION))
          : fixedAmp;
        if (amp === 0) continue;

        const toneOff  = (mixer >> ch) & 1;
        const noiseOff = (mixer >> (ch + 3)) & 1;

        const regBase = ch * 2;
        const period  = (regs[regBase] | ((regs[regBase + 1] & 0x0f) << 8)) || 1;
        const freq    = periodToFreq(period);

        if (freq > 0 && !toneOff) {
          const phaseInc = (freq * 2) / sampleRate;
          phase[ch] += phaseInc;
          if (phase[ch] >= 2) phase[ch] -= 2;
          const squareOut = phase[ch] < 1 ? 1.0 : -1.0;
          sample += squareOut * (amp / 15) * CHANNEL_GAIN;
        } else if (!noiseOff) {
          sample += (Math.random() * 2 - 1) * (amp / 15) * CHANNEL_GAIN;
        }
      }

      output[outOffset] = Math.max(-1, Math.min(1, sample));
    }
  }

  return output;
}
