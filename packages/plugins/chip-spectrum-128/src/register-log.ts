/**
 * Register log — deterministic tick-by-tick AY register snapshot.
 *
 * The register log is the primary regression artifact for the Spectrum 128
 * plugin. Both PCM preview and future export formats (VGM, PT3) consume the
 * same log, ensuring deterministic output across render runs.
 *
 * Each entry captures R0–R15 at one 50 Hz chip tick.
 */
import type { RegisterFrame } from './register-arbitrator.js';

/** One entry in the register log — immutable snapshot of R0–R15. */
export interface RegisterLogEntry {
  /** Tick index (0-based, 50 Hz). */
  tick: number;
  /** R0–R15 values as a fixed-size byte array. */
  regs: Uint8Array;
}

export class RegisterLog {
  private entries: RegisterLogEntry[] = [];

  /** Append a resolved register frame to the log. */
  append(frame: RegisterFrame): void {
    this.entries.push({
      tick: frame.tick,
      regs: new Uint8Array(frame.regs), // defensive copy
    });
  }

  /** Return all log entries (read-only view). */
  getEntries(): readonly RegisterLogEntry[] {
    return this.entries;
  }

  /** Number of ticks in the log. */
  get length(): number {
    return this.entries.length;
  }

  /** Reset the log (call between sessions). */
  clear(): void {
    this.entries = [];
  }

  /**
   * Serialize the entire log to a flat byte buffer.
   * Format: 16 bytes per tick (R0–R15 in order).
   * Suitable for SHA-256 hashing in regression tests.
   */
  toBytes(): Uint8Array {
    const buf = new Uint8Array(this.entries.length * 16);
    let offset = 0;
    for (const entry of this.entries) {
      buf.set(entry.regs.subarray(0, 16), offset);
      offset += 16;
    }
    return buf;
  }
}
