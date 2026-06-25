import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import {
  AVAILABLE_PLUGINS,
  getEnabledPluginIds,
  setPluginEnabled,
} from '@beatbax/app-core/plugins/registry-config';
import {
  BUILTIN_EXPORTER_IDS,
  OPTIONAL_EXPORTER_PLUGINS,
  getEnabledExporterPluginIds,
  isExporterDependencySatisfied,
  setExporterPluginEnabled,
} from '@beatbax/app-core/plugins/exporter-registry-config';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { gameboyPlugin, nesPlugin } from '@beatbax/engine/chips';
import { NoteText, SectionHeading, SettingsFeatureRow } from './form';

const BADGE_CLASS: Record<string, string> = {
  Stable: 'bb-settings-badge--stable',
  Beta: 'bb-settings-badge--beta',
  Experimental: 'bb-settings-badge--experimental',
};

function BuiltinSubheading({ children }: { children: string }): React.JSX.Element {
  return <div className="bb-settings-subheading">{children}</div>;
}

function VersionedTitle({
  badge,
  label,
  version,
}: {
  badge: string;
  label: string;
  version: string;
}): React.JSX.Element {
  return (
    <>
      <span>{label}</span>
      <span className="bb-settings-plugin-version">v{version}</span>
      <span className={`bb-settings-badge ${BADGE_CLASS[badge] ?? ''}`}>{badge}</span>
    </>
  );
}

export function PluginsSettingsSection(): React.JSX.Element {
  const enabledPlugins = getEnabledPluginIds();
  const enabledExporters = getEnabledExporterPluginIds();
  const builtinExporters = exporterRegistry
    .all()
    .filter((plugin) => BUILTIN_EXPORTER_IDS.includes(plugin.id))
    .sort((a, b) => {
      const aUniversal = a.supportedChips.includes('*');
      const bUniversal = b.supportedChips.includes('*');
      if (aUniversal !== bUniversal) return aUniversal ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  return (
    <div className="bb-settings-section">
      <SectionHeading>Chip plugins</SectionHeading>
      <NoteText>Enable or disable pre-bundled chip backends. Built-in chips are always available. Changes take effect after a page reload.</NoteText>

      <BuiltinSubheading>Built-in</BuiltinSubheading>
      {[
        {
          badge: 'Stable',
          description: '4-channel APU - 2 pulse, wave, and noise. Enables `chip gameboy` in .bax scripts.',
          id: 'gameboy',
          label: 'Game Boy DMG-01 APU',
          version: gameboyPlugin.version,
        },
        {
          badge: 'Beta',
          description: 'Nintendo Entertainment System / Famicom APU - 2 pulse channels, triangle, noise, and DMC sample playback. Enables `chip nes` or `chip famicom` in .bax scripts.',
          id: 'nes',
          label: 'NES/Famicom (Ricoh 2A03)',
          version: nesPlugin.version,
        },
      ].map((builtin) => (
        <SettingsFeatureRow
          description={builtin.description}
          key={builtin.id}
          title={<VersionedTitle badge={builtin.badge} label={builtin.label} version={builtin.version} />}
        >
          <span className="bb-settings-plugin-builtin">Built-in</span>
        </SettingsFeatureRow>
      ))}

      <BuiltinSubheading>Optional</BuiltinSubheading>
      {AVAILABLE_PLUGINS.map((entry) => (
        <SettingsFeatureRow
          description={entry.description}
          key={entry.id}
          title={<VersionedTitle badge={entry.badge} label={entry.label} version={entry.plugin.version} />}
        >
          <input
            checked={enabledPlugins.includes(entry.id)}
            className="bb-settings-toggle"
            onChange={(event) => setPluginEnabled(entry.id, event.currentTarget.checked)}
            type="checkbox"
          />
        </SettingsFeatureRow>
      ))}

      <SectionHeading>Export Plugins</SectionHeading>
      <NoteText>Enable or disable optional exporter plugins. Built-in exporters are always available.</NoteText>

      <BuiltinSubheading>Built-in</BuiltinSubheading>
      {builtinExporters.map((plugin) => {
        const ext = plugin.extension.startsWith('.') ? plugin.extension : `.${plugin.extension}`;
        return (
          <SettingsFeatureRow
            description={`${plugin.id} (${ext}) - chips: ${plugin.supportedChips.join(', ')}`}
            key={plugin.id}
            title={<VersionedTitle badge="Stable" label={plugin.label} version={plugin.version} />}
          >
            <span className="bb-settings-plugin-builtin">Built-in</span>
          </SettingsFeatureRow>
        );
      })}

      <BuiltinSubheading>Optional</BuiltinSubheading>
      {OPTIONAL_EXPORTER_PLUGINS.map((entry) => {
        const dependencySatisfied = isExporterDependencySatisfied(entry);
        const deps = (entry.dependsOnChipPlugins ?? []).join(', ');
        return (
          <SettingsFeatureRow
            description={
              dependencySatisfied
                ? entry.description
                : `${entry.description} (Disabled: requires enabled chip plugin(s): ${deps})`
            }
            key={entry.id}
            title={<VersionedTitle badge={entry.badge} label={entry.label} version={entry.plugin.version} />}
          >
            <input
              checked={dependencySatisfied && enabledExporters.includes(entry.id)}
              className="bb-settings-toggle"
              disabled={!dependencySatisfied}
              onChange={(event) => setExporterPluginEnabled(entry.id, event.currentTarget.checked)}
              title={dependencySatisfied ? 'Enable exporter plugin' : 'Enable required chip plugin first'}
              type="checkbox"
            />
          </SettingsFeatureRow>
        );
      })}
    </div>
  );
}

export function resetPluginsDefaults(): void {
  storage.setJSON(StorageKey.ENABLED_PLUGINS, ['sms']);
  storage.setJSON(StorageKey.ENABLED_EXPORTER_PLUGINS, OPTIONAL_EXPORTER_PLUGINS.map((entry) => entry.id));
  window.location.reload();
}
