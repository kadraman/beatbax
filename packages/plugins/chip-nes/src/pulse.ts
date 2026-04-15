/**
 * NES Pulse channel backend (pulse1 and pulse2).
 *
 * Implements `ChipChannelBackend` for NES pulse oscillators.
 * Key features:
 *   - Four duty cycle modes: 12.5%, 25%, 50%, 75% (NES 8-step sequences)
 *   - Volume envelope with period and loop control
 *   - Hardware pitch sweep with muting conditions (period < 8 or target > 2047)
 *   - Constant volume mode when `vol` is specified
 *
 * Dual rendering paths:
 *   - PCM (CLI/headless): `render()` fills a Float32Array sample buffer directly.
 *   - Web Audio (browser): `createPlaybackNodes()` returns [OscillatorNode, GainNode]
 *     with envelope and sweep automation scheduled on AudioParams. This enables
 *     the full effects system (arp, vib, portamento, etc.) in the web-ui, exactly
 *     as the built-in Game Boy pulse channels work.
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { PULSE_PERIOD, pulsePeriodToFreq, noteNameToMidi } from './periodTables.js';
import { NES_MIX_GAIN, NES_WEB_AUDIO_NORM } from './mixer.js';
import {
  parseMacro, makeMacroState, getMacroValue, advanceMacro,
  buildVolEnvGainCurve, scheduleArpEnvToFreq, schedulePitchEnvToFreq,
  DUTY_ENV_INDEX_TO_KEY,
  type ParsedMacro, type MacroState,
} from './macros.js';

// ─── Duty cycle sequences (8-step NES sequences) ─────────────────────────────

/** The four 8-step duty sequences from NES hardware documentation. */
const DUTY_SEQUENCES: Record<string, number[]> = {
  '12.5': [0, 1, 0, 0, 0, 0, 0, 0],
  '12':   [0, 1, 0, 0, 0, 0, 0, 0],
  '25':   [0, 1, 1, 0, 0, 0, 0, 0],
  '50':   [0, 1, 1, 1, 1, 0, 0, 0],
  '75':   [1, 0, 0, 1, 1, 1, 1, 1],
};

function getDutySequence(dutyParam: any): number[] {
  const s = String(dutyParam ?? '50').trim();
  return DUTY_SEQUENCES[s] || DUTY_SEQUENCES['50'];
}

// ─── Envelope parser ──────────────────────────────────────────────────────────

interface NESEnvelope {
  initial: number;      // 0–15 volume at onset
  direction: 'up' | 'down' | 'flat';
  period: number;       // envelope divider period (0–15); 0 = instant/no decay
  loop: boolean;
}

function parseNESEnvelope(inst: InstrumentNode): NESEnvelope {
  // Accept GB-style `env=15,down` or NES-style separate fields
  let initial = 15;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  let period = 0;
  let loop = false;

  if (inst.env) {
    const envStr = String(inst.env);
    const parts = envStr.split(',').map(s => s.trim());
    if (parts.length >= 1) { const v = parseInt(parts[0], 10); initial = Math.max(0, Math.min(15, isNaN(v) ? 15 : v)); }
    if (parts.length >= 2) {
      const dir = parts[1].toLowerCase();
      direction = (dir === 'up' ? 'up' : (dir === 'flat' ? 'flat' : 'down'));
    }
    if (parts.length >= 3) { const v = parseInt(parts[2], 10); period = Math.max(0, Math.min(15, isNaN(v) ? 0 : v)); }
  }

  if (inst.env_period !== undefined) {
    period = Math.max(0, Math.min(15, Number(inst.env_period)));
  }

  if (inst.env_loop !== undefined) {
    loop = Boolean(inst.env_loop);
  }

  if (inst.vol !== undefined && inst.env === undefined) {
    // Constant volume mode — ignore envelope
    initial = Math.max(0, Math.min(15, Number(inst.vol)));
    direction = 'flat';
    period = 0;
  }

  return { initial, direction, period, loop };
}

// ─── Sweep parser ──────────────────────────────────────────────────────────────

interface NESSweep {
  enabled: boolean;
  period: number;   // 1–7 sweep divider
  direction: 'up' | 'down';
  shift: number;    // 0–7 shift count
}

function parseNESSweep(inst: InstrumentNode): NESSweep {
  const enabled = inst.sweep_en === true || inst.sweep_en === 'true';
  const period = Math.max(1, Math.min(7, Number(inst.sweep_period ?? 1)));
  const direction = (String(inst.sweep_dir ?? 'down').toLowerCase() === 'up' ? 'up' : 'down');
  const shift = Math.max(0, Math.min(7, Number(inst.sweep_shift ?? 0)));
  return { enabled, period, direction, shift };
}

// ─── Pulse channel backend ────────────────────────────────────────────────────

export class NESPulseBackend implements ChipChannelBackend {
  private channelType: 'pulse1' | 'pulse2';
  private active: boolean = false;
  private freq: number = 440;
  private baseFreq: number = 440;   // unchanged base for arp_env / pitch_env
  private currentInst: InstrumentNode | null = null;

  // Hardware envelope state
  private envVolume: number = 15;
  private envFrameCounter: number = 0;

  // Sweep state
  private sweepFrameCounter: number = 0;
  private currentPeriod: number = 0;
  private muted: boolean = false;

  // Software macro state (null when macro not present on instrument)
  private volEnvMacro:   ParsedMacro | null = null;
  private dutyEnvMacro:  ParsedMacro | null = null;
  private arpEnvMacro:   ParsedMacro | null = null;
  private pitchEnvMacro: ParsedMacro | null = null;
  private volEnvState:   MacroState = makeMacroState();
  private dutyEnvState:  MacroState = makeMacroState();
  private arpEnvState:   MacroState = makeMacroState();
  private pitchEnvState: MacroState = makeMacroState();
  // Cached duty index: read in applyEnvelope before advancing, used in render()
  private currentDutyIdx: number = 0;

  // Phase accumulator for PCM rendering
  private phase: number = 0;
  private seqStep: number = 0;

  constructor(channelType: 'pulse1' | 'pulse2') {
    this.channelType = channelType;
  }

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.baseFreq = 440;
    this.currentInst = null;
    this.envVolume = 15;
    this.envFrameCounter = 0;
    this.sweepFrameCounter = 0;
    this.currentPeriod = 0;
    this.muted = false;
    this.phase = 0;
    this.seqStep = 0;
    this.volEnvMacro = null;
    this.dutyEnvMacro = null;
    this.arpEnvMacro = null;
    this.pitchEnvMacro = null;
    this.volEnvState = makeMacroState();
    this.dutyEnvState = makeMacroState();
    this.arpEnvState = makeMacroState();
    this.pitchEnvState = makeMacroState();
    this.currentDutyIdx = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.baseFreq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.muted = false;
    this.phase = 0;
    this.seqStep = 0;

    const env = parseNESEnvelope(instrument);
    this.envVolume = env.initial;
    this.envFrameCounter = 0;

    // Parse software macros (null when property absent)
    this.volEnvMacro   = parseMacro(instrument.vol_env);
    this.dutyEnvMacro  = parseMacro(instrument.duty_env);
    this.arpEnvMacro   = parseMacro(instrument.arp_env);
    this.pitchEnvMacro = parseMacro(instrument.pitch_env);
    this.volEnvState   = makeMacroState();
    this.dutyEnvState  = makeMacroState();
    this.arpEnvState   = makeMacroState();
    this.pitchEnvState = makeMacroState();
    // Initialise duty index from first macro value so render() is correct before first applyEnvelope
    this.currentDutyIdx = this.dutyEnvMacro ? getMacroValue(this.dutyEnvMacro, this.dutyEnvState) : 0;

    // Compute period from frequency
    if (frequency > 0) {
      this.currentPeriod = Math.round(1789773 / (16 * frequency) - 1);
    } else {
      this.muted = true;
    }

    // Mute if period < 8 (hardware rule)
    if (this.currentPeriod < 8) this.muted = true;

    this.sweepFrameCounter = 0;
  }

  noteOff(): void {
    this.active = false;
  }

  /** Update frequency mid-note without resetting envelope or phase (used by arpeggio). */
  setFrequency(frequency: number): void {
    if (!this.active) return;
    this.freq = frequency;
    if (frequency > 0) {
      this.currentPeriod = Math.round(1789773 / (16 * frequency) - 1);
      this.muted = this.currentPeriod < 8 || this.currentPeriod > 2047;
    } else {
      this.muted = true;
    }
  }

  applyEnvelope(frame: number): void {
    if (!this.active || !this.currentInst) return;

    // ── Software vol_env macro ────────────────────────────────────────────────
    if (this.volEnvMacro) {
      this.envVolume = getMacroValue(this.volEnvMacro, this.volEnvState);
      advanceMacro(this.volEnvMacro, this.volEnvState);
    } else {
      // Hardware envelope fallback
      const env = parseNESEnvelope(this.currentInst);
      if (env.direction !== 'flat' && env.period >= 0) {
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
    }

    // ── Software duty_env macro ───────────────────────────────────────────────
    // Read THEN advance so render() uses the value for THIS frame, not the next.
    if (this.dutyEnvMacro) {
      this.currentDutyIdx = getMacroValue(this.dutyEnvMacro, this.dutyEnvState);
      advanceMacro(this.dutyEnvMacro, this.dutyEnvState);
    }

    // ── Software arp_env macro ────────────────────────────────────────────────
    if (this.arpEnvMacro) {
      const semitones = getMacroValue(this.arpEnvMacro, this.arpEnvState);
      advanceMacro(this.arpEnvMacro, this.arpEnvState);
      const newFreq = this.baseFreq * Math.pow(2, semitones / 12);
      this.freq = newFreq;
      if (newFreq > 0) {
        this.currentPeriod = Math.round(1789773 / (16 * newFreq) - 1);
        this.muted = this.currentPeriod < 8 || this.currentPeriod > 2047;
      }
    }

    // ── Software pitch_env macro ──────────────────────────────────────────────
    if (this.pitchEnvMacro) {
      const semitones = getMacroValue(this.pitchEnvMacro, this.pitchEnvState);
      advanceMacro(this.pitchEnvMacro, this.pitchEnvState);
      const newFreq = this.baseFreq * Math.pow(2, semitones / 12);
      this.freq = newFreq;
      if (newFreq > 0) {
        this.currentPeriod = Math.round(1789773 / (16 * newFreq) - 1);
        this.muted = this.currentPeriod < 8 || this.currentPeriod > 2047;
      }
    }

    // ── Hardware sweep (only when no pitch macros override freq) ─────────────
    if (!this.arpEnvMacro && !this.pitchEnvMacro && this.currentInst) {
      const sweep = parseNESSweep(this.currentInst);
      if (sweep.enabled && sweep.shift > 0) {
        this.sweepFrameCounter++;
        if (this.sweepFrameCounter >= sweep.period) {
          this.sweepFrameCounter = 0;
          const delta = this.currentPeriod >> sweep.shift;
          let newPeriod: number;
          if (sweep.direction === 'up') {
            newPeriod = this.channelType === 'pulse1'
              ? this.currentPeriod - delta - 1
              : this.currentPeriod - delta;
          } else {
            newPeriod = this.currentPeriod + delta;
          }
          if (newPeriod < 8 || newPeriod > 2047) {
            this.muted = true;
          } else {
            this.currentPeriod = newPeriod;
            this.freq = 1789773 / (16 * (newPeriod + 1));
          }
        }
      }
    }
  }

  render(buffer: Float32Array, sampleRate: number): void {
    if (!this.active || this.muted || !this.currentInst) return;

    // duty_env: use value cached by applyEnvelope() so there's no off-by-one.
    let dutySeq: number[];
    if (this.dutyEnvMacro) {
      dutySeq = getDutySequence(DUTY_ENV_INDEX_TO_KEY[Math.max(0, Math.min(3, this.currentDutyIdx))]);
    } else {
      dutySeq = getDutySequence(this.currentInst.duty);
    }

    const freq = this.freq;
    if (freq <= 0) return;

    // vol_env: when macro present, this.envVolume is already advancing in applyEnvelope
    const env = parseNESEnvelope(this.currentInst);
    const volume = this.volEnvMacro
      ? this.envVolume
      : ((env.direction === 'flat' && env.period === 0 && this.currentInst.vol !== undefined)
          ? Math.max(0, Math.min(15, Number(this.currentInst.vol)))
          : this.envVolume);

    const gain = NES_MIX_GAIN.pulse * volume;
    const phaseInc = (freq * 8) / sampleRate; // 8 steps per cycle

    for (let i = 0; i < buffer.length; i++) {
      const step = Math.floor(this.phase) % 8;
      buffer[i] += (dutySeq[step] ? gain : -gain);
      this.phase = (this.phase + phaseInc);
      if (this.phase >= 8) this.phase -= 8;
    }
  }

  // ── Web Audio path ─────────────────────────────────────────────────────────

  /**
   * Create Web Audio nodes for browser playback.
   * Returns [OscillatorNode, GainNode] with NES duty-cycle PeriodicWave,
   * envelope automation, and (optional) hardware sweep automation on the
   * oscillator frequency. The engine then applies effects (arp, vib, etc.)
   * to the returned nodes via AudioParam automation.
   */
  createPlaybackNodes(
    ctx: BaseAudioContext,
    freq: number,
    start: number,
    dur: number,
    inst: InstrumentNode,
    scheduler: any,
    destination: AudioNode
  ): AudioNode[] | null {
    if (typeof (ctx as any).createOscillator !== 'function') return null;

    // duty_env: use first value for initial PeriodicWave (WebAudio can't change wave dynamically)
    const dutyEnvM = parseMacro(inst.duty_env);
    let dutyRatio: number;
    if (dutyEnvM && dutyEnvM.values.length > 0) {
      const idx = Math.max(0, Math.min(3, dutyEnvM.values[0]));
      const key = DUTY_ENV_INDEX_TO_KEY[idx];
      dutyRatio = parseFloat(key) / 100;
    } else {
      dutyRatio = Number(inst.duty ?? 50) / 100;
    }
    const osc = (ctx as any).createOscillator();
    const gain = (ctx as any).createGain();

    // NES-accurate duty PeriodicWave (Fourier series of a pulse wave)
    const pw = createNESPulseWave(ctx, dutyRatio);
    try { osc.setPeriodicWave(pw); } catch (_) { try { osc.type = 'square'; } catch (_) {} }

    // Align frequency to NES period table: f = 1,789,773 / (16 × (period + 1))
    let alignedFreq = freq;
    if (freq > 0) {
      const period = Math.round(1789773 / (16 * freq) - 1);
      if (period >= 8 && period <= 2047) alignedFreq = 1789773 / (16 * (period + 1));
    }
    const safeFreq = Math.max(1, alignedFreq);
    try { osc.frequency.setValueAtTime(safeFreq, start); } catch (_) {}
    // _baseFreq is read by the arp effect to determine base pitch before automation
    (osc as any)._baseFreq = safeFreq;

    osc.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    // ── Frequency macros (arp_env takes priority over pitch_env) ─────────────
    const arpEnvM  = parseMacro(inst.arp_env);
    const pitchEnvM = parseMacro(inst.pitch_env);
    if (arpEnvM) {
      scheduleArpEnvToFreq(osc.frequency, safeFreq, arpEnvM, start, dur);
    } else if (pitchEnvM) {
      schedulePitchEnvToFreq(osc.frequency, safeFreq, pitchEnvM, start, dur);
    } else {
      // Hardware sweep (only when no pitch macros)
      const sweep = parseNESSweep(inst);
      if (sweep.enabled && sweep.shift > 0 && freq > 0) {
        const initialPeriod = Math.round(1789773 / (16 * freq) - 1);
        applyNESSweepToFreq(osc.frequency, initialPeriod, start, dur, sweep);
      }
    }

    // ── Volume macro or hardware envelope ────────────────────────────────────
    const volEnvM = parseMacro(inst.vol_env);
    if (volEnvM) {
      const curve = buildVolEnvGainCurve(volEnvM, NES_MIX_GAIN.pulse * NES_WEB_AUDIO_NORM, dur);
      try {
        gain.gain.setValueCurveAtTime(curve, start, Math.max(0.001, dur));
      } catch (_) {
        if (curve.length > 0) {
          try { gain.gain.setValueAtTime(curve[0], start); } catch (_) {}
        }
      }
      try {
        gain.gain.setValueAtTime(0.0001, start + dur);
        gain.gain.linearRampToValueAtTime(0.0001, start + dur + 0.005);
      } catch (_) {}
    } else {
      applyNESEnvelopeToGain(gain.gain, parseNESEnvelope(inst), start, dur);
    }

    try { osc.start(start); } catch (e) { try { osc.start(); } catch (_) {} }
    try { osc.stop(start + dur + 0.02); } catch (_) {}

    return [osc, gain];
  }
}

// ─── Web Audio helpers ────────────────────────────────────────────────────────

const NES_FRAME_RATE = 60; // NTSC ~60.1 Hz; close enough for envelope/sweep timing

/**
 * Build a PeriodicWave matching an NES pulse duty cycle.
 * Uses the same Fourier-series approach as the built-in Game Boy pulse channel.
 */
function createNESPulseWave(ctx: BaseAudioContext, dutyRatio: number): any {
  const size = 4096;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  const d = Math.max(0, Math.min(1, dutyRatio));
  for (let n = 1; n < 201; n++) {
    const a = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    imag[n] = Number.isFinite(a) ? a : 0;
  }
  return (ctx as any).createPeriodicWave(real, imag, { disableNormalization: true });
}

/**
 * Schedule NES volume-envelope automation on a GainNode.gain AudioParam.
 * Steps through volume levels at the NES hardware frame rate.
 */
function applyNESEnvelopeToGain(gainParam: any, env: NESEnvelope, start: number, dur: number): void {
  // Apply NES_WEB_AUDIO_NORM so a pulse channel at max volume (15) produces gain ≈ 1.0,
  // matching the Game Boy backends.  The PCM render() path uses raw NES_MIX_GAIN and
  // is unaffected.
  const mixGain = NES_MIX_GAIN.pulse * NES_WEB_AUDIO_NORM;
  const initialGain = env.initial * mixGain;

  // NES hardware: period=0 means fastest decay (one step per 60Hz frame), NOT constant volume.
  // Constant volume is indicated solely by direction === 'flat'.
  if (env.direction === 'flat') {
    try { gainParam.setValueAtTime(initialGain, start); } catch (_) {}
    try {
      gainParam.setValueAtTime(Math.max(0.0001, initialGain), start + dur);
      gainParam.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } catch (_) {}
    return;
  }

  // Build gain curve: one value per envelope step
  const stepInterval = (env.period + 1) / NES_FRAME_RATE;
  const vals: number[] = [];
  let cur = env.initial;
  vals.push(cur * mixGain);
  while (vals.length < 256) {
    if (env.direction === 'down') cur = Math.max(0, cur - 1);
    else cur = Math.min(15, cur + 1);
    vals.push(cur * mixGain);
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

/**
 * Schedule NES hardware pitch-sweep automation on an OscillatorNode.frequency
 * AudioParam. Fires one `setValueAtTime` per sweep step.
 */
function applyNESSweepToFreq(freqParam: any, initialPeriod: number, start: number, dur: number, sweep: NESSweep): void {
  const stepInterval = sweep.period / NES_FRAME_RATE;
  let currentPeriod = initialPeriod;
  const numSteps = Math.floor(dur / stepInterval);
  for (let i = 1; i <= numSteps; i++) {
    const t = start + i * stepInterval;
    const delta = currentPeriod >> sweep.shift;
    // BeatBax uses intuitive musical direction: 'up' = pitch rises (period shrinks),
    // 'down' = pitch falls (period grows). This is opposite to the NES negate flag
    // where negate=1 ("down") subtracts from the period and raises pitch.
    const newPeriod = sweep.direction === 'up' ? currentPeriod - delta : currentPeriod + delta;
    if (newPeriod < 8 || newPeriod > 2047) {
      try { freqParam.setValueAtTime(0, t); } catch (_) {}
      break;
    }
    currentPeriod = newPeriod;
    try { freqParam.setValueAtTime(1789773 / (16 * (currentPeriod + 1)), t); } catch (_) {}
  }
}

export function createPulseChannel(
  _audioContext: BaseAudioContext,
  channelType: 'pulse1' | 'pulse2'
): ChipChannelBackend {
  return new NESPulseBackend(channelType);
}
