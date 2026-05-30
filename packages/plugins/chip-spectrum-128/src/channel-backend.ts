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

/** AY volume scale: BeatBax vol 15 = loudest → AY amplitude 15. */
function volToAmplitude(vol: number): number {
  return Math.max(0, Math.min(15, Math.round(vol)));
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
  private useEnvelope = false;

  // Mixer routing
  private toneEnable = true;
  private noiseEnable = false;
  private noisePeriod: number | undefined;

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

  // Phase for PCM square-wave rendering
  private phase = 0;

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
    this.useEnvelope = false;
    this.toneEnable = true;
    this.noiseEnable = false;
    this.noisePeriod = undefined;
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
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.baseFreq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;

    // Mixer routing
    this.toneEnable = instrument.tone_mix !== false; // default true
    this.noiseEnable = !!instrument.tone_mix && instrument.noise_rate !== undefined;

    // Noise period
    if (instrument.noise_rate !== undefined) {
      this.noisePeriod = Math.max(0, Math.min(31, Number(instrument.noise_rate)));
    } else {
      this.noisePeriod = undefined;
    }

    // Envelope mode
    this.envBass = !!instrument.env_bass;
    if (this.envBass) {
      this.envelopePeriod = freqToEnvPeriod(frequency);
      this.envelopeShape = 12; // continuous attack (ramp down with shape 8 = continuous decay)
      this.useEnvelope = true;
      this.amplitude = 0;
    } else if (instrument.vol_env !== undefined) {
      this.useEnvelope = true;
      this.envelopePeriod = undefined; // software-driven, not hardware
      this.envelopeShape = 8; // continuous decay (for software vol_env)
      this.amplitude = 0;
    } else if (instrument.vol !== undefined) {
      this.useEnvelope = false;
      this.amplitude = volToAmplitude(Number(instrument.vol));
    } else {
      this.useEnvelope = false;
      this.amplitude = 10; // default
    }

    // Parse software macros
    this.volEnvMacro = instrument.vol_env !== undefined ? parseMacro(instrument.vol_env) : null;
    this.arpEnvMacro = instrument.arp_env !== undefined ? parseMacro(instrument.arp_env) : null;
    this.pitchEnvMacro = instrument.pitch_env !== undefined ? parseMacro(instrument.pitch_env) : null;
    this.volEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();

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

    // Software vol_env
    if (this.volEnvMacro && !this.envBass) {
      const vol = macroValue(this.volEnvMacro, this.volEnvState);
      this.amplitude = volToAmplitude(vol);
      advanceMacro(this.volEnvMacro, this.volEnvState);
    }

    // Software arp_env
    if (this.arpEnvMacro) {
      const semitones = macroValue(this.arpEnvMacro, this.arpEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
    }

    // Software pitch_env
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

    // Store for next arbitration cycle
    (this.session as any)._pendingIntents = (this.session as any)._pendingIntents || [];
    (this.session as any)._pendingIntents.push(intent);
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active) return;

    // Simple square wave from current frequency + amplitude
    const freq = this.freq;
    if (freq <= 0) return;

    const amp = this.useEnvelope ? 0.5 : this.amplitude / 15;
    const gain = amp * 0.3; // scale for mixing
    if (gain === 0) return;

    const phaseInc = (freq * 2) / sampleRate;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] += this.phase < 1 ? gain : -gain;
      this.phase += phaseInc;
      if (this.phase >= 2) this.phase -= 2;
    }
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
    if (typeof (ctx as any).createOscillator !== 'function') return null;

    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    try { osc.type = 'square'; } catch (_) { return null; }

    const period = freqToTonePeriod(freq);
    // Recalculate exact freq from period
    const safeFreq = Math.max(1, freq);
    try { osc.frequency.setValueAtTime(safeFreq, start); } catch (_) {}
    (osc as any)._baseFreq = safeFreq;

    osc.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    // Volume
    const vol = inst.vol !== undefined ? volToAmplitude(Number(inst.vol)) : 10;
    const gainVal = (vol / 15) * 0.3;
    try { gain.gain.setValueAtTime(gainVal, start); } catch (_) {}
    try {
      gain.gain.setValueAtTime(0.0001, start + dur);
      gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}

    try { osc.start(start); } catch (e) { try { osc.start(); } catch (_) {} }
    try { osc.stop(start + dur + 0.02); } catch (_) {}

    return [osc, gain];
  }
}
