import {
  SMS_CLOCK_NTSC,
  SMS_CLOCK_PAL,
  getSmsClockRegion,
  periodToFreq,
  setSmsClockRegion,
} from '../src/periodTables.js';

describe('sms period region configuration', () => {
  afterEach(() => {
    setSmsClockRegion('ntsc');
  });

  it('defaults to ntsc for undefined input', () => {
    setSmsClockRegion(undefined);
    expect(getSmsClockRegion()).toBe('ntsc');
    expect(periodToFreq(100)).toBeCloseTo(SMS_CLOCK_NTSC / (32 * 100), 8);
  });

  it('uses pal clock when set to pal', () => {
    setSmsClockRegion('pal');
    expect(getSmsClockRegion()).toBe('pal');
    expect(periodToFreq(100)).toBeCloseTo(SMS_CLOCK_PAL / (32 * 100), 8);
  });

  it('falls back to ntsc for unknown values', () => {
    setSmsClockRegion('ntcs');
    expect(getSmsClockRegion()).toBe('ntsc');
    expect(periodToFreq(100)).toBeCloseTo(SMS_CLOCK_NTSC / (32 * 100), 8);
  });
});
