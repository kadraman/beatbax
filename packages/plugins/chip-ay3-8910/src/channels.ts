import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import { AyEnvelopeGenerator, type AyEnvelopeShape } from './envelope.js';
import { AyToneOscillator, AyNoiseOscillator } from './oscillator.js';

interface AyChannelState {
  active: boolean;
  frequency: number;
  toneEnabled: boolean;
  noiseEnabled: boolean;
  noiseRate: number;
  useEnvelope: boolean;
  volume: number;
  envShape: AyEnvelopeShape;
}

function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createAyChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  const state: AyChannelState = {
    active: false,
    frequency: 0,
    toneEnabled: true,
    noiseEnabled: false,
    noiseRate: 0,
    useEnvelope: false,
    volume: 15,
    envShape: 'none',
  };

  const tone = new AyToneOscillator();
  const noise = new AyNoiseOscillator();
  const envelope = new AyEnvelopeGenerator();

  function resetAll(): void {
    state.active = false;
    state.frequency = 0;
    state.toneEnabled = true;
    state.noiseEnabled = false;
    state.noiseRate = 0;
    state.useEnvelope = false;
    state.volume = 15;
    state.envShape = 'none';
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
      state.toneEnabled = type !== 'noise';
      state.noiseEnabled = type === 'noise' || requestedNoise;
      state.noiseRate = clamp(Number(instrument.noise_rate ?? 0), 0, 31);
      state.envShape = env;

      const requestedEnvelope =
        (typeof instrument.vol === 'string' && String(instrument.vol).toLowerCase() === 'use_envelope') ||
        parseBool(instrument.use_envelope) ||
        (instrument.vol === undefined && env !== 'none');
      state.useEnvelope = requestedEnvelope;

      const parsedVol = Number(instrument.vol ?? 15);
      state.volume = clamp(Number.isFinite(parsedVol) ? parsedVol : 15, 0, 15);

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
      tone.setFrequency(state.frequency);
    },

    applyEnvelope(_frame: number): void {
      if (!state.active) return;
      if (state.useEnvelope && state.envShape !== 'none') {
        envelope.tick();
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

        const level = state.useEnvelope
          ? envelope.level() / 15
          : state.volume / 15;

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
      if (type === 'noise' || mixNoise) {
        return null;
      }

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(Math.max(1, freq), start);
      (osc as any)._baseFreq = Math.max(1, freq);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);

      const env = String(inst.env ?? 'none').toLowerCase();
      const useEnvelope =
        (typeof inst.vol === 'string' && String(inst.vol).toLowerCase() === 'use_envelope') ||
        parseBool(inst.use_envelope) ||
        (inst.vol === undefined && env !== 'none');

      const targetGain = useEnvelope ? 0.18 : clamp(Number(inst.vol ?? 15), 0, 15) / 15 * 0.18;
      gain.gain.linearRampToValueAtTime(targetGain, start + 0.008);
      gain.gain.linearRampToValueAtTime(0, start + Math.max(0.012, dur));

      osc.connect(gain);
      gain.connect(destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);

      return [osc, gain];
    },
  };
}
