import { storage } from '@beatbax/app-core/utils/local-storage';
import type { DevToolsState } from '../../../../shared/electron-api';
import {
  settingDebugOverlay,
  settingDebugOverlayFontSize,
  settingDebugOverlayOpacity,
  settingDebugOverlayPosition,
} from '@beatbax/app-core/stores/settings.store';
import { useEffect, useMemo, useState } from 'react';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, RangeField, SectionHeading, SelectField, ToggleRow } from './form';

interface RemoteAssetAllowlistApi {
  getRemoteAssetAllowlist?: () => Promise<string[]>;
  setRemoteAssetAllowlist?: (hosts: string[]) => Promise<string[]>;
}

function getRemoteAllowlistApi(): RemoteAssetAllowlistApi | null {
  const api = (window as unknown as { electronAPI?: RemoteAssetAllowlistApi }).electronAPI;
  if (!api || typeof api !== 'object') return null;
  if (typeof api.getRemoteAssetAllowlist !== 'function' || typeof api.setRemoteAssetAllowlist !== 'function') return null;
  return api;
}

interface DevToolsApi {
  getDevToolsState?: () => Promise<DevToolsState>;
  setDevToolsEnabled?: (enabled: boolean) => Promise<DevToolsState>;
  onDevToolsStateChanged?: (callback: (state: DevToolsState) => void) => () => void;
}

function getDevToolsApi(): Required<DevToolsApi> | null {
  const api = (window as unknown as { electronAPI?: DevToolsApi }).electronAPI;
  if (!api || typeof api.getDevToolsState !== 'function' || typeof api.setDevToolsEnabled !== 'function'
    || typeof api.onDevToolsStateChanged !== 'function') return null;
  return api as Required<DevToolsApi>;
}

export const DEVTOOLS_ENABLE_WARNING = 'Developer tools give full access to BeatBax\'s internals, including your saved AI API key. '
  + 'Never paste code into the console unless you wrote it or fully understand it.\n\nEnable developer tools?';

function DevToolsToggle(): React.JSX.Element | null {
  const api = useMemo(() => getDevToolsApi(), []);
  const [state, setState] = useState<DevToolsState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.getDevToolsState().then((next) => { if (!cancelled) setState(next); }).catch(() => undefined);
    const unsubscribe = api.onDevToolsStateChanged((next) => setState(next));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api]);

  if (!api || !state) return null;

  const development = state.source === 'development';
  const change = async (enabled: boolean): Promise<void> => {
    if (enabled && !confirm(DEVTOOLS_ENABLE_WARNING)) return;
    setError('');
    try {
      setState(await api.setDevToolsEnabled(enabled));
    } catch (err) {
      setError(`Could not change developer tools: ${(err as Error).message || 'unknown error'}.`);
    }
  };

  return (
    <>
      <ToggleRow
        checked={development || state.saved}
        disabled={development}
        label="Enable developer tools"
        onChange={(value) => { void change(value); }}
      />
      {development ? <NoteText>Always available in development builds.</NoteText> : null}
      {state.source === 'launch-flag'
        ? <NoteText>Enabled for this session by the --devtools launch flag.</NoteText>
        : null}
      {error ? <NoteText>{error}</NoteText> : null}
    </>
  );
}

function parseAllowlistInput(raw: string): string[] {
  const unique = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const host = line.trim().toLowerCase();
    if (!host) continue;
    unique.add(host);
  }
  return Array.from(unique);
}

export function AdvancedSettingsSection(): React.JSX.Element {
  const debugOverlay = useStoreValue(settingDebugOverlay);
  const position = useStoreValue(settingDebugOverlayPosition);
  const opacity = useStoreValue(settingDebugOverlayOpacity);
  const fontSize = useStoreValue(settingDebugOverlayFontSize);
  const allowlistApi = useMemo(() => getRemoteAllowlistApi(), []);
  const [allowlistValue, setAllowlistValue] = useState('');
  const [allowlistStatus, setAllowlistStatus] = useState('');
  const [allowlistBusy, setAllowlistBusy] = useState(false);

  useEffect(() => {
    if (!allowlistApi?.getRemoteAssetAllowlist) return;
    let cancelled = false;
    setAllowlistStatus('Loading allowlist...');
    void allowlistApi.getRemoteAssetAllowlist()
      .then((hosts) => {
        if (cancelled) return;
        setAllowlistValue((hosts || []).join('\n'));
        setAllowlistStatus('');
      })
      .catch((error) => {
        if (cancelled) return;
        setAllowlistStatus(`Could not load allowlist: ${(error as Error).message || 'unknown error'}.`);
      });
    return () => { cancelled = true; };
  }, [allowlistApi]);

  const saveAllowlist = async (): Promise<void> => {
    if (!allowlistApi?.setRemoteAssetAllowlist) return;
    setAllowlistBusy(true);
    setAllowlistStatus('Saving allowlist...');
    try {
      const normalized = await allowlistApi.setRemoteAssetAllowlist(parseAllowlistInput(allowlistValue));
      setAllowlistValue((normalized || []).join('\n'));
      setAllowlistStatus('Allowlist saved.');
    } catch (error) {
      setAllowlistStatus(`Could not save allowlist: ${(error as Error).message || 'unknown error'}.`);
    } finally {
      setAllowlistBusy(false);
    }
  };

  const resetAllowlist = async (): Promise<void> => {
    if (!allowlistApi?.setRemoteAssetAllowlist) return;
    setAllowlistBusy(true);
    setAllowlistStatus('Resetting allowlist...');
    try {
      await allowlistApi.setRemoteAssetAllowlist([]);
      setAllowlistValue('');
      setAllowlistStatus('Allowlist reset to built-in defaults.');
    } catch (error) {
      setAllowlistStatus(`Could not reset allowlist: ${(error as Error).message || 'unknown error'}.`);
    } finally {
      setAllowlistBusy(false);
    }
  };

  return (
    <div className="bb-settings-section">
      <SectionHeading>Diagnostics</SectionHeading>
      <DevToolsToggle />
      <NoteText>
        Warnings and errors are written to a log file you can attach to bug reports. Open it from Help → Open Logs Folder.
      </NoteText>
      <ToggleRow
        checked={debugOverlay}
        label="Show debug overlay"
        onChange={(value) => settingDebugOverlay.set(value)}
      />
      <SelectField
        label="Overlay position"
        onChange={(value) => settingDebugOverlayPosition.set(value as 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left')}
        options={[
          { value: 'top-right', label: 'Top right (default)' },
          { value: 'top-left', label: 'Top left' },
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
        ]}
        value={position}
      />
      <RangeField
        label="Overlay opacity"
        max={100}
        min={10}
        onChange={(value) => settingDebugOverlayOpacity.set(value)}
        step={5}
        unit="%"
        value={opacity}
      />
      <SelectField
        label="Overlay font size"
        onChange={(value) => settingDebugOverlayFontSize.set(Number(value))}
        options={[
          { value: '10', label: '10px (small)' },
          { value: '11', label: '11px (default)' },
          { value: '12', label: '12px' },
          { value: '13', label: '13px' },
          { value: '14', label: '14px (large)' },
          { value: '16', label: '16px (extra large)' },
        ]}
        value={String(fontSize)}
      />

      <SectionHeading>Remote assets</SectionHeading>
      <NoteText>
        Add one hostname per line to allow remote asset downloads from those hosts.
      </NoteText>
      <NoteText>
        Hostnames only. No scheme, path, or wildcard. This applies to all remote assets (for example DMC and future sample formats). Built-in defaults still apply even when this list is empty.
      </NoteText>
      <NoteText>
        Always allowed by default: raw.githubusercontent.com. Entries below are additional custom hosts only.
      </NoteText>
      <div className="bb-settings-row bb-settings-row--column bb-settings-remote-assets-wrap">
        <label className="bb-settings-label" htmlFor="bb-remote-allowlist">Remote host allowlist</label>
        <textarea
          className="bb-settings-text bb-settings-remote-assets-text"
          disabled={!allowlistApi || allowlistBusy}
          id="bb-remote-allowlist"
          onChange={(event) => setAllowlistValue(event.currentTarget.value)}
          placeholder="example.com"
          rows={5}
          spellCheck={false}
          value={allowlistValue}
        />
        <div className="bb-ai-key-actions">
          <button
            className="bb-settings-btn-secondary"
            disabled={!allowlistApi || allowlistBusy}
            onClick={() => { void saveAllowlist(); }}
            type="button"
          >
            Save allowlist
          </button>
          <button
            className="bb-settings-btn-secondary"
            disabled={!allowlistApi || allowlistBusy}
            onClick={() => { void resetAllowlist(); }}
            type="button"
          >
            Reset allowlist
          </button>
        </div>
        {allowlistStatus ? <NoteText>{allowlistStatus}</NoteText> : null}
      </div>

      <SectionHeading>Danger zone</SectionHeading>
      <NoteText>Reset all settings removes every beatbax:* key from localStorage and reloads the page.</NoteText>
      <button
        className="bb-settings-btn-danger"
        onClick={() => {
          if (confirm('Reset ALL BeatBax settings to defaults and reload? This cannot be undone.')) {
            storage.clear();
            const devTools = getDevToolsApi();
            void (devTools ? devTools.setDevToolsEnabled(false).catch(() => undefined) : Promise.resolve())
              .then(() => window.location.reload());
          }
        }}
        type="button"
      >
        Reset all settings...
      </button>
    </div>
  );
}

export function resetAdvancedDefaults(): void {
  settingDebugOverlay.set(false);
  settingDebugOverlayPosition.set('top-right');
  settingDebugOverlayOpacity.set(70);
  settingDebugOverlayFontSize.set(11);
  const api = getRemoteAllowlistApi();
  if (api?.setRemoteAssetAllowlist) {
    void api.setRemoteAssetAllowlist([]).catch(() => undefined);
  }
  void getDevToolsApi()?.setDevToolsEnabled(false).catch(() => undefined);
}
