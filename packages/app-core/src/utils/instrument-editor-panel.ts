/**
 * Instrument Editor panel visibility (feature flag + Desktop).
 */

import type { ClientCapabilities } from '../client-profile.js';
import { isFeatureEnabled, FeatureFlag } from './feature-flags.js';
import { storage, StorageKey } from './local-storage.js';

export function isInstrumentEditorAllowed(capabilities: ClientCapabilities): boolean {
  if (!capabilities.advancedEditor) return false;
  return isFeatureEnabled(FeatureFlag.INSTRUMENT_EDITOR);
}

export function shouldShowInstrumentEditor(capabilities: ClientCapabilities): boolean {
  if (!isInstrumentEditorAllowed(capabilities)) return false;
  const raw = storage.get(StorageKey.PANEL_VIS_INSTRUMENT_EDITOR);
  if (raw === 'false') return false;
  return true;
}
