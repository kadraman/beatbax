/**
 * Minimal UGE binary builder for reader tests (v1 / v4 / v5 / v6 layouts).
 */

export class UgeBuf {
  private bytes: number[] = [];

  writeU8(n: number): void {
    this.bytes.push(n & 0xff);
  }

  writeI8(n: number): void {
    this.writeU8(n < 0 ? n + 256 : n);
  }

  writeU32(n: number): void {
    const v = n >>> 0;
    this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  }

  writeBool(v: boolean): void {
    this.writeU8(v ? 1 : 0);
  }

  writeShortString(s: string): void {
    const raw = Buffer.from(s, 'utf8');
    const len = Math.min(255, raw.length);
    this.writeU8(len);
    for (let i = 0; i < len; i++) this.bytes.push(raw[i]);
    for (let i = len; i < 255; i++) this.bytes.push(0);
  }

  writeString(s: string): void {
    const raw = Buffer.from(s, 'utf8');
    this.writeU32(raw.length);
    for (let i = 0; i < raw.length; i++) this.bytes.push(raw[i]);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.bytes);
  }
}

export interface FixtureInst {
  type: 0 | 1 | 2;
  name?: string;
  initialVolume?: number;
  volumeSweepDir?: number;
  volumeSweepChange?: number;
  freqSweepTime?: number;
  sweepDir?: number;
  freqSweepShift?: number;
  duty?: number;
  waveVolume?: number;
  waveIndex?: number;
  noiseMode?: number;
  length?: number;
  lengthEnabled?: boolean;
  subpatternEnabled?: boolean;
  noiseMacro?: number[];
  subNote?: number;
}

function writeInstrument(w: UgeBuf, version: number, inst: FixtureInst): void {
  w.writeU32(inst.type);
  w.writeShortString(inst.name ?? '');
  w.writeU32(inst.length ?? 0);
  w.writeBool(!!inst.lengthEnabled);
  w.writeU8(inst.initialVolume ?? 15);
  w.writeU32(inst.volumeSweepDir ?? 1);
  w.writeU8(inst.volumeSweepChange ?? 0);
  w.writeU32(inst.freqSweepTime ?? 0);
  w.writeU32(inst.sweepDir ?? 0);
  w.writeU32(inst.freqSweepShift ?? 0);
  w.writeU8(inst.duty ?? 2);
  w.writeU32(inst.waveVolume ?? 1);
  w.writeU32(inst.waveIndex ?? 0);

  if (version >= 6) {
    w.writeU32(inst.noiseMode ?? 0);
    w.writeBool(!!inst.subpatternEnabled);
    for (let r = 0; r < 64; r++) {
      w.writeU32(r === 0 && inst.subNote !== undefined ? inst.subNote : 90);
      w.writeU32(0);
      w.writeU32(0);
      w.writeU32(0);
      w.writeU8(0);
    }
  } else {
    w.writeU32(0);
    w.writeU32(inst.noiseMode ?? 0);
    w.writeU32(0);
    if (version >= 4) {
      const macro = inst.noiseMacro ?? [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 6; i++) w.writeI8(macro[i] ?? 0);
    }
  }
}

function defaultBank(type: 0 | 1 | 2, filled: FixtureInst[]): FixtureInst[] {
  const out: FixtureInst[] = Array.from({ length: 15 }, () => ({ type }));
  for (let i = 0; i < Math.min(15, filled.length); i++) out[i] = { ...filled[i], type };
  return out;
}

export function buildUgeFixture(opts: {
  version: number;
  name?: string;
  ticksPerRow?: number;
  duty?: FixtureInst[];
  wave?: FixtureInst[];
  noise?: FixtureInst[];
  mixed?: FixtureInst[];
  waveNibble?: number;
}): Buffer {
  const version = opts.version;
  const w = new UgeBuf();
  w.writeU32(version);
  w.writeShortString(opts.name ?? 'Test');
  w.writeShortString('Artist');
  w.writeShortString('Comment');

  const ticks = opts.ticksPerRow ?? 7;

  if (version < 3) {
    const mixed = opts.mixed ?? [
      { type: 0, name: 'Lead', duty: 2 },
      { type: 1, name: 'Bass', waveIndex: 0, waveVolume: 1 },
      { type: 2, name: 'Kick', noiseMode: 1, initialVolume: 14, volumeSweepChange: 1 },
    ];
    while (mixed.length < 15) mixed.push({ type: 0 });
    for (const inst of mixed) writeInstrument(w, version, inst);
  } else {
    for (const inst of defaultBank(0, opts.duty ?? [{ type: 0, name: 'Lead', duty: 1, freqSweepTime: 3, sweepDir: 1, freqSweepShift: 2 }])) {
      writeInstrument(w, version, inst);
    }
    for (const inst of defaultBank(1, opts.wave ?? [{ type: 1, name: 'Pad', waveIndex: 1, waveVolume: 2 }])) {
      writeInstrument(w, version, inst);
    }
    for (const inst of defaultBank(2, opts.noise ?? [{ type: 2, name: 'Snare', noiseMode: 1, noiseMacro: [-2, -4, 0, 0, 0, 0] }])) {
      writeInstrument(w, version, inst);
    }
  }

  for (let t = 0; t < 16; t++) {
    for (let i = 0; i < 32; i++) w.writeU8(opts.waveNibble ?? (t === 1 ? 0xa : 0));
    if (version < 3) w.writeU8(0);
  }

  w.writeU32(ticks);
  if (version >= 6) {
    w.writeBool(false);
    w.writeU32(0);
  }

  w.writeU32(1); // one pattern
  if (version >= 5) w.writeU32(0); // pattern id
  for (let r = 0; r < 64; r++) {
    const note = r === 0 ? 36 : 90;
    const instrument = r === 0 ? 1 : 0;
    w.writeU32(note);
    w.writeU32(instrument);
    if (version >= 6) w.writeU32(0);
    w.writeU32(0);
    w.writeU8(0);
  }

  for (let c = 0; c < 4; c++) {
    w.writeU32(2); // length + 1
    w.writeU32(0); // pattern 0
    w.writeU32(0); // filler
  }

  if (version >= 2) {
    for (let i = 0; i < 16; i++) w.writeString('');
  }

  return w.toBuffer();
}
