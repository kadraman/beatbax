/**
 * Editor settings section.
 */

import {
  settingAutoSave, settingWordWrap, settingFoldComments, settingCodeLens,
  settingBeatDecorations, settingDefaultBpm, settingSongArtist, settingFontSize,
  settingMidiInputEnabled, settingMidiInputDevice, settingMidiStepLength,
  settingMidiEmitDurations, settingMidiEntryMode, settingMidiAutoAdvance,
  settingMidiAuditionNotes, settingMidiUseNoteDuration, settingMidiScaleSnapMode,
} from '@beatbax/app-core/stores/settings.store';
import { sectionHeading, toggle, numberField, textField, noteText, selectField } from './general';
import { MidiStepEntryService } from '@beatbax/app-core/input/midi-step-entry';

export function buildEditorSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Editor preferences'));

  el.appendChild(toggle('Auto-save', settingAutoSave.get(), (v) => {
    settingAutoSave.set(v);
  }));
  el.appendChild(noteText('When enabled, the editor auto-saves content to local storage 500 ms after each keystroke. Changes to this setting take effect after a page reload.'));

  el.appendChild(toggle('Word wrap', settingWordWrap.get(), (v) => {
    settingWordWrap.set(v);
    (window as any).__beatbax_editor?.editor?.updateOptions?.({ wordWrap: v ? 'on' : 'off' });
    (window as any).__beatbax_toolbar?.setWrapActive(v);
  }, settingWordWrap.subscribe));

  el.appendChild(toggle('Show CodeLens previews', settingCodeLens.get(), (v) => {
    settingCodeLens.set(v);
    (window as any).__beatbax_editor?.editor?.updateOptions?.({ codeLens: v });
  }));
  el.appendChild(noteText('CodeLens adds a clickable ▶ Play button above each pat and inst definition so you can preview a pattern or instrument note without running the whole song.'));

  el.appendChild(toggle('Show beat decorations', settingBeatDecorations.get(), (v) => {
    settingBeatDecorations.set(v);
    (window as any).__beatbax_toggleBeatDecorations?.(v);
  }));
  el.appendChild(noteText('Beat decorations tint note tokens inside pat blocks: downbeats are highlighted more strongly, upbeats more subtly, making the rhythmic structure visible while editing.'));

  el.appendChild(numberField('Default BPM', 60, 300, settingDefaultBpm.get(), (v) => settingDefaultBpm.set(v)));
  el.appendChild(textField('Default song artist', settingSongArtist.get(), (v) => settingSongArtist.set(v)));

  el.appendChild(numberField('Font size', 10, 24, settingFontSize.get(), (v) => {
    settingFontSize.set(v);
    (window as any).__beatbax_editor?.editor?.updateOptions?.({ fontSize: v });
  }));

  // ── MIDI Step Entry ─────────────────────────────────────────────────────────
  el.appendChild(sectionHeading('MIDI Step Entry'));

  const midiEnabledInitial = settingMidiInputEnabled.get();

  // Container that shows/hides all MIDI sub-settings based on the enable toggle
  const midiSettingsContainer = document.createElement('div');
  midiSettingsContainer.id = 'bb-midi-settings-container';
  midiSettingsContainer.style.display = midiEnabledInitial ? 'flex' : 'none';
  midiSettingsContainer.style.flexDirection = 'column';
  midiSettingsContainer.style.gap = '12px';

  el.appendChild(toggle('Enable MIDI input', midiEnabledInitial, (v) => {
    settingMidiInputEnabled.set(v);
    (window as any).__beatbax_midiStepEntry?.setEnabled(v);
    midiSettingsContainer.style.display = v ? 'flex' : 'none';
  }));
  el.appendChild(noteText('Allows a connected MIDI keyboard to enter notes directly into the editor when the Record button is active. Requires browser MIDI support (Chrome / Edge).'));

  // ── All remaining MIDI settings live inside midiSettingsContainer ──────────

  // MIDI device selector: populated dynamically when MIDI is available
  const deviceRow = document.createElement('div');
  deviceRow.className = 'bb-settings-row';
  const deviceLabel = document.createElement('label');
  deviceLabel.className = 'bb-settings-label';
  deviceLabel.textContent = 'MIDI input device';
  const deviceSelect = document.createElement('select');
  deviceSelect.className = 'bb-settings-select';
  deviceLabel.setAttribute('for', deviceSelect.id = 'bb-midi-device-select');

  const refreshDevices = async (): Promise<void> => {
    const controller: any = (window as any).__beatbax_midiStepEntry;
    await controller?.requestMidiAccess?.();
    const devices: Array<{ id: string; name: string }> = controller?.listDevices?.() ?? [];
    let selectedId = settingMidiInputDevice.get();

    if (selectedId && !devices.some((d) => d.id === selectedId)) {
      // Persisted selection is no longer available; clear stale value.
      selectedId = '';
      settingMidiInputDevice.set('');
      controller?.setDeviceById?.('');
    }

    deviceSelect.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = devices.length > 0 ? '— Select a device —' : '(No MIDI devices found)';
    noneOpt.selected = selectedId === '';
    deviceSelect.appendChild(noneOpt);
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      opt.selected = d.id === selectedId;
      deviceSelect.appendChild(opt);
    }
  };

  deviceSelect.addEventListener('focus', () => {
    void refreshDevices();
  });
  deviceSelect.addEventListener('change', () => {
    const id = deviceSelect.value;
    settingMidiInputDevice.set(id);
    (window as any).__beatbax_midiStepEntry?.setDeviceById?.(id);
  });

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'bb-settings-btn';
  refreshBtn.textContent = '↺ Refresh';
  refreshBtn.title = 'Re-scan for MIDI devices';
  refreshBtn.addEventListener('click', () => {
    void refreshDevices();
  });

  void refreshDevices();
  deviceRow.append(deviceLabel, deviceSelect, refreshBtn);
  midiSettingsContainer.appendChild(deviceRow);

  midiSettingsContainer.appendChild(selectField(
    'Step length',
    [
      { value: 'inherit', label: 'Inherit (no suffix)' },
      { value: '2',  label: '2 (e.g. A3:2)' },
      { value: '4',  label: '4 (e.g. A3:4)' },
      { value: '8',  label: '8 (e.g. A3:8)' },
      { value: '16', label: '16 (e.g. A3:16)' },
    ],
    settingMidiStepLength.get(),
    (v) => {
      settingMidiStepLength.set(v as any);
      (window as any).__beatbax_midiStepEntry?.setStepLength?.(v);
    },
  ));

  midiSettingsContainer.appendChild(toggle('Emit explicit durations', settingMidiEmitDurations.get(), (v) => {
    settingMidiEmitDurations.set(v);
    (window as any).__beatbax_midiStepEntry?.setEmitDuration?.(v);
  }));
  midiSettingsContainer.appendChild(noteText('When enabled and "Use MIDI key hold" is disabled, inserted notes include a duration suffix (e.g. A3:4). Step Length 1 and Inherit never emit a suffix. If "Use MIDI key hold" is enabled, duration is always emitted regardless of this setting.'));

  midiSettingsContainer.appendChild(toggle('Use MIDI key hold for step length', settingMidiUseNoteDuration.get(), (v) => {
    settingMidiUseNoteDuration.set(v);
    (window as any).__beatbax_midiStepEntry?.setUseNoteDuration?.(v);
  }));
  midiSettingsContainer.appendChild(noteText('When enabled, the step length is determined by how long you hold the MIDI key. Short taps emit note only; longer holds progress through :2, :4, :8, and :16. The note is entered on key release and always includes a duration suffix, overriding both the "Step Length" setting and the "Emit explicit durations" setting.'));

  midiSettingsContainer.appendChild(selectField(
    'Scale snap mode',
    [
      { value: 'off', label: 'Off (insert raw MIDI notes)' },
      { value: 'snap', label: 'Snap (nearest in-scale note)' },
      { value: 'filter', label: 'Filter (drop out-of-scale notes)' },
    ],
    settingMidiScaleSnapMode.get(),
    (v) => {
      settingMidiScaleSnapMode.set(v as any);
      (window as any).__beatbax_midiStepEntry?.setScaleSnapMode?.(v);
    },
  ));
  midiSettingsContainer.appendChild(noteText('Applies when the current song declares `scale`. Off keeps raw notes. Snap moves out-of-scale notes to the nearest allowed pitch class. Filter discards out-of-scale notes.'));

  midiSettingsContainer.appendChild(selectField(
    'Entry mode',
    [
      { value: 'insert',               label: 'Insert at cursor' },
      { value: 'overwrite-selection',  label: 'Overwrite selected tokens' },
    ],
    settingMidiEntryMode.get(),
    (v) => {
      settingMidiEntryMode.set(v as any);
      (window as any).__beatbax_midiStepEntry?.setEntryMode?.(v);
    },
  ));

  midiSettingsContainer.appendChild(toggle('Auto-advance cursor', settingMidiAutoAdvance.get(), (v) => {
    settingMidiAutoAdvance.set(v);
    (window as any).__beatbax_midiStepEntry?.setAutoAdvance?.(v);
  }));
  midiSettingsContainer.appendChild(noteText('When enabled, the cursor moves to the next insertion point after each note is entered. When disabled, pressing a new note replaces the previously entered note in place.'));

  midiSettingsContainer.appendChild(toggle('Play entered notes', settingMidiAuditionNotes.get(), (v) => {
    settingMidiAuditionNotes.set(v);
    (window as any).__beatbax_midiStepEntry?.setAuditionNotes?.(v);
  }));
  midiSettingsContainer.appendChild(noteText('When enabled and in Record mode, each entered note is briefly played back through the BeatBax audio engine so you can hear it as you record.'));

  if (!MidiStepEntryService.isSupported()) {
    midiSettingsContainer.appendChild(noteText('⚠ Your browser does not support the Web MIDI API. MIDI step entry requires Chrome or Edge.'));
  }

  el.appendChild(midiSettingsContainer);

  return el;
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
