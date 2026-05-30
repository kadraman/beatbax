import {
  getPlatformProfile,
  setPlatformRegion,
  PLATFORM_PROFILES,
} from '../src/platform-profiles.js';

describe('Platform profiles', () => {
  afterEach(() => {
    // Reset to default
    setPlatformRegion('spectrum-128');
  });

  test('default region is spectrum-128', () => {
    const profile = getPlatformProfile();
    expect(profile.regionKey).toBe('spectrum-128');
  });

  test('Spectrum 128 AY clock is 1,773,400 Hz', () => {
    setPlatformRegion('spectrum-128');
    expect(getPlatformProfile().ayClockHz).toBe(1_773_400);
  });

  test('CPC AY clock is 1,000,000 Hz', () => {
    setPlatformRegion('cpc');
    expect(getPlatformProfile().ayClockHz).toBe(1_000_000);
  });

  test('both regions use 50 Hz frame rate', () => {
    setPlatformRegion('spectrum-128');
    expect(getPlatformProfile().tickRateHz).toBe(50);
    setPlatformRegion('cpc');
    expect(getPlatformProfile().tickRateHz).toBe(50);
  });

  test('PLATFORM_PROFILES contains spectrum-128 and cpc', () => {
    expect(PLATFORM_PROFILES['spectrum-128']).toBeDefined();
    expect(PLATFORM_PROFILES['cpc']).toBeDefined();
  });

  test('unknown region falls back to spectrum-128', () => {
    setPlatformRegion('unknown-region');
    expect(getPlatformProfile().regionKey).toBe('spectrum-128');
  });

  test('setPlatformRegion is case-insensitive', () => {
    setPlatformRegion('CPC');
    expect(getPlatformProfile().ayClockHz).toBe(1_000_000);
  });

  test('AY clock is NOT the CPU clock (3.5469 MHz)', () => {
    setPlatformRegion('spectrum-128');
    const clock = getPlatformProfile().ayClockHz;
    // Must not be the CPU clock value
    expect(clock).not.toBe(3_546_900);
    expect(clock).not.toBe(3_579_545);
    // Must be the correct AY clock
    expect(clock).toBe(1_773_400);
  });
});
