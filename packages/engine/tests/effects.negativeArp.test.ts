/**
 * Test for negative offset warnings in arpeggio effect
 */

import * as effects from '../src/effects/index.js';

describe('Arpeggio negative offset warnings', () => {
  let originalConsoleWarn: typeof console.warn;
  let warnMessages: string[] = [];

  beforeEach(() => {
    // Capture console.warn messages
    originalConsoleWarn = console.warn;
    warnMessages = [];
    console.warn = jest.fn((...args: any[]) => {
      warnMessages.push(args.join(' '));
    });

    // Clear effect state
    effects.clearEffectState();
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  test('warns about negative offsets in arpeggio', () => {
    // Create mock context and nodes
    const mockCtx = {
      _chipType: 'gameboy',
      currentTime: 0,
    };

    const mockOsc = {
      frequency: {
        value: 440,
        setValueAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      },
      _baseFreq: 440,
    };

    const mockNodes = [mockOsc];

    // Call arpeggio effect with negative offsets
    const arpHandler = effects.get('arp');
    expect(arpHandler).toBeDefined();

    if (arpHandler) {
      // Test with negative offsets mixed with valid ones
      arpHandler(mockCtx, mockNodes, [-2, 4, 7, -5], 0, 0.5);
    }

    // Verify warning was emitted
    expect(warnMessages.length).toBeGreaterThan(0);

    const arpeggioWarning = warnMessages.find(msg =>
      msg.includes('negative offsets') &&
      msg.includes('[-2, -5]')
    );

    expect(arpeggioWarning).toBeDefined();
    expect(arpeggioWarning).toContain('hUGETracker');
    expect(arpeggioWarning).toContain('0-15');
  });

  test('does not warn when all offsets are valid', () => {
    const mockCtx = {
      _chipType: 'gameboy',
      currentTime: 0,
    };

    const mockOsc = {
      frequency: {
        value: 440,
        setValueAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      },
      _baseFreq: 440,
    };

    const mockNodes = [mockOsc];

    const arpHandler = effects.get('arp');
    if (arpHandler) {
      // Test with only valid offsets
      arpHandler(mockCtx, mockNodes, [0, 4, 7], 0, 0.5);
    }

    // Should not produce any warnings
    const arpeggioWarning = warnMessages.find(msg =>
      msg.includes('negative offsets')
    );

    expect(arpeggioWarning).toBeUndefined();
  });

  test('filters out negative offsets but keeps valid ones', () => {
    const mockCtx = {
      _chipType: 'gameboy',
      currentTime: 0,
    };

    const mockOsc = {
      frequency: {
        value: 440,
        setValueAtTime: jest.fn(),
        cancelScheduledValues: jest.fn(),
      },
      _baseFreq: 440,
    };

    const mockNodes = [mockOsc];

    const arpHandler = effects.get('arp');
    if (arpHandler) {
      // Test with negative offsets mixed with valid ones
      arpHandler(mockCtx, mockNodes, [-3, 4, -1, 7], 0, 0.5);
    }

    // Should have scheduled frequencies for valid offsets only (0, 4, 7)
    // The allOffsets array should be [0, 4, 7] (root + valid offsets)
    // Each should be scheduled multiple times throughout the duration
    expect(mockOsc.frequency.setValueAtTime).toHaveBeenCalled();

    // Get all frequencies that were scheduled
    const calls = (mockOsc.frequency.setValueAtTime as jest.Mock).mock.calls;
    const frequencies = calls.map((call: any[]) => call[0]);

    // Should only contain frequencies for root (440), +4 semitones, and +7 semitones
    // Should NOT contain frequencies for -3 or -1 semitones
    const expectedRoot = 440;
    const expectedPlus4 = 440 * Math.pow(2, 4 / 12); // ~554.37 Hz
    const expectedPlus7 = 440 * Math.pow(2, 7 / 12); // ~659.26 Hz

    const uniqueFreqs = [...new Set(frequencies)];
    expect(uniqueFreqs.length).toBe(3); // root, +4, +7

    // Check that scheduled frequencies are close to expected (within 1 Hz)
    expect(uniqueFreqs.some((f: number) => Math.abs(f - expectedRoot) < 1)).toBe(true);
    expect(uniqueFreqs.some((f: number) => Math.abs(f - expectedPlus4) < 1)).toBe(true);
    expect(uniqueFreqs.some((f: number) => Math.abs(f - expectedPlus7) < 1)).toBe(true);
  });
});
