import {
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
    expect(mid).toBeGreaterThan(220);
    expect(mid).toBeLessThan(440);
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
    expect(fx.arpOffsets).toEqual([4, 7]);
    expect(fx.portSpeed).toBe(16);
    expect(fx.echo?.delayTimeRaw).toBe(0.25);
    expect(fx.retrig?.interval).toBe(2);
    expect(fx.cutEnabled).toBe(true);
  });

  test('resolveEchoDelaySec treats values under 10 as beat fractions', () => {
    // tickSeconds * 16 = seconds per beat; at 0.1 tick → 1.6 s/beat
    expect(resolveEchoDelaySec(0.25, 0.1)).toBeCloseTo(0.4, 8);
    expect(resolveEchoDelaySec(10, 0.1)).toBe(10);
  });
});
