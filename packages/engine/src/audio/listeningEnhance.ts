/**
 * Optional master-bus listening enhancement presets (preview only).
 *
 * Mild/Strong insert presence EQ + glue compression + make-up gain before the
 * protective soft limiter. Export / OfflineAudioContext paths stay dry.
 */

export type ListeningEnhanceMode = 'off' | 'mild' | 'strong';

export const LISTENING_ENHANCE_MODES: readonly ListeningEnhanceMode[] = [
  'off',
  'mild',
  'strong',
] as const;

export function isListeningEnhanceMode(value: unknown): value is ListeningEnhanceMode {
  return value === 'off' || value === 'mild' || value === 'strong';
}

/** Default for new users (no stored preference). */
export const DEFAULT_LISTENING_ENHANCE_MODE: ListeningEnhanceMode = 'mild';

export interface ListeningEnhanceCompressorPreset {
  thresholdDb: number;
  kneeDb: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
}

export interface ListeningEnhancePreset {
  /** Presence peaking filter around 3 kHz. */
  presenceFreqHz: number;
  presenceQ: number;
  presenceGainDb: number;
  /** Optional low-shelf cut (Strong only). */
  lowShelfFreqHz: number | null;
  lowShelfGainDb: number;
  compressor: ListeningEnhanceCompressorPreset;
  /** Linear make-up gain after glue compression. */
  makeupGainLinear: number;
}

/** ~+3 dB make-up with light presence and gentle glue. */
export const LISTENING_ENHANCE_MILD: ListeningEnhancePreset = {
  presenceFreqHz: 3000,
  presenceQ: 1,
  presenceGainDb: 2.5,
  lowShelfFreqHz: null,
  lowShelfGainDb: 0,
  compressor: {
    thresholdDb: -20,
    kneeDb: 8,
    ratio: 3,
    attackSec: 0.015,
    releaseSec: 0.2,
  },
  makeupGainLinear: Math.pow(10, 3 / 20), // ≈ 1.4125 (+3 dB)
};

/** More competitive loudness; still peak-limited downstream. */
export const LISTENING_ENHANCE_STRONG: ListeningEnhancePreset = {
  presenceFreqHz: 3000,
  presenceQ: 1,
  presenceGainDb: 4,
  lowShelfFreqHz: 120,
  lowShelfGainDb: -1.5,
  compressor: {
    thresholdDb: -24,
    kneeDb: 10,
    ratio: 4,
    attackSec: 0.012,
    releaseSec: 0.22,
  },
  makeupGainLinear: Math.pow(10, 6 / 20), // ≈ 2.0 (+6 dB)
};

export function getListeningEnhancePreset(
  mode: ListeningEnhanceMode,
): ListeningEnhancePreset | null {
  if (mode === 'mild') return LISTENING_ENHANCE_MILD;
  if (mode === 'strong') return LISTENING_ENHANCE_STRONG;
  return null;
}
