import { storage } from '@beatbax/app-core/utils/local-storage';
import {
  settingDebugOverlay,
  settingDebugOverlayFontSize,
  settingDebugOverlayOpacity,
  settingDebugOverlayPosition,
} from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, RangeField, SectionHeading, SelectField, ToggleRow } from './form';

export function AdvancedSettingsSection(): React.JSX.Element {
  const debugOverlay = useStoreValue(settingDebugOverlay);
  const position = useStoreValue(settingDebugOverlayPosition);
  const opacity = useStoreValue(settingDebugOverlayOpacity);
  const fontSize = useStoreValue(settingDebugOverlayFontSize);

  return (
    <div className="bb-settings-section">
      <SectionHeading>Diagnostics</SectionHeading>
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

      <SectionHeading>Danger zone</SectionHeading>
      <NoteText>Reset all settings removes every beatbax:* key from localStorage and reloads the page.</NoteText>
      <button
        className="bb-settings-btn-danger"
        onClick={() => {
          if (confirm('Reset ALL BeatBax settings to defaults and reload? This cannot be undone.')) {
            storage.clear();
            window.location.reload();
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
}
