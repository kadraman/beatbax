/**
 * Feature flags — read/write helpers backed by localStorage + URL param overrides.
 *
 * Usage:
 *   isFeatureEnabled(FeatureFlag.AI_ASSISTANT)   // → false by default
 *   setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true)
 *
 * URL overrides (evaluated once at page load):
 *   ?ai=1  → AI_ASSISTANT enabled regardless of localStorage
 *   ?ai=0  → AI_ASSISTANT disabled regardless of localStorage
 */

import { storage, StorageKey } from './local-storage';
import { eventBus } from './event-bus';

// ─── Well-known flags ─────────────────────────────────────────────────────────

export const FeatureFlag = {
  AI_ASSISTANT:           StorageKey.AI_ASSISTANT,
  PER_CHANNEL_ANALYSER:   StorageKey.FEATURE_PER_CHANNEL_ANALYSER,
  CHANNEL_MIXER:          StorageKey.FEATURE_CHANNEL_MIXER,
  PATTERN_GRID:           StorageKey.FEATURE_PATTERN_GRID,
  HOT_RELOAD:             StorageKey.FEATURE_HOT_RELOAD,
  SONG_VISUALIZER:        StorageKey.FEATURE_SONG_VISUALIZER,
} as const;

// ─── URL-param overrides ──────────────────────────────────────────────────────

/** Map from storage-key to URL param name. */
const URL_PARAM_MAP: Record<string, string> = {
  [FeatureFlag.AI_ASSISTANT]:         'ai',
  [FeatureFlag.PER_CHANNEL_ANALYSER]: 'perChannelAnalyser',
  [FeatureFlag.HOT_RELOAD]:           'hotReload',
};

/**
 * Returns the URL-param override for a flag, or `undefined` if the URL contains
 * no relevant param for this flag.
 */
function getUrlOverride(flag: string): boolean | undefined {
  try {
    const paramName = URL_PARAM_MAP[flag];
    if (!paramName) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(paramName)) return undefined;
    const val = params.get(paramName);
    if (val === '1') return true;
    if (val === '0') return false;
    return undefined;
  } catch {
    return undefined;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns `true` when the feature flag is enabled.
 *
 * Priority (highest → lowest):
 *  1. URL query parameter (`?ai=1` / `?ai=0`)
 *  2. localStorage value (`"true"` / `"false"`)
 *  3. Default: `false`
 */
export function isFeatureEnabled(flag: string): boolean {
  const urlOverride = getUrlOverride(flag);
  if (urlOverride !== undefined) return urlOverride;
  const stored = storage.get(flag);
  return stored === 'true';
}

/**
 * Persist the enabled/disabled state of a feature flag to localStorage and
 * emit a `feature-flag:changed` event so subscribers can react immediately.
 * A URL override will still take precedence over the stored value on the
 * current page load, but the stored value will apply once the URL param
 * is removed.
 */
export function setFeatureEnabled(flag: string, enabled: boolean): void {
  storage.set(flag, enabled ? 'true' : 'false');
  eventBus.emit('feature-flag:changed', { flag, enabled });
}
