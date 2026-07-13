/**
 * Channel Mixer panel visibility rules (feature flag + panel preference).
 */

import type { ClientCapabilities } from '../client-profile.js';
import { isFeatureEnabled, FeatureFlag } from './feature-flags.js';
import { storage, StorageKey } from './local-storage.js';

/** True when the Channel Mixer feature flag is on. */
export function isChannelMixerAllowed(capabilities: ClientCapabilities): boolean {
  if (!capabilities.channelMixer) return false;
  return isFeatureEnabled(FeatureFlag.CHANNEL_MIXER);
}

/**
 * Whether the channel mixer should be visible after startup / a visibility sync.
 * Defaults to visible unless `panel.channel-mixer` is explicitly `false`.
 */
export function shouldShowChannelMixer(capabilities: ClientCapabilities): boolean {
  if (!isChannelMixerAllowed(capabilities)) return false;
  const raw = storage.get(StorageKey.PANEL_VIS_CHANNEL_MIXER);
  if (raw === 'false') return false;
  return true;
}
