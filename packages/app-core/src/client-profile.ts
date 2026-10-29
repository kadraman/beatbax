export type ClientProfile = 'web-lite' | 'desktop-full';

export interface ClientCapabilities {
  export: boolean;
  copilot: boolean;
  channelMixer: boolean;
  songVisualizer: boolean;
  patternGrid: boolean;
  /** Whether the Pattern Grid requires the experimental `feature.patternGrid` flag (desktop: true, web-lite: false). */
  patternGridBehindFlag: boolean;
  advancedEditor: boolean;
  midiStepEntry: boolean;
  helpPanel: boolean;
  problemsPanel: boolean;
  outputPanel: boolean;
  settingsPanel: boolean;
  nativeMenu: boolean;
  /** Load curated example songs from the hosted /songs/ bundle (web-lite only). */
  exampleMenu: boolean;
}

const WEB_LITE: ClientCapabilities = {
  export: false,
  copilot: false,
  channelMixer: true,
  songVisualizer: false,
  patternGrid: true,
  patternGridBehindFlag: false,
  advancedEditor: false,
  midiStepEntry: false,
  helpPanel: true,
  problemsPanel: true,
  outputPanel: true,
  settingsPanel: false,
  nativeMenu: false,
  exampleMenu: true,
};

const DESKTOP_FULL: ClientCapabilities = {
  export: true,
  copilot: true,
  channelMixer: true,
  songVisualizer: true,
  patternGrid: true,
  patternGridBehindFlag: true,
  advancedEditor: true,
  midiStepEntry: true,
  helpPanel: true,
  problemsPanel: true,
  outputPanel: true,
  settingsPanel: true,
  nativeMenu: true,
  exampleMenu: false,
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
