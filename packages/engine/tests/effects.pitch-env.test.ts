import { describe, expect, it } from '@jest/globals';
import { get } from '../src/effects/index.js';

describe('Pitch Env Effect', () => {
  it('registers pitch_env handler', () => {
    const handler = get('pitch_env');
    expect(handler).toBeDefined();
    expect(typeof handler).toBe('function');
  });

  it('applies bracketed macro payload to oscillator frequency automation', () => {
    const handler = get('pitch_env');
    if (!handler) throw new Error('pitch_env handler not found');

    const freqCalls: Array<{ value: number; time: number }> = [];
    const mockOsc = {
      _baseFreq: 440,
      frequency: {
        value: 440,
        cancelScheduledValues: (_time: number) => {},
        setValueAtTime: (value: number, time: number) => {
          freqCalls.push({ value, time });
        },
      },
    };

    handler({ _chipType: 'sms' }, [mockOsc], ['[0,2,0,-2,0]'], 0, 0.1);

    expect(freqCalls.length).toBeGreaterThan(0);
    expect(freqCalls[0].value).toBeCloseTo(440, 6);
    expect(freqCalls.some(c => c.value > 440)).toBe(true);
    expect(freqCalls.some(c => c.value < 440)).toBe(true);
  });

  it('supports legacy split numeric params form', () => {
    const handler = get('pitch_env');
    if (!handler) throw new Error('pitch_env handler not found');

    const freqCalls: Array<{ value: number; time: number }> = [];
    const mockOsc = {
      _baseFreq: 440,
      frequency: {
        value: 440,
        cancelScheduledValues: (_time: number) => {},
        setValueAtTime: (value: number, time: number) => {
          freqCalls.push({ value, time });
        },
      },
    };

    handler({ _chipType: 'sms' }, [mockOsc], [0, 2, 0, -2, 0], 0, 0.1);

    expect(freqCalls.length).toBeGreaterThan(0);
    expect(freqCalls.some(c => c.value > 440)).toBe(true);
    expect(freqCalls.some(c => c.value < 440)).toBe(true);
  });
});
