import {
  getPlatformProfile,
  setPlatformRegion,
  resolvePlatformRegionFromSong,
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

describe('resolvePlatformRegionFromSong', () => {
  test('chip cpc selects cpc profile', () => {
    expect(resolvePlatformRegionFromSong({ chip: 'cpc' })).toBe('cpc');
  });

  test('chip amstrad-cpc selects cpc profile', () => {
    expect(resolvePlatformRegionFromSong({ chip: 'amstrad-cpc' })).toBe('cpc');
  });

  test('chip spectrum-128 defaults to spectrum-128', () => {
    expect(resolvePlatformRegionFromSong({ chip: 'spectrum-128' })).toBe('spectrum-128');
  });

  test('chipRegion cpc on spectrum chip is ignored in favour of alias-only platform selection', () => {
    expect(resolvePlatformRegionFromSong({ chip: 'spectrum-128', chipRegion: 'cpc' })).toBe('spectrum-128');
  });

  test('chip alias selects cpc regardless of chipRegion', () => {
    expect(resolvePlatformRegionFromSong({ chip: 'cpc', chipRegion: 'spectrum-128' })).toBe('cpc');
  });
});
