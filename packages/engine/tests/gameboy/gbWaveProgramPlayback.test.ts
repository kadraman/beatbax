/**
 * Game Boy wave preview must honor pitch_env via the shared tick program.
 */

import {
  applyTickOffsetToFreq,
  lowerGameBoyInstrumentProgram,
  tickRowAtTime,
  HUGE_TICK_SEC,
} from '../../src/chips/gameboy/instrumentProgram';
import { parse } from '../../src/parser/index';
import { resolveSong } from '../../src/song/resolver';
import { renderSongToPCM } from '../../src/audio/pcmRenderer';

describe('GB wave tick-program playback', () => {
  test('wave pitch_env lowers to tick offsets', () => {
    const prog = lowerGameBoyInstrumentProgram({
      pitch_env: '[0,-1,-2,-3]',
    });
    expect(prog.enabled).toBe(true);
    expect(prog.errors).toEqual([]);
    expect(tickRowAtTime(prog, 0)?.offset).toBe(0);
    expect(tickRowAtTime(prog, 1 * HUGE_TICK_SEC)?.offset).toBe(-1);
    expect(tickRowAtTime(prog, 2 * HUGE_TICK_SEC)?.offset).toBe(-2);
    expect(tickRowAtTime(prog, 3 * HUGE_TICK_SEC)?.offset).toBe(-3);
    expect(applyTickOffsetToFreq(65.41, -3)).toBeLessThan(65.41);
  });

  test('pitch_env changes wave PCM vs static wavekick', () => {
    const withDrop = resolveSong(parse(`
chip gameboy
bpm 120
inst wk type=wave volume=50 wave=[15,15,14,12,9,6,4,2,1,0,0,0,0,0,0,0] note=C2 pitch_env=[0,-4,-8,-12]
pat p = wk:4
channel 3 => inst wk seq p
`) as any);
    const staticKick = resolveSong(parse(`
chip gameboy
bpm 120
inst wk type=wave volume=50 wave=[15,15,14,12,9,6,4,2,1,0,0,0,0,0,0,0] note=C2
pat p = wk:4
channel 3 => inst wk seq p
`) as any);

    const a = renderSongToPCM(withDrop, { sampleRate: 22050, channels: 1 });
    const b = renderSongToPCM(staticKick, { sampleRate: 22050, channels: 1 });
    expect(a.length).toBe(b.length);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    expect(diff).toBeGreaterThan(10);
  });
});
