type RegisterPatch = { r: number; v: number };

type WorkletMessage =
  | { type: 'noteOn'; channel: 0 | 1 | 2; registers: RegisterPatch[]; scheduledTime: number }
  | { type: 'noteOff'; channel: 0 | 1 | 2; scheduledTime: number }
  | { type: 'reset' };

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

const AY_DAC = new Float32Array([
  0.0, 0.0, 0.0099947, 0.0099947,
  0.0144503, 0.0144503, 0.0210575, 0.0210575,
  0.0307012, 0.0307012, 0.0455482, 0.0455482,
  0.0644999, 0.0644999, 0.1073625, 0.1073625,
  0.1265888, 0.1265888, 0.2049897, 0.2049897,
  0.2922103, 0.2922103, 0.3728389, 0.3728389,
  0.4925307, 0.4925307, 0.6353246, 0.6353246,
  0.8055848, 0.8055848, 1.0, 1.0,
]);

const YM_DAC = new Float32Array([
  0.0, 0.0, 0.004654, 0.0077211,
  0.010956, 0.013962, 0.0169986, 0.0200198,
  0.0243687, 0.0296941, 0.0350652, 0.0403906,
  0.0485389, 0.0583352, 0.0680552, 0.0777752,
  0.0925154, 0.1110857, 0.1297475, 0.1484855,
  0.176669, 0.2115511, 0.2463874, 0.2811017,
  0.3337301, 0.4004273, 0.4673838, 0.534432,
  0.635172, 0.7580072, 0.8799268, 1.0,
]);

class Tone {
  counter = 0;
  period = 1;
  phase = 0;
  setFine(v: number): void { this.period = ((this.period & 0x0f00) | (v & 0xff)) || 1; }
  setCoarse(v: number): void { this.period = (((v & 0x0f) << 8) | (this.period & 0xff)) || 1; }
  clock(): void {
    this.counter += 1;
    if (this.counter >= this.period) {
      this.counter = 0;
      this.phase ^= 1;
    }
  }
}

class Noise {
  counter = 0;
  period = 1;
  lfsr = 0x1ffff;
  phase = 0;
  setPeriod(v: number): void { this.period = Math.max(1, v & 0x1f); }
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
}

class Envelope {
  counter = 0;
  period = 1;
  shape = 0;
  phase = 0;
  level = 0;

  setFine(v: number): void { this.period = ((this.period & 0xff00) | (v & 0xff)) || 1; }
  setCoarse(v: number): void { this.period = (((v & 0xff) << 8) | (this.period & 0xff)) || 1; }
  setShape(v: number): void {
    this.shape = v & 0x0f;
    this.phase = 0;
    this.level = (this.shape & 0x04) !== 0 ? 0 : 31;
  }

  rampUp(): void {
    this.level = (this.level + 1) & 0x1f;
    if (this.level === 31) this.phase ^= 1;
  }

  rampDown(): void {
    this.level = (this.level - 1) & 0x1f;
    if (this.level === 0) this.phase ^= 1;
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
      case 9:
        this.rampDown();
        if (this.phase !== 0) this.level = 0;
        break;
      case 4:
      case 5:
      case 6:
      case 7:
      case 15:
        this.rampUp();
        if (this.phase !== 0) this.level = 0;
        break;
      case 8:
        this.rampDown();
        break;
      case 10:
        if (this.phase === 0) this.rampDown();
        else this.rampUp();
        break;
      case 11:
        this.rampDown();
        if (this.phase !== 0) this.level = 31;
        break;
      case 12:
        this.rampUp();
        break;
      case 13:
        this.rampUp();
        if (this.phase !== 0) this.level = 31;
        break;
      case 14:
        if (this.phase === 0) this.rampUp();
        else this.rampDown();
        break;
      default:
        break;
    }
  }
}

class Mixer {
  tone: [number, number, number] = [1, 1, 1];
  noise: [number, number, number] = [1, 1, 1];
  levels: [number, number, number] = [0, 0, 0];

  setConfig(v: number): void {
    this.tone[0] = (v & 0x01) === 0 ? 1 : 0;
    this.tone[1] = (v & 0x02) === 0 ? 1 : 0;
    this.tone[2] = (v & 0x04) === 0 ? 1 : 0;
    this.noise[0] = (v & 0x08) === 0 ? 1 : 0;
    this.noise[1] = (v & 0x10) === 0 ? 1 : 0;
    this.noise[2] = (v & 0x20) === 0 ? 1 : 0;
  }

  setAmplitude(ch: 0 | 1 | 2, reg: number): void {
    this.levels[ch] = (((reg << 1) & 0x3e) | ((reg >> 3) & 0x01)) & 0x3f;
  }

  applyEnvelope(level: number): void {
    for (let ch = 0 as 0 | 1 | 2; ch <= 2; ch = (ch + 1) as 0 | 1 | 2) {
      if ((this.levels[ch] & 0x20) !== 0) {
        this.levels[ch] = (this.levels[ch] & 0x20) | (level & 0x1f);
      }
    }
  }
}

class WorkletAyEmulator {
  regs = new Uint8Array(16);
  tone: [Tone, Tone, Tone] = [new Tone(), new Tone(), new Tone()];
  noise = new Noise();
  env = new Envelope();
  mixer = new Mixer();
  clockDiv = 0;
  dac = AY_DAC;

  setDacMode(mode: 'ay' | 'ym'): void {
    this.dac = mode === 'ym' ? YM_DAC : AY_DAC;
  }

  reset(): void {
    this.regs.fill(0);
    this.clockDiv = 0;
    this.tone[0] = new Tone();
    this.tone[1] = new Tone();
    this.tone[2] = new Tone();
    this.noise = new Noise();
    this.env = new Envelope();
    this.mixer = new Mixer();
    for (let r = 0; r < 14; r += 1) this.writeRegister(r, 0);
  }

  writeRegister(r: number, v: number): void {
    const reg = r & 0x0f;
    switch (reg) {
      case 0: this.regs[0] = v & 0xff; this.tone[0].setFine(this.regs[0]); break;
      case 1: this.regs[1] = v & 0x0f; this.tone[0].setCoarse(this.regs[1]); break;
      case 2: this.regs[2] = v & 0xff; this.tone[1].setFine(this.regs[2]); break;
      case 3: this.regs[3] = v & 0x0f; this.tone[1].setCoarse(this.regs[3]); break;
      case 4: this.regs[4] = v & 0xff; this.tone[2].setFine(this.regs[4]); break;
      case 5: this.regs[5] = v & 0x0f; this.tone[2].setCoarse(this.regs[5]); break;
      case 6: this.regs[6] = v & 0x1f; this.noise.setPeriod(this.regs[6]); break;
      case 7: this.regs[7] = v & 0xff; this.mixer.setConfig(this.regs[7]); break;
      case 8: this.regs[8] = v & 0x1f; this.mixer.setAmplitude(0, this.regs[8]); break;
      case 9: this.regs[9] = v & 0x1f; this.mixer.setAmplitude(1, this.regs[9]); break;
      case 10: this.regs[10] = v & 0x1f; this.mixer.setAmplitude(2, this.regs[10]); break;
      case 11: this.regs[11] = v & 0xff; this.env.setFine(this.regs[11]); break;
      case 12: this.regs[12] = v & 0xff; this.env.setCoarse(this.regs[12]); break;
      case 13: this.regs[13] = v & 0x0f; this.env.setShape(this.regs[13]); break;
      default: this.regs[reg] = v & 0xff; break;
    }
  }

  clock(): void {
    this.clockDiv = (this.clockDiv + 1) & 0xff;
    if ((this.clockDiv & 0x07) !== 0) return;
    this.tone[0].clock();
    this.tone[1].clock();
    this.tone[2].clock();
    this.noise.clock();
    this.env.clock();
    this.mixer.applyEnvelope(this.env.level);
  }

  channel(ch: 0 | 1 | 2): number {
    const toneSig = this.tone[ch].phase !== 0 ? 1 : -1;
    const noiseSig = this.noise.phase !== 0 ? 1 : -1;
    let out = 0;
    if (this.mixer.tone[ch] !== 0) out |= toneSig;
    if (this.mixer.noise[ch] !== 0) out |= noiseSig;
    return out * (this.dac[this.mixer.levels[ch] & 0x1f] ?? 0);
  }
}

class Ay3WorkletProcessor extends AudioWorkletProcessor {
  private emulator = new WorkletAyEmulator();
  private pending: Array<WorkletMessage & { scheduledTime?: number }> = [];
  private chipClock = 1773400;
  private clockAccumulator = 0;

  constructor() {
    super();
    this.emulator.setDacMode('ay');
    this.emulator.reset();

    this.port.onmessage = (ev: MessageEvent<WorkletMessage>) => {
      const msg = ev.data;
      if (msg.type === 'reset') {
        this.pending.length = 0;
        this.emulator.reset();
        this.clockAccumulator = 0;
        return;
      }
      this.pending.push(msg);
      this.pending.sort((a, b) => (a.scheduledTime ?? 0) - (b.scheduledTime ?? 0));
    };
  }

  private applyEvent(msg: WorkletMessage): void {
    if (msg.type === 'noteOn') {
      for (const patch of msg.registers) {
        this.emulator.writeRegister(patch.r, patch.v);
      }
      return;
    }

    if (msg.type === 'noteOff') {
      this.emulator.writeRegister(8 + msg.channel, 0);
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const left = out[0];
    const right = out[1];
    const ratio = this.chipClock / sampleRate;
    const baseTime = currentTime;

    for (let i = 0; i < left.length; i += 1) {
      const frameTime = baseTime + (i / sampleRate);
      while (this.pending.length > 0 && (this.pending[0].scheduledTime ?? 0) <= frameTime) {
        this.applyEvent(this.pending.shift() as WorkletMessage);
      }

      this.clockAccumulator += ratio;
      while (this.clockAccumulator >= 1) {
        this.emulator.clock();
        this.clockAccumulator -= 1;
      }

      const a = this.emulator.channel(0);
      const b = this.emulator.channel(1);
      const c = this.emulator.channel(2);

      // Stereo pan mixing: scale coefficients to avoid clipping (they sum to 1.5).
      // Divide by 1.5 (equivalent to multiplying by 2/3) to keep output in [-1, 1].
      left[i] = ((a * 0.75) + (b * 0.5) + (c * 0.25)) * (2/3);
      right[i] = ((a * 0.25) + (b * 0.5) + (c * 0.75)) * (2/3);
    }

    return true;
  }
}

registerProcessor('beatbax-ay3-worklet', Ay3WorkletProcessor);
