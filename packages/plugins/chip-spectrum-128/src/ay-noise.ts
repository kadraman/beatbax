/**
 * AY-3-8912 noise generator helpers for PCM / Web Audio rendering.
 *
 * Matches the 17-bit Galois LFSR in ay-chip.ts (tap positions 0 and 3).
 */
import { getPlatformProfile } from './platform-profiles.js';

/** Advance the AY noise LFSR by one step. Returns the new LFSR state. */
export function stepAyNoiseLfsr(lfsr: number): number {
  const bit = (lfsr ^ (lfsr >> 3)) & 1;
  return ((lfsr >> 1) | (bit << 16)) >>> 0;
}

/** Noise output bit (0 or 1) from the current LFSR state. */
export function ayNoiseBit(lfsr: number): number {
  return lfsr & 1;
}

/** Noise frequency in Hz from a 5-bit R6 period value (0–31). */
export function noisePeriodToHz(period: number, ayClockHz?: number): number {
  const clock = ayClockHz ?? getPlatformProfile().ayClockHz;
  const n = Math.max(1, period & 0x1f);
  return clock / (16 * n);
}

/** Precompute one cycle of the AY noise LFSR at the given R6 period. */
export function buildAyNoiseCycle(period: number, ayClockHz?: number): {
  samples: Float32Array;
  lfsrHz: number;
} {
  const clock = ayClockHz ?? getPlatformProfile().ayClockHz;
  const n = Math.max(1, period & 0x1f);
  // One full LFSR period is 2^17-1 steps; use a practical buffer length.
  const cycleLen = 32767;
  const samples = new Float32Array(cycleLen);
  let lfsr = 1;
  for (let i = 0; i < cycleLen; i++) {
    samples[i] = ayNoiseBit(lfsr) ? 1 : -1;
    lfsr = stepAyNoiseLfsr(lfsr);
  }
  return { samples, lfsrHz: noisePeriodToHz(n, clock) };
}
