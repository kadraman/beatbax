/**
 * Register intents — per-tick intended register writes from individual notes.
 *
 * Each active note on each channel produces a RegisterIntent for each tick it
 * spans. The RegisterArbitrator collects intents from all channels and resolves
 * them into a final register frame.
 *
 * Per-channel registers (R0–R5, R8–R10) are never shared, so there is no
 * conflict there. Global registers (R6, R11–R13) can conflict when two notes
 * on different channels request different values on the same tick.
 */
/** Minimal source location for diagnostics (mirrors engine AST SourceLocation). */
export interface SourceLocation {
  line: number;
  column: number;
  offset?: number;
}

/** Source information for diagnostics. */
export interface IntentSource {
  pat?: string;
  loc?: SourceLocation;
  channel: number;
}

/**
 * All intended register writes produced by one active note for one chip tick.
 *
 * Undefined fields mean the note does not care about that register this tick.
 */
export interface RegisterIntent {
  /** Target chip tick index (0-based). */
  tick: number;
  /** Channel index (0 = A, 1 = B, 2 = C). */
  channel: 0 | 1 | 2;
  /** Desired tone period for R0+R1 / R2+R3 / R4+R5 (12-bit). */
  tonePeriod?: number;
  /**
   * Amplitude register value R8/R9/R10 — 0=silent, 15=loudest.
   * Bit 4 (value 16) signals envelope mode (useEnvelope).
   */
  attenuation?: number;
  /** When true, route amplitude through the shared envelope generator. */
  useEnvelope?: boolean;
  /** Tone enable bit for R7 (true = tone active for this channel). */
  toneEnable?: boolean;
  /** Noise enable bit for R7 (true = noise mixed into this channel). */
  noiseEnable?: boolean;
  /** Desired noise period for R6 (5-bit, 0–31). Global — can conflict. */
  noisePeriod?: number;
  /** Desired envelope period for R11+R12 (16-bit). Global — can conflict. */
  envelopePeriod?: number;
  /** Desired envelope shape for R13 (0–15). Global — can conflict. */
  envelopeShape?: number;
  /** Diagnostic context. */
  source: IntentSource;
}
