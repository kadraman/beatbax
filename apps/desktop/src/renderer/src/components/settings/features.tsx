import { setFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import {
  settingFeatureAI,
  settingFeatureChannelMixer,
  settingFeatureHotReload,
  settingFeaturePatternGrid,
  settingFeaturePerChannelAnalyser,
  settingFeatureSongVisualizer,
} from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { SectionHeading, SettingsFeatureRow } from './form';

interface FeatureEntry {
  atom: {
    get: () => boolean;
    set: (value: boolean) => void;
    subscribe: (listener: (value: boolean) => void) => () => void;
  };
  badge: 'Beta' | 'Experimental' | 'Planned' | 'Stable';
  description: string;
  flag: string;
  label: string;
  onToggle?: (enabled: boolean) => void;
  planned?: boolean;
}

const BADGE_CLASS: Record<string, string> = {
  Beta: 'bb-settings-badge--beta',
  Experimental: 'bb-settings-badge--experimental',
  Planned: 'bb-settings-badge--planned',
  Stable: 'bb-settings-badge--stable',
};

const FEATURES: FeatureEntry[] = [
  {
    atom: settingFeatureSongVisualizer,
    badge: 'Beta',
    description: 'Channel cards panel in the right-hand Visualizer tab. Shows per-channel waveforms, instrument and pattern readouts, and mute/solo controls. Includes a fullscreen performance mode with animated backgrounds.',
    flag: FeatureFlag.SONG_VISUALIZER,
    label: 'Song Visualizer',
    onToggle: (enabled) => (window as any).__beatbax_toggleSongVisualizer?.(enabled),
  },
  {
    atom: settingFeatureChannelMixer,
    badge: 'Beta',
    description: 'Horizontal channel strip with VU meters docked at the bottom of the editor. Each channel shows instrument, sequence, and pattern readouts plus mute/solo controls. Can be toggled between full-width and inline (beside the output panel) dock modes.',
    flag: FeatureFlag.CHANNEL_MIXER,
    label: 'Channel Mixer',
    onToggle: (enabled) => (window as any).__beatbax_toggleChannelMixer?.(enabled),
  },
  {
    atom: settingFeatureAI,
    badge: 'Beta',
    description: 'Built-in AI assistant. Requires your own API key (stored locally). Ask questions about your song, generate patterns, or get help with BeatBax syntax.',
    flag: FeatureFlag.AI_ASSISTANT,
    label: 'AI Copilot',
  },
  {
    atom: settingFeaturePerChannelAnalyser,
    badge: 'Beta',
    description: 'Attaches a WebAudio AnalyserNode to each channel and streams real time-domain waveforms to the Song Visualizer. Shows the actual audio signal instead of synthetic pulses. Enable, then press Play to see real waveforms.',
    flag: FeatureFlag.PER_CHANNEL_ANALYSER,
    label: 'Per-channel waveform analyser',
    onToggle: (enabled) => (window as any).__beatbax_setPerChannelAnalyser?.(enabled),
  },
  {
    atom: settingFeaturePatternGrid,
    badge: 'Experimental',
    description: 'Visual sequence overview displayed below the transport bar. Shows all pattern blocks for every channel and tracks the playback cursor in real time. Click a block to jump to its definition in the editor.',
    flag: FeatureFlag.PATTERN_GRID,
    label: 'Pattern grid',
    onToggle: (enabled) => (window as any).__beatbax_togglePatternGrid?.(enabled),
  },
  {
    atom: settingFeatureHotReload,
    badge: 'Experimental',
    description: 'Automatically re-parses and replays the song each time you stop typing - the Live button on the transport bar. Enabling this pre-activates Live mode on startup.',
    flag: FeatureFlag.HOT_RELOAD,
    label: 'Hot reload (Live mode)',
    onToggle: (enabled) => (window as any).__beatbax_setLiveMode?.(enabled),
  },
];

function FeatureToggleRow({ feature }: { feature: FeatureEntry }): React.JSX.Element {
  const enabled = useStoreValue(feature.atom);

  return (
    <SettingsFeatureRow
      badge={feature.badge}
      badgeClass={BADGE_CLASS[feature.badge]}
      description={feature.description}
      title={feature.label}
    >
      <input
        checked={enabled}
        className="bb-settings-toggle"
        disabled={feature.planned}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          feature.atom.set(next);
          setFeatureEnabled(feature.flag, next);
          feature.onToggle?.(next);
        }}
        title={feature.planned ? 'Not yet implemented' : undefined}
        type="checkbox"
      />
    </SettingsFeatureRow>
  );
}

export function FeaturesSettingsSection(): React.JSX.Element {
  return (
    <div className="bb-settings-section">
      <SectionHeading>Optional capabilities</SectionHeading>
      {FEATURES.map((feature) => (
        <FeatureToggleRow feature={feature} key={feature.flag} />
      ))}
    </div>
  );
}

export function resetFeaturesDefaults(): void {
  settingFeatureAI.set(false);
  settingFeaturePerChannelAnalyser.set(false);
  settingFeatureChannelMixer.set(true);
  settingFeaturePatternGrid.set(false);
  settingFeatureHotReload.set(false);
  settingFeatureSongVisualizer.set(false);
}
