import { chipRegistry } from '@beatbax/engine/chips';

export function getMeterDisplayGain(chipName: string | undefined, channelId: number): number {
  if (!Number.isFinite(channelId) || channelId < 1) return 1;
  const resolvedChip = chipRegistry.resolve((chipName ?? 'gameboy').toLowerCase());
  const plugin = chipRegistry.get(resolvedChip);
  const gain = plugin?.getMeterDisplayGain?.(channelId - 1);
  if (typeof gain !== 'number' || !Number.isFinite(gain) || gain <= 0) return 1;
  return gain;
}

export function scaleRmsForMeter(rms: number, gain: number): number {
  const safeRms = Number.isFinite(rms) ? Math.max(0, rms) : 0;
  const safeGain = Number.isFinite(gain) ? Math.max(0, gain) : 1;
  return Math.min(1, safeRms * safeGain);
}

export function scaleSamplesForWaveform(samples: Float32Array, gain: number): Float32Array {
  const safeGain = Number.isFinite(gain) ? Math.max(0, gain) : 1;
  if (safeGain === 1) return samples;
  const scaled = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] * safeGain;
    scaled[i] = Math.max(-1, Math.min(1, v));
  }
  return scaled;
}
