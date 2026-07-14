/**
 * Right-pane Song Visualizer (channels tab) visibility rules.
 */

import type { ClientCapabilities } from '../client-profile.js';
import { isFeatureEnabled, FeatureFlag } from './feature-flags.js';
import { storage, StorageKey } from './local-storage.js';

/** True when the Song Visualizer feature flag is on. */
export function isLegacySongVisualizerAllowed(capabilities: ClientCapabilities): boolean {
  if (!capabilities.songVisualizer) return false;
  return isFeatureEnabled(FeatureFlag.SONG_VISUALIZER);
}

/**
 * Whether the channels tab should be open after startup.
 * Defaults to visible when the feature is on unless `panel.song-visualizer` is `false`.
 */
export function shouldShowLegacySongVisualizerTab(capabilities: ClientCapabilities): boolean {
  if (!isLegacySongVisualizerAllowed(capabilities)) return false;
  const raw = storage.get(StorageKey.PANEL_VIS_SONG_VISUALIZER);
  if (raw === 'false') return false;
  return true;
}
