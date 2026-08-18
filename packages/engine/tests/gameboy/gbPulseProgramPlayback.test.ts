/**
 * Game Boy pulse preview must honor duty_env / arp_env via the shared tick program.
 */

import { fillPulseBufferFromProgram, playPulse, PULSE_OUTPUT_GAIN } from '../../src/chips/gameboy/pulse';
import {
  applyPortamentoToRegister,
  applyTickOffsetToFreq,
  dutyIndexToFraction,
  HUGE_EFFECT_PORTA_DOWN,
  HUGE_EFFECT_PORTA_UP,
  lowerGameBoyInstrumentProgram,
  tickProgramHasDutyMotion,
  tickRowAtTime,
  tickRowDutyFraction,
  HUGE_TICK_SEC,
} from '../../src/chips/gameboy/instrumentProgram';
import { parse } from '../../src/parser/index';
import { resolveSong } from '../../src/song/resolver';
import { renderSongToPCM } from '../../src/audio/pcmRenderer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DEMO = join(__dirname, '../../../../songs/gameboy/instruments/gb_subpattern_macro_demo.bax');
const HUGE_WAV = join(
  __dirname,
  '../../../../songs/gameboy/instruments/game_boy_subpattern_macro_demo-from_hugetracker.wav',
);

describe('GB pulse tick-program playback', () => {
  test('duty_env rows expose changing duty fractions', () => {
    const prog = lowerGameBoyInstrumentProgram({
      duty_env: '[2,2,0,0|0]',
    });
    expect(tickRowDutyFraction(tickRowAtTime(prog, 0))).toBe(dutyIndexToFraction(2));
    expect(tickRowDutyFraction(tickRowAtTime(prog, 2 * HUGE_TICK_SEC))).toBe(dutyIndexToFraction(0));
  });

  test('arp_env offsets change rendered frequency content', () => {
    const prog = lowerGameBoyInstrumentProgram({ arp_env: '[0,12|0]' });
    const base = 261.63;
    const a = new Float32Array(2048);
    const b = new Float32Array(2048);
    fillPulseBufferFromProgram(a, 22050, base, 0.5, prog, false);
    fillPulseBufferFromProgram(
      b,
      22050,
      base,
      0.5,
      { enabled: false, rows: [], errors: [], warnings: [] },
      false,
    );
    // With +12 at 60 Hz, buffer energy should differ from a static oscillator.
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(10);
    expect(applyTickOffsetToFreq(base, 12)).toBeCloseTo(base * 2, 5);
  });

  test('duty_env changes pulse waveform vs static duty', () => {
    const prog = lowerGameBoyInstrumentProgram({
      duty_env: '[0,0,0,0,3,3,3,3|0]',
    });
    const thin = new Float32Array(4096);
    const fat = new Float32Array(4096);
    fillPulseBufferFromProgram(thin, 22050, 440, 0.5, prog, false);
    fillPulseBufferFromProgram(
      fat,
      22050,
      440,
      0.5,
      { enabled: false, rows: [], errors: [], warnings: [] },
      false,
    );
    let diff = 0;
    for (let i = 0; i < thin.length; i++) diff += Math.abs(thin[i] - fat[i]);
    expect(diff).toBeGreaterThan(10);
  });

  test('demo song wah/arp instruments render non-silent PCM', () => {
    const song = resolveSong(parse(readFileSync(DEMO, 'utf8')) as any);
    expect(song.insts.wah.duty_env).toBeTruthy();
    expect(song.insts.arp.arp_env).toBeTruthy();
    const wahProg = lowerGameBoyInstrumentProgram(song.insts.wah as any);
    const arpProg = lowerGameBoyInstrumentProgram(song.insts.arp as any);
    expect(wahProg.enabled).toBe(true);
    expect(arpProg.enabled).toBe(true);
    expect(tickRowDutyFraction(tickRowAtTime(wahProg, 0))).toBe(0.5);
    expect(tickRowDutyFraction(tickRowAtTime(wahProg, 8 * HUGE_TICK_SEC))).toBe(0.125);
    expect(tickRowAtTime(arpProg, 0)?.offset).toBe(0);
    expect(tickRowAtTime(arpProg, 1 * HUGE_TICK_SEC)?.offset).toBe(4);

    const samples = renderSongToPCM(song, { sampleRate: 22050 });
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    expect(peak).toBeGreaterThan(0.01);
  });

  test('demo PCM levels track hUGETracker reference WAV', () => {
    if (!existsSync(HUGE_WAV)) return;

    const song = resolveSong(parse(readFileSync(DEMO, 'utf8')) as any);
    const pcm = renderSongToPCM(song, {
      sampleRate: 44100,
      channels: 1,
      bpm: 128,
      normalize: false,
    });

    const hugeBuf = readFileSync(HUGE_WAV);
    const hugeRate = hugeBuf.readUInt32LE(24);
    const hugeCh = hugeBuf.readUInt16LE(22);
    let pos = 12;
    let data: Buffer | null = null;
    while (pos < hugeBuf.length - 8) {
      const id = hugeBuf.toString('ascii', pos, pos + 4);
      const sz = hugeBuf.readUInt32LE(pos + 4);
      pos += 8;
      if (id === 'data') data = hugeBuf.subarray(pos, pos + sz);
      pos += sz + (sz % 2);
    }
    if (!data) return;

    const frames = data.length / (hugeCh * 2);
    const huge = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < hugeCh; c++) s += data.readInt16LE((i * hugeCh + c) * 2) / 32768;
      huge[i] = s / hugeCh;
    }

    const peak = (buf: Float32Array | Float64Array, a: number, b: number) => {
      let p = 0;
      for (let i = a; i < b && i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
      return p;
    };
    // Sequential demo: drums ~0–1.85s, wah ~1.85–3.65s
    const drumCli = peak(pcm, 0, Math.floor(1.7 * 44100));
    const drumHuge = peak(huge, 0, Math.floor(1.7 * hugeRate));
    const wahCli = peak(pcm, Math.floor(2.2 * 44100), Math.floor(3.4 * 44100));
    const wahHuge = peak(huge, Math.floor(2.2 * hugeRate), Math.floor(3.4 * hugeRate));

    expect(drumHuge).toBeGreaterThan(0.05);
    expect(wahHuge).toBeGreaterThan(0.05);
    expect(drumCli / drumHuge).toBeGreaterThan(0.85);
    expect(drumCli / drumHuge).toBeLessThan(1.2);
    expect(wahCli / wahHuge).toBeGreaterThan(0.85);
    expect(wahCli / wahHuge).toBeLessThan(1.2);
    // Held env=12 should land near 12/15 × PULSE_OUTPUT_GAIN
    expect(wahCli).toBeCloseTo((12 / 15) * PULSE_OUTPUT_GAIN, 2);
  });

  test('1xx/2xx adjust the period register and do not count as duty motion', () => {
    expect(applyPortamentoToRegister(1000, { offset: null, effect: { code: HUGE_EFFECT_PORTA_UP, param: 5 } })).toBe(1005);
    expect(applyPortamentoToRegister(1000, { offset: null, effect: { code: HUGE_EFFECT_PORTA_DOWN, param: 3 } })).toBe(997);
    expect(applyPortamentoToRegister(1000, { offset: null })).toBe(1000);
    const prog = lowerNativeOrFx();
    expect(tickProgramHasDutyMotion(prog)).toBe(false);
  });

  test('1xx porta changes rendered frequency vs a static pulse', () => {
    const prog = {
      enabled: true,
      rows: [
        { offset: null, effect: { code: HUGE_EFFECT_PORTA_UP, param: 40 } },
        { offset: null, jump: 1 },
      ],
      errors: [] as string[],
      warnings: [] as string[],
    };
    const moving = new Float32Array(4096);
    const staticBuf = new Float32Array(4096);
    fillPulseBufferFromProgram(moving, 22050, 440, 0.75, prog, false);
    fillPulseBufferFromProgram(
      staticBuf,
      22050,
      440,
      0.75,
      { enabled: false, rows: [], errors: [], warnings: [] },
      false,
    );
    let diff = 0;
    for (let i = 0; i < moving.length; i++) diff += Math.abs(moving[i] - staticBuf[i]);
    expect(diff).toBeGreaterThan(10);
  });

  test('playPulse keeps PeriodicWave for 1xx-only subpats (not a raw-square buffer)', () => {
    const { ctx } = makePulsePreviewCtx();
    playPulse(ctx, 587, 0.75, 0, 0.5, {
      env: { level: 11, direction: 'flat', period: 0, format: 'gb' },
      subpatRows: [
        { empty: true },
        { empty: true },
        { fx: { code: 1, param: 1 } },
        { empty: true },
        { jump: 3 },
      ],
    });
    expect(ctx.createPeriodicWave).toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    const osc = ctx.createOscillator.mock.results[0].value;
    expect(osc.frequency.setValueAtTime.mock.calls.length).toBeGreaterThan(1);
  });

  test('playPulse still bakes a buffer when duty_env changes', () => {
    const { ctx } = makePulsePreviewCtx();
    playPulse(ctx, 440, 0.5, 0, 0.1, {
      env: { level: 12, direction: 'flat', period: 0, format: 'gb' },
      duty_env: '[2,2,0,0|0]',
    });
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });
});

function lowerNativeOrFx() {
  return lowerGameBoyInstrumentProgram({
    subpatRows: [
      { empty: true },
      { fx: { code: 1, param: 1 } },
      { jump: 2 },
    ],
  });
}

function makePulsePreviewCtx() {
  const gainParam = {
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    value: 1,
  };
  const ctx: any = {
    sampleRate: 44100,
    destination: {},
    createPeriodicWave: jest.fn(() => ({})),
    createOscillator: jest.fn(() => ({
      setPeriodicWave: jest.fn(),
      frequency: {
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
      },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    })),
    createBuffer: jest.fn((_ch: number, len: number) => ({
      getChannelData: jest.fn(() => new Float32Array(len)),
    })),
    createBufferSource: jest.fn(() => ({
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    })),
    createGain: jest.fn(() => ({
      gain: gainParam,
      connect: jest.fn(),
    })),
  };
  return { ctx, gainParam };
}
