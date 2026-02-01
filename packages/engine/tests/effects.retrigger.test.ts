import { describe, it, expect } from '@jest/globals';
import { register, get } from '../src/effects/index.js';

describe('Retrigger Effect', () => {
  it('should register retrigger effect handler', () => {
    const handler = get('retrig');
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('should store retrigger metadata on nodes array', () => {
    const handler = get('retrig');
    if (!handler) throw new Error('retrig handler not found');

    const mockNodes: any[] = [];
    const params = [4]; // Retrigger every 4 ticks
    const start = 1.0;
    const dur = 1.0;
    const tickSeconds = 0.03125; // 16 ticks per beat at 120 BPM

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    // Should attach metadata to nodes array
    expect((mockNodes as any).__retrigger).toBeDefined();
    expect((mockNodes as any).__retrigger.interval).toBe(4);
    expect((mockNodes as any).__retrigger.volumeDelta).toBe(0);
    expect((mockNodes as any).__retrigger.tickDuration).toBe(0.03125);
    expect((mockNodes as any).__retrigger.start).toBe(1.0);
    expect((mockNodes as any).__retrigger.dur).toBe(1.0);
  });

  it('should store volumeDelta when provided', () => {
    const handler = get('retrig');
    if (!handler) throw new Error('retrig handler not found');

    const mockNodes: any[] = [];
    const params = [2, -3]; // Retrigger every 2 ticks with -3 volume fadeout
    const start = 1.0;
    const dur = 0.5;
    const tickSeconds = 0.03125;

    handler({}, mockNodes, params, start, dur, 1, tickSeconds);

    expect((mockNodes as any).__retrigger).toBeDefined();
    expect((mockNodes as any).__retrigger.interval).toBe(2);
    expect((mockNodes as any).__retrigger.volumeDelta).toBe(-3);
  });

  it('should handle zero or negative interval gracefully', () => {
    const handler = get('retrig');
    if (!handler) throw new Error('retrig handler not found');

    const mockNodes: any[] = [];

    // Zero interval - should be ignored
    handler({}, mockNodes, [0], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__retrigger).toBeUndefined();

    // Negative interval - should be ignored
    handler({}, mockNodes, [-1], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__retrigger).toBeUndefined();

    // Positive interval - should work
    handler({}, mockNodes, [1], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__retrigger).toBeDefined();
    expect((mockNodes as any).__retrigger.interval).toBe(1);
  });

  it('should use default tick duration if not provided', () => {
    const handler = get('retrig');
    if (!handler) throw new Error('retrig handler not found');

    const mockNodes: any[] = [];
    const params = [4]; // Retrigger every 4 ticks
    const start = 1.0;
    const dur = 1.0;
    // tickSeconds undefined - should use default 0.03125

    handler({}, mockNodes, params, start, dur, 1);

    expect((mockNodes as any).__retrigger).toBeDefined();
    expect((mockNodes as any).__retrigger.tickDuration).toBe(0.03125);
  });

  it('should handle missing params gracefully', () => {
    const handler = get('retrig');
    if (!handler) throw new Error('retrig handler not found');

    const mockNodes: any[] = [];

    // No params - should be ignored
    handler({}, mockNodes, [], 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__retrigger).toBeUndefined();

    // Undefined params - should be ignored
    handler({}, mockNodes, undefined as any, 1.0, 1.0, 1, 0.03125);
    expect((mockNodes as any).__retrigger).toBeUndefined();
  });
});
