import type { InstrumentNode } from '@beatbax/engine';
import type { VgmBackend, SongLike, VgmTranslateResult } from './types.js';
import type { Gd3Fields } from '../gd3.js';
import type { VgmHeaderParams } from '../vgmWriter.js';
import { appendWait } from '../vgmWriter.js';
import {
  AY8910_CLOCK_NTSC,
  AY8910_CLOCK_PAL,
  CMD_AY8910_WRITE,
  SAMPLES_PER_60HZ,
} from '../constants.js';
import {
  type Effect,
  type BaseChannelSimState,
  makeBaseChannelState,
  resolveInstrument,
  midiToFreqForNote,
  calcTremoloAttenuation,
  parseGenericEffectsOnNoteOn,
  advanceGenericFrames,
} from './channelSim.js';
import { version } from '../version.js';

const AY_ALIASES: readonly string[] = [
  'ay',
  'ym2149',
  'ay38910',
  'ay3-8910',
  'atari-st',
  'msx',
  'amstrad-cpc',
  'vectrex',
  'zx-spectrum-128',
  'oric-1',
  'colour-genie',
  'apple-ii-mockingboard',
  'intellivision',
];

const AY_REGS = {
  toneALo: 0,
  toneAHi: 1,
  toneBLo: 2,
  toneBHi: 3,
  toneCLo: 4,
  toneCHi: 5,
  noisePeriod: 6,
  mixer: 7,
  volA: 8,
  volB: 9,
  volC: 10,
  envPeriodLo: 11,
  envPeriodHi: 12,
  envShape: 13,
} as const;

interface AyChannelState extends BaseChannelSimState {
  toneEnabled: boolean;
  noiseEnabled: boolean;
  noiseRate: number;
  useEnvelope: boolean;
  envShape: number;
}

function normAlias(chip: string): string {
  return chip.toLowerCase().replace(/[\s_-]/g, '');
}

const NORMALIZED_AY_ALIASES = new Set(AY_ALIASES.map(normAlias));

function isAyChip(chip: string): boolean {
  return NORMALIZED_AY_ALIASES.has(normAlias(chip));
}

function mapEnvShape(shape: string | undefined): number {
  switch (String(shape ?? 'none').toLowerCase()) {
    case 'attack_decay': return 0x0B;
    case 'attack_decay_repeat': return 0x08;
    case 'decay_only': return 0x00;
    case 'decay_repeat': return 0x09;
    case 'attack_only': return 0x04;
    case 'hold': return 0x01;
    case 'attack_hold': return 0x0D;
    case 'decay_quick': return 0x00;
    default: return 0x00;
  }
}

function ayRegionClock(song: SongLike): { clock: number; rate: number; systemName: string } {
  const region = String(song.chipRegion || song.chip || '').toLowerCase();
  if (region === 'atari-st') {
    return { clock: 2_000_000, rate: 50, systemName: 'Atari ST' };
  }
  if (region === 'msx') {
    return { clock: 1_789_772, rate: 60, systemName: 'MSX' };
  }
  if (region === 'amstrad-cpc') {
    return { clock: 1_000_000, rate: 50, systemName: 'Amstrad CPC' };
  }
  if (region === 'vectrex') {
    return { clock: 1_500_000, rate: 60, systemName: 'Vectrex' };
  }
  if (region === 'zx-spectrum-128') {
    return { clock: AY8910_CLOCK_PAL, rate: 50, systemName: 'ZX Spectrum 128' };
  }
  return { clock: AY8910_CLOCK_NTSC, rate: 60, systemName: 'AY-3-8910 / YM2149' };
}

function freqToPeriod(freq: number, clock: number): number {
  if (freq <= 0) return 1;
  return Math.max(1, Math.min(0x0fff, Math.round(clock / (16 * freq))));
}

function clampLevel(v: number): number {
  return Math.max(0, Math.min(15, Math.round(v)));
}

function makeChannelState(): AyChannelState {
  return {
    ...makeBaseChannelState(0),
    toneEnabled: true,
    noiseEnabled: false,
    noiseRate: 0,
    useEnvelope: false,
    envShape: 0,
  };
}

function applyInstrumentDefaults(state: AyChannelState, inst: InstrumentNode | null): void {
  const type = String(inst?.type ?? 'tone').toLowerCase();
  state.toneEnabled = type !== 'noise';
  state.noiseEnabled = type === 'noise' || String(inst?.noise ?? 'off').toLowerCase() === 'on';
  state.noiseRate = Math.max(0, Math.min(31, Number(inst?.noise_rate ?? 0)));

  const envName = String(inst?.env ?? 'none').toLowerCase();
  const useEnvField = typeof inst?.use_envelope === 'boolean'
    ? inst.use_envelope
    : String(inst?.use_envelope ?? 'false').toLowerCase() === 'true';
  state.useEnvelope =
    (typeof inst?.vol === 'string' && inst.vol.toLowerCase() === 'use_envelope') ||
    useEnvField ||
    (inst?.vol === undefined && envName !== 'none');
  state.envShape = mapEnvShape(envName);

  const vol = Number(inst?.vol ?? 12);
  state.attenuation = clampLevel(Number.isFinite(vol) ? vol : 12);
}

function writeAyReg(reg: number, value: number, shadow: Int16Array, out: number[]): void {
  const val = value & 0xff;
  if (shadow[reg] === val) return;
  shadow[reg] = val;
  out.push(CMD_AY8910_WRITE, reg & 0xff, val);
}

function updateRegisters(
  states: AyChannelState[],
  clock: number,
  shadow: Int16Array,
  out: number[],
): void {
  let noiseRate = 0;
  let envShape = 0;
  let anyEnvelope = false;

  let mixer = 0;

  for (let i = 0; i < 3; i += 1) {
    const st = states[i] ?? makeChannelState();
    const toneDisableBit = i;
    const noiseDisableBit = i + 3;

    if (!st.active || !st.toneEnabled) mixer |= (1 << toneDisableBit);
    if (!st.active || !st.noiseEnabled) mixer |= (1 << noiseDisableBit);

    if (st.active) {
      const period = st.toneEnabled ? freqToPeriod(st.freq, clock) : 0;
      const lo = period & 0xff;
      const hi = (period >> 8) & 0x0f;
      writeAyReg(AY_REGS.toneALo + i * 2, lo, shadow, out);
      writeAyReg(AY_REGS.toneAHi + i * 2, hi, shadow, out);

      if (st.noiseEnabled) noiseRate = Math.max(noiseRate, st.noiseRate);
      if (st.useEnvelope) {
        anyEnvelope = true;
        envShape = st.envShape;
      }
    }

    const level = st.active
      ? calcTremoloAttenuation(st, st.attenuation, true)
      : 0;
    const volReg = st.active && st.useEnvelope ? 0x10 : clampLevel(level);
    writeAyReg(AY_REGS.volA + i, volReg, shadow, out);
  }

  writeAyReg(AY_REGS.noisePeriod, noiseRate & 0x1f, shadow, out);
  writeAyReg(AY_REGS.mixer, mixer & 0x3f, shadow, out);

  if (anyEnvelope) {
    // Fixed starter envelope period (0x0030) used for deterministic AY shape playback in v1.
    writeAyReg(AY_REGS.envPeriodLo, 0x30, shadow, out);
    writeAyReg(AY_REGS.envPeriodHi, 0x00, shadow, out);
    writeAyReg(AY_REGS.envShape, envShape & 0x0f, shadow, out);
  }
}

export const ay38910VgmBackend: VgmBackend = {
  chipAliases: AY_ALIASES,

  validate(song: SongLike): string[] {
    const errors: string[] = [];

    if (!song.chip || !isAyChip(song.chip)) {
      errors.push(`VGM exporter only supports AY-family chips for this backend. Found chip=${JSON.stringify(song.chip)}.`);
    }

    if (song.channels.length === 0) {
      errors.push('Song has no channels.');
    }

    if (song.channels.length > 3) {
      errors.push(`AY-3-8910 has 3 channels but ${song.channels.length} channels are defined.`);
    }

    return errors;
  },

  translate(song: SongLike): VgmTranslateResult {
    const bpm = song.bpm ?? 120;
    const tickSeconds = (60 / bpm) / 4;
    const framesPerTick = 60 * tickSeconds;

    const { clock } = ayRegionClock(song);
    const insts = (song.insts ?? {}) as Record<string, InstrumentNode>;
    const channels = song.channels;

    const states = channels.map(() => makeChannelState());
    const defaults = channels.map((ch) => ch.defaultInstrument);
    const maxTicks = Math.max(...channels.map((ch) => ch.events.length), 0);

    const shadow = new Int16Array(16);
    shadow.fill(-1);

    const dataBytes: number[] = [];
    let totalSamples = 0;
    let hasRetrig = false;
    let globalFrameAccum = 0;

    for (let tick = 0; tick < maxTicks; tick += 1) {
      for (let ci = 0; ci < channels.length; ci += 1) {
        const ch = channels[ci];
        if (tick >= ch.events.length) continue;

        const ev = ch.events[tick];
        const st = states[ci];

        if (ev.type === 'note' || ev.type === 'named') {
          const inst = resolveInstrument(ev as any, insts, defaults[ci]);
          applyInstrumentDefaults(st, inst);

          const noteName = ev.type === 'note'
            ? (ev.token ?? 'C4')
            : (ev.defaultNote ?? 'C4');

          st.active = true;
          st.freq = midiToFreqForNote(noteName);
          st.baseFreq = st.freq;
          st.noteFrame = 0;
          st.cutDone = false;
          st.retrigTick = 0;

          if (ev.effects && ev.effects.length > 0) {
            parseGenericEffectsOnNoteOn(ev.effects as Effect[], st, noteName, tickSeconds, framesPerTick);
            if (ev.effects.some((fx) => String((fx as any).type).toLowerCase() === 'retrig')) {
              hasRetrig = true;
            }
          }
        } else if (ev.type === 'rest') {
          st.active = false;
          st.freq = 0;
        }
      }

      globalFrameAccum += framesPerTick;
      const framesThisTick = Math.floor(globalFrameAccum);
      globalFrameAccum -= framesThisTick;

      for (let f = 0; f < framesThisTick; f += 1) {
        for (const st of states) {
          if (!st.active) continue;
          advanceGenericFrames(st, 1);
        }

        updateRegisters(states, clock, shadow, dataBytes);
        appendWait(dataBytes, SAMPLES_PER_60HZ);
        totalSamples += SAMPLES_PER_60HZ;
      }
    }

    // hard mute at end
    for (let i = 0; i < 3; i += 1) {
      writeAyReg(AY_REGS.volA + i, 0, shadow, dataBytes);
    }

    dataBytes.push(0x66);

    return {
      dataBytes: new Uint8Array(dataBytes),
      totalSamples,
      hasRetrig,
      clock,
      isGameGear: false,
    };
  },

  buildGd3Fields(song: SongLike, result: VgmTranslateResult): Gd3Fields {
    const meta = song.metadata ?? {};
    const { systemName } = ayRegionClock(song);
    const noteParts: string[] = [];
    if (meta.description) noteParts.push(meta.description);
    if (result.hasRetrig) {
      noteParts.push('[BeatBax] retrig effect used: AY export approximates retrigger timing.');
    }

    return {
      trackTitleEn: String(meta.name ?? ''),
      gameNameEn: String(meta.name ?? ''),
      systemNameEn: systemName,
      authorEn: String(meta.artist ?? ''),
      date: '',
      creator: `BeatBax VGM Exporter v${version}`,
      notes: noteParts.join(' '),
    };
  },

  headerParams(song: SongLike, result: VgmTranslateResult): VgmHeaderParams {
    const { rate } = ayRegionClock(song);
    return {
      ay8910Clock: result.clock,
      rate,
    };
  },
};

export const ayVgmBackend = ay38910VgmBackend;
