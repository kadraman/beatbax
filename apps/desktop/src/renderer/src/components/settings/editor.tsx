import { useCallback, useEffect, useState } from 'react';
import { MidiStepEntryService } from '@beatbax/app-core/input/midi-step-entry';
import {
  settingAutoSave,
  settingBeatDecorations,
  settingCodeLens,
  settingDefaultBpm,
  settingFoldComments,
  settingFontSize,
  settingMidiAuditionNotes,
  settingMidiAutoAdvance,
  settingMidiEmitDurations,
  settingMidiEntryMode,
  settingMidiInputDevice,
  settingMidiInputEnabled,
  settingMidiScaleSnapMode,
  settingMidiStepLength,
  settingMidiUseNoteDuration,
  settingSongArtist,
  settingWordWrap,
} from '@beatbax/app-core/stores/settings.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, NumberField, SectionHeading, SelectField, TextField, ToggleRow } from './form';

interface MidiDevice {
  id: string;
  name: string;
}

function midiController(): any {
  return (window as any).__beatbax_midiStepEntry;
}

export function EditorSettingsSection(): React.JSX.Element {
  const autoSave = useStoreValue(settingAutoSave);
  const wordWrap = useStoreValue(settingWordWrap);
  const codeLens = useStoreValue(settingCodeLens);
  const beatDecorations = useStoreValue(settingBeatDecorations);
  const defaultBpm = useStoreValue(settingDefaultBpm);
  const songArtist = useStoreValue(settingSongArtist);
  const fontSize = useStoreValue(settingFontSize);
  const midiEnabled = useStoreValue(settingMidiInputEnabled);
  const midiDevice = useStoreValue(settingMidiInputDevice);
  const midiStepLength = useStoreValue(settingMidiStepLength);
  const midiEmitDurations = useStoreValue(settingMidiEmitDurations);
  const midiUseNoteDuration = useStoreValue(settingMidiUseNoteDuration);
  const midiScaleSnapMode = useStoreValue(settingMidiScaleSnapMode);
  const midiEntryMode = useStoreValue(settingMidiEntryMode);
  const midiAutoAdvance = useStoreValue(settingMidiAutoAdvance);
  const midiAuditionNotes = useStoreValue(settingMidiAuditionNotes);
  const [devices, setDevices] = useState<MidiDevice[]>([]);

  const refreshDevices = useCallback(async (): Promise<void> => {
    const controller = midiController();
    await controller?.requestMidiAccess?.();
    const nextDevices: MidiDevice[] = controller?.listDevices?.() ?? [];
    let selectedId = settingMidiInputDevice.get();
    if (selectedId && !nextDevices.some((device) => device.id === selectedId)) {
      selectedId = '';
      settingMidiInputDevice.set('');
      controller?.setDeviceById?.('');
    }
    setDevices(nextDevices);
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  const hasElectronAPI = Boolean((window as unknown as { electronAPI?: unknown }).electronAPI);

  return (
    <div className="bb-settings-section">
      <SectionHeading>Editor preferences</SectionHeading>
      <ToggleRow checked={autoSave} label="Auto-save" onChange={(value) => settingAutoSave.set(value)} />
      <NoteText>
        {hasElectronAPI
          ? 'When enabled, saves the open file to disk shortly after each edit (requires a saved file path).'
          : 'When enabled, the editor auto-saves content to local storage 500 ms after each keystroke. Changes to this setting take effect after a page reload.'}
      </NoteText>

      <ToggleRow
        checked={wordWrap}
        label="Word wrap"
        onChange={(value) => {
          settingWordWrap.set(value);
          (window as any).__beatbax_editor?.editor?.updateOptions?.({ wordWrap: value ? 'on' : 'off' });
          (window as any).__beatbax_toolbar?.setWrapActive(value);
        }}
      />
      <ToggleRow
        checked={codeLens}
        label="Show CodeLens previews"
        onChange={(value) => {
          settingCodeLens.set(value);
          (window as any).__beatbax_editor?.editor?.updateOptions?.({ codeLens: value });
        }}
      />
      <NoteText>CodeLens adds a clickable Play button above each pat and inst definition so you can preview a pattern or instrument note without running the whole song.</NoteText>

      <ToggleRow
        checked={beatDecorations}
        label="Show beat decorations"
        onChange={(value) => {
          settingBeatDecorations.set(value);
          (window as any).__beatbax_toggleBeatDecorations?.(value);
        }}
      />
      <NoteText>Beat decorations tint note tokens inside pat blocks: downbeats are highlighted more strongly, upbeats more subtly, making the rhythmic structure visible while editing.</NoteText>

      <NumberField label="Default BPM" max={300} min={60} onChange={(value) => settingDefaultBpm.set(value)} value={defaultBpm} />
      <TextField label="Default song artist" onChange={(value) => settingSongArtist.set(value.trim())} value={songArtist} />
      <NumberField
        label="Font size"
        max={24}
        min={10}
        onChange={(value) => {
          settingFontSize.set(value);
          (window as any).__beatbax_editor?.editor?.updateOptions?.({ fontSize: value });
        }}
        value={fontSize}
      />

      <SectionHeading>MIDI Step Entry</SectionHeading>
      <ToggleRow
        checked={midiEnabled}
        label="Enable MIDI input"
        onChange={(value) => {
          settingMidiInputEnabled.set(value);
          midiController()?.setEnabled(value);
        }}
      />
      <NoteText>Allows a connected MIDI keyboard to enter notes directly into the editor when the Record button is active. Requires browser MIDI support (Chrome / Edge).</NoteText>

      <div
        id="bb-midi-settings-container"
        style={{ display: midiEnabled ? 'flex' : 'none', flexDirection: 'column', gap: '12px' }}
      >
        <div className="bb-settings-row">
          <label className="bb-settings-label" htmlFor="bb-midi-device-select">MIDI input device</label>
          <select
            className="bb-settings-select"
            id="bb-midi-device-select"
            onChange={(event) => {
              const id = event.currentTarget.value;
              settingMidiInputDevice.set(id);
              midiController()?.setDeviceById?.(id);
            }}
            onFocus={() => { void refreshDevices(); }}
            value={midiDevice}
          >
            <option value="">{devices.length > 0 ? '-- Select a device --' : '(No MIDI devices found)'}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>{device.name}</option>
            ))}
          </select>
          <button
            className="bb-settings-btn"
            onClick={() => { void refreshDevices(); }}
            title="Re-scan for MIDI devices"
            type="button"
          >
            Refresh
          </button>
        </div>

        <SelectField
          label="Step length"
          onChange={(value) => {
            settingMidiStepLength.set(value as 'inherit' | '1' | '2' | '4' | '8' | '16');
            midiController()?.setStepLength?.(value);
          }}
          options={[
            { value: 'inherit', label: 'Inherit (no suffix)' },
            { value: '2', label: '2 (e.g. A3:2)' },
            { value: '4', label: '4 (e.g. A3:4)' },
            { value: '8', label: '8 (e.g. A3:8)' },
            { value: '16', label: '16 (e.g. A3:16)' },
          ]}
          value={midiStepLength}
        />
        <ToggleRow
          checked={midiEmitDurations}
          label="Emit explicit durations"
          onChange={(value) => {
            settingMidiEmitDurations.set(value);
            midiController()?.setEmitDuration?.(value);
          }}
        />
        <NoteText>When enabled and "Use MIDI key hold" is disabled, inserted notes include a duration suffix (e.g. A3:4). Step Length 1 and Inherit never emit a suffix. If "Use MIDI key hold" is enabled, duration is always emitted regardless of this setting.</NoteText>

        <ToggleRow
          checked={midiUseNoteDuration}
          label="Use MIDI key hold for step length"
          onChange={(value) => {
            settingMidiUseNoteDuration.set(value);
            midiController()?.setUseNoteDuration?.(value);
          }}
        />
        <NoteText>When enabled, the step length is determined by how long you hold the MIDI key. Short taps emit note only; longer holds progress through :2, :4, :8, and :16. The note is entered on key release and always includes a duration suffix.</NoteText>

        <SelectField
          label="Scale snap mode"
          onChange={(value) => {
            settingMidiScaleSnapMode.set(value as 'off' | 'snap' | 'filter');
            midiController()?.setScaleSnapMode?.(value);
          }}
          options={[
            { value: 'off', label: 'Off (insert raw MIDI notes)' },
            { value: 'snap', label: 'Snap (nearest in-scale note)' },
            { value: 'filter', label: 'Filter (drop out-of-scale notes)' },
          ]}
          value={midiScaleSnapMode}
        />
        <NoteText>Applies when the current song declares `scale`. Off keeps raw notes. Snap moves out-of-scale notes to the nearest allowed pitch class. Filter discards out-of-scale notes.</NoteText>

        <SelectField
          label="Entry mode"
          onChange={(value) => {
            settingMidiEntryMode.set(value as 'insert' | 'overwrite-selection');
            midiController()?.setEntryMode?.(value);
          }}
          options={[
            { value: 'insert', label: 'Insert at cursor' },
            { value: 'overwrite-selection', label: 'Overwrite selected tokens' },
          ]}
          value={midiEntryMode}
        />
        <ToggleRow
          checked={midiAutoAdvance}
          label="Auto-advance cursor"
          onChange={(value) => {
            settingMidiAutoAdvance.set(value);
            midiController()?.setAutoAdvance?.(value);
          }}
        />
        <NoteText>When enabled, the cursor moves to the next insertion point after each note is entered. When disabled, pressing a new note replaces the previously entered note in place.</NoteText>
        <ToggleRow
          checked={midiAuditionNotes}
          label="Play entered notes"
          onChange={(value) => {
            settingMidiAuditionNotes.set(value);
            midiController()?.setAuditionNotes?.(value);
          }}
        />
        <NoteText>When enabled and in Record mode, each entered note is briefly played back through the BeatBax audio engine so you can hear it as you record.</NoteText>
        {!MidiStepEntryService.isSupported() ? (
          <NoteText>Your browser does not support the Web MIDI API. MIDI step entry requires Chrome or Edge.</NoteText>
        ) : null}
      </div>
    </div>
  );
}

export function resetEditorDefaults(): void {
  settingAutoSave.set(true);
  settingWordWrap.set(false);
  settingFoldComments.set(false);
  settingCodeLens.set(true);
  settingBeatDecorations.set(true);
  settingDefaultBpm.set(128);
  settingSongArtist.set('');
  settingFontSize.set(14);
  settingMidiInputEnabled.set(false);
  settingMidiInputDevice.set('');
  settingMidiStepLength.set('inherit');
  settingMidiEmitDurations.set(false);
  settingMidiEntryMode.set('insert');
  settingMidiAutoAdvance.set(true);
  settingMidiAuditionNotes.set(false);
  settingMidiUseNoteDuration.set(false);
  settingMidiScaleSnapMode.set('off');
}
