/**
 * Register arbitrator — resolves per-tick RegisterIntents from all channels
 * into a single AYRegisters frame and detects shared-resource conflicts.
 *
 * Arbitration rules (v1):
 *  - R6  (noise period): last-writer-wins; warn when values differ on same tick
 *  - R11–R13 (envelope): last-writer-wins; warn when shape/period differ
 *  - R7  (mixer bits): merged per-channel — each channel owns its two bits
 *  - R0–R5, R8–R10: per-channel — no conflict possible
 */
import type { RegisterIntent } from './register-intent.js';

/** A resolved register frame for one chip tick. */
export interface RegisterFrame {
  /** Tick index (0-based, 50 Hz). */
  tick: number;
  /** Final R0–R15 values. */
  regs: Uint8Array;
}

/** A conflict diagnostic emitted when global registers disagree on one tick. */
export interface ConflictDiagnostic {
  tick: number;
  register: string;
  channels: number[];
  values: number[];
  message: string;
}

export class RegisterArbitrator {
  private diagnostics: ConflictDiagnostic[] = [];

  /**
   * Merge a set of intents for a single tick into one RegisterFrame.
   *
   * @param tick    - The tick index
   * @param intents - All intents for this tick (may span multiple channels)
   * @param prevRegs - Previous frame's register values (for carry-over)
   */
  arbitrate(tick: number, intents: RegisterIntent[], prevRegs: Uint8Array): RegisterFrame {
    const regs = new Uint8Array(prevRegs); // start from previous state

    // Per-channel intents (channel A=0, B=1, C=2)
    const byChannel: [RegisterIntent | undefined, RegisterIntent | undefined, RegisterIntent | undefined] =
      [undefined, undefined, undefined];

    for (const intent of intents) {
      if (intent.channel >= 0 && intent.channel <= 2) {
        byChannel[intent.channel] = intent;
      }
    }

    // ── R7 mixer: carry-over previous, then apply per-channel bits ───────────
    // AY R7 active-low: bit=0 means ENABLED
    // BeatBax: toneEnable/noiseEnable=true means active
    // Layout: bits 0-2 = tone enable (active-low), bits 3-5 = noise enable (active-low)
    let mixer = regs[7];
    for (let ch = 0; ch < 3; ch++) {
      const intent = byChannel[ch];
      if (intent !== undefined) {
        if (intent.toneEnable !== undefined) {
          if (intent.toneEnable) {
            mixer &= ~(1 << ch);        // clear bit = enable tone
          } else {
            mixer |= (1 << ch);         // set bit = disable tone
          }
        }
        if (intent.noiseEnable !== undefined) {
          if (intent.noiseEnable) {
            mixer &= ~(1 << (ch + 3));  // clear bit = enable noise
          } else {
            mixer |= (1 << (ch + 3));   // set bit = disable noise
          }
        }
      }
    }
    regs[7] = mixer & 0x3f;

    // ── Per-channel registers (R0–R5, R8–R10) ───────────────────────────────
    for (let ch = 0; ch < 3; ch++) {
      const intent = byChannel[ch];
      if (!intent) continue;

      // Tone period
      if (intent.tonePeriod !== undefined) {
        const p = Math.max(1, Math.min(4095, intent.tonePeriod));
        const regBase = ch * 2;
        regs[regBase]     = p & 0xff;
        regs[regBase + 1] = (p >> 8) & 0x0f;
      }

      // Amplitude / envelope routing
      if (intent.useEnvelope) {
        regs[8 + ch] = 0x10; // envelope mode bit
      } else if (intent.attenuation !== undefined) {
        // Map BeatBax vol (15=loudest) directly to AY amplitude (15=loudest)
        regs[8 + ch] = Math.max(0, Math.min(15, intent.attenuation)) & 0x0f;
      }
    }

    // ── R6 noise period (global — conflict detection) ────────────────────────
    const noiseIntents = intents.filter(i => i.noisePeriod !== undefined);
    if (noiseIntents.length > 0) {
      const firstVal = noiseIntents[0].noisePeriod!;
      const allSame = noiseIntents.every(i => i.noisePeriod === firstVal);
      if (!allSame) {
        this.diagnostics.push({
          tick,
          register: 'R6 (noise period)',
          channels: noiseIntents.map(i => i.channel),
          values: noiseIntents.map(i => i.noisePeriod!),
          message: `Tick ${tick}: noise_rate conflict — channels [${noiseIntents.map(i => i.channel + 1).join(', ')}] request different R6 values [${noiseIntents.map(i => i.noisePeriod).join(', ')}]. Last-writer-wins.`,
        });
      }
      // last-writer-wins
      regs[6] = (noiseIntents[noiseIntents.length - 1].noisePeriod! & 0x1f);
    }

    // ── R11–R13 envelope (global — conflict detection) ───────────────────────
    const envPeriodIntents = intents.filter(i => i.envelopePeriod !== undefined);
    const envShapeIntents  = intents.filter(i => i.envelopeShape  !== undefined);

    if (envPeriodIntents.length > 1) {
      const firstPeriod = envPeriodIntents[0].envelopePeriod!;
      const allSamePeriod = envPeriodIntents.every(i => i.envelopePeriod === firstPeriod);
      if (!allSamePeriod) {
        this.diagnostics.push({
          tick,
          register: 'R11-R12 (envelope period)',
          channels: envPeriodIntents.map(i => i.channel),
          values: envPeriodIntents.map(i => i.envelopePeriod!),
          message: `Tick ${tick}: envelope period conflict — channels [${envPeriodIntents.map(i => i.channel + 1).join(', ')}] request different values.`,
        });
      }
    }

    if (envShapeIntents.length > 1) {
      const firstShape = envShapeIntents[0].envelopeShape!;
      const allSameShape = envShapeIntents.every(i => i.envelopeShape === firstShape);
      if (!allSameShape) {
        this.diagnostics.push({
          tick,
          register: 'R13 (envelope shape)',
          channels: envShapeIntents.map(i => i.channel),
          values: envShapeIntents.map(i => i.envelopeShape!),
          message: `Tick ${tick}: envelope shape conflict — channels [${envShapeIntents.map(i => i.channel + 1).join(', ')}] request different R13 values.`,
        });
      }
    }

    // Apply envelope period (last-writer-wins)
    if (envPeriodIntents.length > 0) {
      const period = Math.max(1, Math.min(65535, envPeriodIntents[envPeriodIntents.length - 1].envelopePeriod!));
      regs[11] = period & 0xff;
      regs[12] = (period >> 8) & 0xff;
    }

    // Apply envelope shape (last-writer-wins; triggers reset)
    if (envShapeIntents.length > 0) {
      regs[13] = envShapeIntents[envShapeIntents.length - 1].envelopeShape! & 0x0f;
    }

    return { tick, regs };
  }

  /** All conflict diagnostics collected so far. */
  getDiagnostics(): ConflictDiagnostic[] {
    return this.diagnostics;
  }

  /** Clear diagnostics (call between song sessions). */
  clearDiagnostics(): void {
    this.diagnostics = [];
  }
}
