/**
 * NES Pulse channel backend (pulse1 and pulse2).
 *
 * Implements `ChipChannelBackend` for NES pulse oscillators.
 * Key features:
 *   - Four duty cycle modes: 12.5%, 25%, 50%, 75% (NES 8-step sequences)
 *   - Volume envelope with period and loop control
 *   - Hardware pitch sweep with muting conditions (period < 8 or target > 2047)
 *   - Constant volume mode when `vol` is specified
 */
import type { ChipChannelBackend } from '@beatbax/engine';
import type { InstrumentNode } from '@beatbax/engine';
import { PULSE_PERIOD, pulsePeriodToFreq, noteNameToMidi } from './periodTables.js';
import { NES_MIX_GAIN } from './mixer.js';

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
    if (parts.length >= 1) initial = Math.max(0, Math.min(15, parseInt(parts[0], 10) || 15));
    if (parts.length >= 2) {
      const dir = parts[1].toLowerCase();
      direction = (dir === 'up' ? 'up' : (dir === 'flat' ? 'flat' : 'down'));
    }
    if (parts.length >= 3) period = Math.max(0, Math.min(15, parseInt(parts[2], 10) || 0));
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
  private currentInst: InstrumentNode | null = null;

  // Envelope state
  private envVolume: number = 15;
  private envFrameCounter: number = 0;

  // Sweep state
  private sweepFrameCounter: number = 0;
  private currentPeriod: number = 0;
  private muted: boolean = false;

  // Phase accumulator for PCM rendering
  private phase: number = 0;
  private seqStep: number = 0;

  constructor(channelType: 'pulse1' | 'pulse2') {
    this.channelType = channelType;
  }

  reset(): void {
    this.active = false;
    this.freq = 440;
    this.currentInst = null;
    this.envVolume = 15;
    this.envFrameCounter = 0;
    this.sweepFrameCounter = 0;
    this.currentPeriod = 0;
    this.muted = false;
    this.phase = 0;
    this.seqStep = 0;
  }

  noteOn(frequency: number, instrument: InstrumentNode): void {
    this.freq = frequency;
    this.currentInst = instrument;
    this.active = true;
    this.muted = false;
    this.phase = 0;
    this.seqStep = 0;

    const env = parseNESEnvelope(instrument);
    this.envVolume = env.initial;
    this.envFrameCounter = 0;

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

  applyEnvelope(frame: number): void {
    if (!this.active || !this.currentInst) return;
    const env = parseNESEnvelope(this.currentInst);
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

    // Apply sweep if enabled
    if (this.currentInst) {
      const sweep = parseNESSweep(this.currentInst);
      if (sweep.enabled && sweep.shift > 0) {
        this.sweepFrameCounter++;
        if (this.sweepFrameCounter >= sweep.period) {
          this.sweepFrameCounter = 0;
          const delta = this.currentPeriod >> sweep.shift;
          let newPeriod: number;
          if (sweep.direction === 'up') {
            // Pulse 1: negate uses one's complement; Pulse 2: two's complement
            // Both produce similar results in practice
            newPeriod = this.currentPeriod - delta;
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

    const dutySeq = getDutySequence(this.currentInst.duty);
    const freq = this.freq;
    if (freq <= 0) return;

    const env = parseNESEnvelope(this.currentInst);
    const volume = (env.direction === 'flat' && env.period === 0 && this.currentInst.vol !== undefined)
      ? Math.max(0, Math.min(15, Number(this.currentInst.vol)))
      : this.envVolume;

    const gain = NES_MIX_GAIN.pulse * volume;
    const phaseInc = (freq * 8) / sampleRate; // 8 steps per cycle

    for (let i = 0; i < buffer.length; i++) {
      const step = Math.floor(this.phase) % 8;
      buffer[i] += (dutySeq[step] ? gain : -gain);
      this.phase = (this.phase + phaseInc);
      if (this.phase >= 8) this.phase -= 8;
    }
  }
}

export function createPulseChannel(
  _audioContext: BaseAudioContext,
  channelType: 'pulse1' | 'pulse2'
): ChipChannelBackend {
  return new NESPulseBackend(channelType);
}
