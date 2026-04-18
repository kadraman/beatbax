/**
 * settings.store — nanostores atoms for all user-configurable preferences.
 *
 * Each atom reads its initial value from localStorage via StorageKey and
 * persists changes back on write. Components that read these atoms react
 * automatically to changes without polling.
 */

import { atom } from 'nanostores';
import { storage, StorageKey } from '../utils/local-storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function boolAtom(key: string, defaultVal: boolean) {
  const stored = storage.get(key);
  const initial = stored !== undefined ? stored === 'true' : defaultVal;
  const a = atom<boolean>(initial);
  let first = true;
  a.subscribe((v) => { if (first) { first = false; return; } storage.set(key, v ? 'true' : 'false'); });
  return a;
}

function stringAtom<T extends string>(key: string, defaultVal: T) {
  const stored = storage.get(key);
  const initial: T = (stored as T) ?? defaultVal;
  const a = atom<T>(initial);
  let first = true;
  a.subscribe((v) => { if (first) { first = false; return; } storage.set(key, v); });
  return a;
}

function numberAtom(key: string, defaultVal: number) {
  const stored = storage.get(key);
  const parsed = stored !== undefined ? Number(stored) : NaN;
  const initial = Number.isFinite(parsed) ? parsed : defaultVal;
  const a = atom<number>(initial);
  let first = true;
  a.subscribe((v) => { if (first) { first = false; return; } storage.set(key, String(v)); });
  return a;
}

// ─── General ──────────────────────────────────────────────────────────────────

// settingTheme is purely UI state — it does NOT write to StorageKey.THEME.
// ThemeManager owns that key: 'dark'/'light' = explicit choice, absent = follow OS.
// We read 'system' when the key is absent so the radio shows the correct selection.
export const settingTheme = (() => {
  const initial: 'dark' | 'light' | 'system' = storage.has(StorageKey.THEME)
    ? (storage.get(StorageKey.THEME) as 'dark' | 'light')
    : 'system';
  return atom<'dark' | 'light' | 'system'>(initial);
})();

export const settingToolbarStyle = stringAtom<'icons+labels' | 'icons'>(
  StorageKey.TOOLBAR_STYLE,
  'icons+labels',
);

export const settingShowToolbar        = boolAtom(StorageKey.PANEL_VIS_TOOLBAR,        true);
export const settingShowTransportBar   = boolAtom(StorageKey.PANEL_VIS_TRANSPORT_BAR,  true);
export const settingShowPatternGrid    = boolAtom(StorageKey.PANEL_VIS_PATTERN_GRID,   false);
export const settingShowChannelMixer   = boolAtom(StorageKey.PANEL_VIS_CHANNEL_MIXER,  true);
export const settingShowSongVisualizer = boolAtom(StorageKey.PANEL_VIS_SONG_VISUALIZER, false);
export const settingShowChannelMixerLegacy = settingShowSongVisualizer;
export const settingVizBgEffect        = stringAtom<'none' | 'starfield' | 'scanlines' | 'custom-image'>(
  StorageKey.VIZ_BG_EFFECT,
  'none',
);
export const settingVizBgImage         = stringAtom<string>(StorageKey.VIZ_BG_IMAGE, '');

// ─── Editor ───────────────────────────────────────────────────────────────────

export const settingAutoSave        = boolAtom(StorageKey.AUTO_SAVE,         true);
export const settingWordWrap        = boolAtom(StorageKey.WORD_WRAP,         false);
export const settingCodeLens        = boolAtom(StorageKey.CODELENS,          true);
export const settingBeatDecorations = boolAtom(StorageKey.BEAT_DECORATIONS,  true);
export const settingDefaultBpm      = numberAtom(StorageKey.BPM,              128);
export const settingFontSize        = numberAtom(StorageKey.FONT_SIZE,         14);

// ─── Playback ─────────────────────────────────────────────────────────────────

export const settingAudioSampleRate = stringAtom<'44100' | '48000' | '96000'>(
  StorageKey.AUDIO_SAMPLE_RATE,
  '44100',
);

export const settingDefaultLoop = boolAtom(StorageKey.PLAYBACK_LOOP, false);

export const settingAudioBufferFrames = stringAtom<'1024' | '2048' | '4096' | '8192'>(
  StorageKey.AUDIO_BUFFER_FRAMES,
  '4096',
);

// ─── Features ─────────────────────────────────────────────────────────────────

export const settingFeatureAI              = boolAtom(StorageKey.AI_ASSISTANT,              false);
export const settingFeaturePerChannelAnalyser = boolAtom(StorageKey.FEATURE_PER_CHANNEL_ANALYSER, false);
export const settingFeatureChannelMixer    = boolAtom(StorageKey.FEATURE_CHANNEL_MIXER,      false);
export const settingFeaturePatternGrid     = boolAtom(StorageKey.FEATURE_PATTERN_GRID,      false);
export const settingFeatureHotReload       = boolAtom(StorageKey.FEATURE_HOT_RELOAD,        false);
export const settingFeatureSongVisualizer  = boolAtom(StorageKey.FEATURE_SONG_VISUALIZER,   false);

// ─── Advanced ─────────────────────────────────────────────────────────────────

export const settingLogLevel = stringAtom<'error' | 'warn' | 'info' | 'debug'>(
  StorageKey.LOG_LEVEL,
  'warn',
);

export const settingDebugOverlay      = boolAtom(StorageKey.DEBUG_OVERLAY,       false);
export const settingDebugOverlayPosition = stringAtom<'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'>(
  StorageKey.DEBUG_OVERLAY_POSITION,
  'top-right',
);
export const settingDebugOverlayOpacity = numberAtom(StorageKey.DEBUG_OVERLAY_OPACITY, 70);
export const settingDebugOverlayFontSize = numberAtom(StorageKey.DEBUG_OVERLAY_FONT_SIZE, 11);
export const settingDebugExposePlayer = boolAtom(StorageKey.DEBUG_EXPOSE_PLAYER, true);

// ─── Reset helpers ────────────────────────────────────────────────────────────

/** Keys belonging to each section — used by "Reset section to defaults". */
export const SECTION_KEYS: Record<string, string[]> = {
  general: [
    StorageKey.THEME,
    StorageKey.TOOLBAR_STYLE,
    StorageKey.PANEL_VIS_TOOLBAR,
    StorageKey.PANEL_VIS_TRANSPORT_BAR,
    StorageKey.PANEL_VIS_PATTERN_GRID,
    StorageKey.PANEL_VIS_CHANNEL_MIXER,
    StorageKey.PANEL_VIS_SONG_VISUALIZER,
    StorageKey.VIZ_BG_EFFECT,
    StorageKey.VIZ_BG_IMAGE,
  ],
  editor: [
    StorageKey.AUTO_SAVE,
    StorageKey.WORD_WRAP,
    StorageKey.CODELENS,
    StorageKey.BEAT_DECORATIONS,
    StorageKey.BPM,
    StorageKey.FONT_SIZE,
  ],
  playback: [
    StorageKey.AUDIO_SAMPLE_RATE,
    StorageKey.PLAYBACK_LOOP,
    StorageKey.AUDIO_BUFFER_FRAMES,
  ],
  features: [
    StorageKey.AI_ASSISTANT,
    StorageKey.FEATURE_PER_CHANNEL_ANALYSER,
    StorageKey.FEATURE_CHANNEL_MIXER,
    StorageKey.FEATURE_PATTERN_GRID,
    StorageKey.FEATURE_HOT_RELOAD,
    StorageKey.FEATURE_SONG_VISUALIZER,
  ],
  ai: [
    StorageKey.CHAT_SETTINGS,
    StorageKey.CHAT_MODE,
  ],
  advanced: [
    StorageKey.LOG_LEVEL,
    StorageKey.DEBUG_OVERLAY,
    StorageKey.DEBUG_OVERLAY_POSITION,
    StorageKey.DEBUG_OVERLAY_OPACITY,
    StorageKey.DEBUG_OVERLAY_FONT_SIZE,
    StorageKey.DEBUG_EXPOSE_PLAYER,
  ],
};
