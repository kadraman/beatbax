/**
 * Lag-aware correlation / RMS helpers for WebAudio vs PCM parity (spec 112).
 */

export interface ParityStats {
  correlation: number;
  bestLagSamples: number;
  bestCorrelation: number;
  /** Mean of best-lag correlations over fixed windows (phase-drift tolerant). */
  windowedCorrelation: number;
  peakA: number;
  peakB: number;
  rmsA: number;
  rmsB: number;
  lengthA: number;
  lengthB: number;
}

/** Interleaved stereo → mono average. */
export function stereoToMono(interleaved: Float32Array): Float32Array {
  const n = Math.floor(interleaved.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.5 * (interleaved[i * 2] + interleaved[i * 2 + 1]);
  }
  return out;
}

export function peakAbs(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

/** One-pole low-pass (spec 112 optional preprocess for PeriodicWave vs square). */
export function mildLowPass(samples: Float32Array, alpha = 0.2): Float32Array {
  const out = new Float32Array(samples.length);
  let y = 0;
  for (let i = 0; i < samples.length; i++) {
    y += alpha * (samples[i] - y);
    out[i] = y;
  }
  return out;
}

/** Remove DC mean. */
export function dcBlock(samples: Float32Array): Float32Array {
  if (samples.length === 0) return samples;
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i];
  mean /= samples.length;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - mean;
  return out;
}

export function normalizedCorrelation(
  a: Float32Array,
  b: Float32Array,
  offA = 0,
  offB = 0,
): number {
  const n = Math.min(a.length - offA, b.length - offB);
  if (n <= 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[offA + i];
    mb += b[offB + i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[offA + i] - ma;
    const db = b[offB + i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  const den = Math.sqrt(saa * sbb);
  return den > 0 ? sab / den : 0;
}

/**
 * Search lag in ±maxLagSamples (step samples) for best correlation of A vs B.
 * Positive lag means A starts later than B (skip samples from A).
 */
export function bestLagCorrelation(
  a: Float32Array,
  b: Float32Array,
  maxLagSamples: number,
  step = 1,
): { lag: number; correlation: number } {
  let best = -2;
  let bestLag = 0;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag += step) {
    const c = lag >= 0
      ? normalizedCorrelation(a, b, lag, 0)
      : normalizedCorrelation(a, b, 0, -lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return { lag: bestLag, correlation: best };
}

export interface CompareOptions {
  /** Max lag to search (±), default ~50 ms at 44100. */
  maxLagMs?: number;
  sampleRate?: number;
  /**
   * Channel layout of both buffers. `2` downmixes interleaved stereo to mono.
   * Omitted or `1` leaves samples as-is (do not infer stereo from even length).
   */
  channels?: 1 | 2;
  /** Apply DC-block + mild low-pass before compare. */
  preprocess?: boolean;
  lagStep?: number;
  /**
   * Window length for windowedCorrelation (seconds).
   * Default 0.1s (~1 tick at 150 bpm) so pitch-dependent PeriodicWave phase
   * does not destroy the score across multi-pitch phrases.
   */
  windowSec?: number;
}

/**
 * Mean best-lag correlation over successive windows. Tolerates residual phase
 * drift that destroys whole-buffer correlation while pitch/timing still match.
 */
export function windowedBestCorrelation(
  a: Float32Array,
  b: Float32Array,
  sampleRate: number,
  windowSec = 1,
  maxLagMs = 50,
  step = 1,
): number {
  const win = Math.max(1, Math.floor(windowSec * sampleRate));
  const maxLag = Math.round((maxLagMs / 1000) * sampleRate);
  const n = Math.min(a.length, b.length);
  let sum = 0;
  let count = 0;
  for (let start = 0; start + win <= n; start += win) {
    const aw = a.subarray(start, start + win);
    const bw = b.subarray(start, start + win);
    const ra = rms(aw);
    const rb = rms(bw);
    // Skip near-silent windows (rests). Require both sides active so
    // rest/note boundary windows do not dominate.
    if (ra < 0.01 || rb < 0.01) continue;
    const { correlation } = bestLagCorrelation(aw, bw, maxLag, step);
    sum += correlation;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/** Compare two interleaved stereo buffers (or mono). */
export function compareParity(
  aInterleaved: Float32Array,
  bInterleaved: Float32Array,
  opts: CompareOptions = {},
): ParityStats {
  const sampleRate = opts.sampleRate ?? 44100;
  const maxLagMs = opts.maxLagMs ?? 50;
  const maxLag = Math.round((maxLagMs / 1000) * sampleRate);
  const step = opts.lagStep ?? Math.max(1, Math.floor(sampleRate / 1000)); // ~1 ms

  const toMono = (x: Float32Array) =>
    (opts.channels === 2 ? stereoToMono(x) : x);
  let a = toMono(aInterleaved);
  let b = toMono(bInterleaved);
  if (opts.preprocess !== false) {
    a = mildLowPass(dcBlock(a));
    b = mildLowPass(dcBlock(b));
  }

  const raw = normalizedCorrelation(a, b);
  const { lag, correlation } = bestLagCorrelation(a, b, maxLag, step);
  const windowed = windowedBestCorrelation(
    a, b, sampleRate, opts.windowSec ?? 0.1, maxLagMs, step,
  );
  return {
    correlation: raw,
    bestLagSamples: lag,
    bestCorrelation: correlation,
    windowedCorrelation: windowed,
    peakA: peakAbs(a),
    peakB: peakAbs(b),
    rmsA: rms(a),
    rmsB: rms(b),
    lengthA: a.length,
    lengthB: b.length,
  };
}
