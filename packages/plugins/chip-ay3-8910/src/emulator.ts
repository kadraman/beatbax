import { dacTableForMode, type AyDacMode } from './dac.js';

type AyChannel = 0 | 1 | 2;

class AyToneGen {
  private counter = 0;
  private period = 1;
  private phase = 0;

  reset(): void {
    this.counter = 0;
    this.period = 1;
    this.phase = 0;
  }

  setFine(v: number): void {
    this.period = ((this.period & 0x0f00) | (v & 0xff)) || 1;
  }

  setCoarse(v: number): void {
    this.period = (((v & 0x0f) << 8) | (this.period & 0x00ff)) || 1;
  }

  clock(): void {
    this.counter += 1;
    if (this.counter >= this.period) {
      this.counter = 0;
      this.phase ^= 1;
    }
  }

  getPhase(): number {
    return this.phase;
  }
}

class AyNoiseGen {
  private counter = 0;
  private period = 1;
  private lfsr = 0x1ffff;
  private phase = 0;

  reset(): void {
    this.counter = 0;
    this.period = 1;
    this.lfsr = 0x1ffff;
    this.phase = 0;
  }

  setPeriod(v: number): void {
    this.period = Math.max(1, v & 0x1f);
  }

  clock(): void {
    this.counter += 1;
    if (this.counter < this.period) return;
    this.counter = 0;

    const bit0 = this.lfsr & 1;
    const bit3 = (this.lfsr >> 3) & 1;
    const feedback = bit0 ^ bit3;
    this.lfsr = (this.lfsr >> 1) | (feedback << 16);
    this.phase = this.lfsr & 1;
  }

  getPhase(): number {
    return this.phase;
  }
}

class AyEnvelopeGen {
  private counter = 0;
  private period = 1;
  private shape = 0;
  private phase = 0;
  private level = 0;

  reset(): void {
    this.counter = 0;
    this.period = 1;
    this.shape = 0;
    this.phase = 0;
    this.level = 0;
  }

  setFine(v: number): void {
    this.period = ((this.period & 0xff00) | (v & 0xff)) || 1;
  }

  setCoarse(v: number): void {
    this.period = (((v & 0xff) << 8) | (this.period & 0x00ff)) || 1;
  }

  setShape(v: number): void {
    this.shape = v & 0x0f;
    this.phase = 0;
    this.level = (this.shape & 0x04) !== 0 ? 0 : 31;
  }

  private rampUp(): void {
    this.level = (this.level + 1) & 0x1f;
    if (this.level === 0x1f) this.phase ^= 1;
  }

  private rampDown(): void {
    this.level = (this.level - 1) & 0x1f;
    if (this.level === 0x00) this.phase ^= 1;
  }

  clock(): void {
    this.counter += 1;
    if (this.counter < this.period) return;
    this.counter = 0;

    switch (this.shape) {
      case 0:
      case 1:
      case 2:
      case 3:
        this.rampDown();
        if (this.phase !== 0) this.level = 0;
        return;
      case 4:
      case 5:
      case 6:
      case 7:
        this.rampUp();
        if (this.phase !== 0) this.level = 0;
        return;
      case 8:
        this.rampDown();
        return;
      case 9:
        this.rampDown();
        if (this.phase !== 0) this.level = 0;
        return;
      case 10:
        if (this.phase === 0) this.rampDown();
        else this.rampUp();
        return;
      case 11:
        this.rampDown();
        if (this.phase !== 0) this.level = 31;
        return;
      case 12:
        this.rampUp();
        return;
      case 13:
        this.rampUp();
        if (this.phase !== 0) this.level = 31;
        return;
      case 14:
        if (this.phase === 0) this.rampUp();
        else this.rampDown();
        return;
      case 15:
        this.rampUp();
        if (this.phase !== 0) this.level = 0;
        return;
      default:
        return;
    }
  }

  getLevel(): number {
    return this.level & 0x1f;
  }
}

class AyMixer {
  private toneEnable: [number, number, number] = [1, 1, 1];
  private noiseEnable: [number, number, number] = [1, 1, 1];
  private levels: [number, number, number] = [0, 0, 0];

  reset(): void {
    this.toneEnable = [1, 1, 1];
    this.noiseEnable = [1, 1, 1];
    this.levels = [0, 0, 0];
  }

  setConfig(r7: number): void {
    this.toneEnable[0] = (r7 & 0x01) === 0 ? 1 : 0;
    this.toneEnable[1] = (r7 & 0x02) === 0 ? 1 : 0;
    this.toneEnable[2] = (r7 & 0x04) === 0 ? 1 : 0;
    this.noiseEnable[0] = (r7 & 0x08) === 0 ? 1 : 0;
    this.noiseEnable[1] = (r7 & 0x10) === 0 ? 1 : 0;
    this.noiseEnable[2] = (r7 & 0x20) === 0 ? 1 : 0;
  }

  setAmplitude(ch: AyChannel, regValue: number): void {
    this.levels[ch] = (((regValue << 1) & 0x3e) | ((regValue >> 3) & 0x01)) & 0x3f;
  }

  applyEnvelopeLevel(level: number): void {
    for (let ch = 0 as AyChannel; ch <= 2; ch = (ch + 1) as AyChannel) {
      if ((this.levels[ch] & 0x20) !== 0) {
        this.levels[ch] = (this.levels[ch] & 0x20) | (level & 0x1f);
      }
    }
  }

  getLevel(ch: AyChannel): number {
    return this.levels[ch] & 0x1f;
  }

  toneOn(ch: AyChannel): number {
    return this.toneEnable[ch];
  }

  noiseOn(ch: AyChannel): number {
    return this.noiseEnable[ch];
  }
}

export class AyChipEmulator {
  private regs = new Uint8Array(16);
  private tone: [AyToneGen, AyToneGen, AyToneGen] = [new AyToneGen(), new AyToneGen(), new AyToneGen()];
  private noise = new AyNoiseGen();
  private envelope = new AyEnvelopeGen();
  private mixer = new AyMixer();
  private clockDiv = 0;
  private dac = dacTableForMode('ay');

  constructor(dacMode: AyDacMode = 'ay') {
    this.setDacMode(dacMode);
    this.reset();
  }

  setDacMode(mode: AyDacMode): void {
    this.dac = dacTableForMode(mode);
  }

  reset(): void {
    this.regs.fill(0);
    this.clockDiv = 0;
    this.tone[0].reset();
    this.tone[1].reset();
    this.tone[2].reset();
    this.noise.reset();
    this.envelope.reset();
    this.mixer.reset();
    for (let r = 0; r < 14; r += 1) {
      this.writeRegister(r, 0);
    }
  }

  writeRegister(r: number, v: number): void {
    const reg = r & 0x0f;
    switch (reg) {
      case 0:
        this.regs[reg] = v & 0xff;
        this.tone[0].setFine(this.regs[reg]);
        break;
      case 1:
        this.regs[reg] = v & 0x0f;
        this.tone[0].setCoarse(this.regs[reg]);
        break;
      case 2:
        this.regs[reg] = v & 0xff;
        this.tone[1].setFine(this.regs[reg]);
        break;
      case 3:
        this.regs[reg] = v & 0x0f;
        this.tone[1].setCoarse(this.regs[reg]);
        break;
      case 4:
        this.regs[reg] = v & 0xff;
        this.tone[2].setFine(this.regs[reg]);
        break;
      case 5:
        this.regs[reg] = v & 0x0f;
        this.tone[2].setCoarse(this.regs[reg]);
        break;
      case 6:
        this.regs[reg] = v & 0x1f;
        this.noise.setPeriod(this.regs[reg]);
        break;
      case 7:
        this.regs[reg] = v & 0xff;
        this.mixer.setConfig(this.regs[reg]);
        break;
      case 8:
      case 9:
      case 10:
        this.regs[reg] = v & 0x1f;
        this.mixer.setAmplitude((reg - 8) as AyChannel, this.regs[reg]);
        break;
      case 11:
        this.regs[reg] = v & 0xff;
        this.envelope.setFine(this.regs[reg]);
        break;
      case 12:
        this.regs[reg] = v & 0xff;
        this.envelope.setCoarse(this.regs[reg]);
        break;
      case 13:
        this.regs[reg] = v & 0x0f;
        this.envelope.setShape(this.regs[reg]);
        break;
      default:
        this.regs[reg] = v & 0xff;
        break;
    }
  }

  readRegister(r: number): number {
    return this.regs[r & 0x0f] ?? 0;
  }

  clock(): void {
    this.clockDiv = (this.clockDiv + 1) & 0xff;
    if ((this.clockDiv & 0x07) !== 0) return;

    this.tone[0].clock();
    this.tone[1].clock();
    this.tone[2].clock();
    this.noise.clock();
    this.envelope.clock();
    this.mixer.applyEnvelopeLevel(this.envelope.getLevel());
  }

  getChannelSample(ch: AyChannel): number {
    const tonePhase = this.tone[ch].getPhase() !== 0 ? 1 : -1;
    const noisePhase = this.noise.getPhase() !== 0 ? 1 : -1;

    let output = 0;
    if (this.mixer.toneOn(ch) !== 0) output |= tonePhase;
    if (this.mixer.noiseOn(ch) !== 0) output |= noisePhase;

    const level = this.dac[this.mixer.getLevel(ch)] ?? 0;
    return output * level;
  }
}
