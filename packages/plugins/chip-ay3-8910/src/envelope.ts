export type AyEnvelopeShape =
  | 'none'
  | 'attack_decay'
  | 'attack_decay_repeat'
  | 'decay_only'
  | 'decay_repeat'
  | 'attack_only'
  | 'hold'
  | 'attack_hold'
  | 'decay_quick';

const SHAPE_SEQUENCE: Record<AyEnvelopeShape, number[]> = {
  none: [15],
  attack_decay: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  attack_decay_repeat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  decay_only: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  decay_repeat: [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  attack_only: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  hold: [15],
  attack_hold: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  decay_quick: [15, 12, 9, 6, 3, 0],
};

const REPEATING = new Set<AyEnvelopeShape>(['attack_decay_repeat', 'decay_repeat']);

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
    return seq[Math.min(this.index, seq.length - 1)] ?? 15;
  }
}
