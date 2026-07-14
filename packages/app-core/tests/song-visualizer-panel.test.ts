jest.mock('../src/utils/local-storage', () => ({
  StorageKey: {
    FEATURE_CHANNEL_MIXER: 'feature.channelMixer',
    FEATURE_SONG_VISUALIZER: 'feature.songVisualizer',
    PANEL_VIS_SONG_VISUALIZER: 'panel.song-visualizer',
  },
  storage: {
    get: (key: string) => {
      const val = window.localStorage.getItem(`beatbax:${key}`);
      return val === null ? undefined : val;
    },
    set: (key: string, val: string) => {
      window.localStorage.setItem(`beatbax:${key}`, val);
    },
    remove: (key: string) => {
      window.localStorage.removeItem(`beatbax:${key}`);
    },
  },
}));

import { getCapabilities } from '../src/client-profile';
import { FeatureFlag, setFeatureEnabled } from '../src/utils/feature-flags';
import {
  isLegacySongVisualizerAllowed,
  shouldShowLegacySongVisualizerTab,
} from '../src/utils/song-visualizer-panel';

const desktop = getCapabilities('desktop-full');

beforeEach(() => {
  localStorage.clear();
});

describe('isLegacySongVisualizerAllowed', () => {
  it('is false when the Song Visualizer feature flag is off', () => {
    expect(isLegacySongVisualizerAllowed(desktop)).toBe(false);
  });

  it('is true when the Song Visualizer feature flag is on', () => {
    setFeatureEnabled(FeatureFlag.SONG_VISUALIZER, true);
    expect(isLegacySongVisualizerAllowed(desktop)).toBe(true);
  });

  it('remains allowed when Channel Mixer is also enabled', () => {
    setFeatureEnabled(FeatureFlag.SONG_VISUALIZER, true);
    setFeatureEnabled(FeatureFlag.CHANNEL_MIXER, true);
    expect(isLegacySongVisualizerAllowed(desktop)).toBe(true);
  });
});

describe('shouldShowLegacySongVisualizerTab', () => {
  beforeEach(() => {
    setFeatureEnabled(FeatureFlag.SONG_VISUALIZER, true);
  });

  it('defaults to visible when no panel preference is stored', () => {
    expect(shouldShowLegacySongVisualizerTab(desktop)).toBe(true);
  });

  it('honours an explicit panel visibility preference of false', () => {
    localStorage.setItem('beatbax:panel.song-visualizer', 'false');
    expect(shouldShowLegacySongVisualizerTab(desktop)).toBe(false);
  });

  it('is false when the feature flag is off even without a stored panel preference', () => {
    setFeatureEnabled(FeatureFlag.SONG_VISUALIZER, false);
    expect(shouldShowLegacySongVisualizerTab(desktop)).toBe(false);
  });
});
