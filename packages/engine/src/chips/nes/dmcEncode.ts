/**
 * NES DMC (delta modulation) sample encoder.
 * Inverse of decodeDMC in dmc.ts — produces raw .dmc byte streams.
 */
import {
  DMC_RATE_TABLE_NTSC,
  DMC_RATE_TABLE_PAL,
  type NesClockRegion,
} from './periodTables.js';

export interface EncodeDMCOptions {
  /** Maps 1:1 to instrument dmc_rate= (0 = slowest, 15 = fastest). */
  rateIndex?: number;
  region?: NesClockRegion;
  maxBytes?: number;
  /** Trim to NES $4013 length-register alignment (default true). */
  trim?: boolean;
  normalize?: boolean;
  gain?: number;
  lowPass?: boolean;
  keepDirection?: boolean;
  /** Enable source-audio silence trimming before resampling (default true). */
  trimSilence?: boolean;
  /** Silence threshold in dBFS for trimming (default -45). */
  trimSilenceDb?: number;
  /** Keep this much audio after the last above-threshold sample (default 8ms). */
  tailMs?: number;
  /** Apply a fade-out before encoding (default 4ms). */
  fadeOutMs?: number;
  /** Hard cap source audio length before encoding. */
  maxDurationMs?: number;
}

export interface EncodeDMCResult {
  bytes: Uint8Array;
  rateIndex: number;
  rateHz: number;
  durationSec: number;
  byteLength: number;
}

/** Pack bits LSB-first (8 bits per byte), matching decodeDMC. */
export function packBitsLSBFirst(bits: number[]): Uint8Array {
  const byteCount = Math.ceil(bits.length / 8);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      out[i >> 3] |= 1 << (i & 7);
    }
  }
  return out;
}

/** Greedy hardware-accurate DMC encoder from 7-bit DAC target levels (0–127). */
export function encodeDMC(targetLevels: number[], keepDirection = false): Uint8Array {
  const bits: number[] = [];
  let level = 64;
  let lastDir = 1;

  for (const target of targetLevels) {
    const t = Math.max(0, Math.min(127, Math.round(target)));
    const upLevel = level <= 125 ? level + 2 : level;
    const downLevel = level >= 2 ? level - 2 : level;
    const errUp = Math.abs(upLevel - t);
    const errDown = Math.abs(downLevel - t);

    let bit: number;
    if (errUp < errDown) {
      bit = 1;
    } else if (errDown < errUp) {
      bit = 0;
    } else if (t > level) {
      bit = 1;
    } else if (t < level) {
      bit = 0;
    } else if (keepDirection) {
      bit = lastDir;
    } else {
      bit = lastDir === 1 ? 0 : 1;
    }

    if (bit) {
      if (level <= 125) level += 2;
    } else {
      if (level >= 2) level -= 2;
    }
    lastDir = bit;
    bits.push(bit);
  }

  return packBitsLSBFirst(bits);
}

function applyLowPass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  if (cutoffHz <= 0 || sampleRate <= 0) return samples;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const out = new Float32Array(samples.length);
  let y = samples[0] ?? 0;
  for (let i = 0; i < samples.length; i++) {
    y = y + alpha * ((samples[i] ?? 0) - y);
    out[i] = y;
  }
  return out;
}

function resampleLinear(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate <= 0 || targetRate <= 0 || samples.length === 0) {
    return new Float32Array(0);
  }
  if (Math.abs(sourceRate - targetRate) < 1e-6) {
    return samples.slice();
  }
  const outLen = Math.max(1, Math.round(samples.length * (targetRate / sourceRate)));
  const out = new Float32Array(outLen);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = samples[Math.min(idx, samples.length - 1)] ?? 0;
    const b = samples[Math.min(idx + 1, samples.length - 1)] ?? 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function pcmToDacTargets(samples: Float32Array): number[] {
  const targets = new Array<number>(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    targets[i] = Math.round(clamped * 63 + 64);
  }
  return targets;
}

function copyFloat32(samples: Float32Array): Float32Array {
  const out = new Float32Array(samples.length);
  out.set(samples);
  return out;
}

function trimSilence(samples: Float32Array, sampleRate: number, thresholdDb: number, tailMs: number): Float32Array {
  if (samples.length === 0 || sampleRate <= 0) return samples;
  const threshold = Math.pow(10, thresholdDb / 20);
  let first = -1;
  let last = -1;

  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) {
      if (first < 0) first = i;
      last = i;
    }
  }

  if (first < 0 || last < 0) {
    return new Float32Array(0);
  }

  const tailSamples = Math.max(0, Math.round((tailMs / 1000) * sampleRate));
  const end = Math.min(samples.length, last + tailSamples + 1);
  const out = new Float32Array(end - first);
  out.set(samples.subarray(first, end));
  return out;
}

function capDuration(samples: Float32Array, sampleRate: number, maxDurationMs?: number): Float32Array {
  if (!maxDurationMs || maxDurationMs <= 0 || sampleRate <= 0) return samples;
  const maxSamples = Math.max(1, Math.round((maxDurationMs / 1000) * sampleRate));
  if (samples.length <= maxSamples) return samples;
  const out = new Float32Array(maxSamples);
  out.set(samples.subarray(0, maxSamples));
  return out;
}

function applyFadeOut(samples: Float32Array, sampleRate: number, fadeOutMs: number): Float32Array {
  if (samples.length === 0 || fadeOutMs <= 0 || sampleRate <= 0) return samples;
  const fadeSamples = Math.min(samples.length, Math.round((fadeOutMs / 1000) * sampleRate));
  if (fadeSamples <= 1) return samples;

  const out = copyFloat32(samples);
  const start = out.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    const gain = 1 - i / (fadeSamples - 1);
    out[start + i] *= gain;
  }
  return out;
}

/** Trim byte count to NES hardware length register alignment: n = floor((bytes-1)/16)*16+1 */
export function trimDmcByteLength(byteLength: number, maxBytes = 4096): number {
  if (byteLength <= 0) return 1;
  const capped = Math.min(byteLength, maxBytes);
  const cutlen = Math.floor((capped - 1) / 16);
  return cutlen * 16 + 1;
}

function trimBitsToBytes(bits: number[], maxBytes: number, trim: boolean): Uint8Array {
  let packed = packBitsLSBFirst(bits);
  if (!trim) {
    if (packed.length > maxBytes) {
      packed = packed.slice(0, maxBytes);
    }
    return packed;
  }
  const targetBytes = trimDmcByteLength(packed.length, maxBytes);
  const targetBits = targetBytes * 8;
  if (bits.length > targetBits) {
    return packBitsLSBFirst(bits.slice(0, targetBits));
  }
  return packed.length > targetBytes ? packed.slice(0, targetBytes) : packed;
}

export function getMaxEncodedByteLength(maxBytes: number, trim: boolean): number {
  return trim ? trimDmcByteLength(maxBytes, maxBytes) : maxBytes;
}

export function getMaxSourceSampleCountForDmc(
  maxBytes: number,
  rateHz: number,
  sourceSampleRate: number,
  trim: boolean
): number {
  if (maxBytes <= 0 || rateHz <= 0 || sourceSampleRate <= 0) return 0;
  const maxEncodedBytes = getMaxEncodedByteLength(maxBytes, trim);
  const maxEncodedSamples = maxEncodedBytes * 8;
  return Math.max(1, Math.ceil((maxEncodedSamples * sourceSampleRate) / rateHz));
}

function capFloat32Length(samples: Float32Array, maxLength: number): Float32Array {
  if (maxLength <= 0 || samples.length <= maxLength) return samples;
  return samples.slice(0, maxLength);
}

export function encodeDMCFromPCM(
  samples: Float32Array,
  sourceSampleRate: number,
  options: EncodeDMCOptions = {}
): EncodeDMCResult {
  const rateIndex = Math.max(0, Math.min(15, options.rateIndex ?? 15));
  const region = options.region ?? 'ntsc';
  const maxBytes = options.maxBytes ?? 4096;
  const trim = options.trim !== false;
  const lowPass = options.lowPass !== false;
  const gain = options.gain ?? 1;
  const keepDirection = options.keepDirection === true;
  const trimSilenceEnabled = options.trimSilence !== false;
  const trimSilenceDb = options.trimSilenceDb ?? -45;
  const tailMs = options.tailMs ?? 8;
  const fadeOutMs = options.fadeOutMs ?? 4;

  const rateTable = region === 'pal' ? DMC_RATE_TABLE_PAL : DMC_RATE_TABLE_NTSC;
  const rateHz = rateTable[rateIndex];

  let pcm = copyFloat32(samples);
  if (options.normalize && pcm.length > 0) {
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) {
      peak = Math.max(peak, Math.abs(pcm[i]));
    }
    if (peak > 1e-9) {
      const scale = 1 / peak;
      for (let i = 0; i < pcm.length; i++) pcm[i] *= scale;
    }
  }
  if (gain !== 1) {
    for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  }
  if (trimSilenceEnabled) {
    pcm = trimSilence(pcm, sourceSampleRate, trimSilenceDb, tailMs);
  }
  pcm = capDuration(pcm, sourceSampleRate, options.maxDurationMs);
  pcm = applyFadeOut(pcm, sourceSampleRate, fadeOutMs);

  const maxSourceSampleCount = getMaxSourceSampleCountForDmc(maxBytes, rateHz, sourceSampleRate, trim);
  pcm = capFloat32Length(pcm, maxSourceSampleCount);

  const pcmForResample = lowPass
    ? applyLowPass(pcm, rateHz * 0.45, sourceSampleRate)
    : pcm;

  const resampled = capFloat32Length(
    resampleLinear(pcmForResample, sourceSampleRate, rateHz),
    getMaxEncodedByteLength(maxBytes, trim) * 8
  );
  const bytes = encodeDMC(pcmToDacTargets(resampled), keepDirection);
  const durationSec = (bytes.length * 8) / rateHz;

  return {
    bytes,
    rateIndex,
    rateHz,
    durationSec,
    byteLength: bytes.length,
  };
}

/** Format a BeatBax DMC instrument declaration line. */
export function formatDmcInstrumentLine(opts: {
  instName: string;
  sampleRef: string;
  dmcRate: number;
  dmcLoop: boolean;
}): string {
  const name = opts.instName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]+/, '') || 'sample';
  const loop = opts.dmcLoop ? 'true' : 'false';
  const rate = Math.max(0, Math.min(15, opts.dmcRate));
  const sampleRef = opts.sampleRef.startsWith('local:') && /\s/.test(opts.sampleRef)
    ? `local:${encodeURI(opts.sampleRef.slice('local:'.length))}`
    : opts.sampleRef;
  return `inst ${name} type=dmc dmc_rate=${rate} dmc_loop=${loop} dmc_sample="${sampleRef}"`;
}

/** Resolve DMC rate Hz for a region without mutating global clock state. */
export function getDmcRateHz(rateIndex: number, region: NesClockRegion = 'ntsc'): number {
  const table = region === 'pal' ? DMC_RATE_TABLE_PAL : DMC_RATE_TABLE_NTSC;
  return table[Math.max(0, Math.min(15, rateIndex))];
}
