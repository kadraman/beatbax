import {
  lfoSample,
  modulatePitchHz,
  noteCutGain,
  oscillatorSample,
  tremoloGain,
  vibratoAmplitudeHz,
  portamentoDurationSec,
  portamentoFreqAt,
  arpSemitoneAt,
  applyArpToFreq,
  parseNoteEffects,
  resolveEchoDelaySec,
  chipFrameRate,
} from '../src/effects/modulation.js';
import { arpCycleOffsets } from '../src/util/arpOffsets.js';

describe('modulation kernel (112)', () => {
  test('vibratoAmplitudeHz matches f²/131072 depth model', () => {
    const f = 440;
    const amp = vibratoAmplitudeHz(6, f);
    expect(amp).toBeCloseTo(6 * f * f / 131072, 6);
  });

  test('portamentoDurationSec matches WebAudio formula', () => {
    const dur = 0.5;
    const speed = 16;
    expect(portamentoDurationSec(speed, dur)).toBeCloseTo((256 - 16) / 256 * dur * 0.6, 8);
    expect(portamentoDurationSec(speed, dur, 0.1)).toBe(0.1);
  });

  test('portamentoFreqAt exponential reaches target', () => {
    expect(portamentoFreqAt(0, 220, 440, 0.2, 'exponential')).toBeCloseTo(220, 0);
    expect(portamentoFreqAt(0.2, 220, 440, 0.2, 'exponential')).toBeCloseTo(440, 0);
    const mid = portamentoFreqAt(0.1, 220, 440, 0.2, 'exponential');
    // Halfway on exponentialRamp is the geometric mean, matching WebAudio.
    expect(mid).toBeCloseTo(Math.sqrt(220 * 440), 3);
  });

  test('arp cycle includes root then offsets at 60 Hz', () => {
    expect(arpCycleOffsets([4, 7])).toEqual([0, 4, 7]);
    expect(chipFrameRate('gameboy')).toBe(60);
    expect(arpSemitoneAt(0, [4, 7], 'gameboy')).toBe(0);
    expect(arpSemitoneAt(1 / 60, [4, 7], 'gameboy')).toBe(4);
    expect(arpSemitoneAt(2 / 60, [4, 7], 'gameboy')).toBe(7);
    const f = applyArpToFreq(440, 1 / 60, [4, 7], 'gameboy');
    expect(f).toBeCloseTo(440 * Math.pow(2, 4 / 12), 6);
  });

  test('parseNoteEffects extracts vib/arp/port/echo/retrig', () => {
    const fx = parseNoteEffects(
      [
        { type: 'vib', params: [6, 4] },
        { type: 'arp', params: [4, 7] },
        { type: 'port', params: [16] },
        { type: 'echo', params: [0.25, 50, 30] },
        { type: 'retrig', params: [2, -2] },
        { type: 'cut', params: [4] },
      ],
      0.5,
      0.1
    );
    expect(fx.vibDepth).toBe(6);
    expect(fx.vibRate).toBe(4);
    const rateOmitted = parseNoteEffects([{ type: 'vib', params: [4] }], 0.5, 0.1);
    expect(rateOmitted.vibRate).toBe(4);
    expect(fx.arpOffsets).toEqual([4, 7]);
    expect(fx.portSpeed).toBe(16);
    expect(fx.echo?.delayTimeRaw).toBe(0.25);
    expect(fx.retrig?.interval).toBe(2);
    expect(fx.cutEnabled).toBe(true);
  });

  test('square vibrato starts high, matching the WebAudio LFO buffer', () => {
    expect(lfoSample(0, 'square')).toBe(1);
    expect(lfoSample(0, 'sine')).toBeCloseTo(0, 6);
    const fx = parseNoteEffects([{ type: 'vib', params: [6, 5, 'square'] }], 1, 0.1);
    const amp = vibratoAmplitudeHz(6, 440);
    const at0 = modulatePitchHz({ t: 0, noteDurSec: 1, baseFreq: 440, fx, vibratoPhase: 0 });
    expect(at0.freq).toBeCloseTo(440 + amp, 4);
  });

  test('tremolo phase starts when the delay ends', () => {
    const depth = 15;
    const rate = 6;
    const delay = 0.1;
    expect(tremoloGain(delay - 0.001, depth, rate, 'sine', undefined, delay, 0.5)).toBe(1);
    // OscillatorNode sine is 0 at lfo.start(), then rises.
    expect(tremoloGain(delay, depth, rate, 'sine', undefined, delay, 0.5)).toBeCloseTo(1, 5);
    const quarter = delay + 1 / (4 * rate);
    expect(tremoloGain(quarter, depth, rate, 'sine', undefined, delay, 0.5)).toBeCloseTo(1.5, 4);
    expect(oscillatorSample(0, 'saw')).toBeCloseTo(0, 5);
    expect(oscillatorSample(0, 'triangle')).toBeCloseTo(0, 5);
    expect(oscillatorSample(Math.PI / 2, 'triangle')).toBeCloseTo(1, 5);
  });

  test('note cut ramps from the current voice gain to 0.0001', () => {
    const tick = 0.1;
    const g = 0.2;
    expect(noteCutGain(0.2 - 0.001, 2, tick, g)).toBe(1);
    expect(noteCutGain(0.2, 2, tick, g)).toBeCloseTo(1, 5);
    expect(noteCutGain(0.2 + 0.0025, 2, tick, g)).toBeCloseTo(Math.sqrt(0.0001 / g), 4);
    expect(noteCutGain(0.2 + 0.005, 2, tick, g)).toBe(0);
    expect(noteCutGain(0.4, 8, tick, g, 0.4)).toBe(1);
  });

  test('resolveEchoDelaySec treats values under 10 as beat fractions', () => {
    // tickSeconds * 16 = seconds per beat; at 0.1 tick → 1.6 s/beat
    expect(resolveEchoDelaySec(0.25, 0.1)).toBeCloseTo(0.4, 8);
    expect(resolveEchoDelaySec(10, 0.1)).toBe(10);
  });
});
