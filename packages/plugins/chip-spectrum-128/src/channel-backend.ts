/**
 * AY-3-8912 channel backend facades.
 *
 * Each AyChannelBackend is a lightweight facade that collects register intents
 * from the BeatBax engine (noteOn, applyEnvelope, etc.) and queues them into
 * the shared RegisterArbitrator. All three channel backends (A/B/C) share a
 * single AyChipSimulator via the AySongSession.
 *
 * PCM rendering path: the session drives the shared simulator and fills audio
 * buffers from the resulting waveforms.
 */
import type { ChipChannelBackend, InstrumentNode } from '@beatbax/engine';
import {
  parseMacro, makeMacroState, macroValue, advanceMacro,
  type ParsedMacro, type MacroState,
} from '@beatbax/engine';
import { freqToTonePeriod, freqToEnvPeriod } from './periodTables.js';
import type { RegisterIntent } from './register-intent.js';
import type { RegisterArbitrator } from './register-arbitrator.js';
import type { AyChipSimulator } from './ay-chip.js';
import {
  ayNoiseBit,
  noisePeriodToHz,
  stepAyNoiseLfsr,
} from './ay-noise.js';
import { parseBaxBool, parseBaxNumber } from './bax-values.js';

/** AY volume scale: BeatBax vol 15 = loudest → AY amplitude 15. */
function volToAmplitude(vol: number): number {
  return Math.max(0, Math.min(15, Math.round(vol)));
}

/** Resolve R7 mixer routing from instrument fields. */
export function resolveAyMixerRouting(instrument: InstrumentNode): {
  toneEnable: boolean;
  noiseEnable: boolean;
} {
  const noiseRate = parseBaxNumber(instrument.noise_rate);
  const hasNoiseRate = noiseRate !== undefined;
  const noiseEnable = hasNoiseRate && parseBaxBool(instrument.tone_mix, false);

  let toneEnable = true;
  if (instrument.tone !== undefined) {
    toneEnable = parseBaxBool(instrument.tone, true);
  } else if (noiseEnable) {
    // Noise percussion default: noise-only unless tone=true is set explicitly.
    toneEnable = false;
  }

  return { toneEnable, noiseEnable };
}

/** Whether a mixer path is active for the current 60 Hz frame index. */
export function isMixActiveForFrames(
  mixEnabled: boolean,
  frameLimit: number | undefined,
  frameIndex: number
): boolean {
  if (!mixEnabled) return false;
  if (frameLimit === undefined) return true;
  return frameIndex < frameLimit;
}

/** Whether noise mixing is active for the current 60 Hz frame index. */
export function isNoiseMixActive(
  noiseMix: boolean,
  noiseFrames: number | undefined,
  frameIndex: number
): boolean {
  return isMixActiveForFrames(noiseMix, noiseFrames, frameIndex);
}

/** Whether tone mixing is active for the current 60 Hz frame index. */
export function isToneMixActive(
  toneMix: boolean,
  toneFrames: number | undefined,
  frameIndex: number
): boolean {
  return isMixActiveForFrames(toneMix, toneFrames, frameIndex);
}

/** Peak linear gain (0–1) from current amplitude / buzz-bass placeholder. */
function amplitudeToGain(amplitude: number, envBass: boolean): number {
  const amp = envBass ? 0.5 : Math.max(0, amplitude / 15);
  return amp * 0.3;
}

/** Separate tone/noise gains; tone_vol caps the tone path when set. */
export function resolveToneNoiseGains(
  amplitude: number,
  toneVolAmplitude: number | undefined,
  envBass: boolean
): { toneGain: number; noiseGain: number } {
  const noiseGain = amplitudeToGain(amplitude, envBass);
  const toneAmp = toneVolAmplitude !== undefined
    ? Math.min(amplitude, toneVolAmplitude)
    : amplitude;
  const toneGain = amplitudeToGain(toneAmp, envBass);
  return { toneGain, noiseGain };
}

/** Render one note with optional 60 Hz vol_env / pitch_env shaping (PCM + Web Audio). */
export function renderAyNotePcm(
  sampleCount: number,
  sampleRate: number,
  params: {
    freq: number;
    toneEnable: boolean;
    noiseEnable: boolean;
    noisePeriod?: number;
    peakAmplitude: number;
    envBass?: boolean;
    volEnvMacro?: ParsedMacro | null;
    pitchEnvMacro?: ParsedMacro | null;
    noiseFrames?: number;
    toneFrames?: number;
    toneVolAmplitude?: number;
  }
): Float32Array {
  const out = new Float32Array(sampleCount);
  if (sampleCount === 0) return out;

  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / 60));
  const baseFreq = params.freq;
  let freq = baseFreq;
  let frameIndex = 0;
  let phase = 0;
  let noiseLfsr = 1;
  let noisePhase = 0;
  let amplitude = params.peakAmplitude;
  const volEnvState = makeMacroState();
  const pitchEnvState = makeMacroState();
  if (params.volEnvMacro) {
    amplitude = volToAmplitude(macroValue(params.volEnvMacro, volEnvState));
  }
  if (params.pitchEnvMacro) {
    const semitones = macroValue(params.pitchEnvMacro, pitchEnvState);
    freq = baseFreq * Math.pow(2, semitones / 12);
  }

  let offset = 0;
  let samplesSinceFrame = 0;
  while (offset < sampleCount) {
    const len = Math.min(512, sampleCount - offset);
    const slice = out.subarray(offset, offset + len);
    const { toneGain, noiseGain } = resolveToneNoiseGains(
      amplitude,
      params.toneVolAmplitude,
      !!params.envBass
    );
    const noiseEnable = isNoiseMixActive(!!params.noiseEnable, params.noiseFrames, frameIndex);
    const toneEnable = isToneMixActive(!!params.toneEnable, params.toneFrames, frameIndex);
    if (toneGain > 0 || noiseGain > 0) {
      const state = renderAyChannelSamples(slice, sampleRate, {
        freq,
        toneGain,
        noiseGain,
        toneEnable,
        noiseEnable,
        noisePeriod: params.noisePeriod,
        phase,
        noiseLfsr,
        noisePhase,
      });
      phase = state.phase;
      noiseLfsr = state.noiseLfsr;
      noisePhase = state.noisePhase;
    }

    offset += len;
    samplesSinceFrame += len;
    while (samplesSinceFrame >= samplesPerFrame) {
      frameIndex++;
      if (params.volEnvMacro) {
        advanceMacro(params.volEnvMacro, volEnvState);
        amplitude = volToAmplitude(macroValue(params.volEnvMacro, volEnvState));
      }
      if (params.pitchEnvMacro) {
        advanceMacro(params.pitchEnvMacro, pitchEnvState);
        const semitones = macroValue(params.pitchEnvMacro, pitchEnvState);
        freq = baseFreq * Math.pow(2, semitones / 12);
      }
      samplesSinceFrame -= samplesPerFrame;
    }
  }

  return out;
}

/** Render AY channel output (tone/noise OR mix) into a mono buffer. */
export function renderAyChannelSamples(
  buffer: Float32Array,
  sampleRate: number,
  opts: {
    freq: number;
    /** @deprecated Use toneGain/noiseGain */
    gain?: number;
    toneGain?: number;
    noiseGain?: number;
    toneEnable: boolean;
    noiseEnable: boolean;
    noisePeriod?: number;
    phase?: number;
    noiseLfsr?: number;
    noisePhase?: number;
  }
): { phase: number; noiseLfsr: number; noisePhase: number } {
  let phase = opts.phase ?? 0;
  let noiseLfsr = opts.noiseLfsr ?? 1;
  let noisePhase = opts.noisePhase ?? 0;

  const { freq, toneEnable, noiseEnable, noisePeriod } = opts;
  const toneGain = opts.toneGain ?? opts.gain ?? 0;
  const noiseGain = opts.noiseGain ?? opts.gain ?? 0;
  const splitMix = toneGain !== noiseGain;

  if (toneGain === 0 && noiseGain === 0) return { phase, noiseLfsr, noisePhase };

  const noiseHz = noisePeriod !== undefined ? noisePeriodToHz(noisePeriod) : 0;
  const noisePhaseInc = noiseHz > 0 ? noiseHz / sampleRate : 0;

  for (let i = 0; i < buffer.length; i++) {
    let toneBit = 0;
    if (toneEnable && freq > 0) {
      toneBit = phase < 0.5 ? 1 : 0;
      phase += freq / sampleRate;
      if (phase >= 1) phase -= 1;
    }

    let noiseBit = 0;
    if (noiseEnable && noisePeriod !== undefined) {
      noisePhase += noisePhaseInc;
      const steps = Math.floor(noisePhase);
      if (steps > 0) {
        for (let s = 0; s < steps; s++) {
          noiseLfsr = stepAyNoiseLfsr(noiseLfsr);
        }
        noisePhase -= steps;
      }
      noiseBit = ayNoiseBit(noiseLfsr);
    }

    if (!toneEnable && !noiseEnable) continue;

    if (splitMix) {
      let sample = 0;
      if (toneEnable && freq > 0) sample += toneBit ? toneGain : -toneGain;
      if (noiseEnable && noisePeriod !== undefined) sample += noiseBit ? noiseGain : -noiseGain;
      buffer[i] += sample;
    } else {
      const active = toneBit | noiseBit;
      buffer[i] += active ? toneGain : -toneGain;
    }
  }

  return { phase, noiseLfsr, noisePhase };
}

export interface AySongSession {
  arbitrator: RegisterArbitrator;
  chip: AyChipSimulator;
  /** Current 50 Hz tick index. */
  currentTick: number;
  /** Previous register state (for carry-over in arbitrator). */
  prevRegs: Uint8Array;
}

/**
 * AY channel backend — facade for channels A (0), B (1), C (2).
 */
export class AyChannelBackend implements ChipChannelBackend {
  private channel: 0 | 1 | 2;
  private session: AySongSession;

  private active = false;
  private freq = 440;
  private baseFreq = 440;
  private currentInst: InstrumentNode | null = null;

  // Amplitude state
  private amplitude = 0;
  private toneVolAmplitude: number | undefined;
  private useEnvelope = false;

  // Mixer routing
  private toneMix = false;
  private toneEnable = true;
  private toneFrames: number | undefined;
  private toneFrameIndex = 0;
  private noiseMix = false;
  private noiseEnable = false;
  private noisePeriod: number | undefined;
  private noiseFrames: number | undefined;
  private noiseFrameIndex = 0;

  // Envelope (buzz-bass)
  private envBass = false;
  private envelopePeriod: number | undefined;
  private envelopeShape: number | undefined;

  // Software macros
  private volEnvMacro: ParsedMacro | null = null;
  private arpEnvMacro: ParsedMacro | null = null;
  private pitchEnvMacro: ParsedMacro | null = null;
  private volEnvState: MacroState = makeMacroState();
  private arpEnvState: MacroState = makeMacroState();
  private pitchEnvState: MacroState = makeMacroState();

  // PCM synthesis state
  private phase = 0;
  private noiseLfsr = 1;
  private noisePhase = 0;

  constructor(channel: 0 | 1 | 2, session: AySongSession) {
    this.channel = channel;
    this.session = session;
  }

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.baseFreq = 440;
    this.currentInst = null;
    this.amplitude = 0;
    this.toneVolAmplitude = undefined;
    this.useEnvelope = false;
    this.toneMix = false;
    this.toneEnable = true;
    this.toneFrames = undefined;
    this.toneFrameIndex = 0;
    this.noiseMix = false;
    this.noiseEnable = false;
    this.noisePeriod = undefined;
    this.noiseFrames = undefined;
    this.noiseFrameIndex = 0;
    this.envBass = false;
    this.envelopePeriod = undefined;
    this.envelopeShape = undefined;
    this.volEnvMacro = null;
    this.arpEnvMacro = null;
    this.pitchEnvMacro = null;
    this.volEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
    this.phase = 0;
    this.noiseLfsr = 1;
    this.noisePhase = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.baseFreq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.noiseLfsr = 1;
    this.noisePhase = 0;

    const routing = resolveAyMixerRouting(instrument);
    this.toneMix = routing.toneEnable;
    this.toneFrameIndex = 0;
    const toneFrames = parseBaxNumber(instrument.tone_frames);
    this.toneFrames = toneFrames !== undefined ? Math.max(0, Math.round(toneFrames)) : undefined;
    this.toneEnable = isToneMixActive(this.toneMix, this.toneFrames, this.toneFrameIndex);
    this.noiseMix = routing.noiseEnable;
    this.noiseFrameIndex = 0;
    const noiseFrames = parseBaxNumber(instrument.noise_frames);
    this.noiseFrames = noiseFrames !== undefined ? Math.max(0, Math.round(noiseFrames)) : undefined;
    this.noiseEnable = isNoiseMixActive(this.noiseMix, this.noiseFrames, this.noiseFrameIndex);

    if (instrument.noise_rate !== undefined) {
      const rate = parseBaxNumber(instrument.noise_rate);
      this.noisePeriod = rate !== undefined
        ? Math.max(0, Math.min(31, Math.round(rate)))
        : undefined;
    } else {
      this.noisePeriod = undefined;
    }

    // Envelope mode
    this.envBass = !!instrument.env_bass;
    if (this.envBass) {
      this.envelopePeriod = freqToEnvPeriod(frequency);
      this.envelopeShape = 12;
      this.useEnvelope = true;
      this.amplitude = 0;
    } else if (instrument.vol_env !== undefined) {
      this.useEnvelope = true;
      this.envelopePeriod = undefined;
      this.envelopeShape = 8;
      this.amplitude = 0;
    } else if (instrument.vol !== undefined) {
      this.useEnvelope = false;
      this.amplitude = volToAmplitude(Number(instrument.vol));
    } else {
      this.useEnvelope = false;
      this.amplitude = 10;
    }

    this.volEnvMacro = instrument.vol_env !== undefined ? parseMacro(instrument.vol_env) : null;
    this.arpEnvMacro = instrument.arp_env !== undefined ? parseMacro(instrument.arp_env) : null;
    this.pitchEnvMacro = instrument.pitch_env !== undefined ? parseMacro(instrument.pitch_env) : null;
    this.volEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
    if (this.volEnvMacro && !this.envBass) {
      this.amplitude = volToAmplitude(macroValue(this.volEnvMacro, this.volEnvState));
    }

    const toneVol = parseBaxNumber(instrument.tone_vol);
    this.toneVolAmplitude = toneVol !== undefined ? volToAmplitude(toneVol) : undefined;

    this._queueIntent();
  }

  noteOff(): void {
    this.active = false;
  }

  setFrequency(frequency: number): void {
    if (!this.active) return;
    this.freq = frequency;
    this._queueIntent();
  }

  applyEnvelope(_frame: number): void {
    if (!this.active || !this.currentInst) return;

    this.noiseFrameIndex++;
    this.noiseEnable = isNoiseMixActive(this.noiseMix, this.noiseFrames, this.noiseFrameIndex);
    this.toneFrameIndex++;
    this.toneEnable = isToneMixActive(this.toneMix, this.toneFrames, this.toneFrameIndex);

    if (this.volEnvMacro && !this.envBass) {
      const vol = macroValue(this.volEnvMacro, this.volEnvState);
      this.amplitude = volToAmplitude(vol);
      advanceMacro(this.volEnvMacro, this.volEnvState);
    }

    if (this.arpEnvMacro) {
      const semitones = macroValue(this.arpEnvMacro, this.arpEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
    }

    if (this.pitchEnvMacro) {
      const semitones = macroValue(this.pitchEnvMacro, this.pitchEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
      advanceMacro(this.pitchEnvMacro, this.pitchEnvState);
    }

    this._queueIntent();
  }

  private _queueIntent(): void {
    if (!this.active) return;
    const tonePeriod = freqToTonePeriod(this.freq);

    const intent: RegisterIntent = {
      tick: this.session.currentTick,
      channel: this.channel,
      tonePeriod,
      toneEnable: this.toneEnable,
      noiseEnable: this.noiseEnable,
      noisePeriod: this.noisePeriod,
      useEnvelope: this.useEnvelope,
      attenuation: this.useEnvelope ? undefined : this.amplitude,
      envelopePeriod: this.envBass ? this.envelopePeriod : undefined,
      envelopeShape: this.envBass ? this.envelopeShape : undefined,
      source: { channel: this.channel },
    };

    (this.session as any)._pendingIntents = (this.session as any)._pendingIntents || [];
    (this.session as any)._pendingIntents.push(intent);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active) return;

    const { toneGain, noiseGain } = resolveToneNoiseGains(
      this.amplitude,
      this.toneVolAmplitude,
      this.envBass
    );
    if (toneGain === 0 && noiseGain === 0) return;

    const state = renderAyChannelSamples(buffer, sampleRate, {
      freq: this.freq,
      toneGain,
      noiseGain,
      toneEnable: this.toneEnable,
      noiseEnable: this.noiseEnable,
      noisePeriod: this.noisePeriod,
      phase: this.phase,
      noiseLfsr: this.noiseLfsr,
      noisePhase: this.noisePhase,
    });
    this.phase = state.phase;
    this.noiseLfsr = state.noiseLfsr;
    this.noisePhase = state.noisePhase;
  }

  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null {
    if (typeof (ctx as any).createBuffer !== 'function') return null;

    const routing = resolveAyMixerRouting(inst);
    const peakAmplitude = inst.vol !== undefined ? volToAmplitude(Number(inst.vol)) : 10;
    if (peakAmplitude === 0) return null;

    const sampleRate = ctx.sampleRate;
    const sampleCount = Math.max(1, Math.ceil(dur * sampleRate));

    const noiseRate = parseBaxNumber(inst.noise_rate);
    const noisePeriod = noiseRate !== undefined
      ? Math.max(0, Math.min(31, Math.round(noiseRate)))
      : undefined;

    const volEnvMacro = inst.vol_env !== undefined ? parseMacro(inst.vol_env) : null;
    const pitchEnvMacro = inst.pitch_env !== undefined ? parseMacro(inst.pitch_env) : null;
    const noiseFramesVal = parseBaxNumber(inst.noise_frames);
    const noiseFrames = noiseFramesVal !== undefined ? Math.max(0, Math.round(noiseFramesVal)) : undefined;
    const toneFramesVal = parseBaxNumber(inst.tone_frames);
    const toneFrames = toneFramesVal !== undefined ? Math.max(0, Math.round(toneFramesVal)) : undefined;
    const toneVolVal = parseBaxNumber(inst.tone_vol);
    const toneVolAmplitude = toneVolVal !== undefined ? volToAmplitude(toneVolVal) : undefined;
    const mono = renderAyNotePcm(sampleCount, sampleRate, {
      freq,
      toneEnable: routing.toneEnable,
      noiseEnable: routing.noiseEnable,
      noisePeriod,
      peakAmplitude,
      volEnvMacro,
      pitchEnvMacro,
      noiseFrames,
      toneFrames,
      toneVolAmplitude,
    });

    const audioBuffer = (ctx as any).createBuffer(1, sampleCount, sampleRate);
    audioBuffer.copyToChannel(mono, 0);

    const source = (ctx as any).createBufferSource();
    source.buffer = audioBuffer;

    const gain = (ctx as any).createGain();
    source.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    try { gain.gain.setValueAtTime(1, start); } catch (_) {}
    try {
      gain.gain.setValueAtTime(0.0001, start + dur);
      gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}

    try { source.start(start); } catch (_) { try { source.start(); } catch (_) {} }
    try { source.stop(start + dur + 0.02); } catch (_) {}

    return [source, gain];
  }
}
