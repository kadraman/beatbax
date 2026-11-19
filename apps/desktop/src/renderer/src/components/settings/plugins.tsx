import { useCallback, useEffect, useState } from 'react';
import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import {
  AVAILABLE_PLUGINS,
  DEFAULT_ENABLED_PLUGINS,
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
import type { DesktopUserChipPluginInfo } from '../../../../shared/electron-api';
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

function UserPluginsSettings(): React.JSX.Element {
  const [plugins, setPlugins] = useState<DesktopUserChipPluginInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.listUserChipPlugins();
      setPlugins(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAndReload = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  const installFromArchive = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const installed = await window.electronAPI.installUserChipPluginFromArchive();
      if (!installed) {
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  return (
    <>
      <BuiltinSubheading>User plugins</BuiltinSubheading>
      <NoteText>
        Add a chip plugin from a packed <code>.zip</code> or <code>.tgz</code>. The app reloads after
        install.
      </NoteText>

      <div className="bb-settings-user-plugins">
        <div className="bb-settings-row">
          <button
            className="bb-settings-btn-secondary"
            disabled={busy}
            onClick={() => void installFromArchive()}
            type="button"
          >
            Install
          </button>
        </div>

        {error ? <div className="bb-settings-inline-warning">{error}</div> : null}

        {plugins.length === 0 ? (
          <NoteText>No user chip plugins installed yet.</NoteText>
        ) : (
          plugins.map((entry) => (
            <SettingsFeatureRow
              description={
                entry.missingOnDisk
                  ? `Chip \`${entry.chipName}\` — on-disk package missing; remove or reinstall.`
                  : `Chip \`${entry.chipName}\`${entry.aliases.length ? ` (aliases: ${entry.aliases.join(', ')})` : ''} — package ${entry.packageName}`
              }
              key={entry.packageName}
              title={
                <VersionedTitle
                  badge="Experimental"
                  label={entry.chipName}
                  version={entry.version}
                />
              }
            >
              <input
                checked={entry.enabled}
                className="bb-settings-toggle"
                disabled={busy || Boolean(entry.missingOnDisk)}
                onChange={(event) =>
                  void runAndReload(() =>
                    window.electronAPI.setUserChipPluginEnabled(
                      entry.packageName,
                      event.currentTarget.checked
                    )
                  )
                }
                title={entry.enabled ? 'Disable user chip plugin' : 'Enable user chip plugin'}
                type="checkbox"
              />
              <button
                className="bb-settings-btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Remove user chip plugin ${entry.packageName}?`)) return;
                  void runAndReload(() =>
                    window.electronAPI.removeUserChipPlugin(entry.packageName)
                  );
                }}
                type="button"
              >
                Remove
              </button>
            </SettingsFeatureRow>
          ))
        )}
      </div>
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

      <UserPluginsSettings />

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
  storage.setJSON(StorageKey.ENABLED_PLUGINS, [...DEFAULT_ENABLED_PLUGINS]);
  storage.setJSON(StorageKey.ENABLED_EXPORTER_PLUGINS, OPTIONAL_EXPORTER_PLUGINS.map((entry) => entry.id));
  window.location.reload();
}
