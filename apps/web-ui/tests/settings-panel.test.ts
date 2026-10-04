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

import { StorageKey } from '@beatbax/app-core/utils/local-storage';
import { FeatureFlag, isFeatureEnabled, setFeatureEnabled } from '@beatbax/app-core/utils/feature-flags';
import { eventBus } from '@beatbax/app-core/utils/event-bus';
import {
  SECTION_KEYS,
  settingCodeLens,
  settingCodeLensPatterns,
  settingCodeLensSequences,
  settingCodeLensInstruments,
  settingCodeLensEffects,
} from '@beatbax/app-core/stores/settings.store';
import { buildEditorSection, resetEditorDefaults } from '../src/panels/settings-sections/editor';

// ─── StorageKey additions ─────────────────────────────────────────────────────

describe('StorageKey', () => {
  it('has new keys added for settings panel', () => {
    expect(StorageKey.TOOLBAR_STYLE).toBe('ui.toolbarStyle');
    expect(StorageKey.WORD_WRAP).toBe('editor.wordWrap');
    expect(StorageKey.FOLD_COMMENTS).toBe('editor.foldComments');
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
    expect(StorageKey.FEATURE_CHANNEL_MIXER).toBe('feature.channelMixer');
    expect(StorageKey.FEATURE_PATTERN_GRID).toBe('feature.patternGrid');
    expect(StorageKey.FEATURE_HOT_RELOAD).toBe('feature.hotReload');
  });
});

// ─── FeatureFlag additions ────────────────────────────────────────────────────

describe('FeatureFlag', () => {
  it('has new flags', () => {
    expect(FeatureFlag.PER_CHANNEL_ANALYSER).toBe('feature.perChannelAnalyser');
    expect(FeatureFlag.CHANNEL_MIXER).toBe('feature.channelMixer');
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
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_CHANNEL_MIXER);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_PATTERN_GRID);
    expect(SECTION_KEYS.features).toContain(StorageKey.FEATURE_HOT_RELOAD);
  });

  it('editor section includes the CodeLens category keys', () => {
    expect(SECTION_KEYS.editor).toEqual(expect.arrayContaining([
      StorageKey.CODELENS,
      StorageKey.CODELENS_PATTERNS,
      StorageKey.CODELENS_SEQUENCES,
      StorageKey.CODELENS_INSTRUMENTS,
      StorageKey.CODELENS_EFFECTS,
    ]));
  });
});

// ─── Granular CodeLens settings ───────────────────────────────────────────────

describe('Editor section CodeLens category toggles', () => {
  const categoryLabels = [
    'Pattern previews (pat)',
    'Sequence previews (seq)',
    'Instrument previews (inst)',
    'Effect previews (effect)',
  ];

  function rowInput(section: HTMLElement, label: string): HTMLInputElement {
    const row = Array.from(section.querySelectorAll('label.bb-settings-toggle-row'))
      .find((el) => el.querySelector('.bb-settings-label')?.textContent === label);
    if (!row) throw new Error(`toggle row not found: ${label}`);
    return row.querySelector('input') as HTMLInputElement;
  }

  afterEach(() => {
    settingCodeLens.set(true);
    settingCodeLensPatterns.set(true);
    settingCodeLensSequences.set(true);
    settingCodeLensInstruments.set(true);
    settingCodeLensEffects.set(true);
  });

  it('uses dedicated storage keys', () => {
    expect(StorageKey.CODELENS_PATTERNS).toBe('editor.codelens.patterns');
    expect(StorageKey.CODELENS_SEQUENCES).toBe('editor.codelens.sequences');
    expect(StorageKey.CODELENS_INSTRUMENTS).toBe('editor.codelens.instruments');
    expect(StorageKey.CODELENS_EFFECTS).toBe('editor.codelens.effects');
  });

  it('renders the four category toggles, checked by default', () => {
    const section = buildEditorSection();
    for (const label of categoryLabels) {
      const input = rowInput(section, label);
      expect(input.checked).toBe(true);
      expect(input.disabled).toBe(false);
    }
  });

  it('disables the category toggles while the master toggle is off', () => {
    const section = buildEditorSection();
    const master = rowInput(section, 'Show CodeLens previews');
    master.checked = false;
    master.dispatchEvent(new Event('change'));

    expect(settingCodeLens.get()).toBe(false);
    for (const label of categoryLabels) {
      expect(rowInput(section, label).disabled).toBe(true);
    }

    master.checked = true;
    master.dispatchEvent(new Event('change'));
    for (const label of categoryLabels) {
      expect(rowInput(section, label).disabled).toBe(false);
    }
  });

  it('writes category changes to the settings store', () => {
    const section = buildEditorSection();
    const seq = rowInput(section, 'Sequence previews (seq)');
    seq.checked = false;
    seq.dispatchEvent(new Event('change'));
    expect(settingCodeLensSequences.get()).toBe(false);
    expect(localStorage.getItem(`beatbax:${StorageKey.CODELENS_SEQUENCES}`)).toBe('false');
  });

  it('resetEditorDefaults turns every category back on', () => {
    settingCodeLensPatterns.set(false);
    settingCodeLensSequences.set(false);
    settingCodeLensInstruments.set(false);
    settingCodeLensEffects.set(false);

    resetEditorDefaults();

    expect(settingCodeLensPatterns.get()).toBe(true);
    expect(settingCodeLensSequences.get()).toBe(true);
    expect(settingCodeLensInstruments.get()).toBe(true);
    expect(settingCodeLensEffects.get()).toBe(true);
  });
});
