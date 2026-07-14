/**
 * Pattern grid panel visibility rules (feature flag + panel preference).
 */

import type { ClientCapabilities } from '../client-profile.js';
import { isFeatureEnabled, FeatureFlag } from './feature-flags.js';
import { storage, StorageKey } from './local-storage.js';

/** True when the Pattern Grid feature flag is on. */
export function isPatternGridAllowed(capabilities: ClientCapabilities): boolean {
  if (!capabilities.patternGrid) return false;
  return isFeatureEnabled(FeatureFlag.PATTERN_GRID);
}

/**
 * Whether the pattern grid should be visible after startup.
 * Defaults to visible when the feature is on unless `panel.pattern-grid` is `false`.
 */
export function shouldShowPatternGrid(capabilities: ClientCapabilities): boolean {
  if (!isPatternGridAllowed(capabilities)) return false;
  const raw = storage.get(StorageKey.PANEL_VIS_PATTERN_GRID);
  if (raw === 'false') return false;
  return true;
}
