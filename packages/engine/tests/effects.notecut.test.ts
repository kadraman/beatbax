import { describe, it, expect } from '@jest/globals';
import { register, get } from '../src/effects/index.js';

describe('Note Cut Effect', () => {
  it('should register cut effect handler', () => {
    const handler = get('cut');
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should stop oscillator at cut time', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const stopTimes: number[] = [];
    const mockOscillator = {
      stop: (time: number) => stopTimes.push(time),
    };

    const nodes = [mockOscillator];
    const params = [4]; // Cut after 4 ticks
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM

    handler({}, nodes, params, start, dur, 1, tickSeconds);

    // Should schedule stop at start + (4 ticks * 0.03125s) = 1.125s
    expect(stopTimes.length).toBe(1);
    expect(stopTimes[0]).toBeCloseTo(1.125, 3);
  });

  it('should not exceed note duration', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const stopTimes: number[] = [];
    const mockOscillator = {
      stop: (time: number) => stopTimes.push(time),
    };

    const nodes = [mockOscillator];
    const params = [100]; // Cut after 100 ticks (longer than note)
    const start = 1.0;
    const dur = 0.5; // Note duration 0.5s
    const tickSeconds = 0.03125;

    handler({}, nodes, params, start, dur, 1, tickSeconds);

    // Should cap at note end time (start + dur = 1.5s)
    expect(stopTimes.length).toBe(1);
    expect(stopTimes[0]).toBeLessThanOrEqual(start + dur);
    expect(stopTimes[0]).toBeCloseTo(1.5, 3);
  });

  it('should handle zero or negative ticks gracefully', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const stopTimes: number[] = [];
    const mockOscillator = {
      stop: (time: number) => stopTimes.push(time),
    };

    const nodes = [mockOscillator];

    // Zero ticks - should be ignored (no cut, since ticks <= 0)
    handler({}, nodes, [0], 1.0, 1.0, 1, 0.03125);
    expect(stopTimes.length).toBe(0);

    // Negative ticks - should be ignored (no cut)
    handler({}, nodes, [-1], 1.0, 1.0, 1, 0.03125);
    expect(stopTimes.length).toBe(0);

    // Positive ticks - should work
    handler({}, nodes, [1], 1.0, 1.0, 1, 0.03125);
    expect(stopTimes.length).toBe(1);
    expect(stopTimes[0]).toBeCloseTo(1.03125, 5);
  });

  it('should use default tick duration if not provided', () => {
    const handler = get('cut');
    if (!handler) throw new Error('cut handler not found');

    const stopTimes: number[] = [];
    const mockOscillator = {
      stop: (time: number) => stopTimes.push(time),
    };

    const nodes = [mockOscillator];
    const params = [4]; // Cut after 4 ticks
    const start = 1.0;
    const dur = 1.0;
    // tickSeconds undefined - should use default 0.03125

    handler({}, nodes, params, start, dur, 1);

    // Should use default: 4 * 0.03125 = 0.125
    expect(stopTimes.length).toBe(1);
    expect(stopTimes[0]).toBeCloseTo(1.125, 3);
  });
});
