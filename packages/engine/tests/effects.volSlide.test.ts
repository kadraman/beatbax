import { describe, expect, it } from '@jest/globals';
import { get } from '../src/effects/index.js';

describe('volSlide gain stage', () => {
  it('ramps a stage after the voice and leaves the envelope gain alone', () => {
    const handler = get('volSlide');
    if (!handler) throw new Error('volSlide handler not found');

    const slideCalls: Array<{ method: string; value: number; time: number }> = [];
    const slide = {
      gain: {
        setValueAtTime: (value: number, time: number) => {
          slideCalls.push({ method: 'setValueAtTime', value, time });
        },
        linearRampToValueAtTime: (value: number, time: number) => {
          slideCalls.push({ method: 'linearRampToValueAtTime', value, time });
        },
      },
      connect: () => {},
    };
    const dest = { name: 'dest' };
    let voiceWrites = 0;
    const voice = {
      __beatbaxDest: dest,
      disconnect: () => {},
      connect: () => {},
      gain: {
        setValueAtTime: () => { voiceWrites += 1; },
        cancelScheduledValues: () => { voiceWrites += 1; },
        linearRampToValueAtTime: () => { voiceWrites += 1; },
      },
    };
    const nodes: any[] = [{}, voice];
    handler({ createGain: () => slide }, nodes, [12], 0, 1, 1, 0.125, {
      type: 'pulse1',
      env: 'gb:4,flat',
    });

    expect(voiceWrites).toBe(0);
    expect((nodes as any).__tail).toBe(slide);
    const ramp = slideCalls.find((c) => c.method === 'linearRampToValueAtTime');
    // env 4/15 + 1.2 clamps to 1, so the stage ends at 1 / (4/15).
    expect(ramp?.value).toBeCloseTo(15 / 4, 5);
    expect(ramp?.time).toBeCloseTo(1, 5);
  });

  it('writes chip gain times the level when the envelope starts at zero', () => {
    const handler = get('volSlide');
    if (!handler) throw new Error('volSlide handler not found');

    const calls: Array<{ method: string; value: number; time: number }> = [];
    const voice = {
      gain: {
        setValueAtTime: (value: number, time: number) => {
          calls.push({ method: 'setValueAtTime', value, time });
        },
        cancelScheduledValues: () => {},
        linearRampToValueAtTime: (value: number, time: number) => {
          calls.push({ method: 'linearRampToValueAtTime', value, time });
        },
      },
    };
    handler({ createGain: () => null }, [{}, voice], [10], 0, 0.5, 1, 0.125, {
      type: 'pulse1',
      env: 'gb:0,flat',
    });

    const end = calls.find((c) => c.method === 'linearRampToValueAtTime' && Math.abs(c.time - 0.5) < 1e-6);
    // +10 reaches level 1, times the pulse output gain 0.25.
    expect(end?.value).toBeCloseTo(0.25, 5);
  });
});
