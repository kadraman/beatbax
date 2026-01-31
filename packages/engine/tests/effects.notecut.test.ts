import { describe, it, expect } from '@jest/globals';
import { get } from '../src/effects/index.js';

describe('Note Cut Effect', () => {
  it('should register cut effect handler', () => {
    const handler = get('cut');
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should ramp gain to zero at cut time', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const gainCalls: Array<{ method: string; time: number; value?: number }> = [];
    const mockGainNode = {
      gain: {
        value: 1.0,
        setValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'setValueAtTime', time, value });
        },
        cancelScheduledValues: (time: number) => {
          gainCalls.push({ method: 'cancelScheduledValues', time });
        },
        exponentialRampToValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'exponentialRampToValueAtTime', time, value });
        },
      },
    };

    const nodes = [mockGainNode];
    const params = [4]; // Cut after 4 ticks
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM

    handler({}, nodes, params, start, dur, 1, tickSeconds);

    // Should schedule gain automation at cutTime = start + (4 ticks * 0.03125s) = 1.125s
    const expectedCutTime = 1.125;

    // Check that cancelScheduledValues was called
    const cancelCalls = gainCalls.filter(c => c.method === 'cancelScheduledValues');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].time).toBeCloseTo(expectedCutTime, 3);

    // Check that setValueAtTime was called at cut time
    const setValueCalls = gainCalls.filter(c => c.method === 'setValueAtTime');
    expect(setValueCalls.length).toBeGreaterThan(0);
    const cutSetValue = setValueCalls.find(c => Math.abs(c.time - expectedCutTime) < 0.001);
    expect(cutSetValue).toBeDefined();

    // Check that exponentialRampToValueAtTime was called shortly after
    const rampCalls = gainCalls.filter(c => c.method === 'exponentialRampToValueAtTime');
    expect(rampCalls.length).toBe(1);
    expect(rampCalls[0].time).toBeCloseTo(expectedCutTime + 0.005, 3);
    expect(rampCalls[0].value).toBeCloseTo(0.0001, 4);
  });

  it('should not exceed note duration', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const gainCalls: Array<{ method: string; time: number; value?: number }> = [];
    const mockGainNode = {
      gain: {
        value: 1.0,
        setValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'setValueAtTime', time, value });
        },
        cancelScheduledValues: (time: number) => {
          gainCalls.push({ method: 'cancelScheduledValues', time });
        },
        exponentialRampToValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'exponentialRampToValueAtTime', time, value });
        },
      },
    };

    const nodes = [mockGainNode];
    const params = [100]; // Cut after 100 ticks (longer than note)
    const start = 1.0;
    const dur = 0.5; // Note duration 0.5s
    const tickSeconds = 0.03125;

    handler({}, nodes, params, start, dur, 1, tickSeconds);

    // Should cap at note end time (start + dur = 1.5s)
    const expectedCutTime = start + dur; // 1.5s

    const cancelCalls = gainCalls.filter(c => c.method === 'cancelScheduledValues');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].time).toBeLessThanOrEqual(start + dur);
    expect(cancelCalls[0].time).toBeCloseTo(expectedCutTime, 3);
  });

  it('should handle zero or negative ticks gracefully', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const gainCalls: Array<{ method: string; time: number }> = [];
    const mockGainNode = {
      gain: {
        value: 1.0,
        setValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'setValueAtTime', time });
        },
        cancelScheduledValues: (time: number) => {
          gainCalls.push({ method: 'cancelScheduledValues', time });
        },
        exponentialRampToValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'exponentialRampToValueAtTime', time });
        },
      },
    };

    const nodes = [mockGainNode];

    // Zero ticks - should be ignored (no cut, since ticks <= 0)
    handler({}, nodes, [0], 1.0, 1.0, 1, 0.03125);
    expect(gainCalls.length).toBe(0);

    // Negative ticks - should be ignored (no cut)
    handler({}, nodes, [-1], 1.0, 1.0, 1, 0.03125);
    expect(gainCalls.length).toBe(0);

    // Positive ticks - should work
    handler({}, nodes, [1], 1.0, 1.0, 1, 0.03125);
    expect(gainCalls.length).toBeGreaterThan(0);

    // Check cut time is correct: 1.0 + (1 tick * 0.03125) = 1.03125
    const cancelCalls = gainCalls.filter(c => c.method === 'cancelScheduledValues');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].time).toBeCloseTo(1.03125, 5);
  });

  it('should use default tick duration if not provided', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const gainCalls: Array<{ method: string; time: number }> = [];
    const mockGainNode = {
      gain: {
        value: 1.0,
        setValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'setValueAtTime', time });
        },
        cancelScheduledValues: (time: number) => {
          gainCalls.push({ method: 'cancelScheduledValues', time });
        },
        exponentialRampToValueAtTime: (value: number, time: number) => {
          gainCalls.push({ method: 'exponentialRampToValueAtTime', time });
        },
      },
    };

    const nodes = [mockGainNode];
    const params = [4]; // Cut after 4 ticks
    const start = 1.0;
    const dur = 1.0;
    // tickSeconds undefined - should use default 0.03125

    handler({}, nodes, params, start, dur, 1);

    // Should use default: 4 * 0.03125 = 0.125, cutTime = 1.125
    const cancelCalls = gainCalls.filter(c => c.method === 'cancelScheduledValues');
    expect(cancelCalls.length).toBe(1);
    expect(cancelCalls[0].time).toBeCloseTo(1.125, 3);
  });
});
