/**
 * Tests for feature-flags.ts
 */

// Mock local-storage to avoid @beatbax/engine/util/logger ts-jest type resolution.
// The mock uses jsdom's localStorage (available in testEnvironment: 'jsdom').
jest.mock('../src/utils/local-storage', () => ({
  StorageKey: {
    AI_ASSISTANT: 'feature.aiAssistant',
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

import { FeatureFlag, isFeatureEnabled, setFeatureEnabled } from '../src/utils/feature-flags';

// jsdom provides localStorage; clear between tests.
// Use history.pushState to reset location.search (jsdom supports this).
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

// ─── Defaults ────────────────────────────────────────────────────────────────

describe('isFeatureEnabled — defaults', () => {
  it('returns false for AI_ASSISTANT by default', () => {
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(false);
  });

  it('returns false for an unknown flag by default', () => {
    expect(isFeatureEnabled('feature.unknown')).toBe(false);
  });
});

// ─── setFeatureEnabled / isFeatureEnabled round-trip ─────────────────────────

describe('setFeatureEnabled / isFeatureEnabled', () => {
  it('persists true and isFeatureEnabled returns true', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(true);
  });

  it('persists false and isFeatureEnabled returns false', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, false);
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(false);
  });

  it('stores value in localStorage under the beatbax: prefix', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    expect(localStorage.getItem('beatbax:feature.aiAssistant')).toBe('true');
  });
});

// ─── URL parameter overrides ──────────────────────────────────────────────────

describe('URL param overrides', () => {
  it('?ai=1 enables the flag regardless of localStorage (not set)', () => {
    window.history.pushState({}, '', '?ai=1');
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(true);
  });

  it('?ai=1 enables the flag even when localStorage says false', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, false);
    window.history.pushState({}, '', '?ai=1');
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(true);
  });

  it('?ai=0 disables the flag even when localStorage says true', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    window.history.pushState({}, '', '?ai=0');
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(false);
  });

  it('?ai=0 disables the flag when localStorage is not set', () => {
    window.history.pushState({}, '', '?ai=0');
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(false);
  });

  it('absence of ai param falls through to localStorage', () => {
    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);
    window.history.pushState({}, '', '?other=1');
    expect(isFeatureEnabled(FeatureFlag.AI_ASSISTANT)).toBe(true);
  });
});

// ─── FeatureFlag constant ─────────────────────────────────────────────────────

describe('FeatureFlag', () => {
  it('AI_ASSISTANT resolves to feature.aiAssistant', () => {
    expect(FeatureFlag.AI_ASSISTANT).toBe('feature.aiAssistant');
  });
});
