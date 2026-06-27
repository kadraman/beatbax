import { useRef } from 'react';
import { eventBus } from '@beatbax/app-core/utils/event-bus';
import {
  settingTheme,
  settingToolbarStyle,
  settingShowToolbar,
  settingShowTransportBar,
  settingShowPatternGrid,
  settingShowChannelMixer,
  settingShowSongVisualizer,
  settingVizBgEffect,
  settingVizBgImage,
  settingFeatureChannelMixer,
  settingFeaturePatternGrid,
  settingFeatureSongVisualizer,
} from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, RadioGroup, SectionHeading, SelectField, ToggleRow } from './form';

export function GeneralSettingsSection(): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const theme = useStoreValue(settingTheme);
  const toolbarStyle = useStoreValue(settingToolbarStyle);
  const showToolbar = useStoreValue(settingShowToolbar);
  const showTransportBar = useStoreValue(settingShowTransportBar);
  const showPatternGrid = useStoreValue(settingShowPatternGrid);
  const showChannelMixer = useStoreValue(settingShowChannelMixer);
  const showSongVisualizer = useStoreValue(settingShowSongVisualizer);
  const vizBgEffect = useStoreValue(settingVizBgEffect);
  const vizBgImage = useStoreValue(settingVizBgImage);
  const featureChannelMixer = useStoreValue(settingFeatureChannelMixer);
  const featurePatternGrid = useStoreValue(settingFeaturePatternGrid);
  const featureSongVisualizer = useStoreValue(settingFeatureSongVisualizer);

  const clearVisualizerImage = (): void => {
    settingVizBgImage.set('');
    eventBus.emit('song-visualizer:settings-changed', { key: 'bgImage', value: '' });
  };

  return (
    <div className="bb-settings-section">
      <SectionHeading>Appearance</SectionHeading>

      <RadioGroup
        label="Theme"
        name="bb-settings-theme"
        onChange={(value) => {
          settingTheme.set(value as 'dark' | 'light' | 'system');
          if (value === 'system') {
            (window as any).__beatbax_themeManager?.followSystem();
          } else {
            (window as any).__beatbax_themeManager?.setTheme(value as 'dark' | 'light');
          }
        }}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'System' },
        ]}
        value={theme}
      />

      <NoteText>System follows your OS preference (Settings - Appearance on Windows/macOS). Changes automatically when your OS switches between light and dark mode.</NoteText>

      <RadioGroup
        label="Toolbar style"
        name="bb-settings-toolbar-style"
        onChange={(value) => {
          settingToolbarStyle.set(value as 'icons+labels' | 'icons');
          (window as any).__beatbax_toolbar?.setStyle(value);
        }}
        options={[
          { value: 'icons+labels', label: 'Icons with labels' },
          { value: 'icons', label: 'Icons only' },
        ]}
        value={toolbarStyle}
      />

      <SectionHeading>Panels</SectionHeading>

      <ToggleRow
        checked={showToolbar}
        label="Show toolbar"
        onChange={(value) => {
          settingShowToolbar.set(value);
          eventBus.emit('panel:toggled', { panel: 'toolbar', visible: value });
        }}
      />
      <ToggleRow
        checked={showTransportBar}
        label="Show transport bar"
        onChange={(value) => {
          settingShowTransportBar.set(value);
          eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: value });
        }}
      />
      <ToggleRow
        checked={showPatternGrid}
        disabled={!featurePatternGrid}
        label="Show pattern grid"
        onChange={(value) => {
          settingShowPatternGrid.set(value);
          eventBus.emit('panel:toggled', { panel: 'pattern-grid', visible: value });
        }}
        title={featurePatternGrid ? '' : 'Enable Pattern Grid in Settings - Features first'}
      />
      <ToggleRow
        checked={showChannelMixer}
        disabled={!featureChannelMixer}
        label="Show channel mixer"
        onChange={(value) => {
          settingShowChannelMixer.set(value);
          eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: value });
        }}
        title={featureChannelMixer ? '' : 'Enable Channel Mixer in Settings - Features first'}
      />
      <ToggleRow
        checked={showSongVisualizer}
        disabled={!featureSongVisualizer}
        label="Show song visualizer"
        onChange={(value) => {
          settingShowSongVisualizer.set(value);
          eventBus.emit('panel:toggled', { panel: 'song-visualizer', visible: value });
        }}
        title={featureSongVisualizer ? '' : 'Enable Song Visualizer in Settings - Features first'}
      />

      <div style={{ display: featureSongVisualizer ? '' : 'none' }}>
        <SelectField
          label="Song visualizer background"
          onChange={(value) => {
            const next = value as 'none' | 'starfield' | 'scanlines' | 'matrix-rain' | 'custom-image';
            settingVizBgEffect.set(next);
            if (next !== 'custom-image') clearVisualizerImage();
            eventBus.emit('song-visualizer:settings-changed', { key: 'bgEffect', value: next });
          }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'starfield', label: 'Starfield' },
            { value: 'scanlines', label: 'CRT Scanlines' },
            { value: 'matrix-rain', label: 'Matrix Rain' },
            { value: 'custom-image', label: 'Custom image' },
          ]}
          value={vizBgEffect}
        />

        {vizBgEffect === 'custom-image' ? (
          <div className="bb-settings-row bb-settings-row--column">
            <span className="bb-settings-label">Visualizer background image</span>
            <div className="bb-settings-img-controls">
              <input
                accept="image/*"
                className="bb-settings-file"
                id="bb-viz-bg-image-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (loadEvent) => {
                    const dataUrl = loadEvent.target?.result as string;
                    if (!dataUrl) return;
                    settingVizBgImage.set(dataUrl);
                    eventBus.emit('song-visualizer:settings-changed', { key: 'bgImage', value: dataUrl });
                  };
                  reader.readAsDataURL(file);
                }}
                ref={fileInputRef}
                style={{ display: 'none' }}
                type="file"
              />
              <button
                className="bb-settings-btn"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {vizBgImage ? 'Replace image' : 'Upload image'}
              </button>
              <button
                className="bb-settings-btn bb-settings-btn--danger"
                onClick={() => {
                  clearVisualizerImage();
                  settingVizBgEffect.set('none');
                  eventBus.emit('song-visualizer:settings-changed', { key: 'bgEffect', value: 'none' });
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={{ display: vizBgImage ? '' : 'none' }}
                type="button"
              >
                Clear
              </button>
            </div>
            <div className="bb-settings-img-preview-wrap">
              {vizBgImage ? (
                <>
                  <img alt="Background preview" className="bb-settings-img-preview" src={vizBgImage} />
                  <span className="bb-settings-img-name">Current image</span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function resetGeneralDefaults(): void {
  settingTheme.set('system');
  (window as any).__beatbax_themeManager?.followSystem();
  settingToolbarStyle.set('icons+labels');
  settingShowToolbar.set(true);
  settingShowTransportBar.set(true);
  settingShowPatternGrid.set(false);
  settingShowChannelMixer.set(true);
  settingShowSongVisualizer.set(false);
  settingVizBgEffect.set('none');
  settingVizBgImage.set('');
}
