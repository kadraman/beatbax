/**
 * Features section — toggles for opt-in / gated capabilities.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { setFeatureEnabled, FeatureFlag } from '../../utils/feature-flags';
import {
  settingFeatureAI,
  settingFeatureDawMixer,
  settingFeaturePatternGrid,
  settingFeatureHotReload,
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
    label: 'Pattern grid',
    description: 'Visual sequence overview displayed below the transport bar. Shows all pattern blocks for every channel and tracks the playback cursor in real time. Click a block to jump to its definition in the editor.',
    badge: 'Stable',
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
  {
    label: 'AI Copilot',
    description: 'Built-in AI assistant. Requires your own API key (stored locally). Ask questions about your song, generate patterns, or get help with BeatBax syntax.',
    badge: 'Beta',
    flag: FeatureFlag.AI_ASSISTANT,
    atom: settingFeatureAI,
  },
  {
    label: 'DAW channel mixer',
    description: 'Horizontal channel strip with VU meters and faders docked at the bottom of the editor. Includes per-channel real-time waveform displays (WebAudio AnalyserNode — adds CPU overhead).',
    badge: 'Planned',
    flag: FeatureFlag.DAW_MIXER,
    atom: settingFeatureDawMixer,
    planned: true,
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

    row.append(left, input);
    el.appendChild(row);
  }

  return el;
}

export function resetFeaturesDefaults(): void {
  const defaults: Record<string, string> = {
    [StorageKey.AI_ASSISTANT]:                  'false',
    [StorageKey.FEATURE_PER_CHANNEL_ANALYSER]:  'false',
    [StorageKey.FEATURE_DAW_MIXER]:             'false',
    [StorageKey.FEATURE_PATTERN_GRID]:          'false',
    [StorageKey.FEATURE_HOT_RELOAD]:            'false',
  };
  for (const [key, val] of Object.entries(defaults)) storage.set(key, val);
}
