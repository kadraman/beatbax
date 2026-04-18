/**
 * Features section — toggles for opt-in / gated capabilities.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { setFeatureEnabled, FeatureFlag } from '../../utils/feature-flags';
import {
  settingFeatureAI,
  settingFeaturePerChannelAnalyser,
  settingFeatureDawMixer,
  settingFeaturePatternGrid,
  settingFeatureHotReload,
  settingFeatureSongVisualizer,
} from '../../stores/settings.store';
import { sectionHeading, noteText } from './general';

interface FeatureEntry {
  label: string;
  description: string;
  badge: 'Beta' | 'Experimental' | 'Planned' | 'Stable';
  flag: string;
  atom: ReturnType<typeof import('nanostores').atom<boolean>>;
  planned?: boolean;
  onToggle?: (enabled: boolean) => void;
}

const FEATURES: FeatureEntry[] = [
  {
    label: 'Song Visualizer',
    description: 'Channel cards panel in the right-hand Visualizer tab. Shows per-channel waveforms, instrument and pattern readouts, and mute/solo controls. Includes a fullscreen performance mode with animated backgrounds.',
    badge: 'Beta',
    flag: FeatureFlag.SONG_VISUALIZER,
    atom: settingFeatureSongVisualizer,
    onToggle: (enabled) => (window as any).__beatbax_toggleSongVisualizer?.(enabled),
  },
  {
    label: 'Channel Mixer',
    description: 'Horizontal channel strip with VU meters docked at the bottom of the editor. Each channel shows instrument, sequence, and pattern readouts plus mute/solo controls. Can be toggled between full-width and inline (beside the output panel) dock modes.',
    badge: 'Beta',
    flag: FeatureFlag.DAW_MIXER,
    atom: settingFeatureDawMixer,
    onToggle: (enabled) => (window as any).__beatbax_toggleChannelMixer?.(enabled),
  },
  {
    label: 'AI Copilot',
    description: 'Built-in AI assistant. Requires your own API key (stored locally). Ask questions about your song, generate patterns, or get help with BeatBax syntax.',
    badge: 'Beta',
    flag: FeatureFlag.AI_ASSISTANT,
    atom: settingFeatureAI,
  },
  {
    label: 'Per-channel waveform analyser',
    description: 'Attaches a WebAudio AnalyserNode to each channel and streams real time-domain waveforms to the Song Visualizer. Shows the actual audio signal instead of synthetic pulses. Enable, then press Play to see real waveforms.',
    badge: 'Beta',
    flag: FeatureFlag.PER_CHANNEL_ANALYSER,
    atom: settingFeaturePerChannelAnalyser,
    onToggle: (enabled) => (window as any).__beatbax_setPerChannelAnalyser?.(enabled),
  },
  {
    label: 'Pattern grid',
    description: 'Visual sequence overview displayed below the transport bar. Shows all pattern blocks for every channel and tracks the playback cursor in real time. Click a block to jump to its definition in the editor.',
    badge: 'Experimental',
    flag: FeatureFlag.PATTERN_GRID,
    atom: settingFeaturePatternGrid,
    onToggle: (enabled) => (window as any).__beatbax_togglePatternGrid?.(enabled),
  },
  {
    label: 'Hot reload (Live mode)',
    description: 'Automatically re-parses and replays the song each time you stop typing — the ⚡ Live button on the transport bar. Enabling this pre-activates Live mode on startup.',
    badge: 'Experimental',
    flag: FeatureFlag.HOT_RELOAD,
    atom: settingFeatureHotReload,
    onToggle: (enabled) => (window as any).__beatbax_setLiveMode?.(enabled),
  },
];

const BADGE_CLASS: Record<string, string> = {
  Beta:         'bb-settings-badge--beta',
  Experimental: 'bb-settings-badge--experimental',
  Planned:      'bb-settings-badge--planned',
  Stable:       'bb-settings-badge--stable',
};

export function buildFeaturesSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Optional capabilities'));

  // Collect all nanostores unsubscribe functions so we can tear them down
  // when this section is removed from the DOM (e.g. on "Reset to defaults").
  const unsubs: Array<() => void> = [];

  for (const feat of FEATURES) {
    const row = document.createElement('div');
    row.className = 'bb-settings-feature-row';

    const left = document.createElement('div');
    left.className = 'bb-settings-feature-info';

    const titleLine = document.createElement('div');
    titleLine.className = 'bb-settings-feature-title';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = feat.label;

    const badge = document.createElement('span');
    badge.className = `bb-settings-badge ${BADGE_CLASS[feat.badge] ?? ''}`;
    badge.textContent = feat.badge;
    titleLine.append(nameSpan, badge);

    const desc = document.createElement('span');
    desc.className = 'bb-settings-feature-desc';
    desc.textContent = feat.description;

    left.append(titleLine, desc);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bb-settings-toggle';
    input.checked = feat.atom.get();
    if (feat.planned) {
      input.disabled = true;
      input.title = 'Not yet implemented';
    }
    input.addEventListener('change', () => {
      feat.atom.set(input.checked);
      setFeatureEnabled(feat.flag, input.checked);
      feat.onToggle?.(input.checked);
    });
    // Keep checkbox in sync when atom is changed externally (e.g. from ChannelMixer button).
    // Store the returned unsubscribe so we can clean up on section disposal.
    unsubs.push(feat.atom.subscribe((val: boolean) => { input.checked = val; }));

    row.append(left, input);
    el.appendChild(row);
  }

  // Dispose all subscriptions as soon as this element is detached from the DOM.
  // A MutationObserver on the parent is the simplest hook that doesn't require
  // callers to invoke a teardown function.
  let observer: MutationObserver | null = new MutationObserver(() => {
    if (!el.isConnected) {
      unsubs.forEach(fn => fn());
      unsubs.length = 0;
      observer!.disconnect();
      observer = null;
    }
  });
  // Begin observing once the element is inserted (defer one microtask so that
  // the caller has time to attach it to the document).
  Promise.resolve().then(() => {
    if (el.isConnected && observer) {
      observer.observe(el.parentElement!, { childList: true });
    } else if (observer) {
      // Element was never inserted — nothing to observe; release immediately.
      unsubs.forEach(fn => fn());
      unsubs.length = 0;
      observer.disconnect();
      observer = null;
    }
  });

  return el;
}

export function resetFeaturesDefaults(): void {
  settingFeatureAI.set(false);
  settingFeaturePerChannelAnalyser.set(false);
  settingFeatureDawMixer.set(false);
  settingFeaturePatternGrid.set(false);
  settingFeatureHotReload.set(false);
}
