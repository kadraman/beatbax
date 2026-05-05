import { describe, expect, it } from '@jest/globals';
import { get, clearEffectState } from '../src/effects/index.js';

describe('Portamento Effect', () => {
  it('uses seeded previous frequency when no prior port state exists', () => {
    clearEffectState();

    const handler = get('port');
    if (!handler) throw new Error('port handler not found');

    const freqCalls: Array<{ method: string; value: number; time: number }> = [];
    const mockOsc = {
      _baseFreq: 220,
      _prevFreq: 440,
      frequency: {
        value: 220,
        setValueAtTime: (value: number, time: number) => {
          freqCalls.push({ method: 'setValueAtTime', value, time });
        },
        cancelScheduledValues: (_time: number) => {},
        linearRampToValueAtTime: (value: number, time: number) => {
          freqCalls.push({ method: 'linearRampToValueAtTime', value, time });
        },
      },
    } as any;

    const mockGainNode = {
      gain: {
        value: 1,
      },
    } as any;

    // port:8 on a 1-second note should glide from previous (440) to target (220).
    handler({}, [mockOsc, mockGainNode], [8], 1.0, 1.0, 2, 0.1, { env: 'gb:12,down,1' });

    const startCall = freqCalls.find(c => c.method === 'setValueAtTime' && Math.abs(c.time - 1.0) < 1e-6);
    expect(startCall).toBeDefined();
    expect(startCall!.value).toBeCloseTo(440, 3);

    const rampCall = freqCalls.find(c => c.method === 'linearRampToValueAtTime');
    expect(rampCall).toBeDefined();
    expect(rampCall!.value).toBeCloseTo(220, 3);
  });
});
