const LFSR_SEED = 0x1ffff;

export class AyToneOscillator {
  private phase = 0;
  private frequency = 0;

  reset(): void {
    this.phase = 0;
    this.frequency = 0;
  }

  setFrequency(frequency: number): void {
    this.frequency = Math.max(0, frequency);
  }

  next(sampleRate: number): number {
    if (this.frequency <= 0 || sampleRate <= 0) return 0;
    this.phase += this.frequency / sampleRate;
    while (this.phase >= 1) this.phase -= 1;
    return this.phase < 0.5 ? 1 : -1;
  }
}

export class AyNoiseOscillator {
  private lfsr = LFSR_SEED;
  private phase = 0;
  private rate = 0;

  reset(): void {
    this.lfsr = LFSR_SEED;
    this.phase = 0;
    this.rate = 0;
  }

  setRate(rate: number): void {
    this.rate = Math.max(0, Math.min(31, Math.round(rate)));
  }

  next(sampleRate: number): number {
    if (sampleRate <= 0) return 0;

    // AY-like inverse period mapping: lower register values clock the LFSR faster.
    // Treat 0 as 1 for period purposes, mirroring common AY behavior.
    const periodReg = Math.max(1, this.rate);
    const hz = 120 + (3400 / periodReg);
    this.phase += hz / sampleRate;

    while (this.phase >= 1) {
      const bit0 = this.lfsr & 1;
      const bit3 = (this.lfsr >> 3) & 1;
      const feedback = bit0 ^ bit3;
      this.lfsr = (this.lfsr >> 1) | (feedback << 16);
      this.phase -= 1;
    }

    return (this.lfsr & 1) === 0 ? 1 : -1;
  }
}
