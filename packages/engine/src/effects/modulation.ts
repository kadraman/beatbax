/**
 * Shared sample-domain effect modulation (WebAudio ↔ PCM parity).
 * Pure math only — no AudioContext. Used by pcmRenderer and asserted against
 * WebAudio schedules in effects/index.ts.
 *
 * Spec: specs/features/112-webaudio-pcm-effect-parity/
 */

import { arpCycleOffsets } from '../util/arpOffsets.js';

export const VIB_DEPTH_SCALE = 1.0;

/** Chip frame rates (Hz) — must match effects/index.ts CHIP_FRAME_RATES. */
export const CHIP_FRAME_RATES: Record<string, number> = {
  gameboy: 60,
  nes: 60,
  c64: 50,
  genesis: 60,
  megadrive: 60,
  pcengine: 60,
};

export function chipFrameRate(chipType?: string): number {
  const key = (chipType || 'gameboy').toLowerCase();
  return CHIP_FRAME_RATES[key] || 60;
}

export function vibratoAmplitudeHz(depth: number, baseFreq: number, depthScale = VIB_DEPTH_SCALE): number {
  if (!(baseFreq > 0) || !Number.isFinite(depth)) return 0;
  const trackerDepth = Math.max(0, Math.min(15, Math.round(depth * depthScale)));
  const amp = trackerDepth * baseFreq * baseFreq / 131072;
  return Number.isFinite(amp) && amp > 0 ? amp : 0;
}

export function portamentoDurationSec(speed: number, noteDurSec: number, durationSecOverride?: number): number {
  if (typeof durationSecOverride === 'number' && durationSecOverride > 0) {
    return durationSecOverride;
  }
  const sp = Number.isFinite(speed) ? Math.max(1, Math.min(255, speed)) : 16;
  return Math.max(0.001, (256 - sp) / 256 * noteDurSec * 0.6);
}

/**
 * WebAudio pulse uses exponentialRamp (fallback linear); wave uses linearRamp.
 * For PCM we approximate exponential with a power curve and linear with t.
 */
export function portamentoProgress(
  t: number,
  portDur: number,
  curve: 'exponential' | 'linear' = 'exponential'
): number {
  if (portDur <= 0) return 1;
  const u = Math.min(1, Math.max(0, t / portDur));
  if (curve === 'linear') return u;
  // Approximate audio-rate exponential glide (closer to exponentialRampToValueAtTime)
  return u * u;
}

export function portamentoFreqAt(
  t: number,
  lastFreq: number,
  targetFreq: number,
  portDur: number,
  curve: 'exponential' | 'linear' = 'exponential'
): number {
  if (!(portDur > 0) || Math.abs(targetFreq - lastFreq) <= 1) return targetFreq;
  if (t >= portDur) return targetFreq;
  const p = portamentoProgress(t, portDur, curve);
  if (curve === 'exponential' && lastFreq > 0 && targetFreq > 0) {
    // Geometric interpolation matches exponentialRamp better than linear Hz lerp
    const log0 = Math.log(Math.max(20, lastFreq));
    const log1 = Math.log(Math.max(20, targetFreq));
    return Math.exp(log0 + (log1 - log0) * p);
  }
  return lastFreq + (targetFreq - lastFreq) * p;
}

export function arpSemitoneAt(t: number, offsets: number[], chipType?: string): number {
  const all = arpCycleOffsets(offsets);
  if (all.length === 0) return 0;
  const frameRate = chipFrameRate(chipType);
  // Quantize to chip frames like WebAudio setValueAtTime step schedule
  // (avoids float drift of t % (n/frameRate) near boundaries).
  const frame = Math.max(0, Math.floor(t * frameRate + 1e-9));
  return all[frame % all.length] || 0;
}

export function applyArpToFreq(baseFreq: number, t: number, offsets: number[], chipType?: string): number {
  if (!(baseFreq > 0) || !offsets.length) return baseFreq;
  const semi = arpSemitoneAt(t, offsets, chipType);
  return baseFreq * Math.pow(2, semi / 12);
}

export function bendProgress(t: number, delay: number, bendTime: number, curve: string): number {
  if (!(bendTime > 0) || t < delay || t > delay + bendTime) {
    if (t > delay + bendTime) return 1;
    return 0;
  }
  let p = Math.min(1, (t - delay) / bendTime);
  const c = (curve || 'linear').toLowerCase();
  if (c === 'exp' || c === 'exponential') p = p * p;
  else if (c === 'log' || c === 'logarithmic') p = 1 - Math.pow(1 - p, 2);
  else if (c === 'sine' || c === 'sin') p = (1 - Math.cos(Math.PI * p)) / 2;
  return p;
}

export function applyBendToFreq(
  baseFreq: number,
  t: number,
  semitones: number,
  delay: number,
  bendTime: number,
  curve: string
): number {
  if (!(baseFreq > 0) || semitones === 0 || !(bendTime > 0)) return baseFreq;
  if (t < delay) return baseFreq;
  const p = bendProgress(t, delay, bendTime, curve);
  return baseFreq * Math.pow(2, (semitones * p) / 12);
}

export function tremoloGain(
  t: number,
  depth: number,
  rate: number,
  waveform: string | undefined,
  durationSec?: number,
  delaySec?: number
): number {
  if (!(depth > 0) || !(rate > 0)) return 1;
  if (typeof delaySec === 'number' && t < delaySec) return 1;
  if (typeof durationSec === 'number' && t >= durationSec) return 1;
  const modulationDepth = (depth / 15) * 0.5;
  const tremPhase = t * rate * 2 * Math.PI;
  let lfo = 0;
  switch ((waveform || 'sine').toLowerCase()) {
    case 'square':
      lfo = Math.sin(tremPhase) >= 0 ? 1 : -1;
      break;
    case 'sawtooth':
    case 'saw':
      lfo = 2 * ((tremPhase / (2 * Math.PI)) % 1) - 1;
      break;
    case 'triangle': {
      const sawLfo = 2 * ((tremPhase / (2 * Math.PI)) % 1) - 1;
      lfo = 2 * Math.abs(sawLfo) - 1;
      break;
    }
    default:
      lfo = Math.sin(tremPhase);
  }
  return 1.0 + lfo * modulationDepth;
}

export function noteCutGain(t: number, cutTicks: number, tickSeconds: number): number {
  if (!(cutTicks > 0) || !(tickSeconds > 0)) return 1;
  const cutTimeSec = cutTicks * tickSeconds;
  if (t < cutTimeSec) return 1;
  const fadeDuration = 0.005;
  const fadeTime = t - cutTimeSec;
  if (fadeTime >= fadeDuration) return 0;
  return Math.pow(0.0001, fadeTime / fadeDuration);
}

export interface ParsedNoteEffects {
  vibDepth: number;
  vibRate: number;
  vibDurationSec?: number;
  vibDelaySec?: number;
  tremDepth: number;
  tremRate: number;
  tremWaveform?: string;
  tremDurationSec?: number;
  tremDelaySec?: number;
  cutTicks: number;
  cutEnabled: boolean;
  portSpeed: number;
  portDurationSec?: number;
  arpOffsets: number[];
  bendSemitones: number;
  bendCurve: string;
  bendDelay: number;
  bendTime: number;
  sweepTime: number;
  sweepDirection: 'up' | 'down';
  sweepShift: number;
  volDelta: number;
  volSteps?: number;
  echo?: { delayTimeRaw: number; feedback: number; mix: number };
  retrig?: { interval: number; volumeDelta: number };
}

export function emptyParsedEffects(): ParsedNoteEffects {
  return {
    vibDepth: 0,
    vibRate: 0,
    tremDepth: 0,
    tremRate: 0,
    cutTicks: 0,
    cutEnabled: false,
    portSpeed: 0,
    arpOffsets: [],
    bendSemitones: 0,
    bendCurve: 'linear',
    bendDelay: 0,
    bendTime: 0,
    sweepTime: 0,
    sweepDirection: 'down',
    sweepShift: 0,
    volDelta: 0,
  };
}

/**
 * Parse resolver effect objects into a flat modulation params struct.
 */
export function parseNoteEffects(
  effects: any[] | undefined,
  durSec: number,
  tickSeconds?: number
): ParsedNoteEffects {
  const out = emptyParsedEffects();
  out.bendDelay = durSec * 0.5;
  out.bendTime = durSec - out.bendDelay;
  if (!Array.isArray(effects)) return out;

  for (const fx of effects) {
    try {
      if (!fx || !fx.type) continue;
      const p = fx.params || [];
      switch (fx.type) {
        case 'vib': {
          out.vibDepth = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          out.vibRate = Number(typeof p[1] !== 'undefined' ? p[1] : 0);
          if (typeof fx.durationSec === 'number') out.vibDurationSec = Number(fx.durationSec);
          else if (typeof p[3] !== 'undefined' && typeof tickSeconds === 'number') {
            const durRows = Number(p[3]);
            if (!Number.isNaN(durRows) && durRows > 0) out.vibDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
          }
          if (typeof fx.delaySec === 'number' && fx.delaySec > 0) out.vibDelaySec = fx.delaySec;
          else if (typeof p[4] !== 'undefined' && typeof tickSeconds === 'number') {
            const delayRows = Number(p[4]);
            if (Number.isFinite(delayRows) && delayRows > 0) out.vibDelaySec = delayRows * tickSeconds;
          }
          break;
        }
        case 'port': {
          out.portSpeed = Number(typeof p[0] !== 'undefined' ? p[0] : 16);
          if (typeof fx.durationSec === 'number') out.portDurationSec = Number(fx.durationSec);
          else if (typeof p[1] !== 'undefined' && typeof tickSeconds === 'number') {
            const durRows = Number(p[1]);
            if (!Number.isNaN(durRows)) out.portDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
          }
          break;
        }
        case 'trem': {
          out.tremDepth = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          out.tremRate = Number(typeof p[1] !== 'undefined' ? p[1] : 6);
          out.tremWaveform = typeof p[2] !== 'undefined' ? String(p[2]).toLowerCase() : 'sine';
          if (typeof fx.durationSec === 'number' && fx.durationSec > 0) out.tremDurationSec = Number(fx.durationSec);
          else if (typeof p[3] !== 'undefined' && typeof tickSeconds === 'number') {
            const durRows = Number(p[3]);
            if (!Number.isNaN(durRows) && durRows > 0) out.tremDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
          }
          if (typeof fx.delaySec === 'number' && fx.delaySec > 0) out.tremDelaySec = fx.delaySec;
          else if (typeof p[4] !== 'undefined' && typeof tickSeconds === 'number') {
            const delayRows = Number(p[4]);
            if (Number.isFinite(delayRows) && delayRows > 0) out.tremDelaySec = delayRows * tickSeconds;
          }
          break;
        }
        case 'arp': {
          out.arpOffsets = p
            .map((x: any) => Number(x))
            .filter((n: number) => Number.isFinite(n) && n >= 0);
          break;
        }
        case 'bend': {
          out.bendSemitones = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          if (Number.isFinite(out.bendSemitones)) {
            out.bendCurve = typeof p[1] !== 'undefined' ? String(p[1]).toLowerCase() : 'linear';
            out.bendDelay = typeof p[2] !== 'undefined' ? Number(p[2]) : durSec * 0.5;
            if (!Number.isFinite(out.bendDelay) || out.bendDelay < 0) out.bendDelay = durSec * 0.5;
            out.bendDelay = Math.min(out.bendDelay, durSec);
            out.bendTime = typeof p[3] !== 'undefined' ? Number(p[3]) : (durSec - out.bendDelay);
            if (!Number.isFinite(out.bendTime) || out.bendTime <= 0) out.bendTime = durSec - out.bendDelay;
            out.bendTime = Math.min(out.bendTime, durSec - out.bendDelay);
          } else {
            out.bendSemitones = 0;
          }
          break;
        }
        case 'sweep': {
          const timeVal = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          if (Number.isFinite(timeVal) && timeVal >= 0 && timeVal <= 7) {
            out.sweepTime = Math.round(timeVal);
            const dirRaw = typeof p[1] !== 'undefined' ? p[1] : 'down';
            if (typeof dirRaw === 'number') out.sweepDirection = dirRaw > 0 ? 'up' : 'down';
            else {
              const dirStr = String(dirRaw).toLowerCase().trim();
              out.sweepDirection = (dirStr === 'up' || dirStr === '+' || dirStr === '1') ? 'up' : 'down';
            }
            const shiftVal = Number(typeof p[2] !== 'undefined' ? p[2] : 0);
            if (Number.isFinite(shiftVal) && shiftVal >= 0 && shiftVal <= 7) {
              out.sweepShift = Math.round(shiftVal);
            }
          }
          break;
        }
        case 'volSlide': {
          out.volDelta = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          out.volSteps = typeof p[1] !== 'undefined' ? Number(p[1]) : undefined;
          if (!Number.isFinite(out.volDelta)) out.volDelta = 0;
          if (out.volSteps !== undefined && !Number.isFinite(out.volSteps)) out.volSteps = undefined;
          break;
        }
        case 'cut': {
          const ticks = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          if (Number.isFinite(ticks) && ticks > 0) {
            out.cutTicks = Math.max(0, ticks);
            out.cutEnabled = true;
          }
          break;
        }
        case 'echo': {
          const delayTimeRaw = Number(p[0]);
          if (Number.isFinite(delayTimeRaw) && delayTimeRaw > 0) {
            const feedbackRaw = typeof p[1] !== 'undefined' ? Number(p[1]) : 50;
            const mixRaw = typeof p[2] !== 'undefined' ? Number(p[2]) : 30;
            out.echo = {
              delayTimeRaw,
              feedback: Number.isFinite(feedbackRaw) ? Math.max(0, Math.min(100, feedbackRaw)) / 100 : 0.5,
              mix: Number.isFinite(mixRaw) ? Math.max(0, Math.min(100, mixRaw)) / 100 : 0.3,
            };
          }
          break;
        }
        case 'retrig': {
          const interval = Number(p[0]);
          if (Number.isFinite(interval) && interval > 0) {
            out.retrig = {
              interval,
              volumeDelta: typeof p[1] !== 'undefined' ? Number(p[1]) : 0,
            };
          }
          break;
        }
        default:
          break;
      }
    } catch (_) { /* ignore malformed effect */ }
  }
  return out;
}

/** Resolve echo delay seconds (beat fraction if < 10, else absolute seconds). */
export function resolveEchoDelaySec(delayTimeRaw: number, tickSeconds?: number): number {
  if (delayTimeRaw < 10.0) {
    const secondsPerBeat = tickSeconds ? tickSeconds * 16 : 0.5;
    return delayTimeRaw * secondsPerBeat;
  }
  return delayTimeRaw;
}

/**
 * Effective frequency at time t after port → vib → arp → bend (sweep applied by caller).
 */
export function modulatePitchHz(opts: {
  t: number;
  noteDurSec: number;
  baseFreq: number;
  lastFreq?: number;
  fx: ParsedNoteEffects;
  chipType?: string;
  vibDepthScale?: number;
  vibratoPhase: number;
  portCurve?: 'exponential' | 'linear';
}): { freq: number; nextVibratoPhase: number } {
  const {
    t,
    noteDurSec,
    baseFreq,
    lastFreq,
    fx,
    chipType,
    vibDepthScale = VIB_DEPTH_SCALE,
    vibratoPhase,
    portCurve = 'exponential',
  } = opts;

  // Order matches typical WebAudio scheduling: port sets the carrier, arp steps
  // the carrier, vib LFO *adds* Hz on top (does not rescale arp), then bend.
  let freq = baseFreq;

  if (fx.portSpeed > 0 && typeof lastFreq === 'number' && lastFreq > 0) {
    const portDur = portamentoDurationSec(fx.portSpeed, noteDurSec, fx.portDurationSec);
    freq = portamentoFreqAt(t, lastFreq, baseFreq, portDur, portCurve);
  }

  if (fx.arpOffsets.length > 0 && freq > 0) {
    freq = applyArpToFreq(freq, t, fx.arpOffsets, chipType);
  }

  if (fx.bendSemitones !== 0 && fx.bendTime > 0 && freq > 0 && t >= fx.bendDelay) {
    const p = bendProgress(t, fx.bendDelay, fx.bendTime, fx.bendCurve);
    freq = freq * Math.pow(2, (fx.bendSemitones * p) / 12);
  }

  const afterVibDelay = typeof fx.vibDelaySec !== 'number' || t >= fx.vibDelaySec;
  const withinVibDur = typeof fx.vibDurationSec === 'undefined' || t < fx.vibDurationSec;
  if (fx.vibDepth !== 0 && fx.vibRate > 0 && freq > 0 && afterVibDelay && withinVibDur) {
    // WebAudio sets LFO gain once from the note frequency at schedule time.
    const amp = vibratoAmplitudeHz(fx.vibDepth, baseFreq, vibDepthScale);
    freq = freq + Math.sin(vibratoPhase) * amp;
  }

  return { freq, nextVibratoPhase: vibratoPhase };
}

export function advanceVibratoPhase(phase: number, rate: number, sampleRate: number): number {
  return phase + (2 * Math.PI * rate) / sampleRate;
}
