/**
 * SMS SN76489 Noise channel backend.
 *
 * Implements `ChipChannelBackend` for SMS PSG noise generator.
 *
 * Key features:
 *   - 15-bit LFSR (Linear Feedback Shift Register) in white noise mode
 *   - 93-sample period in periodic (loop/short) noise mode
 *   - 4-bit noise period/divisor selection (0-2 = fixed, 3 = tone3-derived)
 *   - Volume via 4-bit attenuation (0-15, 0=loudest, 15=silent)
 *   - All articulation is software-driven (no hardware envelope)
 *
 * The SN76489 noise generator uses a strategy similar to the NES:
 * pre-generated LFSR buffers for compatibility with both browser WebAudio
 * and Node.js headless environments.
 *
 * Note: The SN76489 does not have separate noise period tables like the NES.
 * Instead, it has a noise clock divider (0-2) and can also use Tone 3's period.
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { SMS_MIX_GAIN, getSmsWebAudioNorm, ggPanToGains } from './mixer.js';
import { SMS_CLOCK, freqToPeriod, NOISE_RATE_DIVIDERS, resolveNoiseRateDivisor } from './periodTables.js';
import { smsCoordinator } from './scheduler.js';
import {
  parseMacro, makeMacroState, getMacroValue, advanceMacro,
  buildVolEnvGainCurve,
  type ParsedMacro, type MacroState,
} from './macros.js';

// ─── LFSR buffer generation ─────────────────────────────────────────────────

/**
 * White noise mode: 15-bit LFSR with feedback from bits 0 and 1.
 * Period: 32767 samples (2^15 - 1)
 */
function generateWhiteNoiseLFSR(): Int8Array {
  const buf = new Int8Array(32767);
  let lfsr = 1; // Start with non-zero value

  for (let i = 0; i < buf.length; i++) {
    // Output bit 0: 1 = positive, 0 = negative
    buf[i] = (lfsr & 1) ? 1 : -1;

    // Feedback: XOR of bits 0 and 1 (white noise mode)
    // SN76489 uses: feedback = (lfsr & 1) ^ ((lfsr >> 1) & 1)
    const feedback = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;

    // Shift right and insert feedback at bit 14 (15-bit LFSR)
    lfsr = ((lfsr >> 1) | (feedback << 14)) & 0x7FFF;
  }

  return buf;
}

/**
 * Periodic noise mode: feedback from bits 0 and 6.
 * Period: 93 samples (empirically determined)
 */
function generatePeriodicNoiseLFSR(): Int8Array {
  const buf = new Int8Array(93);
  let lfsr = 1;

  for (let i = 0; i < buf.length; i++) {
    buf[i] = (lfsr & 1) ? 1 : -1;

    // Feedback: XOR of bits 0 and 6 (periodic mode)
    const feedback = ((lfsr >> 0) ^ (lfsr >> 6)) & 1;

    lfsr = ((lfsr >> 1) | (feedback << 14)) & 0x7FFF;
  }

  return buf;
}

// Pre-generated at module load time
const WHITE_NOISE_LFSR_BUF = generateWhiteNoiseLFSR();
const PERIODIC_NOISE_LFSR_BUF = generatePeriodicNoiseLFSR();
const SAFE_NOISE_DIVISOR_FALLBACK = NOISE_RATE_DIVIDERS[2];

// ─── Noise channel backend ────────────────────────────────────────────────────

/**
 * SMS Noise channel backend.
 */
export class SMSNoiseBackend implements ChipChannelBackend {
  private active: boolean = false;
  private currentInst: InstrumentNode | null = null;
  private attenuation: number = 15; // Default: silent (4-bit attenuation: 0-15)

  // LFSR state
  private lfsrBuf: Int8Array = WHITE_NOISE_LFSR_BUF;
  private lfsrHz: number = 0; // LFSR clock rate in Hz
  private phase: number = 0;
  private lfsrIndex: number = 0;

  // Noise mode and rate
  private noiseMode: 'white' | 'periodic' = 'white';
  private noiseRate: number | 'tone3' = 2; // Default rate
  private tone3Period: number = 0; // For when noise_rate = tone3

  // Software macro state
  private volEnvMacro:   ParsedMacro | null = null;
  private volEnvState:   MacroState = makeMacroState();
  private noiseRateEnvMacro: ParsedMacro | null = null;
  private noiseRateEnvState: MacroState = makeMacroState();

  // Frame counter
  private frameCounter: number = 0;

  reset(): void {
    this.active = false;
    this.currentInst = null;
    this.attenuation = 15;
    this.phase = 0;
    this.lfsrIndex = 0;
    this.lfsrHz = 0;
    this.noiseMode = 'white';
    this.noiseRate = 2;
    this.tone3Period = 0;
    this.frameCounter = 0;
    this.volEnvMacro = null;
    this.volEnvState = makeMacroState();
    this.noiseRateEnvMacro = null;
    this.noiseRateEnvState = makeMacroState();
  }

  noteOn(_frequency: number, instrument: InstrumentNode): void {
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.lfsrIndex = 0;
    this.frameCounter = 0;

    // Parse volume
    let initialAttenuation = 15;
    if (instrument.vol !== undefined) {
      const vol = Math.max(0, Math.min(15, Number(instrument.vol)));
      // SMS uses attenuation semantics directly: 0=loudest, 15=silent
      initialAttenuation = vol;
    } else if (instrument.vol_env) {
      const volEnv = parseMacro(instrument.vol_env);
      if (volEnv && volEnv.values.length > 0) {
        const firstVol = Math.max(0, Math.min(15, volEnv.values[0]));
        initialAttenuation = firstVol;
      }
    }
    this.attenuation = initialAttenuation;

    // Parse noise mode
    const mode = (typeof instrument.noise_mode === 'string' ? instrument.noise_mode.toLowerCase() : undefined);
    this.noiseMode = (mode === 'periodic' || mode === 'white') ? mode as 'white' | 'periodic' : 'white';
    this.lfsrBuf = this.noiseMode === 'periodic' ? PERIODIC_NOISE_LFSR_BUF : WHITE_NOISE_LFSR_BUF;

    // Parse noise rate into canonical backend representation
    this.noiseRate = this.normalizeNoiseRate(
      instrument.noise_rate !== undefined ? instrument.noise_rate : 2
    );

    // Parse software macros
    this.volEnvMacro = parseMacro(instrument.vol_env);
    this.volEnvState = makeMacroState();
    this.noiseRateEnvMacro = parseMacro(instrument.noise_rate_env);
    this.noiseRateEnvState = makeMacroState();

    // Calculate LFSR clock rate
    this.updateLFSRRate();
  }

  noteOff(): void {
    this.active = false;
  }

  setFrequency(_frequency: number): void {
    // For v1, noise frequency is controlled by noise_rate, not note frequency
    // The note frequency parameter is ignored for noise channels
    // However, we need to update tone3Period if this noise is slaved to tone3
    if (this.noiseRate === 'tone3' || this.noiseRate === 3) {
      // Would need access to Tone3's period - this is handled at the plugin level
      this.updateLFSRRate();
    }
  }

  /**
   * Update the tone3Period reference.
   * Called by the plugin when Tone3's period changes.
   */
  updateTone3Period(period: number): void {
    this.tone3Period = period;
    if (this.noiseRate === 'tone3' || this.noiseRate === 3) {
      this.updateLFSRRate();
    }
  }

  /**
   * Set the noise rate directly (for effects).
   * @param rate - Noise rate (0, 1, 2, or 3 for tone3)
   */
  setNoiseRate(rate: number | 'tone3'): void {
    this.noiseRate = this.normalizeNoiseRate(rate);
    this.updateLFSRRate();
  }

  /** Get the current normalized noise rate state. */
  getNoiseRate(): number | 'tone3' {
    return this.noiseRate;
  }

  /**
   * Normalize noise_rate inputs so backend state is always number or 'tone3'.
   */
  private normalizeNoiseRate(rawRate: unknown): number | 'tone3' {
    if (typeof rawRate === 'string') {
      if (rawRate.toLowerCase() === 'tone3') return 'tone3';
      const parsed = Number(rawRate);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(3, Math.round(parsed)));
      }
      return 2;
    }

    if (typeof rawRate === 'number' && Number.isFinite(rawRate)) {
      return Math.max(0, Math.min(3, Math.round(rawRate)));
    }

    return 2;
  }

  /**
   * Resolve Tone3 period for noise sync, preferring locally pushed updates and
   * falling back to the coordinator's current Tone3 period when available.
   */
  private resolveTone3Period(): number {
    if (this.tone3Period > 0) return this.tone3Period;

    const coordinatorPeriod = smsCoordinator.getTone3Period();
    if (coordinatorPeriod > 0) {
      this.tone3Period = coordinatorPeriod;
      return coordinatorPeriod;
    }

    return 0;
  }

  /**
   * Clamp divisor to a safe positive finite value before division.
   */
  private ensureSafeDivisor(divisor: number): number {
    return Number.isFinite(divisor) && divisor > 0
      ? divisor
      : SAFE_NOISE_DIVISOR_FALLBACK;
  }

  private updateLFSRRate(): void {
    if (!this.currentInst) return;

    const tone3Period = this.resolveTone3Period();

    const resolvedRate = typeof this.noiseRate === 'number'
      ? this.noiseRate
      : (this.noiseRate === 'tone3' ? tone3Period : 2);

    const divisor = resolveNoiseRateDivisor(resolvedRate, tone3Period);
    const safeTone3Divisor = this.ensureSafeDivisor(divisor);

    // LFSR clock = chip clock / divisor
    // For rate 0-2: divisor is already the actual divisor value
    // For rate 3 (tone3): divisor is the period value itself
    const actualDivisor = typeof resolvedRate === 'number' && (resolvedRate === 0 || resolvedRate === 1 || resolvedRate === 2)
      ? NOISE_RATE_DIVIDERS[resolvedRate]
      : safeTone3Divisor;

    this.lfsrHz = SMS_CLOCK / actualDivisor;
  }

  applyEnvelope(_frame: number): void {
    if (!this.active || !this.currentInst) return;

    this.frameCounter++;

    // ── Software vol_env macro ────────────────────────────────────────────────
    if (this.volEnvMacro) {
      const vol = getMacroValue(this.volEnvMacro, this.volEnvState);
      this.attenuation = Math.max(0, Math.min(15, Math.round(vol)));
      advanceMacro(this.volEnvMacro, this.volEnvState);
    }

    // ── Software noise_rate_env macro ────────────────────────────────────────
    if (this.noiseRateEnvMacro) {
      const newRate = getMacroValue(this.noiseRateEnvMacro, this.noiseRateEnvState);
      // Clamp to 0-3
      this.noiseRate = Math.max(0, Math.min(3, Math.round(newRate)));
      this.updateLFSRRate();
      advanceMacro(this.noiseRateEnvMacro, this.noiseRateEnvState);
    }
  }

  render(buffer: Float32Array, sampleRate: number, channelPan?: string): void {
    if (!this.active || !this.currentInst) return;

    const gain = SMS_MIX_GAIN.noise * (1.0 - (this.attenuation / 15));
    if (gain === 0) return;

    const lfsrLen = this.lfsrBuf.length;
    const phaseInc = this.lfsrHz / sampleRate;

    // Apply stereo panning if channelPan is provided
    const [leftGain, rightGain] = channelPan ? ggPanToGains(channelPan) : [1.0, 1.0];
    const effectiveGain = gain * ((leftGain + rightGain) / 2); // Average for mono buffer

    for (let i = 0; i < buffer.length; i++) {
      buffer[i] += this.lfsrBuf[this.lfsrIndex] * effectiveGain;
      this.phase += phaseInc;
      const steps = Math.floor(this.phase);
      if (steps > 0) {
        this.lfsrIndex = (this.lfsrIndex + steps) % lfsrLen;
        this.phase -= steps;
      }
    }
  }

  // ── Web Audio path ────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [AudioBufferSourceNode, GainNode] with pre-rendered noise buffer.
   */
  createPlaybackNodes(
    ctx: BaseAudioContext,
    _freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    _scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null {
    if (typeof (ctx as any).createBuffer !== 'function') return null;

    const tone3Period = this.resolveTone3Period();

    // Resolve noise parameters from instrument
    const mode = (inst.noise_mode as string | undefined)?.toLowerCase() || 'white';
    const srcBuf = mode === 'periodic' ? PERIODIC_NOISE_LFSR_BUF : WHITE_NOISE_LFSR_BUF;

    // Calculate initial noise rate and optional per-frame noise_rate_env timeline.
    const baseRate = this.normalizeNoiseRate(
      inst.noise_rate !== undefined ? inst.noise_rate : 2
    );
    const noiseRateEnvM = parseMacro(inst.noise_rate_env);
    const noiseRateEnvState = makeMacroState();

    const resolveLfsrHz = (rateValue: number | 'tone3'): number => {
      const resolvedRate = rateValue === 'tone3' ? 3 : rateValue;
      const divisor = resolveNoiseRateDivisor(resolvedRate, tone3Period);
      const safeTone3Divisor = this.ensureSafeDivisor(divisor);
      const actualDivisor = (resolvedRate === 0 || resolvedRate === 1 || resolvedRate === 2)
        ? NOISE_RATE_DIVIDERS[resolvedRate]
        : safeTone3Divisor;
      return SMS_CLOCK / actualDivisor;
    };

    let currentRate: number | 'tone3' = baseRate;
    if (noiseRateEnvM && noiseRateEnvM.values.length > 0) {
      const envRate = Math.max(0, Math.min(3, Math.round(getMacroValue(noiseRateEnvM, noiseRateEnvState))));
      currentRate = envRate;
    }

    // Build upsampled LFSR buffer for the note duration
    const sampleRate = ctx.sampleRate;

    // For tone3 sync, use a shorter buffer to be more responsive to changes.
    // Also shorten when noise_rate_env can switch into rate 3.
    const envUsesTone3 = !!(noiseRateEnvM && noiseRateEnvM.values.some(v => Math.round(v) === 3));
    const isTone3Sync = baseRate === 'tone3' || baseRate === 3 || envUsesTone3;
    const bufferDuration = isTone3Sync ? Math.min(dur, 0.1) : dur + 0.05; // Max 100ms for tone3 sync
    const totalSamples = Math.ceil(bufferDuration * sampleRate);

    const abuf = (ctx as any).createBuffer(1, totalSamples, sampleRate);
    const data = abuf.getChannelData(0);
    let phaseInc = resolveLfsrHz(currentRate) / sampleRate;
    let phase = 0;
    let lfsrIdx = 0;
    const lfsrLen = srcBuf.length;

    // Advance noise_rate_env at 60 Hz to match software macro behavior.
    const frameSamples = Math.max(1, Math.round(sampleRate / 60));
    let samplesUntilNextFrame = frameSamples;

    for (let i = 0; i < totalSamples; i++) {
      data[i] = srcBuf[lfsrIdx];
      phase += phaseInc;
      const steps = Math.floor(phase);
      if (steps > 0) {
        lfsrIdx = (lfsrIdx + steps) % lfsrLen;
        phase -= steps;
      }

      if (noiseRateEnvM) {
        samplesUntilNextFrame--;
        if (samplesUntilNextFrame <= 0) {
          advanceMacro(noiseRateEnvM, noiseRateEnvState);
          const nextRate = Math.max(0, Math.min(3, Math.round(getMacroValue(noiseRateEnvM, noiseRateEnvState))));
          currentRate = nextRate;
          phaseInc = resolveLfsrHz(currentRate) / sampleRate;
          samplesUntilNextFrame = frameSamples;
        }
      }
    }

    const source = (ctx as any).createBufferSource();
    source.buffer = abuf;

    // Enable looping for tone3 sync to make it more responsive
    if (isTone3Sync) {
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = totalSamples / sampleRate; // Loop duration in seconds
    }

    const gainNode = (ctx as any).createGain();
    const webNorm = getSmsWebAudioNorm();

    // Apply volume envelope or constant volume
    const volEnvM = parseMacro(inst.vol_env);
    if (volEnvM) {
      const curve = buildVolEnvGainCurve(volEnvM, SMS_MIX_GAIN.noise * webNorm, dur);
      try {
        gainNode.gain.setValueCurveAtTime(curve, start, Math.max(0.001, dur));
      } catch (_) {
        if (curve.length > 0) {
          try { gainNode.gain.setValueAtTime(curve[0], start); } catch (_) {}
        }
      }
    } else if (inst.vol !== undefined) {
      const vol = Math.max(0, Math.min(15, Number(inst.vol)));
      const att = vol;
      const gainVal = SMS_MIX_GAIN.noise * (1.0 - (att / 15)) * webNorm;
      try { gainNode.gain.setValueAtTime(gainVal, start); } catch (_) {}
    } else {
      const gainVal = SMS_MIX_GAIN.noise * (1.0 - (this.attenuation / 15)) * webNorm;
      try { gainNode.gain.setValueAtTime(gainVal, start); } catch (_) {}
    }

    // Fade out
    try {
      gainNode.gain.setValueAtTime(0.0001, start + dur);
      gainNode.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}

    source.connect(gainNode);
    gainNode.connect(destination || (ctx as any).destination);

    try { source.start(start); } catch (e) { try { source.start(); } catch (_) {} }
    try { source.stop(start + dur + 0.05); } catch (_) {}

    return [source, gainNode];
  }
}

/**
 * Create the noise channel backend.
 */
export function createNoiseChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  const backend = new SMSNoiseBackend();
  smsCoordinator.registerNoiseChannel(backend);
  return backend;
}
