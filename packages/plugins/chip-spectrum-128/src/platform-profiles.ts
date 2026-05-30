/**
 * Platform profiles for the AY-3-8912 PSG.
 *
 * The AY chip clock differs from the host CPU clock:
 *   - ZX Spectrum 128: AY clock = 1,773,400 Hz  (CPU = 3.5469 MHz)
 *   - Amstrad CPC:     AY clock = 1,000,000 Hz  (CPU = 4 MHz)
 *
 * Both machines run a PAL frame rate of 50 Hz.
 *
 * Reference: hardware_guide.md
 */

export interface PlatformProfile {
  /** Unique region key (used in chipRegion directive). */
  regionKey: string;
  /** Human-readable name. */
  displayName: string;
  /** AY-3-8912 clock frequency in Hz. */
  ayClockHz: number;
  /** Chip tick rate in Hz (PAL = 50). */
  tickRateHz: number;
}

/** ZX Spectrum 128 AY-3-8912 clock (1,773,400 Hz). */
export const AY_CLOCK_SPECTRUM_128 = 1_773_400;

/** Amstrad CPC AY-3-8912 clock (1,000,000 Hz). */
export const AY_CLOCK_CPC = 1_000_000;

/** PAL frame/tick rate for both platforms (50 Hz). */
export const AY_TICK_RATE_HZ = 50;

export const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  'spectrum-128': {
    regionKey: 'spectrum-128',
    displayName: 'ZX Spectrum 128',
    ayClockHz: AY_CLOCK_SPECTRUM_128,
    tickRateHz: AY_TICK_RATE_HZ,
  },
  cpc: {
    regionKey: 'cpc',
    displayName: 'Amstrad CPC',
    ayClockHz: AY_CLOCK_CPC,
    tickRateHz: AY_TICK_RATE_HZ,
  },
};

/** Default platform (Spectrum 128). */
const DEFAULT_REGION = 'spectrum-128';

let _currentRegion: string = DEFAULT_REGION;

/**
 * Set the active platform region from a chipRegion directive value.
 * Unrecognised values fall back to 'spectrum-128'.
 */
export function setPlatformRegion(region?: string | null): string {
  const key = String(region || '').toLowerCase();
  _currentRegion = PLATFORM_PROFILES[key] ? key : DEFAULT_REGION;
  return _currentRegion;
}

/** Return the active region key. */
export function getPlatformRegion(): string {
  return _currentRegion;
}

/** Return the active PlatformProfile. */
export function getPlatformProfile(): PlatformProfile {
  return PLATFORM_PROFILES[_currentRegion] ?? PLATFORM_PROFILES[DEFAULT_REGION];
}
