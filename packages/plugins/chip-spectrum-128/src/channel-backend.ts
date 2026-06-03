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
import {
  createEnvelopeClockState,
  advanceEnvelopeClockState,
  type EnvelopeClockState,
} from './envelope-generator.js';
import {
  freqToTonePeriod,
  freqToBuzzBassEnvPeriod,
  resolveEnvShape,
  AY_BUZZ_BASS_ENVELOPE_SHAPE,
  AY_BUZZ_BASS_LOUDNESS_COMPENSATION,
} from './periodTables.js';
import { getPlatformProfile } from './platform-profiles.js';
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

/** Peak linear gain (0–1) from AY amplitude 0–15. */
function amplitudeToGain(amplitude: number): number {
  return Math.max(0, amplitude / 15) * 0.3;
}

/** Spread macro steps evenly across a note (vol_env); arp_env stays at 60 Hz. */
export function macroSamplesPerStep(sampleCount: number, macro: ParsedMacro): number {
  return Math.max(1, Math.floor(sampleCount / macro.values.length));
}

/**
 * pitch_env semitones at a sample position — linearly interpolated between macro
 * knots spread across the note. arp_env stays stepped; pitch_env glides smoothly.
 */
export function pitchEnvSemitonesAt(
  macro: ParsedMacro,
  sampleIndex: number,
  sampleCount: number,
): number {
  const values = macro.values;
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];
  const clamped = Math.max(0, Math.min(sampleIndex, Math.max(0, sampleCount - 1)));
  const t = (clamped / Math.max(1, sampleCount - 1)) * (n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const frac = t - i;
  return values[i] + (values[i + 1] - values[i]) * frac;
}

export function pitchEnvFreqAt(
  baseFreq: number,
  macro: ParsedMacro,
  sampleIndex: number,
  sampleCount: number,
): number {
  const semitones = pitchEnvSemitonesAt(macro, sampleIndex, sampleCount);
  return baseFreq * Math.pow(2, semitones / 12);
}

function advanceMacroBySamples(
  macro: ParsedMacro,
  state: MacroState,
  sampleCount: number,
  samplesPerStep: number,
  remainder: { value: number },
): void {
  remainder.value += sampleCount;
  while (remainder.value >= samplesPerStep) {
    advanceMacro(macro, state);
    remainder.value -= samplesPerStep;
  }
}

/** Separate tone/noise gains; tone_vol caps the tone path when set. */
export function resolveToneNoiseGains(
  amplitude: number,
  toneVolAmplitude: number | undefined,
): { toneGain: number; noiseGain: number } {
  const noiseGain = amplitudeToGain(amplitude);
  const toneAmp = toneVolAmplitude !== undefined
    ? Math.min(amplitude, toneVolAmplitude)
    : amplitude;
  const toneGain = amplitudeToGain(toneAmp);
  return { toneGain, noiseGain };
}

/** Buzz-bass: square tone × fast hardware sawtooth envelope (shape 8, short period). */
export function renderAyBuzzBassSamples(
  buffer: Float32Array,
  sampleRate: number,
  opts: {
    freq: number;
    envelopePeriod: number;
    envelopeClock: EnvelopeClockState;
    phase?: number;
    peakGain?: number;
  },
): { phase: number } {
  let phase = opts.phase ?? 0;
  const peakGain = opts.peakGain ?? 0.3;
  const chipClocksPerSample = getPlatformProfile().ayClockHz / sampleRate;

  for (let i = 0; i < buffer.length; i++) {
    if (opts.freq <= 0) continue;
    const envLevel = advanceEnvelopeClockState(
      opts.envelopeClock,
      chipClocksPerSample,
      opts.envelopePeriod,
    );
    const gain = (envLevel / 15) * peakGain * AY_BUZZ_BASS_LOUDNESS_COMPENSATION;
    const toneHigh = phase < 0.5;
    // Sawtooth AM on the high half-cycle — classic AY buzz (gritty, not tremolo).
    if (toneHigh && gain > 0) {
      buffer[i] += gain;
    } else if (!toneHigh && gain > 0) {
      buffer[i] -= gain * 0.35;
    }
    phase += opts.freq / sampleRate;
    if (phase >= 1) phase -= 1;
  }

  return { phase };
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
    envelopePeriod?: number;
    envelopeShape?: number;
    volEnvMacro?: ParsedMacro | null;
    arpEnvMacro?: ParsedMacro | null;
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
  const arpEnvState = makeMacroState();
  const volSamplesPerStep = params.volEnvMacro
    ? macroSamplesPerStep(sampleCount, params.volEnvMacro)
    : samplesPerFrame;
  const volRemainder = { value: 0 };
  const arpRemainder = { value: 0 };
  const pitchAtSample = params.pitchEnvMacro && !params.arpEnvMacro
    ? (gi: number) => pitchEnvFreqAt(baseFreq, params.pitchEnvMacro!, gi, sampleCount)
    : undefined;
  if (params.volEnvMacro) {
    amplitude = volToAmplitude(macroValue(params.volEnvMacro, volEnvState));
  }
  if (params.arpEnvMacro) {
    const semitones = macroValue(params.arpEnvMacro, arpEnvState);
    freq = baseFreq * Math.pow(2, semitones / 12);
  } else if (params.pitchEnvMacro) {
    freq = pitchEnvFreqAt(baseFreq, params.pitchEnvMacro, 0, sampleCount);
  }

  const envClock = params.envBass && params.envelopePeriod
    ? createEnvelopeClockState(params.envelopeShape ?? AY_BUZZ_BASS_ENVELOPE_SHAPE)
    : null;

  let offset = 0;
  let samplesSinceFrame = 0;
  while (offset < sampleCount) {
    const len = Math.min(512, sampleCount - offset);
    const slice = out.subarray(offset, offset + len);
    const noiseEnable = isNoiseMixActive(!!params.noiseEnable, params.noiseFrames, frameIndex);
    const toneEnable = isToneMixActive(!!params.toneEnable, params.toneFrames, frameIndex);

    if (envClock && params.envelopePeriod && toneEnable) {
      const buzz = renderAyBuzzBassSamples(slice, sampleRate, {
        freq,
        envelopePeriod: params.envelopePeriod,
        envelopeClock: envClock,
        phase,
        peakGain: amplitudeToGain(params.peakAmplitude),
      });
      phase = buzz.phase;
    } else {
      const { toneGain, noiseGain } = resolveToneNoiseGains(
        amplitude,
        params.toneVolAmplitude,
      );
      if (toneGain > 0 || noiseGain > 0) {
        const state = renderAyChannelSamples(slice, sampleRate, {
          freq,
          globalSampleOffset: offset,
          freqAtGlobalSample: pitchAtSample,
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
    }

    offset += len;
    if (params.volEnvMacro) {
      advanceMacroBySamples(params.volEnvMacro, volEnvState, len, volSamplesPerStep, volRemainder);
      amplitude = volToAmplitude(macroValue(params.volEnvMacro, volEnvState));
    }
    if (params.arpEnvMacro) {
      advanceMacroBySamples(params.arpEnvMacro, arpEnvState, len, samplesPerFrame, arpRemainder);
      const semitones = macroValue(params.arpEnvMacro, arpEnvState);
      freq = baseFreq * Math.pow(2, semitones / 12);
    }
    samplesSinceFrame += len;
    while (samplesSinceFrame >= samplesPerFrame) {
      frameIndex++;
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
    /** When set, overrides `freq` per sample (pitch_env glide). */
    globalSampleOffset?: number;
    freqAtGlobalSample?: (globalSample: number) => number;
  }
): { phase: number; noiseLfsr: number; noisePhase: number } {
  let phase = opts.phase ?? 0;
  let noiseLfsr = opts.noiseLfsr ?? 1;
  let noisePhase = opts.noisePhase ?? 0;

  const { toneEnable, noiseEnable, noisePeriod } = opts;
  const toneGain = opts.toneGain ?? opts.gain ?? 0;
  const noiseGain = opts.noiseGain ?? opts.gain ?? 0;
  const splitMix = toneGain !== noiseGain;
  const globalOff = opts.globalSampleOffset ?? 0;

  if (toneGain === 0 && noiseGain === 0) return { phase, noiseLfsr, noisePhase };

  const noiseHz = noisePeriod !== undefined ? noisePeriodToHz(noisePeriod) : 0;
  const noisePhaseInc = noiseHz > 0 ? noiseHz / sampleRate : 0;

  for (let i = 0; i < buffer.length; i++) {
    const freq = opts.freqAtGlobalSample
      ? opts.freqAtGlobalSample(globalOff + i)
      : opts.freq;
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
  private envClockState: EnvelopeClockState | null = null;

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

  /** Stretched vol_env across prepareNoteRender duration. */
  private noteDurationSamples = 0;
  private noteRenderedSamples = 0;
  private volSamplesPerStep = 0;
  private volSampleRemainder = 0;

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
    this.envClockState = null;
    this.volEnvMacro = null;
    this.arpEnvMacro = null;
    this.pitchEnvMacro = null;
    this.volEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
    this.phase = 0;
    this.noiseLfsr = 1;
    this.noisePhase = 0;
    this.noteDurationSamples = 0;
    this.noteRenderedSamples = 0;
    this.volSamplesPerStep = 0;
    this.volSampleRemainder = 0;
  }

  prepareNoteRender(durationSamples: number): void {
    this.noteDurationSamples = Math.max(1, durationSamples);
    this.noteRenderedSamples = 0;
    this.volSampleRemainder = 0;
    this.volSamplesPerStep = this.volEnvMacro && !this.envBass
      ? macroSamplesPerStep(this.noteDurationSamples, this.volEnvMacro)
      : 0;
    this.volEnvState = makeMacroState();
    if (this.volEnvMacro && !this.envBass) {
      this.amplitude = volToAmplitude(macroValue(this.volEnvMacro, this.volEnvState));
    }
    if (this.pitchEnvMacro) {
      this.freq = pitchEnvFreqAt(this.baseFreq, this.pitchEnvMacro, 0, this.noteDurationSamples);
    }
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
      this.envelopePeriod = freqToBuzzBassEnvPeriod(frequency);
      this.envelopeShape = resolveEnvShape(instrument);
      this.envClockState = createEnvelopeClockState(this.envelopeShape);
      this.useEnvelope = true;
      this.amplitude = instrument.vol !== undefined
        ? volToAmplitude(Number(instrument.vol))
        : 15;
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
    if (this.envBass) {
      const nextPeriod = freqToBuzzBassEnvPeriod(frequency);
      if (nextPeriod !== this.envelopePeriod) {
        this.envelopePeriod = nextPeriod;
        if (this.envelopeShape !== undefined) {
          this.envClockState = createEnvelopeClockState(this.envelopeShape);
        }
      }
    }
    this._queueIntent();
  }

  applyEnvelope(_frame: number): void {
    if (!this.active || !this.currentInst) return;

    this.noiseFrameIndex++;
    this.noiseEnable = isNoiseMixActive(this.noiseMix, this.noiseFrames, this.noiseFrameIndex);
    this.toneFrameIndex++;
    this.toneEnable = isToneMixActive(this.toneMix, this.toneFrames, this.toneFrameIndex);

    if (this.arpEnvMacro) {
      const semitones = macroValue(this.arpEnvMacro, this.arpEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
    }

    this._queueIntent();
  }

  private advanceStretchedVol(bufferLength: number): void {
    if (this.volEnvMacro && !this.envBass && this.volSamplesPerStep > 0) {
      const rem = { value: this.volSampleRemainder };
      advanceMacroBySamples(
        this.volEnvMacro,
        this.volEnvState,
        bufferLength,
        this.volSamplesPerStep,
        rem,
      );
      this.volSampleRemainder = rem.value;
      this.amplitude = volToAmplitude(macroValue(this.volEnvMacro, this.volEnvState));
    }
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

    this.advanceStretchedVol(buffer.length);

    const pitchAtSample = this.pitchEnvMacro && this.noteDurationSamples > 0 && !this.arpEnvMacro
      ? (gi: number) => pitchEnvFreqAt(this.baseFreq, this.pitchEnvMacro!, gi, this.noteDurationSamples)
      : undefined;

    if (this.envBass && this.envelopePeriod && this.envClockState && this.toneEnable) {
      const buzz = renderAyBuzzBassSamples(buffer, sampleRate, {
        freq: pitchAtSample
          ? pitchAtSample(this.noteRenderedSamples)
          : this.freq,
        envelopePeriod: this.envelopePeriod,
        envelopeClock: this.envClockState,
        phase: this.phase,
        peakGain: amplitudeToGain(this.amplitude),
      });
      this.phase = buzz.phase;
      this.noteRenderedSamples += buffer.length;
      return;
    }

    const { toneGain, noiseGain } = resolveToneNoiseGains(
      this.amplitude,
      this.toneVolAmplitude,
    );
    if (toneGain === 0 && noiseGain === 0) {
      this.noteRenderedSamples += buffer.length;
      return;
    }

    const state = renderAyChannelSamples(buffer, sampleRate, {
      freq: this.freq,
      globalSampleOffset: this.noteRenderedSamples,
      freqAtGlobalSample: pitchAtSample,
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
    this.noteRenderedSamples += buffer.length;
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
    const envBass = !!inst.env_bass;
    const peakAmplitude = inst.vol !== undefined ? volToAmplitude(Number(inst.vol)) : (envBass ? 15 : 10);
    if (peakAmplitude === 0 && !envBass) return null;

    const sampleRate = ctx.sampleRate;
    const sampleCount = Math.max(1, Math.ceil(dur * sampleRate));

    const noiseRate = parseBaxNumber(inst.noise_rate);
    const noisePeriod = noiseRate !== undefined
      ? Math.max(0, Math.min(31, Math.round(noiseRate)))
      : undefined;

    const volEnvMacro = inst.vol_env !== undefined ? parseMacro(inst.vol_env) : null;
    const arpEnvMacro = inst.arp_env !== undefined ? parseMacro(inst.arp_env) : null;
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
      envBass,
      envelopePeriod: envBass ? freqToBuzzBassEnvPeriod(freq) : undefined,
      envelopeShape: envBass ? resolveEnvShape(inst) : undefined,
      volEnvMacro: envBass ? null : volEnvMacro,
      arpEnvMacro,
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
