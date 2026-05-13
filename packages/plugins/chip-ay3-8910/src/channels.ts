import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import {
  parseMacro,
  makeMacroState,
  macroValue,
  advanceMacro,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';
import {
  AyEnvelopeGenerator,
  buildAyEnvelopeLevelCurve,
  type AyEnvelopeShape,
} from './envelope.js';
import { AyToneOscillator, AyNoiseOscillator } from './oscillator.js';
import { shouldUseEnvelope } from './instrument.js';

interface AyChannelState {
  active: boolean;
  frequency: number;
  baseFrequency: number;
  toneEnabled: boolean;
  noiseEnabled: boolean;
  noiseRate: number;
  useEnvelope: boolean;
  volume: number;
  envShape: AyEnvelopeShape;
  volEnvMacro: ParsedMacro | null;
  volEnvState: MacroState;
  pitchEnvMacro: ParsedMacro | null;
  pitchEnvState: MacroState;
  arpEnvMacro: ParsedMacro | null;
  arpEnvState: MacroState;
  noiseRateEnvMacro: ParsedMacro | null;
  noiseRateEnvState: MacroState;
}

const AY_LFSR_SEED = 0x1ffff;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function volEnvToCurve(inst: InstrumentNode, dur: number): Float32Array | null {
  const volEnv = parseMacro((inst as any).vol_env);
  if (!volEnv || volEnv.values.length === 0) return null;
  if (dur <= 0) return null;
  const curve = new Float32Array(Math.max(2, volEnv.values.length));
  for (let i = 0; i < curve.length; i += 1) {
    curve[i] = clamp(volEnv.values[Math.min(i, volEnv.values.length - 1)], 0, 15) / 15;
  }
  return curve;
}

function ayShapeToCurve(inst: InstrumentNode, dur: number): Float32Array | null {
  const env = String(inst.env ?? 'none').toLowerCase() as AyEnvelopeShape;
  if (env === 'none') return null;
  if (dur <= 0) return null;
  return buildAyEnvelopeLevelCurve(env, dur);
}

function scheduleFrequencyMacros(
  freqParam: AudioParam,
  baseFreq: number,
  arpEnv: ParsedMacro | null,
  pitchEnv: ParsedMacro | null,
  start: number,
  dur: number,
  frameRate = 60,
): void {
  const totalFrames = Math.max(1, Math.ceil(dur * frameRate));
  const frameDur = 1 / frameRate;
  const arpState = makeMacroState();
  const pitchState = makeMacroState();

  for (let frame = 0; frame < totalFrames; frame += 1) {
    let semitoneOffset = 0;

    if (arpEnv) {
      semitoneOffset += macroValue(arpEnv, arpState);
      advanceMacro(arpEnv, arpState);
    }

    if (pitchEnv) {
      semitoneOffset += macroValue(pitchEnv, pitchState);
      advanceMacro(pitchEnv, pitchState);
    }

    const freq = baseFreq * Math.pow(2, semitoneOffset / 12);
    try {
      freqParam.setValueAtTime(Math.max(1, freq), start + (frame * frameDur));
    } catch (_) {}
  }
}

function noiseRateToHz(rate: number): number {
  // Must mirror AyNoiseOscillator.next() so CLI PCM and Web Audio match.
  const clamped = clamp(rate, 0, 31);
  const periodReg = Math.max(1, clamped);
  return 120 + (3400 / periodReg);
}

function buildAyNoiseBuffer(
  ctx: BaseAudioContext,
  dur: number,
  baseRate: number,
  noiseRateEnv: ParsedMacro | null,
  frameRate = 60,
): AudioBuffer {
  const sampleRate = Math.max(1, ctx.sampleRate || 44100);
  const totalSamples = Math.max(1, Math.ceil((dur + 0.03) * sampleRate));
  const buf = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buf.getChannelData(0);

  let lfsr = AY_LFSR_SEED;
  let phase = 0;
  let currentRate = clamp(baseRate, 0, 31);
  const noiseRateState = makeMacroState();
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / frameRate));
  let nextFrameSample = 0;

  for (let i = 0; i < totalSamples; i += 1) {
    if (i >= nextFrameSample) {
      currentRate = noiseRateEnv
        ? clamp(macroValue(noiseRateEnv, noiseRateState), 0, 31)
        : clamp(baseRate, 0, 31);
      if (noiseRateEnv) {
        advanceMacro(noiseRateEnv, noiseRateState);
      }
      nextFrameSample += samplesPerFrame;
    }

    phase += noiseRateToHz(currentRate) / sampleRate;
    while (phase >= 1) {
      const bit0 = lfsr & 1;
      const bit3 = (lfsr >> 3) & 1;
      const feedback = bit0 ^ bit3;
      lfsr = (lfsr >> 1) | (feedback << 16);
      phase -= 1;
    }

    data[i] = (lfsr & 1) === 0 ? 1 : -1;
  }

  return buf;
}

function computeEffectiveLevel(state: AyChannelState, envelope: AyEnvelopeGenerator): number {
  if (!state.active) return 0;

  if (state.volEnvMacro) {
    return clamp(macroValue(state.volEnvMacro, state.volEnvState), 0, 15) / 15;
  }

  if (state.useEnvelope) {
    return envelope.level() / 15;
  }

  return clamp(state.volume, 0, 15) / 15;
}

export function createAyChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  const state: AyChannelState = {
    active: false,
    frequency: 0,
    baseFrequency: 0,
    toneEnabled: true,
    noiseEnabled: false,
    noiseRate: 0,
    useEnvelope: false,
    volume: 15,
    envShape: 'none',
    volEnvMacro: null,
    volEnvState: makeMacroState(),
    pitchEnvMacro: null,
    pitchEnvState: makeMacroState(),
    arpEnvMacro: null,
    arpEnvState: makeMacroState(),
    noiseRateEnvMacro: null,
    noiseRateEnvState: makeMacroState(),
  };

  const tone = new AyToneOscillator();
  const noise = new AyNoiseOscillator();
  const envelope = new AyEnvelopeGenerator();

  function resetAll(): void {
    state.active = false;
    state.frequency = 0;
    state.baseFrequency = 0;
    state.toneEnabled = true;
    state.noiseEnabled = false;
    state.noiseRate = 0;
    state.useEnvelope = false;
    state.volume = 15;
    state.envShape = 'none';
    state.volEnvMacro = null;
    state.volEnvState = makeMacroState();
    state.pitchEnvMacro = null;
    state.pitchEnvState = makeMacroState();
    state.arpEnvMacro = null;
    state.arpEnvState = makeMacroState();
    state.noiseRateEnvMacro = null;
    state.noiseRateEnvState = makeMacroState();
    tone.reset();
    noise.reset();
    envelope.reset('none');
  }

  resetAll();

  return {
    reset(): void {
      resetAll();
    },

    noteOn(frequency: number, instrument: InstrumentNode): void {
      const type = String(instrument.type ?? 'tone').toLowerCase();
      const env = String(instrument.env ?? 'none').toLowerCase() as AyEnvelopeShape;
      const requestedNoise = String(instrument.noise ?? (type === 'noise' ? 'on' : 'off')).toLowerCase() === 'on';

      state.active = true;
      state.frequency = Math.max(0, frequency);
      state.baseFrequency = state.frequency;
      state.toneEnabled = type !== 'noise';
      state.noiseEnabled = type === 'noise' || requestedNoise;
      state.noiseRate = clamp(Number(instrument.noise_rate ?? 0), 0, 31);
      state.envShape = env;
      state.useEnvelope = shouldUseEnvelope(instrument);

      const parsedVol = Number(instrument.vol ?? 15);
      state.volume = clamp(Number.isFinite(parsedVol) ? parsedVol : 15, 0, 15);

      state.volEnvMacro = parseMacro((instrument as any).vol_env);
      state.volEnvState = makeMacroState();
      state.pitchEnvMacro = parseMacro((instrument as any).pitch_env);
      state.pitchEnvState = makeMacroState();
      state.arpEnvMacro = parseMacro((instrument as any).arp_env);
      state.arpEnvState = makeMacroState();
      state.noiseRateEnvMacro = parseMacro((instrument as any).noise_rate_env);
      state.noiseRateEnvState = makeMacroState();

      if (state.volEnvMacro && state.volEnvMacro.values.length > 0) {
        state.volume = clamp(state.volEnvMacro.values[0], 0, 15);
      }

      tone.setFrequency(state.frequency);
      noise.setRate(state.noiseRate);
      envelope.reset(state.envShape);
    },

    noteOff(): void {
      state.active = false;
      state.frequency = 0;
    },

    setFrequency(frequency: number): void {
      state.frequency = Math.max(0, frequency);
      state.baseFrequency = state.frequency;
      tone.setFrequency(state.frequency);
    },

    applyEnvelope(_frame: number): void {
      if (!state.active) return;

      if (state.useEnvelope && state.envShape !== 'none') {
        envelope.tick();
      }

      if (state.volEnvMacro) {
        state.volume = clamp(macroValue(state.volEnvMacro, state.volEnvState), 0, 15);
        advanceMacro(state.volEnvMacro, state.volEnvState);
      }

      let semitoneOffset = 0;
      if (state.arpEnvMacro) {
        semitoneOffset += macroValue(state.arpEnvMacro, state.arpEnvState);
        advanceMacro(state.arpEnvMacro, state.arpEnvState);
      }
      if (state.pitchEnvMacro) {
        semitoneOffset += macroValue(state.pitchEnvMacro, state.pitchEnvState);
        advanceMacro(state.pitchEnvMacro, state.pitchEnvState);
      }
      if (semitoneOffset !== 0) {
        const tuned = state.baseFrequency * Math.pow(2, semitoneOffset / 12);
        state.frequency = Math.max(0, tuned);
        tone.setFrequency(state.frequency);
      }

      if (state.noiseRateEnvMacro) {
        state.noiseRate = clamp(macroValue(state.noiseRateEnvMacro, state.noiseRateEnvState), 0, 31);
        noise.setRate(state.noiseRate);
        advanceMacro(state.noiseRateEnvMacro, state.noiseRateEnvState);
      }
    },

    render(buffer: Float32Array, sampleRate: number): void {
      if (!state.active) return;

      for (let i = 0; i < buffer.length; i += 1) {
        let sample = 0;
        let parts = 0;

        if (state.toneEnabled) {
          sample += tone.next(sampleRate);
          parts += 1;
        }

        if (state.noiseEnabled) {
          sample += noise.next(sampleRate);
          parts += 1;
        }

        if (parts === 0) continue;

        const level = computeEffectiveLevel(state, envelope);
        // Keep AY PCM path below full-scale to preserve headroom during channel summing.
        buffer[i] += (sample / parts) * level * 0.22;
      }
    },

    createPlaybackNodes(
      ctx: BaseAudioContext,
      freq: number,
      start: number,
      dur: number,
      inst: InstrumentNode,
      _scheduler: any,
      destination: AudioNode,
    ): AudioNode[] | null {
      const type = String(inst.type ?? 'tone').toLowerCase();
      const mixNoise = String(inst.noise ?? 'off').toLowerCase() === 'on';
      const useEnvelope = shouldUseEnvelope(inst);
      const volCurve = volEnvToCurve(inst, dur);
      const shapeCurve = !volCurve && useEnvelope ? ayShapeToCurve(inst, dur) : null;
      const curve = volCurve ?? shapeCurve;
      const noiseRateEnv = parseMacro((inst as any).noise_rate_env);

      if (type === 'noise' || mixNoise) {
        const src = ctx.createBufferSource();
        const baseNoiseRate = clamp(Number((inst as any).noise_rate ?? 0), 0, 31);
        src.buffer = buildAyNoiseBuffer(ctx, dur, baseNoiseRate, noiseRateEnv);
        src.loop = false;

        // Noise-rate macro is rendered directly into the one-shot LFSR buffer.

        const gain = ctx.createGain();

        const baseLevel = clamp(Number(inst.vol ?? 15), 0, 15) / 15;
        const targetGain = useEnvelope ? 0.2 : baseLevel * 0.2;

        if (curve && curve.length >= 2) {
          // When using envelope curve, apply it directly
          // Set initial value to curve's first value to avoid discontinuity
          const scaledCurve = new Float32Array(curve.length);
          for (let i = 0; i < curve.length; i += 1) {
            scaledCurve[i] = curve[i] * targetGain;
          }
          gain.gain.setValueAtTime(scaledCurve[0], start);
          try {
            gain.gain.setValueCurveAtTime(scaledCurve, start, Math.max(0.01, dur));
          } catch {
            // Fallback: just hold at first value
            gain.gain.setValueAtTime(scaledCurve[0], start);
          }
          // Release ramp happens after curve completes
          gain.gain.linearRampToValueAtTime(0, start + Math.max(0.01, dur) + 0.01);
        } else if (curve) {
          // Curve is too short, just use first value
          gain.gain.setValueAtTime(curve[0] * targetGain, start);
          gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));
        } else {
          // Without curve: manual attack and release
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(targetGain, start + 0.004);
          gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));
        }

        src.connect(gain);
        gain.connect(destination);
        src.start(start);
        src.stop(start + dur + 0.03);

        return [src, gain];
      }

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(Math.max(1, freq), start);
      (osc as any)._baseFreq = Math.max(1, freq);

      const gain = ctx.createGain();

      const targetGain = useEnvelope ? 0.18 : clamp(Number(inst.vol ?? 15), 0, 15) / 15 * 0.18;

      if (curve && curve.length >= 2) {
        // When using envelope curve, apply it directly
        // Set initial value to curve's first value to avoid discontinuity
        gain.gain.setValueAtTime(curve[0], start);
        try {
          gain.gain.setValueCurveAtTime(curve, start, Math.max(0.01, dur));
        } catch {
          // Fallback: just hold at first value
          gain.gain.setValueAtTime(curve[0], start);
        }
        // Release ramp happens after curve completes
        gain.gain.linearRampToValueAtTime(0, start + Math.max(0.01, dur) + 0.01);
      } else if (curve) {
        // Curve is too short, just use first value
        gain.gain.setValueAtTime(curve[0] * targetGain, start);
        gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));
      } else {
        // Without curve: manual attack and release
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(targetGain, start + 0.008);
        gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));
      }

      osc.connect(gain);
      gain.connect(destination);

      const arpEnv = parseMacro((inst as any).arp_env);
      const pitchEnv = parseMacro((inst as any).pitch_env);
      if (arpEnv || pitchEnv) {
        scheduleFrequencyMacros(osc.frequency, Math.max(1, freq), arpEnv, pitchEnv, start, dur);
      }

      osc.start(start);
      osc.stop(start + dur + 0.02);

      return [osc, gain];
    },
  };
}
