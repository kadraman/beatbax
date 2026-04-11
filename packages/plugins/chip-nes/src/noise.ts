/**
 * NES Noise channel backend.
 *
 * Uses pre-generated LFSR buffers (not audio-thread LFSR) for compatibility
 * with both browser WebAudio and Node.js headless environments.
 *
 * Two noise modes:
 *   - `normal`: 15-bit LFSR, feedback from bits 1 and 0 → 32,767-sample period (white noise)
 *   - `loop`:   LFSR with feedback from bits 6 and 0 → 93-sample period (metallic/tonal)
 *
 * Noise period is indexed via NOISE_PERIOD_TABLE (16 values, NTSC rates).
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { NOISE_PERIOD_TABLE, NES_CLOCK } from './periodTables.js';
import { NES_MIX_GAIN } from './mixer.js';

// ─── LFSR buffer generation ───────────────────────────────────────────────────

const NORMAL_LFSR_LENGTH = 32767; // 2^15 - 1
const LOOP_LFSR_LENGTH   = 93;    // empirical loop mode period

function generateNormalLFSR(): Int8Array {
  const buf = new Int8Array(NORMAL_LFSR_LENGTH);
  let lfsr = 1;
  for (let i = 0; i < NORMAL_LFSR_LENGTH; i++) {
    buf[i] = (lfsr & 1) ? 1 : -1;
    const feedback = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
    lfsr = ((lfsr >> 1) | (feedback << 14)) & 0x7FFF;
  }
  return buf;
}

function generateLoopLFSR(): Int8Array {
  const buf = new Int8Array(LOOP_LFSR_LENGTH);
  let lfsr = 1;
  for (let i = 0; i < LOOP_LFSR_LENGTH; i++) {
    buf[i] = (lfsr & 1) ? 1 : -1;
    const feedback = ((lfsr >> 0) ^ (lfsr >> 6)) & 1;
    lfsr = ((lfsr >> 1) | (feedback << 14)) & 0x7FFF;
  }
  return buf;
}

// Pre-generated at module load time (negligible overhead)
const NORMAL_LFSR_BUF = generateNormalLFSR();
const LOOP_LFSR_BUF   = generateLoopLFSR();

// ─── Envelope parser ──────────────────────────────────────────────────────────

interface NESNoiseEnvelope {
  initial: number;
  direction: 'up' | 'down' | 'flat';
  period: number;
  loop: boolean;
}

function parseNoiseEnvelope(inst: InstrumentNode): NESNoiseEnvelope {
  let initial = 15;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  let period = 0;
  let loop = false;

  if (inst.env) {
    const parts = String(inst.env).split(',').map(s => s.trim());
    if (parts.length >= 1) { const v = parseInt(parts[0], 10); initial = Math.max(0, Math.min(15, isNaN(v) ? 15 : v)); }
    if (parts.length >= 2) {
      const dir = parts[1].toLowerCase();
      direction = dir === 'up' ? 'up' : dir === 'flat' ? 'flat' : 'down';
    }
    if (parts.length >= 3) { const v = parseInt(parts[2], 10); period = Math.max(0, Math.min(15, isNaN(v) ? 0 : v)); }
  }

  if (inst.env_period !== undefined) period = Math.max(0, Math.min(15, Number(inst.env_period)));
  if (inst.env_loop !== undefined) loop = Boolean(inst.env_loop);

  if (inst.vol !== undefined && inst.env === undefined) {
    initial = Math.max(0, Math.min(15, Number(inst.vol)));
    direction = 'flat';
    period = 0;
  }

  return { initial, direction, period, loop };
}

// ─── Noise backend ────────────────────────────────────────────────────────────

export class NESNoiseBackend implements ChipChannelBackend {
  private active: boolean = false;
  private currentInst: InstrumentNode | null = null;
  private envVolume: number = 15;
  private envFrameCounter: number = 0;
  private lfsrBuf: Int8Array = NORMAL_LFSR_BUF;
  private lfsrHz: number = 0;
  private phase: number = 0;
  private lfsrIndex: number = 0;

  reset(): void {
    this.active = false;
    this.currentInst = null;
    this.envVolume = 15;
    this.envFrameCounter = 0;
    this.phase = 0;
    this.lfsrIndex = 0;
  }

  noteOn(_frequency: number, instrument: InstrumentNode): void {
    this.currentInst = instrument;
    this.active = true;
    this.phase = 0;
    this.lfsrIndex = 0;

    const env = parseNoiseEnvelope(instrument);
    this.envVolume = env.initial;
    this.envFrameCounter = 0;

    // Select LFSR mode
    const mode = (instrument.noise_mode || 'normal').toString().toLowerCase();
    this.lfsrBuf = (mode === 'loop') ? LOOP_LFSR_BUF : NORMAL_LFSR_BUF;

    // Compute LFSR clock rate from noise_period index
    const periodIdx = Math.max(0, Math.min(15, Number(instrument.noise_period ?? 8)));
    const timerPeriod = NOISE_PERIOD_TABLE[periodIdx];
    // NTSC CPU clock / (timer period * 2) = LFSR step rate
    this.lfsrHz = NES_CLOCK / (timerPeriod * 2);
  }

  noteOff(): void {
    this.active = false;
  }

  applyEnvelope(_frame: number): void {
    if (!this.active || !this.currentInst) return;
    const env = parseNoiseEnvelope(this.currentInst);
    if (env.direction === 'flat' || env.period === 0) return;

    this.envFrameCounter++;
    const divider = env.period + 1;
    if (this.envFrameCounter >= divider) {
      this.envFrameCounter = 0;
      if (env.direction === 'down') {
        if (this.envVolume > 0) this.envVolume--;
        else if (env.loop) this.envVolume = 15;
      } else {
        if (this.envVolume < 15) this.envVolume++;
        else if (env.loop) this.envVolume = 0;
      }
    }
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || !this.currentInst) return;

    const env = parseNoiseEnvelope(this.currentInst);
    const volume = (env.direction === 'flat' && env.period === 0 && this.currentInst.vol !== undefined)
      ? Math.max(0, Math.min(15, Number(this.currentInst.vol)))
      : this.envVolume;

    const gain = NES_MIX_GAIN.noise * volume;
    if (gain === 0) return;

    const lfsrLen = this.lfsrBuf.length;
    const phaseInc = this.lfsrHz / sampleRate;

    for (let i = 0; i < buffer.length; i++) {
      buffer[i] += this.lfsrBuf[this.lfsrIndex] * gain;
      this.phase += phaseInc;
      const steps = Math.floor(this.phase);
      if (steps > 0) {
        this.lfsrIndex = (this.lfsrIndex + steps) % lfsrLen;
        this.phase -= steps;
      }
    }
  }

  // ── Web Audio path ──────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [BufferSourceNode, GainNode] with the LFSR noise pre-rendered into
   * an AudioBuffer at the context sample rate, plus NES envelope automation.
   * Each percussion hit gets its own independent AudioBuffer so multiple
   * simultaneous triggers (kick, snare, hihat) don't overwrite each other.
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

    const periodIdx = Math.max(0, Math.min(15, Number(inst.noise_period ?? 8)));
    const timerPeriod = NOISE_PERIOD_TABLE[periodIdx];
    const lfsrHz = NES_CLOCK / (timerPeriod * 2);

    const mode = (inst.noise_mode || 'normal').toString().toLowerCase();
    const srcBuf = (mode === 'loop') ? LOOP_LFSR_BUF : NORMAL_LFSR_BUF;

    // Build upsampled LFSR buffer limited to note duration + tail
    const sampleRate = ctx.sampleRate;
    const totalSamples = Math.ceil((dur + 0.05) * sampleRate);
    const abuf = (ctx as any).createBuffer(1, totalSamples, sampleRate);
    const data = abuf.getChannelData(0);
    const phaseInc = lfsrHz / sampleRate;
    let phase = 0;
    let lfsrIdx = 0;
    const lfsrLen = srcBuf.length;
    for (let i = 0; i < totalSamples; i++) {
      data[i] = srcBuf[lfsrIdx];
      phase += phaseInc;
      const steps = Math.floor(phase);
      if (steps > 0) {
        lfsrIdx = (lfsrIdx + steps) % lfsrLen;
        phase -= steps;
      }
    }

    const source = (ctx as any).createBufferSource();
    source.buffer = abuf;

    const gainNode = (ctx as any).createGain();
    applyNESNoiseEnvelopeToGain(gainNode.gain, parseNoiseEnvelope(inst), start, dur);

    source.connect(gainNode);
    gainNode.connect(destination || (ctx as any).destination);

    try { source.start(start); } catch (e) { try { source.start(); } catch (_) {} }
    try { source.stop(start + dur + 0.05); } catch (_) {}

    return [source, gainNode];
  }
}

// ─── Web Audio envelope helper ────────────────────────────────────────────────

const NES_NOISE_FRAME_RATE = 60;

function applyNESNoiseEnvelopeToGain(
  gainParam: any,
  env: NESNoiseEnvelope,
  start: number,
  dur: number
): void {
  const mixGain = NES_MIX_GAIN.noise;
  const initialGain = (env.initial / 15) * mixGain;

  if (env.direction === 'flat' || env.period === 0) {
    try { gainParam.setValueAtTime(initialGain, start); } catch (_) {}
    try {
      gainParam.setValueAtTime(Math.max(0.0001, initialGain), start + dur);
      gainParam.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}
    return;
  }

  const stepInterval = (env.period + 1) / NES_NOISE_FRAME_RATE;
  const vals: number[] = [];
  let cur = env.initial;
  vals.push((cur / 15) * mixGain);
  while (vals.length < 256) {
    if (env.direction === 'down') cur = Math.max(0, cur - 1);
    else cur = Math.min(15, cur + 1);
    vals.push((cur / 15) * mixGain);
    if (env.loop) {
      if (env.direction === 'down' && cur === 0) cur = 15;
      else if (env.direction === 'up' && cur === 15) cur = 0;
    } else {
      if (cur === 0 || cur === 15) break;
    }
  }

  const curve = new Float32Array(vals);
  const curveDuration = (vals.length - 1) * stepInterval;
  try {
    gainParam.setValueCurveAtTime(curve, start, Math.min(curveDuration, dur > 0 ? dur : curveDuration));
  } catch (_) {
    try { gainParam.setValueAtTime(vals[0], start); } catch (_) {}
  }
  try {
    gainParam.setValueAtTime(0.0001, start + dur);
    gainParam.linearRampToValueAtTime(0.0001, start + dur + 0.005);
  } catch (_) {}
}

export function createNoiseChannel(_audioContext: BaseAudioContext): ChipChannelBackend {
  return new NESNoiseBackend();
}
