/**
 * SMS SN76489 Tone channel backend.
 *
 * Implements `ChipChannelBackend` for SMS PSG tone oscillators (tone1, tone2, tone3).
 *
 * Key features:
 *   - Square wave at fixed 50% duty (SN76489 produces square waves only)
 *   - 10-bit period register (0-1023)
 *   - Volume via 4-bit attenuation (0-15, 0=loudest, 15=silent)
 *   - All effects are software-driven (no hardware envelope or LFO)
 *
 * Dual rendering paths:
 *   - PCM (CLI/headless): `render()` fills a Float32Array sample buffer directly.
 *   - Web Audio (browser): `createPlaybackNodes()` returns [OscillatorNode, GainNode]
 *     with macro automation scheduled on AudioParams. This enables the full
 *     effects system (arp, vib, portamento, etc.) in the web-ui.
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { SMS_MIX_GAIN, getSmsWebAudioNorm } from './mixer.js';
import { freqToPeriod, periodToFreq, SMS_CLOCK } from './periodTables.js';
import {
  parseMacro, makeMacroState, getMacroValue, advanceMacro,
  buildVolEnvGainCurve, scheduleArpEnvToFreq, schedulePitchEnvToFreq,
  type ParsedMacro, type MacroState,
} from './macros.js';

// ─── Tone channel backend ────────────────────────────────────────────────────

/**
 * SMS Tone channel backend.
 * All three tone channels (tone1, tone2, tone3) are functionally identical.
 */
export class SMSToneBackend implements ChipChannelBackend {
  private channelType: 'tone1' | 'tone2' | 'tone3';
  private active: boolean = false;
  private freq: number = 440;
  private baseFreq: number = 440;   // unchanged base for arp_env / pitch_env
  private currentInst: InstrumentNode | null = null;
  private currentPeriod: number = 0;

  // Volume state (4-bit attenuation: 0=loudest, 15=silent)
  private attenuation: number = 15; // Default: silent

  // Software macro state
  private volEnvMacro:   ParsedMacro | null = null;
  private arpEnvMacro:   ParsedMacro | null = null;
  private pitchEnvMacro: ParsedMacro | null = null;
  private volEnvState:   MacroState = makeMacroState();
  private arpEnvState:   MacroState = makeMacroState();
  private pitchEnvState: MacroState = makeMacroState();

  // Phase accumulator for PCM rendering
  private phase: number = 0;

  // Frame counter for envelope advancement
  private frameCounter: number = 0;

  constructor(channelType: 'tone1' | 'tone2' | 'tone3') {
    this.channelType = channelType;
  }

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.baseFreq = 440;
    this.currentInst = null;
    this.currentPeriod = 0;
    this.attenuation = 15;
    this.phase = 0;
    this.frameCounter = 0;
    this.volEnvMacro = null;
    this.arpEnvMacro = null;
    this.pitchEnvMacro = null;
    this.volEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.baseFreq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.frameCounter = 0;

    // Parse volume from instrument
    // For SMS, we support both vol and vol_env
    let initialAttenuation = 15; // Default silent
    if (instrument.vol !== undefined) {
      // Constant volume mode
      const vol = Math.max(0, Math.min(15, Number(instrument.vol)));
      // vol in inst is 0-15 where 0=loudest (opposite to attenuation)
      initialAttenuation = 15 - vol;
    } else if (instrument.vol_env) {
      // Volume envelope - get first value
      const volEnv = parseMacro(instrument.vol_env);
      if (volEnv && volEnv.values.length > 0) {
        const firstVol = Math.max(0, Math.min(15, volEnv.values[0]));
        initialAttenuation = 15 - firstVol;
      }
    }
    this.attenuation = initialAttenuation;

    // Calculate period from frequency
    this.currentPeriod = freqToPeriod(frequency);

    // Parse software macros
    this.volEnvMacro   = parseMacro(instrument.vol_env);
    this.arpEnvMacro   = parseMacro(instrument.arp_env);
    this.pitchEnvMacro = parseMacro(instrument.pitch_env);
    this.volEnvState   = makeMacroState();
    this.arpEnvState   = makeMacroState();
    this.pitchEnvState = makeMacroState();

    // If we have arp_env or pitch_env, calculate the period for the initial frequency
    // Note: period will be recalculated each frame based on macro values
    if (this.arpEnvMacro || this.pitchEnvMacro) {
      // For now, just update the base frequency; actual pitch shifting happens in applyEnvelope
    }
  }

  noteOff(): void {
    this.active = false;
  }

  setFrequency(frequency: number): void {
    if (!this.active) return;
    this.freq = frequency;
    this.currentPeriod = freqToPeriod(frequency);
  }

  applyEnvelope(frame: number): void {
    if (!this.active || !this.currentInst) return;

    // Advance frame counter
    this.frameCounter++;
    // For v1, we advance macros every frame (60 Hz)
    // In a more accurate implementation, this would be tied to the SMS frame rate

    // ── Software vol_env macro ────────────────────────────────────────────────
    if (this.volEnvMacro) {
      const vol = getMacroValue(this.volEnvMacro, this.volEnvState);
      // vol_env values are 0-15 where 0=loudest
      this.attenuation = Math.max(0, Math.min(15, Math.round(15 - vol)));
      advanceMacro(this.volEnvMacro, this.volEnvState);
    }

    // ── Software arp_env macro ────────────────────────────────────────────────
    if (this.arpEnvMacro) {
      const semitones = getMacroValue(this.arpEnvMacro, this.arpEnvState);
      const newFreq = this.baseFreq * Math.pow(2, semitones / 12);
      this.freq = newFreq;
      this.currentPeriod = freqToPeriod(newFreq);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
    }

    // ── Software pitch_env macro ──────────────────────────────────────────────
    if (this.pitchEnvMacro) {
      const semitones = getMacroValue(this.pitchEnvMacro, this.pitchEnvState);
      const newFreq = this.baseFreq * Math.pow(2, semitones / 12);
      this.freq = newFreq;
      this.currentPeriod = freqToPeriod(newFreq);
      advanceMacro(this.pitchEnvMacro, this.pitchEnvState);
    }
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || !this.currentInst) return;

    const gain = SMS_MIX_GAIN.tone * (1.0 - (this.attenuation / 15));
    if (gain === 0) return;

    const freq = this.freq;
    if (freq <= 0) return;

    // Calculate phase increment based on period (not frequency directly)
    // period = clock / (32 * freq), so freq = clock / (32 * period)
    // For a square wave, we need 2 samples per period for 50% duty
    // But we render at the given sample rate, so:
    // phaseInc = (freq * 2) / sampleRate  (2 because square wave has 2 states)
    
    // However, using the frequency directly is fine for audio rate rendering
    const phaseInc = (freq * 2) / sampleRate; // 2 for square wave period

    for (let i = 0; i < buffer.length; i++) {
      // Square wave: positive half cycle = 1, negative half cycle = -1
      // phase goes from 0 to 2 (one full cycle)
      const value = (this.phase < 1) ? gain : -gain;
      buffer[i] += value;
      this.phase += phaseInc;
      if (this.phase >= 2) this.phase -= 2;
    }
  }

  // ── Web Audio path ─────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [OscillatorNode, GainNode] with square wave and macro automation.
   */
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

    // Create square wave oscillator
    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    // SN76489 produces a fixed 50% duty square wave
    try {
      osc.type = 'square';
    } catch (_) {
      // Fallback for browsers that don't support square type
      return null;
    }

    // Align frequency to SN76489 period table
    let alignedFreq = freq;
    if (freq > 0) {
      const period = freqToPeriod(freq);
      alignedFreq = periodToFreq(period);
    }
    const safeFreq = Math.max(1, alignedFreq);
    try { osc.frequency.setValueAtTime(safeFreq, start); } catch (_) {}
    // Store base frequency for arp effect
    (osc as any)._baseFreq = safeFreq;

    osc.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    // Parse macros
    const volEnvM = parseMacro(inst.vol_env);
    const arpEnvM = parseMacro(inst.arp_env);
    const pitchEnvM = parseMacro(inst.pitch_env);
    const webNorm = getSmsWebAudioNorm();

    // ── Frequency macros (arp_env takes priority over pitch_env) ─────────────
    if (arpEnvM) {
      scheduleArpEnvToFreq(osc.frequency, safeFreq, arpEnvM, start, dur);
    } else if (pitchEnvM) {
      schedulePitchEnvToFreq(osc.frequency, safeFreq, pitchEnvM, start, dur);
    }

    // ── Volume macro or constant volume ────────────────────────────────────
    if (volEnvM) {
      const curve = buildVolEnvGainCurve(volEnvM, SMS_MIX_GAIN.tone * webNorm, dur);
      try {
        gain.gain.setValueCurveAtTime(curve, start, Math.max(0.001, dur));
      } catch (_) {
        if (curve.length > 0) {
          try { gain.gain.setValueAtTime(curve[0], start); } catch (_) {}
        }
      }
    } else if (inst.vol !== undefined) {
      // Constant volume
      const vol = Math.max(0, Math.min(15, Number(inst.vol)));
      const att = 15 - vol; // Convert to attenuation
      const gainVal = SMS_MIX_GAIN.tone * (1.0 - (att / 15)) * webNorm;
      try { gain.gain.setValueAtTime(gainVal, start); } catch (_) {}
    } else {
      // Default: use attenuation from noteOn
      const gainVal = SMS_MIX_GAIN.tone * (1.0 - (this.attenuation / 15)) * webNorm;
      try { gain.gain.setValueAtTime(gainVal, start); } catch (_) {}
    }

    // Fade out at the end
    try {
      gain.gain.setValueAtTime(0.0001, start + dur);
      gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}

    try { osc.start(start); } catch (e) { try { osc.start(); } catch (_) {} }
    try { osc.stop(start + dur + 0.02); } catch (_) {}

    return [osc, gain];
  }
}

/**
 * Create a tone channel backend for the given channel type.
 */
export function createToneChannel(
  _audioContext: BaseAudioContext,
  channelType: 'tone1' | 'tone2' | 'tone3'
): ChipChannelBackend {
  return new SMSToneBackend(channelType);
}
