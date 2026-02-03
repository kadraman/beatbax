import { describe, it, expect } from '@jest/globals';
import { get } from '../src/effects/index.js';

describe('Echo Effect', () => {
  it('should register echo effect handler', () => {
    const handler = get('echo');
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should store echo metadata on nodes array', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.25, 50, 30]; // Quarter beat delay, 50% feedback, 30% mix
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    // Should attach metadata to nodes array
    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.125); // 0.25 * (0.03125 * 16)
    expect((mockNodes as any).__echo.feedback).toBe(0.5);
    expect((mockNodes as any).__echo.mix).toBe(0.3);
    expect((mockNodes as any).__echo.start).toBe(1.0);
    expect((mockNodes as any).__echo.dur).toBe(1.0);
  });

  it('should handle absolute time delays (>= 10.0 seconds)', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [12.0]; // 12.0 seconds (absolute)
    const start = 1.0;
    const dur = 1.0;

    handler({}, mockNodes, params, start, dur, 1);

    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.delayTime).toBe(12.0); // Used as-is (absolute)
  });

  it('should handle beat-fraction delays (< 10.0)', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.5]; // Half beat delay
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    // 0.5 * (0.03125 * 16) = 0.5 * 0.5 = 0.25 seconds
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.25);
  });
  it('should treat 1.0 as one whole beat (not 1 second)', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [1.0]; // One whole beat
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM (0.5 seconds per beat)

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    // 1.0 * (0.03125 * 16) = 1.0 * 0.5 = 0.5 seconds (one beat at 120 BPM)
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.5);
  });
  it('should use default feedback when not provided', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.25]; // Only delay time
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125;

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.feedback).toBe(0.5); // Default 50%
  });

  it('should use default mix when not provided', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.25, 60]; // Delay time and feedback, no mix
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125;

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.feedback).toBe(0.6); // 60%
    expect((mockNodes as any).__echo.mix).toBe(0.3); // Default 30%
  });

  it('should clamp feedback to 0-100% range', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodesHigh: any[] = [];
    const mockNodesLow: any[] = [];

    // Test high value (should clamp to 100%)
    handler({}, mockNodesHigh, [0.25, 150], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesHigh as any).__echo.feedback).toBe(1.0); // Clamped to 100%

    // Test low value (should clamp to 0%)
    handler({}, mockNodesLow, [0.25, -50], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesLow as any).__echo.feedback).toBe(0.0); // Clamped to 0%
  });

  it('should clamp mix to 0-100% range', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodesHigh: any[] = [];
    const mockNodesLow: any[] = [];

    // Test high value (should clamp to 100%)
    handler({}, mockNodesHigh, [0.25, 50, 200], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesHigh as any).__echo.mix).toBe(1.0); // Clamped to 100%

    // Test low value (should clamp to 0%)
    handler({}, mockNodesLow, [0.25, 50, -30], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesLow as any).__echo.mix).toBe(0.0); // Clamped to 0%
  });

  it('should handle zero or negative delay time gracefully', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodesZero: any[] = [];
    const mockNodesNegative: any[] = [];

    // Zero delay - should be ignored
    handler({}, mockNodesZero, [0], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesZero as any).__echo).toBeUndefined();

    // Negative delay - should be ignored
    handler({}, mockNodesNegative, [-0.5], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesNegative as any).__echo).toBeUndefined();

    // Positive delay - should work
    const mockNodesPositive: any[] = [];
    handler({}, mockNodesPositive, [0.001], 1.0, 1.0, 1, 0.03125);
    expect((mockNodesPositive as any).__echo).toBeDefined();
  });

  it('should handle missing params gracefully', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];

    // No params - should be ignored
    handler({}, mockNodes, [], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__echo).toBeUndefined();

    // Undefined params - should be ignored
    handler({}, mockNodes, undefined as any, 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__echo).toBeUndefined();
  });

  it('should handle missing nodes gracefully', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    // Empty nodes array - should still store metadata (echo doesn't need nodes in array)
    const emptyNodes: any[] = [];
    handler({}, emptyNodes, [0.25, 50, 30], 1.0, 1.0, 1, 0.03125);
    expect((emptyNodes as any).__echo).toBeDefined();

    // Undefined nodes - should be ignored (no crash)
    expect(() => {
      handler({}, undefined as any, [0.25, 50, 30], 1.0, 1.0, 1, 0.03125);
    }).not.toThrow();
  });

  it('should use default beat duration when tickSeconds not provided', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.25]; // Quarter beat delay
    const start = 1.0;
    const dur = 1.0;
    // tickSeconds undefined - should use default (120 BPM = 0.5s per beat)

    handler({}, mockNodes, params, start, dur, 1);

    expect((mockNodes as any).__echo).toBeDefined();
    // 0.25 * 0.5 (default beat duration) = 0.125 seconds
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.125);
  });

  it('should handle invalid numeric parameters gracefully', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];

    // NaN delay time - should be ignored
    handler({}, mockNodes, [NaN, 50, 30], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__echo).toBeUndefined();

    // Infinity delay time - should be ignored
    const mockNodes2: any[] = [];
    handler({}, mockNodes2, [Infinity, 50, 30], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes2 as any).__echo).toBeUndefined();
  });

  it('should handle typical slapback delay preset', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.125, 0, 40]; // Slapback: 125ms, no feedback, 40% mix
    const start = 1.0;
    const dur = 0.5;
    const tickSeconds = 0.03125;

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.0625); // 0.125 * 0.5
    expect((mockNodes as any).__echo.feedback).toBe(0.0); // No feedback
    expect((mockNodes as any).__echo.mix).toBe(0.4); // 40% mix
  });

  it('should handle typical dub delay preset', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [0.375, 70, 50]; // Dub: dotted-eighth, heavy feedback, equal mix
    const start = 1.0;
    const dur = 2.0;
    const tickSeconds = 0.03125;

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(0.1875); // 0.375 * 0.5
    expect((mockNodes as any).__echo.feedback).toBe(0.7); // 70%
    expect((mockNodes as any).__echo.mix).toBe(0.5); // 50%
  });

  it('should preserve metadata for long echo tails', () => {
    const handler = get('echo');
    if (!handler) throw new Error('echo handler not found');

    const mockNodes: any[] = [];
    const params = [4.0, 90]; // 4 beats delay, 90% feedback = long tail
    const start = 2.0;
    const dur = 3.0;
    const tickSeconds = 0.03125; // 120 BPM

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__echo).toBeDefined();
    // 4.0 * (0.03125 * 16) = 4.0 * 0.5 = 2.0 seconds (four beats at 120 BPM)
    expect((mockNodes as any).__echo.delayTime).toBeCloseTo(2.0);
    expect((mockNodes as any).__echo.feedback).toBe(0.9);
    expect((mockNodes as any).__echo.start).toBe(2.0);
    expect((mockNodes as any).__echo.dur).toBe(3.0);
  });
});
