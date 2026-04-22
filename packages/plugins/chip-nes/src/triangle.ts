/**
 * NES Triangle channel backend.
 *
 * Key characteristics:
 *   - Fixed 32-step quantised triangle waveform (hardware-exact staircase)
 *   - No hardware volume envelope (always full amplitude when active)
 *   - Software gate: `vol=0` silences the channel; any other value gives full amplitude
 *   - Linear counter: `linear` field (1–127 ticks at 240 Hz) controls note duration
 *   - Frequency formula: f = 1,789,773 / (32 × (period + 1))
 *
 * Dual rendering paths:
 *   - PCM (CLI/headless): `render()` fills a Float32Array sample buffer directly.
 *   - Web Audio (browser): `createPlaybackNodes()` returns [OscillatorNode, GainNode]
 *     using an odd-harmonic PeriodicWave that closely matches the NES 32-step
 *     staircase. This enables arp, vib, and portamento effects in the web-ui.
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { NES_MIX_GAIN, getNesWebAudioNorm } from './mixer.js';
import {
  parseMacro, makeMacroState, getMacroValue, advanceMacro,
  schedulePitchEnvToFreq, scheduleArpEnvToFreq,
  type ParsedMacro, type MacroState,
} from './macros.js';

/**
 * Constant output gain for the triangle Web Audio path (no hardware envelope).
 * Normalised so that maximum amplitude matches the Game Boy backends in the browser.
 * The PCM render path uses raw NES_MIX_GAIN and is unaffected.
 */
function getNesTriangleWebGain(): number {
  return NES_MIX_GAIN.triangle * 15 * getNesWebAudioNorm();
}

/** 32-step quantised triangle waveform (hardware NES values, 0–15 each step). */
const TRIANGLE_WAVE_32: number[] = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
   0,  1,  2,  3,  4,  5, 6, 7, 8, 9,10,11,12,13,14,15
];

export class NESTriangleBackend implements ChipChannelBackend {
  private active: boolean = false;
  private freq: number = 440;
  private baseFreq: number = 440;
  private currentInst: InstrumentNode | null = null;
  private phase: number = 0;

  // Linear counter state (in samples)
  private linearCounterSamples: number = Infinity;
  private sampleCount: number = 0;
  private linearTicks: number = 0;

  // Software macro state
  private arpEnvMacro:   ParsedMacro | null = null;
  private pitchEnvMacro: ParsedMacro | null = null;
  private arpEnvState:   MacroState = makeMacroState();
  private pitchEnvState: MacroState = makeMacroState();

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.baseFreq = 440;
    this.currentInst = null;
    this.phase = 0;
    this.linearCounterSamples = Infinity;
    this.sampleCount = 0;
    this.linearTicks = 0;
    this.arpEnvMacro = null;
    this.pitchEnvMacro = null;
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.baseFreq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.sampleCount = 0;

    // Parse macros
    this.arpEnvMacro   = parseMacro(instrument.arp_env);
    this.pitchEnvMacro = parseMacro(instrument.pitch_env);
    this.arpEnvState   = makeMacroState();
    this.pitchEnvState = makeMacroState();

    // Linear counter: `linear` field in ticks at 240 Hz; 0 = no counter (infinite duration)
    const linear = instrument.linear !== undefined ? Number(instrument.linear) : 0;
    if (linear > 0) {
      this.linearCounterSamples = Infinity; // computed in render() where sampleRate is known
      this.linearTicks = Math.max(1, Math.min(127, linear));
    } else {
      // linear=0 means no linear counter (sustain indefinitely)
      this.linearCounterSamples = Infinity;
      this.linearTicks = 0;
    }
  }

  noteOff(): void {
    this.active = false;
  }

  /** Update frequency mid-note without resetting phase or linear counter (used by arpeggio). */
  setFrequency(frequency: number): void {
    if (!this.active) return;
    this.freq = frequency;
  }

  applyEnvelope(_frame: number): void {
    if (!this.active) return;

    if (this.arpEnvMacro) {
      const semitones = getMacroValue(this.arpEnvMacro, this.arpEnvState);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
    }

    if (this.pitchEnvMacro) {
      const semitones = getMacroValue(this.pitchEnvMacro, this.pitchEnvState);
      advanceMacro(this.pitchEnvMacro, this.pitchEnvState);
      this.freq = this.baseFreq * Math.pow(2, semitones / 12);
    }

    // Triangle has no hardware envelope; linear counter is handled in render
  }

  // ── Web Audio path ─────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [OscillatorNode, GainNode] using an odd-harmonic PeriodicWave
   * that closely matches the NES 32-step triangle staircase. Since the
   * triangle has no volume envelope, gain is held constant (or silenced
   * when `vol=0` is set on the instrument).
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

    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    // Approximate NES 32-step staircase with an odd-harmonic PeriodicWave
    const pw = createNESTriangleWave(ctx);
    try { osc.setPeriodicWave(pw); } catch (_) { try { osc.type = 'triangle'; } catch (_) {} }

    // Align frequency to NES triangle period table: f = 1,789,773 / (32 × (period + 1))
    let alignedFreq = freq;
    if (freq > 0) {
      const period = Math.round(1789773 / (32 * freq) - 1);
      if (period >= 2 && period <= 2047) alignedFreq = 1789773 / (32 * (period + 1));
    }
    const safeFreq = Math.max(1, alignedFreq);
    try { osc.frequency.setValueAtTime(safeFreq, start); } catch (_) {}
    // _baseFreq is read by the arp effect to determine base pitch before automation
    (osc as any)._baseFreq = safeFreq;

    osc.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    // Frequency macros (arp_env takes priority over pitch_env)
    const arpEnvM  = parseMacro(inst.arp_env);
    const pitchEnvM = parseMacro(inst.pitch_env);
    if (arpEnvM) {
      scheduleArpEnvToFreq(osc.frequency, safeFreq, arpEnvM, start, dur);
    } else if (pitchEnvM) {
      schedulePitchEnvToFreq(osc.frequency, safeFreq, pitchEnvM, start, dur);
    }

    // Triangle has no envelope: constant gain unless vol=0 (software mute)
    const vol = (inst.vol !== undefined && Number(inst.vol) === 0) ? 0 : getNesTriangleWebGain();
    try { gain.gain.setValueAtTime(vol, start); } catch (_) {}
    try {
      gain.gain.setValueAtTime(Math.max(0.0001, vol), start + dur);
      gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}

    try { osc.start(start); } catch (e) { try { osc.start(); } catch (_) {} }
    try { osc.stop(start + dur + 0.02); } catch (_) {}

    return [osc, gain];
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || !this.currentInst) return;

    // Software gate: vol=0 silences the channel
    if (this.currentInst.vol !== undefined && Number(this.currentInst.vol) === 0) return;

    const freq = this.freq;
    if (freq <= 0) return;

    // Set up linear counter (in samples) on first render for this note
    if (this.linearTicks > 0 && this.linearCounterSamples === Infinity) {
      // linear ticks at 240 Hz
      this.linearCounterSamples = Math.floor((this.linearTicks / 240) * sampleRate);
    }

    // Gain: triangle is always at maximum (half scale to mix with other channels)
    const gain = NES_MIX_GAIN.triangle * 15; // 15 = maximum triangle amplitude

    // Phase increment: 32 steps per cycle
    const phaseInc = (freq * 32) / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      // Linear counter gate
      if (this.sampleCount >= this.linearCounterSamples) break;

      const step = Math.floor(this.phase) % 32;
      // Centre waveform around 0 (hardware is 0–15, so subtract 7.5)
      buffer[i] += ((TRIANGLE_WAVE_32[step] - 7.5) / 7.5) * gain;
      this.phase = (this.phase + phaseInc);
      if (this.phase >= 32) this.phase -= 32;
      this.sampleCount++;
    }
  }
}

// ─── Web Audio helpers ────────────────────────────────────────────────────────

/**
 * Build a PeriodicWave that closely approximates the NES 32-step triangle
 * staircase using only odd harmonics with alternating signs.
 *
 * Standard triangle Fourier series (odd harmonics only):
 *   b_n = (8 / (π² × n²)) × (-1)^((n-1)/2)  for odd n
 *
 * This matches the NES hardware waveform closely; any residual staircase
 * artefacts are inaudible at typical NES frequencies (below 2 kHz).
 */
function createNESTriangleWave(ctx: BaseAudioContext): any {
  const size = 256;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  // Only odd harmonics: 1, 3, 5, ...
  for (let k = 0; (2 * k + 1) < size; k++) {
    const n = 2 * k + 1;
    const sign = (k % 2 === 0) ? 1 : -1;
    imag[n] = sign * (8 / (Math.PI * Math.PI * n * n));
  }
  return (ctx as any).createPeriodicWave(real, imag, { disableNormalization: true });
}

export function createTriangleChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  return new NESTriangleBackend();
}
