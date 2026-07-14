jest.mock('../src/utils/local-storage', () => ({
  StorageKey: {
    FEATURE_CHANNEL_MIXER: 'feature.channelMixer',
    PANEL_VIS_CHANNEL_MIXER: 'panel.channel-mixer',
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
import { isChannelMixerAllowed, shouldShowChannelMixer } from '../src/utils/channel-mixer-panel';

const desktop = getCapabilities('desktop-full');

beforeEach(() => {
  localStorage.clear();
});

describe('isChannelMixerAllowed', () => {
  it('is true by default when the feature flag has no stored value', () => {
    expect(isChannelMixerAllowed(desktop)).toBe(true);
  });

  it('is false when the Channel Mixer feature flag is off', () => {
    setFeatureEnabled(FeatureFlag.CHANNEL_MIXER, false);
    expect(isChannelMixerAllowed(desktop)).toBe(false);
  });
});

describe('shouldShowChannelMixer', () => {
  it('defaults to visible when the feature is on and no panel preference is stored', () => {
    expect(shouldShowChannelMixer(desktop)).toBe(true);
  });

  it('honours an explicit panel visibility preference of false', () => {
    localStorage.setItem('beatbax:panel.channel-mixer', 'false');
    expect(shouldShowChannelMixer(desktop)).toBe(false);
  });

  it('is false when the feature flag is off even without a stored panel preference', () => {
    setFeatureEnabled(FeatureFlag.CHANNEL_MIXER, false);
    expect(shouldShowChannelMixer(desktop)).toBe(false);
  });
});
