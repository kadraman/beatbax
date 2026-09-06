import {
  formatHardwareEnvelope,
  formatHardwareSweep,
  parseHardwareEnvelope,
  parseHardwareSweep,
  simulateGBEnvelope,
  simulateHardwareSweep,
  renderEnvelopeSparkline,
} from '../src/editor/envelope-preview';

describe('parseHardwareEnvelope', () => {
  it('parses short CSV', () => {
    expect(parseHardwareEnvelope('12,down,1')).toEqual({
      level: 12,
      direction: 'down',
      period: 1,
    });
  });

  it('defaults omitted period to 1 (matches playback)', () => {
    expect(parseHardwareEnvelope('12,down')).toEqual({
      level: 12,
      direction: 'down',
      period: 1,
    });
    expect(parseHardwareEnvelope({ level: 8, direction: 'up' })).toEqual({
      level: 8,
      direction: 'up',
      period: 1,
    });
  });

  it('keeps explicit period 0 as constant', () => {
    expect(parseHardwareEnvelope('12,down,0')).toEqual({
      level: 12,
      direction: 'down',
      period: 0,
    });
  });

  it('parses gb-prefixed and flat', () => {
    expect(parseHardwareEnvelope('gb:8,flat')).toEqual({
      level: 8,
      direction: 'flat',
      period: 0,
    });
  });

  it('returns null for garbage', () => {
    expect(parseHardwareEnvelope('nope')).toBeNull();
    expect(parseHardwareEnvelope('')).toBeNull();
  });
});

describe('formatHardwareEnvelope', () => {
  it('omits period when 1', () => {
    expect(formatHardwareEnvelope({ level: 12, direction: 'down', period: 1 })).toBe('12,down');
  });

  it('includes non-default period', () => {
    expect(formatHardwareEnvelope({ level: 12, direction: 'down', period: 2 })).toBe('12,down,2');
  });
});

describe('simulateGBEnvelope', () => {
  it('decays every period steps', () => {
    const steps = simulateGBEnvelope({ level: 4, direction: 'down', period: 2 }, 6);
    expect(steps).toEqual([4, 4, 3, 3, 2, 2]);
  });

  it('holds when flat', () => {
    expect(simulateGBEnvelope({ level: 10, direction: 'flat', period: 0 }, 4)).toEqual([10, 10, 10, 10]);
  });
});

describe('parseHardwareSweep / simulateHardwareSweep', () => {
  it('parses and formats sweep CSV', () => {
    expect(parseHardwareSweep('7,down,3')).toEqual({ time: 7, direction: 'down', shift: 3 });
    expect(formatHardwareSweep({ time: 4, direction: 'up', shift: 2 })).toBe('4,up,2');
  });

  it('holds ratio when time is 0', () => {
    expect(simulateHardwareSweep({ time: 0, direction: 'down', shift: 3 }, 4)).toEqual([1, 1, 1, 1]);
  });

  it('moves period for non-zero sweep', () => {
    const steps = simulateHardwareSweep({ time: 1, direction: 'down', shift: 1 }, 3, 1000);
    expect(steps[0]).toBe(1);
    expect(steps[1]).toBeLessThan(1);
  });
});

describe('renderEnvelopeSparkline', () => {
  it('returns one glyph per step', () => {
    expect(renderEnvelopeSparkline([0, 15])).toHaveLength(2);
  });
});
