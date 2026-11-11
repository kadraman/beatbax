/**
 * Instrument Editor availability (feature flag + Desktop).
 *
 * The editor is a modal opened on demand (spec 103). Stored
 * `panel.instrument-editor` must not restore a right-pane tab or reopen the modal.
 */

import type { ClientCapabilities } from '../client-profile.js';
import { isFeatureEnabled, FeatureFlag } from './feature-flags.js';

export function isInstrumentEditorAllowed(capabilities: ClientCapabilities): boolean {
  if (!capabilities.advancedEditor) return false;
  return isFeatureEnabled(FeatureFlag.INSTRUMENT_EDITOR);
}

/** Always false: the modal is not restored on startup. */
export function shouldShowInstrumentEditor(capabilities: ClientCapabilities): boolean {
  void capabilities;
  return false;
}
