/**
 * AY-3-8912 shared chip simulator.
 *
 * Models the complete register state (R0–R15) for one AY chip shared across
 * a song session. Tone, noise, and envelope generators are advanced in lock-step
 * at 50 Hz tick rate.
 *
 * Key hardware facts:
 *  - Three independent tone generators (A/B/C), each with a 12-bit period
 *  - One 5-bit noise period register (R6), shared by all channels
 *  - One 17-bit LFSR noise source (not three separate LFSRs)
 *  - One hardware envelope generator (R11–R13), shared by all channels
 *  - R7 (mixer): per-channel tone/noise enable bits (active-low)
 *  - R8–R10: per-channel amplitude — 0=silent, 15=loudest, bit 4=envelope mode
 */

import {
  AY_ENVELOPE_CLOCKS_PER_STEP,
  createEnvelopeState,
  stepEnvelope,
  getEnvelopeLevel,
  type EnvelopeGeneratorState,
} from './envelope-generator.js';

/** Complete R0–R15 register file. */
export interface AYRegisters {
  r: Uint8Array; // [16] indexed 0–15
}

/** Output amplitudes for all three channels (0–15 each). */
export interface AYOutputState {
  levelA: number;
  levelB: number;
  levelC: number;
}

export class AyChipSimulator {
  /** Raw register values R0–R15. */
  readonly regs: Uint8Array = new Uint8Array(16);

  // ── Tone generators ────────────────────────────────────────────────────────

  /** Tone period counters for A/B/C (counts down from period). */
  private toneCounter: [number, number, number] = [0, 0, 0];
  /** Current output bit for A/B/C tone generators (0 or 1). */
  private toneBit: [number, number, number] = [0, 0, 0];

  // ── Noise generator ────────────────────────────────────────────────────────

  /** 17-bit LFSR state. Initial seed = 1 per datasheet. */
  private noiseLfsr: number = 1;
  /** Noise period counter. */
  private noiseCounter: number = 0;
  /** Current noise output bit. */
  private noiseBit: number = 0;

  // ── Envelope generator ─────────────────────────────────────────────────────

  private envelopeState: EnvelopeGeneratorState = createEnvelopeState(0);
  /** Envelope period counter (steps at period × 256 clock ticks). */
  private envelopeCounter: number = 0;

  /** Reset all state to power-on defaults. */
  reset(): void {
    this.regs.fill(0);
    this.toneCounter = [0, 0, 0];
    this.toneBit = [0, 0, 0];
    this.noiseLfsr = 1;
    this.noiseCounter = 0;
    this.noiseBit = 0;
    this.envelopeCounter = 0;
    this.envelopeState = createEnvelopeState(0);
  }

  /**
   * Write a value to a register.
   * Automatically masks to the hardware-valid bit width.
   */
  writeRegister(reg: number, value: number): void {
    if (reg < 0 || reg > 15) return;
    switch (reg) {
      case 0: this.regs[0] = value & 0xff; break;       // Tone A low 8 bits
      case 1: this.regs[1] = value & 0x0f; break;       // Tone A high 4 bits
      case 2: this.regs[2] = value & 0xff; break;       // Tone B low
      case 3: this.regs[3] = value & 0x0f; break;       // Tone B high
      case 4: this.regs[4] = value & 0xff; break;       // Tone C low
      case 5: this.regs[5] = value & 0x0f; break;       // Tone C high
      case 6: this.regs[6] = value & 0x1f; break;       // Noise period 5-bit
      case 7: this.regs[7] = value & 0x3f; break;       // Mixer (6 active bits)
      case 8: this.regs[8] = value & 0x1f; break;       // Amplitude A (5 bits: bit4=env)
      case 9: this.regs[9] = value & 0x1f; break;       // Amplitude B
      case 10: this.regs[10] = value & 0x1f; break;     // Amplitude C
      case 11: this.regs[11] = value & 0xff; break;     // Envelope period low
      case 12: this.regs[12] = value & 0xff; break;     // Envelope period high
      case 13:                                           // Envelope shape — write resets generator
        this.regs[13] = value & 0x0f;
        this.envelopeState = createEnvelopeState(this.regs[13]);
        this.envelopeCounter = 0;
        break;
      default:
        this.regs[reg] = value & 0xff;
    }
  }

  /** Read raw register value. */
  readRegister(reg: number): number {
    return reg >= 0 && reg <= 15 ? this.regs[reg] : 0;
  }

  /**
   * Advance all generators by `clockTicks` AY clock cycles.
   *
   * Tone generators toggle every (period) half-cycles.
   * Noise generator clocks every (noise_period × 2) half-cycles — approximated.
   * Envelope counter counts at 256 clock ticks per step.
   *
   * @param clockTicks - Number of AY clock ticks to advance
   */
  step(clockTicks: number): void {
    for (let i = 0; i < clockTicks; i++) {
      // ── Tone generators ──────────────────────────────────────────────────
      for (let ch = 0; ch < 3; ch++) {
        const regLo = ch * 2;
        const period = (this.regs[regLo] | ((this.regs[regLo + 1] & 0x0f) << 8)) || 1;
        this.toneCounter[ch]++;
        if (this.toneCounter[ch] >= period) {
          this.toneCounter[ch] = 0;
          this.toneBit[ch] ^= 1;
        }
      }

      // ── Noise generator ──────────────────────────────────────────────────
      const noisePeriod = (this.regs[6] & 0x1f) || 1;
      this.noiseCounter++;
      if (this.noiseCounter >= noisePeriod * 2) {
        this.noiseCounter = 0;
        // 17-bit Galois LFSR: tap positions 0 and 3
        const bit = (this.noiseLfsr ^ (this.noiseLfsr >> 3)) & 1;
        this.noiseLfsr = (this.noiseLfsr >> 1) | (bit << 16);
        this.noiseBit = this.noiseLfsr & 1;
      }

      // ── Envelope generator ───────────────────────────────────────────────
      const envPeriod = (this.regs[11] | (this.regs[12] << 8)) || 1;
      this.envelopeCounter++;
      if (this.envelopeCounter >= envPeriod * AY_ENVELOPE_CLOCKS_PER_STEP) {
        this.envelopeCounter = 0;
        stepEnvelope(this.envelopeState);
      }
    }
  }

  /**
   * Compute the current output amplitude for each channel (0–15).
   * Applies mixer (R7) and envelope routing.
   */
  getOutputLevels(): AYOutputState {
    const mixer = this.regs[7] & 0x3f;
    const envLevel = getEnvelopeLevel(this.envelopeState);

    const levels: AYOutputState = { levelA: 0, levelB: 0, levelC: 0 };

    for (let ch = 0; ch < 3; ch++) {
      const ampReg = this.regs[8 + ch];
      const envMode = (ampReg & 0x10) !== 0;
      const fixedLevel = ampReg & 0x0f;

      // Mixer: bit 0..2 = tone enable (active-low), bit 3..5 = noise enable (active-low)
      const toneOff  = (mixer >> ch) & 1;        // 1 = disabled
      const noiseOff = (mixer >> (ch + 3)) & 1;  // 1 = disabled

      // Mixer AND gate: disabled sources are constant 1; enabled sources pass generator bits.
      const toneOut  = toneOff  ? 1 : this.toneBit[ch];
      const noiseOut = noiseOff ? 1 : this.noiseBit;

      const active = (toneOut & noiseOut) !== 0;
      if (!active) continue;

      const amplitude = envMode ? envLevel : fixedLevel;
      const levelArr = [levels.levelA, levels.levelB, levels.levelC];
      levelArr[ch] = amplitude;
      levels.levelA = levelArr[0];
      levels.levelB = levelArr[1];
      levels.levelC = levelArr[2];
    }

    return levels;
  }

  /** Retrieve the current noise LFSR state (for determinism tests). */
  getNoiseLfsr(): number {
    return this.noiseLfsr;
  }

  /** Snapshot full register state. */
  snapshotRegisters(): Uint8Array {
    return new Uint8Array(this.regs);
  }
}
