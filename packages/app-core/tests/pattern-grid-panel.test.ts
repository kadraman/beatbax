jest.mock('../src/utils/local-storage', () => ({
  StorageKey: {
    FEATURE_PATTERN_GRID: 'feature.patternGrid',
    PANEL_VIS_PATTERN_GRID: 'panel.pattern-grid',
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
import { isPatternGridAllowed, shouldShowPatternGrid } from '../src/utils/pattern-grid-panel';

const desktop = getCapabilities('desktop-full');

beforeEach(() => {
  localStorage.clear();
});

describe('isPatternGridAllowed', () => {
  it('is false when the Pattern Grid feature flag is off', () => {
    expect(isPatternGridAllowed(desktop)).toBe(false);
  });

  it('is true when the Pattern Grid feature flag is on', () => {
    setFeatureEnabled(FeatureFlag.PATTERN_GRID, true);
    expect(isPatternGridAllowed(desktop)).toBe(true);
  });
});

describe('shouldShowPatternGrid', () => {
  beforeEach(() => {
    setFeatureEnabled(FeatureFlag.PATTERN_GRID, true);
  });

  it('defaults to visible when no panel preference is stored', () => {
    expect(shouldShowPatternGrid(desktop)).toBe(true);
  });

  it('honours an explicit panel visibility preference of false', () => {
    localStorage.setItem('beatbax:panel.pattern-grid', 'false');
    expect(shouldShowPatternGrid(desktop)).toBe(false);
  });

  it('is false when the feature flag is off even with panel preference true', () => {
    localStorage.setItem('beatbax:panel.pattern-grid', 'true');
    setFeatureEnabled(FeatureFlag.PATTERN_GRID, false);
    expect(shouldShowPatternGrid(desktop)).toBe(false);
  });
});
