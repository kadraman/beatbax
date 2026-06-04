/**
 * Envelope generator for the AY-3-8912 PSG.
 *
 * The AY chip has a single hardware envelope generator shared across all
 * channels. It generates 16 distinct shapes (R13 bits 0–3) controlled by
 * a 16-bit period register (R11–R12).
 *
 * Envelope shapes (bit layout: CONT | ATT | ALT | HOLD):
 *
 *   Shape  Bits  Pattern
 *   0      0000  \___  (decay, no loop)
 *   1      0001  \___
 *   2      0010  \/\/  (decay + reverse sawtooth)
 *   3      0011  \¯¯¯  (decay, hold at max)
 *   4      0100  /___  (attack, no loop)
 *   5      0101  /___
 *   6      0110  /\/\  (attack + sawtooth)
 *   7      0111  /¯¯¯  (attack, hold at max)
 *   8      1000  \\\\  (continuous decay)
 *   9      1001  \___
 *   10     1010  \/\/  (continuous zigzag)
 *   11     1011  \¯¯¯  (decay then hold max)
 *   12     1100  ////  (continuous attack)
 *   13     1101  /¯¯¯
 *   14     1110  /\/\  (attack then zigzag)
 *   15     1111  /___
 *
 * The generator produces values 0–15 (0 = silent, 15 = loudest).
 */

export interface EnvelopeGeneratorState {
  /** Current envelope level (0–15). */
  level: number;
  /** Current step within one cycle (0–15). */
  step: number;
  /** Which half of the zigzag are we in (0=first, 1=second). */
  half: number;
  /** Whether the envelope has finished (for hold/no-loop shapes). */
  finished: boolean;
  /** Shape register value (0–15). */
  shape: number;
}

/**
 * Create a fresh envelope generator state for a given shape.
 * @param shape - R13 register value (0–15)
 */
export function createEnvelopeState(shape: number): EnvelopeGeneratorState {
  const s = Math.max(0, Math.min(15, shape & 0x0f));
  const cont = (s >> 3) & 1;
  const att = (s >> 2) & 1;
  // Continuous shapes start at the beginning of their ramp (not silent step 0).
  const level = cont ? (att ? 0 : 15) : 0;
  return { level, step: 0, half: 0, finished: false, shape: s };
}

/**
 * Compute the current output level for the envelope generator state.
 * Returns a value 0–15 (0 = silent, 15 = max).
 */
export function getEnvelopeLevel(state: EnvelopeGeneratorState): number {
  return state.level;
}

/** AY-3-8912: one envelope level step every (period × 256) chip clock cycles. */
export const AY_ENVELOPE_CLOCKS_PER_STEP = 256;

export interface EnvelopeClockState {
  env: EnvelopeGeneratorState;
  clockRemainder: number;
}

export function createEnvelopeClockState(shape: number): EnvelopeClockState {
  return { env: createEnvelopeState(shape), clockRemainder: 0 };
}

/**
 * Advance the shared envelope generator by `chipClocks` AY clock cycles.
 * Returns the current level (0–15) after processing.
 */
export function advanceEnvelopeClockState(
  clockState: EnvelopeClockState,
  chipClocks: number,
  period: number,
): number {
  const periodClamped = Math.max(1, Math.min(65535, Math.round(period)));
  const clocksPerStep = periodClamped * AY_ENVELOPE_CLOCKS_PER_STEP;
  clockState.clockRemainder += chipClocks;
  while (clockState.clockRemainder >= clocksPerStep) {
    clockState.clockRemainder -= clocksPerStep;
    stepEnvelope(clockState.env);
  }
  return getEnvelopeLevel(clockState.env);
}

/**
 * Advance the envelope generator by one chip step.
 * The caller must call this once per envelope clock tick (period × 256 chip clocks).
 */
export function stepEnvelope(state: EnvelopeGeneratorState): void {
  if (state.finished) return;

  const shape = state.shape;
  const cont  = (shape >> 3) & 1;  // continue
  const att   = (shape >> 2) & 1;  // attack direction (1=up)
  const alt   = (shape >> 1) & 1;  // alternate direction each cycle
  const hold  = (shape >> 0) & 1;  // hold at end

  // Determine direction for the current half-cycle
  // For first half:  att determines direction
  // For second half: alt XOR att determines direction (alt flips it)
  const ascending = state.half === 0 ? att === 1 : (alt ^ att) === 1;

  // Compute level from step
  if (ascending) {
    state.level = state.step;
  } else {
    state.level = 15 - state.step;
  }

  // Advance step
  state.step++;

  if (state.step > 15) {
    state.step = 0;

    if (!cont) {
      // No continue: hold at 0 (shapes 0-7)
      if (hold) {
        state.level = ascending ? 15 : 0;
      } else {
        state.level = 0;
      }
      state.finished = true;
      return;
    }

    // Continuous: toggle half if alt, else stay same
    if (alt) {
      state.half ^= 1;
    }

    if (hold) {
      // Hold at the level reached at end of this half
      state.level = ascending ? 15 : 0;
      state.finished = true;
    }
  }
}
