export type AyEnvelopeShape =
  | 'none'
  | 'attack_decay'
  | 'attack_decay_repeat'
  | 'decay_only'
  | 'decay_repeat'
  | 'attack_only'
  | 'hold'
  | 'attack_hold'
  | 'decay_quick'
  | 'decay_hold_max'
  | 'attack_hold_max'
  | 'triangle_down_up'
  | 'triangle_up_down';

const SHAPE_SEQUENCE: Record<AyEnvelopeShape, number[]> = {
  none: [31],
  attack_decay: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0],
  attack_decay_repeat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0],
  decay_only: [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0],
  decay_repeat: [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0],
  attack_only: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31],
  hold: [31],
  attack_hold: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31],
  decay_quick: [31, 24, 18, 12, 6, 0],
  decay_hold_max: [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 31],
  attack_hold_max: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31],
  triangle_down_up: [31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31],
  triangle_up_down: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 31, 29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 0],
};

const REPEATING = new Set<AyEnvelopeShape>(['attack_decay_repeat', 'decay_repeat', 'triangle_down_up', 'triangle_up_down']);

export function isRepeatingEnvelopeShape(shape: AyEnvelopeShape): boolean {
  return REPEATING.has(shape);
}

export function buildAyEnvelopeLevelCurve(
  shape: AyEnvelopeShape,
  dur: number,
  frameRate = 60,
): Float32Array {
  const totalFrames = Math.max(2, Math.ceil(Math.max(0.001, dur) * frameRate));
  const seq = SHAPE_SEQUENCE[shape] ?? SHAPE_SEQUENCE.none;
  const out = new Float32Array(totalFrames);
  let idx = 0;

  for (let frame = 0; frame < totalFrames; frame += 1) {
    out[frame] = (seq[Math.min(idx, seq.length - 1)] ?? 31) / 31;

    if (seq.length <= 1) continue;

    if (idx < seq.length - 1) {
      idx += 1;
    } else if (REPEATING.has(shape)) {
      idx = 0;
    }
  }

  return out;
}

export class AyEnvelopeGenerator {
  private shape: AyEnvelopeShape = 'none';
  private index = 0;

  reset(shape: AyEnvelopeShape): void {
    this.shape = shape;
    this.index = 0;
  }

  tick(): void {
    const seq = SHAPE_SEQUENCE[this.shape] ?? SHAPE_SEQUENCE.none;
    if (seq.length <= 1) return;

    if (this.index < seq.length - 1) {
      this.index += 1;
      return;
    }

    if (REPEATING.has(this.shape)) {
      this.index = 0;
    }
  }

  level(): number {
    const seq = SHAPE_SEQUENCE[this.shape] ?? SHAPE_SEQUENCE.none;
    return seq[Math.min(this.index, seq.length - 1)] ?? 31;
  }
}
