export type ClientProfile = 'web-lite' | 'desktop-full';

export interface ClientCapabilities {
  export: boolean;
  copilot: boolean;
  channelMixer: boolean;
  patternGrid: boolean;
  advancedEditor: boolean;
  midiStepEntry: boolean;
  helpPanel: boolean;
  problemsPanel: boolean;
  outputPanel: boolean;
  settingsPanel: boolean;
  nativeMenu: boolean;
}

const WEB_LITE: ClientCapabilities = {
  export: false,
  copilot: false,
  channelMixer: false,
  patternGrid: false,
  advancedEditor: false,
  midiStepEntry: false,
  helpPanel: true,
  problemsPanel: true,
  outputPanel: true,
  settingsPanel: true,
  nativeMenu: false,
};

const DESKTOP_FULL: ClientCapabilities = {
  export: true,
  copilot: true,
  channelMixer: true,
  patternGrid: true,
  advancedEditor: true,
  midiStepEntry: true,
  helpPanel: true,
  problemsPanel: true,
  outputPanel: true,
  settingsPanel: true,
  nativeMenu: true,
};

export function getCapabilities(profile: ClientProfile): ClientCapabilities {
  return profile === 'web-lite' ? WEB_LITE : DESKTOP_FULL;
}

/** Read the compile-time client profile (defaults to desktop-full when unset). */
export function getClientProfile(): ClientProfile {
  if (typeof __CLIENT_PROFILE__ !== 'undefined') {
    return __CLIENT_PROFILE__;
  }
  return 'desktop-full';
}

/** Convenience: capabilities for the current build profile. */
export function getCurrentCapabilities(): ClientCapabilities {
  return getCapabilities(getClientProfile());
}
