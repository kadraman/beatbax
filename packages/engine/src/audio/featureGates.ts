/**
 * SC-001 feature gates (spec 112). Compares two mono renders by note level,
 * pitch track, envelope, band energy, and mix RMS.
 *
 * Oscillator phase is not a gate. Whole-buffer correlation is not a gate.
 */

export const SC001 = {
  noteLevelDb: 0.5,
  plainPitchCents: 3,
  modulatedPitchCents: 10,
  pitchLagMs: 5,
  envelopeDb: 1,
  envelopeFrameMs: 5,
  envelopeTailMs: 25,
  bandDb: 1,
  /** Bands quieter than this far below the loudest band are not compared. */
  bandFloorDb: 40,
  mixRmsDb: 0.3,
} as const;

const BAND_EDGES = [20, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000];

export interface NoteWindow {
  /** Human-readable, included in failure lines. */
  label: string;
  startSec: number;
  endSec: number;
  /** vib / arp / port: pitch may move, with a wider cent allowance. */
  modulated: boolean;
  /** Noise has no pitch track. */
  pitched: boolean;
}

export interface GateReport {
  pass: boolean;
  failures: string[];
  mixRmsDb: number | null;
}

function db(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-12));
}

function rms(a: Float32Array, s: number, e: number): number {
  s = Math.max(0, s);
  e = Math.min(a.length, e);
  if (e <= s) return 0;
  let x = 0;
  for (let i = s; i < e; i++) x += a[i] * a[i];
  return Math.sqrt(x / (e - s));
}

function normalizedAutocorr(a: Float32Array, s: number, n: number, lag: number): number {
  const left = Math.floor(lag);
  const frac = lag - left;
  const last = n - left - 1;
  if (last < 16) return -1;
  let c = 0;
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < last; i++) {
    const x = a[s + i];
    const y = a[s + i + left] * (1 - frac) + a[s + i + left + 1] * frac;
    c += x * y;
    ea += x * x;
    eb += y * y;
  }
  return c / Math.sqrt(ea * eb + 1e-30);
}

function f0At(a: Float32Array, s: number, e: number, sampleRate: number): number {
  const n = e - s;
  if (n < 64) return Number.NaN;
  if (rms(a, s, e) < 0.002) return Number.NaN;
  const lagMin = Math.max(2, Math.floor(sampleRate / 2200));
  const lagMax = Math.min(Math.floor(sampleRate / 70), Math.floor(n * 0.5));
  if (lagMax <= lagMin + 2) return Number.NaN;
  const cmnd = new Float64Array(lagMax + 1);
  let running = 0;
  for (let tau = 1; tau <= lagMax; tau++) {
    let sum = 0;
    const last = s + n - tau;
    for (let i = s; i < last; i++) {
      const diff = a[i] - a[i + tau];
      sum += diff * diff;
    }
    running += sum;
    cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
  }
  let tau = -1;
  for (let i = lagMin; i <= lagMax; i++) {
    if (cmnd[i] < 0.15) {
      tau = i;
      while (tau + 1 <= lagMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
  }
  if (tau < 0 || cmnd[tau] > 0.2) return Number.NaN;
  let bestLag = tau;
  let best = -2;
  for (let lag = tau - 1.2; lag <= tau + 1.2; lag += 0.02) {
    if (lag < lagMin) continue;
    const c = normalizedAutocorr(a, s, n, lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return sampleRate / bestLag;
}

function envelopeLevel(a: Float32Array, s: number, e: number, sampleRate: number): number {
  const release = Math.exp(-1 / (0.004 * sampleRate));
  let env = 0;
  const pre = Math.max(0, s - Math.round(0.004 * sampleRate));
  for (let i = pre; i < s && i < a.length; i++) {
    const x = Math.abs(a[i]);
    env = x > env ? x : env * release;
  }
  let acc = 0;
  let n = 0;
  const end = Math.min(e, a.length);
  for (let i = s; i < end; i++) {
    const x = Math.abs(a[i]);
    env = x > env ? x : env * release;
    acc += env * env;
    n++;
  }
  return n > 0 ? Math.sqrt(acc / n) : 0;
}

function cents(a: number, b: number): number {
  return 1200 * Math.log2(b / a);
}

function fftMag(frame: Float64Array): Float64Array {
  const n = frame.length;
  const re = frame.slice();
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < mag.length; k++) mag[k] = re[k] * re[k] + im[k] * im[k];
  return mag;
}

function bandDb(a: Float32Array, sampleRate: number, end: number): number[] {
  const N = 4096;
  const acc = new Float64Array(BAND_EDGES.length - 1);
  let frames = 0;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const last = Math.min(a.length, end);
  for (let s = 0; s + N <= last; s += N / 2) {
    const frame = new Float64Array(N);
    for (let i = 0; i < N; i++) frame[i] = a[s + i] * win[i];
    const mag = fftMag(frame);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * sampleRate) / N;
      for (let b = 0; b < BAND_EDGES.length - 1; b++) {
        if (f >= BAND_EDGES[b] && f < BAND_EDGES[b + 1]) {
          acc[b] += mag[k];
          break;
        }
      }
    }
    frames++;
  }
  const out: number[] = [];
  for (let b = 0; b < acc.length; b++) out.push(10 * Math.log10(acc[b] / Math.max(1, frames) + 1e-20));
  return out;
}

function pitchTrack(a: Float32Array, sampleRate: number, s0: number, s1: number, win: number, hop: number): number[] {
  const out: number[] = [];
  for (let p = s0; p + win <= s1; p += hop) out.push(f0At(a, p, p + win, sampleRate));
  return out;
}

function maxCentsAtLag(a: number[], b: number[], lag: number): { max: number; n: number } {
  let max = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= b.length) continue;
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[j]) || a[i] <= 0 || b[j] <= 0) continue;
    max = Math.max(max, Math.abs(cents(a[i], b[j])));
    n++;
  }
  return { max, n };
}

/**
 * Compare `other` to `ref` under SC-001.
 * `songEndSec` limits band and mix RMS to the song (release tails still sit inside note windows).
 */
export function compareSc001(
  ref: Float32Array,
  other: Float32Array,
  sampleRate: number,
  notes: NoteWindow[],
  songEndSec: number,
  checkMix = false,
): GateReport {
  const failures: string[] = [];
  const hop = Math.round((SC001.envelopeFrameMs / 1000) * sampleRate);
  const lagSteps = Math.max(1, Math.round(SC001.pitchLagMs / SC001.envelopeFrameMs));

  for (const note of notes) {
    const s = Math.round(note.startSec * sampleRate);
    const e = Math.round(note.endSec * sampleRate);
    const levelA = rms(ref, s, e);
    const levelB = rms(other, s, e);
    if (levelA > 1e-4 || levelB > 1e-4) {
      const diff = Math.abs(db(levelB) - db(levelA));
      if (diff > SC001.noteLevelDb) {
        failures.push(`${note.label} level ${diff.toFixed(2)} dB (limit ${SC001.noteLevelDb})`);
      }
    }

    const tail = Math.round((SC001.envelopeTailMs / 1000) * sampleRate);
    let envMax = 0;
    let envAt = 0;
    let envRef = 0;
    let envOther = 0;
    for (let p = s; p + hop <= e + tail && p + hop <= ref.length && p + hop <= other.length; p += hop) {
      const a = envelopeLevel(ref, p, p + hop, sampleRate);
      const b = envelopeLevel(other, p, p + hop, sampleRate);
      // −40 dB. Both sides of a finished release sit here and still differ by
      // more than 1 dB. A missing release stays above this on one side. See plan.md.
      if (a < 0.01 && b < 0.01) continue;
      const diff = Math.abs(db(b) - db(a));
      if (diff > envMax) {
        envMax = diff;
        envAt = p;
        envRef = a;
        envOther = b;
      }
    }
    if (envMax > SC001.envelopeDb) {
      const atMs = ((envAt - s) / sampleRate) * 1000;
      failures.push(
        `${note.label} envelope ${envMax.toFixed(2)} dB at +${atMs.toFixed(0)} ms (${db(envRef).toFixed(1)} vs ${db(envOther).toFixed(1)} dB, limit ${SC001.envelopeDb})`,
      );
    }

    if (note.pitched && e - s > hop * 4) {
      const limit = note.modulated ? SC001.modulatedPitchCents : SC001.plainPitchCents;
      if (!note.modulated) {
        const from = s + Math.round(0.015 * sampleRate);
        const win = Math.min(e - from, Math.round(0.08 * sampleRate));
        const fA = win > hop ? f0At(ref, from, from + win, sampleRate) : Number.NaN;
        const fB = win > hop ? f0At(other, from, from + win, sampleRate) : Number.NaN;
        if (Number.isFinite(fA) && Number.isFinite(fB) && fA > 0 && fB > 0) {
          const diff = Math.abs(cents(fA, fB));
          if (diff > limit) failures.push(`${note.label} pitch ${diff.toFixed(1)} cents (limit ${limit})`);
        } else if (levelA > 0.01 && levelB > 0.01) {
          failures.push(`${note.label} pitch track missing`);
        }
      } else {
        const pitchWin = Math.round(0.012 * sampleRate);
        const from = s + Math.round(0.01 * sampleRate);
        const trackA = pitchTrack(ref, sampleRate, from, e, pitchWin, hop);
        const trackB = pitchTrack(other, sampleRate, from, e, pitchWin, hop);
        let best = { max: Infinity, n: 0 };
        for (let lag = -lagSteps; lag <= lagSteps; lag++) {
          const hit = maxCentsAtLag(trackA, trackB, lag);
          if (hit.n >= 2 && hit.max < best.max) best = hit;
        }
        if (best.n < 2) {
          if (levelA > 0.01 && levelB > 0.01) failures.push(`${note.label} pitch track missing`);
        } else if (best.max > limit) {
          failures.push(`${note.label} pitch ${best.max.toFixed(1)} cents (limit ${limit})`);
        }
      }
    }
  }

  const songEnd = Math.round(songEndSec * sampleRate);
  const bandsA = bandDb(ref, sampleRate, songEnd);
  const bandsB = bandDb(other, sampleRate, songEnd);
  let loudest = -1e9;
  for (let i = 0; i < bandsA.length; i++) loudest = Math.max(loudest, bandsA[i], bandsB[i]);
  for (let i = 0; i < bandsA.length; i++) {
    if (loudest - Math.max(bandsA[i], bandsB[i]) > SC001.bandFloorDb) continue;
    const diff = Math.abs(bandsB[i] - bandsA[i]);
    if (diff > SC001.bandDb) {
      failures.push(`band ${BAND_EDGES[i]}-${BAND_EDGES[i + 1]} Hz ${diff.toFixed(2)} dB (limit ${SC001.bandDb})`);
    }
  }

  let mixRmsDb: number | null = null;
  if (checkMix) {
    const n = Math.min(ref.length, other.length, songEnd);
    mixRmsDb = db(rms(other, 0, n)) - db(rms(ref, 0, n));
    if (Math.abs(mixRmsDb) > SC001.mixRmsDb) {
      failures.push(`mix RMS ${mixRmsDb.toFixed(2)} dB (limit ±${SC001.mixRmsDb})`);
    }
  }

  return { pass: failures.length === 0, failures, mixRmsDb };
}
