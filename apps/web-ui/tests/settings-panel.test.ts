/**
 * Unit tests for the Settings panel feature.
 *
 * Covers:
 *  - StorageKey additions
 *  - FeatureFlag additions
 *  - setFeatureEnabled emitting feature-flag:changed
 *  - settings.store.ts atoms reset helpers (SECTION_KEYS completeness)
 */

// jsdom provides localStorage and window automatically — no manual mocking needed.

import { StorageKey } from '../src/utils/local-storage';
import { FeatureFlag, isFeatureEnabled, setFeatureEnabled } from '../src/utils/feature-flags';
import { eventBus } from '../src/utils/event-bus';
import { SECTION_KEYS } from '../src/stores/settings.store';

// ─── StorageKey additions ─────────────────────────────────────────────────────

describe('StorageKey', () => {
  it('has new keys added for settings panel', () => {
    expect(StorageKey.TOOLBAR_STYLE).toBe('ui.toolbarStyle');
    expect(StorageKey.CHANNEL_COMPACT).toBe('ui.channelCompact');
    expect(StorageKey.WORD_WRAP).toBe('editor.wordWrap');
    expect(StorageKey.CODELENS).toBe('editor.codelens');
    expect(StorageKey.BEAT_DECORATIONS).toBe('editor.beatDecorations');
    expect(StorageKey.FONT_SIZE).toBe('editor.fontSize');
    expect(StorageKey.AUDIO_BACKEND).toBe('audio.backend');
    expect(StorageKey.AUDIO_SAMPLE_RATE).toBe('audio.sampleRate');
    expect(StorageKey.AUDIO_BUFFER_FRAMES).toBe('audio.bufferFrames');
    expect(StorageKey.PLAYBACK_LOOP).toBe('playback.loop');
    expect(StorageKey.DEBUG_OVERLAY).toBe('debug.overlay');
    expect(StorageKey.DEBUG_EXPOSE_PLAYER).toBe('debug.exposePlayer');
    expect(StorageKey.FEATURE_PER_CHANNEL_ANALYSER).toBe('feature.perChannelAnalyser');
    expect(StorageKey.FEATURE_DAW_MIXER).toBe('feature.dawMixer');
    expect(StorageKey.FEATURE_PATTERN_GRID).toBe('feature.patternGrid');
    expect(StorageKey.FEATURE_HOT_RELOAD).toBe('feature.hotReload');
  });
});

// ─── FeatureFlag additions ────────────────────────────────────────────────────

describe('FeatureFlag', () => {
  it('has new flags', () => {
    expect(FeatureFlag.PER_CHANNEL_ANALYSER).toBe('feature.perChannelAnalyser');
    expect(FeatureFlag.DAW_MIXER).toBe('feature.dawMixer');
    expect(FeatureFlag.PATTERN_GRID).toBe('feature.patternGrid');
    expect(FeatureFlag.HOT_RELOAD).toBe('feature.hotReload');
  });
});

// ─── setFeatureEnabled emits event ───────────────────────────────────────────

describe('setFeatureEnabled', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('emits feature-flag:changed with correct payload when enabled', () => {
    const cb = jest.fn();
    const unsub = eventBus.on('feature-flag:changed', cb);

    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, true);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ flag: FeatureFlag.AI_ASSISTANT, enabled: true });
    unsub();
  });

  it('emits feature-flag:changed with correct payload when disabled', () => {
    const cb = jest.fn();
    const unsub = eventBus.on('feature-flag:changed', cb);

    setFeatureEnabled(FeatureFlag.AI_ASSISTANT, false);

    expect(cb).toHaveBeenCalledWith({ flag: FeatureFlag.AI_ASSISTANT, enabled: false });
    unsub();
  });

  it('persists the value so isFeatureEnabled reads it back', () => {
    setFeatureEnabled(FeatureFlag.HOT_RELOAD, true);
    expect(isFeatureEnabled(FeatureFlag.HOT_RELOAD)).toBe(true);

    setFeatureEnabled(FeatureFlag.HOT_RELOAD, false);
    expect(isFeatureEnabled(FeatureFlag.HOT_RELOAD)).toBe(false);
  });
});

// ─── SECTION_KEYS completeness ────────────────────────────────────────────────

describe('SECTION_KEYS', () => {
  it('has entries for every section', () => {
    expect(SECTION_KEYS.general.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.editor.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.playback.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.features.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.ai.length).toBeGreaterThan(0);
    expect(SECTION_KEYS.advanced.length).toBeGreaterThan(0);
  });

  it('general section includes all panel visibility keys', () => {
    expect(SECTION_KEYS.general).toContain(StorageKey.PANEL_VIS_TOOLBAR);
    expect(SECTION_KEYS.general).toContain(StorageKey.PANEL_VIS_TRANSPORT_BAR);
    expect(SECTION_KEYS.general).toContain(StorageKey.PANEL_VIS_CHANNEL_MIXER);
    expect(SECTION_KEYS.general).toContain(StorageKey.PANEL_VIS_PATTERN_GRID);
  });

  it('features section includes all feature flag keys', () => {
    expect(SECTION_KEYS.features).toContain(StorageKey.AI_ASSISTANT);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_PER_CHANNEL_ANALYSER);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_DAW_MIXER);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_PATTERN_GRID);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_HOT_RELOAD);
  });
});
