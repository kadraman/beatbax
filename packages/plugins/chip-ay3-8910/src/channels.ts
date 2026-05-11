import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import {
  parseMacro,
  makeMacroState,
  macroValue,
  advanceMacro,
  type ParsedMacro,
  type MacroState,
} from '@beatbax/engine';
import { AyEnvelopeGenerator, type AyEnvelopeShape } from './envelope.js';
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

const NOISE_BUFFER_SECONDS = 1;
const NOISE_AMPLITUDE = 0.6;
const NOISE_BUFFER_CACHE = new WeakMap<BaseAudioContext, AudioBuffer>();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function macroToCurve(inst: InstrumentNode, dur: number): Float32Array | null {
  const volEnv = parseMacro((inst as any).vol_env);
  if (!volEnv || volEnv.values.length === 0) return null;
  if (dur <= 0) return null;
  const curve = new Float32Array(Math.max(2, volEnv.values.length));
  for (let i = 0; i < curve.length; i += 1) {
    curve[i] = clamp(volEnv.values[Math.min(i, volEnv.values.length - 1)], 0, 15) / 15;
  }
  return curve;
}

function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = NOISE_BUFFER_CACHE.get(ctx);
  if (cached) return cached;

  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS));
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * NOISE_AMPLITUDE;
  }

  NOISE_BUFFER_CACHE.set(ctx, buf);
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
      const curve = macroToCurve(inst, dur);

      if (type === 'noise' || mixNoise) {
        const src = ctx.createBufferSource();
        src.buffer = getNoiseBuffer(ctx);
        src.loop = true;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, start);

        const baseLevel = clamp(Number(inst.vol ?? 15), 0, 15) / 15;
        const targetGain = useEnvelope ? 0.2 : baseLevel * 0.2;
        gain.gain.linearRampToValueAtTime(targetGain, start + 0.004);
        if (curve) {
          gain.gain.setValueCurveAtTime(curve, start, Math.max(0.01, dur));
        }
        gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));

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
      gain.gain.setValueAtTime(0, start);

      const targetGain = useEnvelope ? 0.18 : clamp(Number(inst.vol ?? 15), 0, 15) / 15 * 0.18;
      gain.gain.linearRampToValueAtTime(targetGain, start + 0.008);
      if (curve) {
        gain.gain.setValueCurveAtTime(curve, start, Math.max(0.01, dur));
      }
      gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));

      osc.connect(gain);
      gain.connect(destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);

      return [osc, gain];
    },
  };
}
