import {
  SMS_CLOCK_NTSC,
  SMS_CLOCK_PAL,
  getSmsClockRegion,
  periodToFreq,
  setSmsClockRegion,
  NOISE_RATE_DIVIDERS,
  SMS_CLOCK_NTSC as NTSC_CLOCK,
} from '../src/periodTables.js';
import smsPlugin from '../src/index.js';

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

  it('plugin configureForSong switches to pal', () => {
    smsPlugin.configureForSong!({ chip: 'sms', chipRegion: 'pal' });
    expect(getSmsClockRegion()).toBe('pal');
  });
});

describe('SN76489 noise rate divisors', () => {
  it('uses hardware-correct divisors [512, 1024, 2048]', () => {
    expect(NOISE_RATE_DIVIDERS[0]).toBe(512);
    expect(NOISE_RATE_DIVIDERS[1]).toBe(1024);
    expect(NOISE_RATE_DIVIDERS[2]).toBe(2048);
  });

  it('produces correct LFSR clock frequencies at NTSC clock', () => {
    // Per hardware_guide.md: rate 0 = PSG/512, rate 1 = PSG/1024, rate 2 = PSG/2048
    expect(NTSC_CLOCK / NOISE_RATE_DIVIDERS[0]).toBeCloseTo(6991, 0);
    expect(NTSC_CLOCK / NOISE_RATE_DIVIDERS[1]).toBeCloseTo(3496, 0);
    expect(NTSC_CLOCK / NOISE_RATE_DIVIDERS[2]).toBeCloseTo(1748, 0);
  });
});
