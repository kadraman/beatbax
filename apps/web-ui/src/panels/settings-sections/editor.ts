/**
 * Editor settings section.
 */

import {
  settingAutoSave, settingWordWrap, settingCodeLens,
  settingBeatDecorations, settingDefaultBpm, settingSongArtist, settingFontSize,
  settingMidiInputEnabled, settingMidiInputDevice, settingMidiStepLength,
  settingMidiEmitDurations, settingMidiEntryMode, settingMidiAutoAdvance,
  settingMidiAuditionNotes, settingMidiAuditionInstruments,
} from '../../stores/settings.store';
import { sectionHeading, toggle, numberField, textField, noteText, selectField } from './general';
import { MidiStepEntryService } from '../../input/midi-step-entry';

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

  el.appendChild(toggle('Enable MIDI input', settingMidiInputEnabled.get(), (v) => {
    settingMidiInputEnabled.set(v);
    (window as any).__beatbax_midiStepEntry?.setEnabled(v);
  }));
  el.appendChild(noteText('Allows a connected MIDI keyboard to enter notes directly into the editor when the Record button is active. Requires browser MIDI support (Chrome / Edge).'));

  // MIDI device selector: populated dynamically when MIDI is available
  const deviceRow = document.createElement('div');
  deviceRow.className = 'bb-settings-row';
  const deviceLabel = document.createElement('label');
  deviceLabel.className = 'bb-settings-label';
  deviceLabel.textContent = 'MIDI input device';
  const deviceSelect = document.createElement('select');
  deviceSelect.className = 'bb-settings-select';
  deviceLabel.setAttribute('for', deviceSelect.id = 'bb-midi-device-select');

  const refreshDevices = (): void => {
    const controller: any = (window as any).__beatbax_midiStepEntry;
    const devices: Array<{ id: string; name: string }> = controller?.listDevices?.() ?? [];
    deviceSelect.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = devices.length > 0 ? '— Select a device —' : '(No MIDI devices found)';
    deviceSelect.appendChild(noneOpt);
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      opt.selected = d.id === settingMidiInputDevice.get();
      deviceSelect.appendChild(opt);
    }
  };

  deviceSelect.addEventListener('focus', refreshDevices);
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
    refreshDevices();
  });

  refreshDevices();
  deviceRow.append(deviceLabel, deviceSelect, refreshBtn);
  el.appendChild(deviceRow);

  el.appendChild(selectField(
    'Step length',
    [
      { value: 'inherit', label: 'Inherit (no suffix)' },
      { value: '1',  label: '1 (whole note)' },
      { value: '2',  label: '2 (half note)' },
      { value: '4',  label: '4 (quarter note)' },
      { value: '8',  label: '8 (eighth note)' },
      { value: '16', label: '16 (sixteenth note)' },
    ],
    settingMidiStepLength.get(),
    (v) => {
      settingMidiStepLength.set(v as any);
      (window as any).__beatbax_midiStepEntry?.setStepLength?.(v);
    },
  ));

  el.appendChild(toggle('Emit explicit durations', settingMidiEmitDurations.get(), (v) => {
    settingMidiEmitDurations.set(v);
    (window as any).__beatbax_midiStepEntry?.setEmitDuration?.(v);
  }));
  el.appendChild(noteText('When enabled, inserted notes include a duration suffix (e.g. C4:4). Requires Step Length to be set to a value other than Inherit.'));

  el.appendChild(selectField(
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

  el.appendChild(toggle('Auto-advance cursor', settingMidiAutoAdvance.get(), (v) => {
    settingMidiAutoAdvance.set(v);
    (window as any).__beatbax_midiStepEntry?.setAutoAdvance?.(v);
  }));
  el.appendChild(noteText('When enabled, the cursor moves to the next insertion point after each note is entered.'));

  el.appendChild(toggle('Audition entered notes', settingMidiAuditionNotes.get(), (v) => {
    settingMidiAuditionNotes.set(v);
    (window as any).__beatbax_midiStepEntry?.setAuditionNotes?.(v);
  }));
  el.appendChild(noteText('When enabled, each pressed note is briefly played back through the BeatBax audio engine so you can hear the pitch before it is entered.'));

  el.appendChild(toggle('Audition instruments via MIDI', settingMidiAuditionInstruments.get(), (v) => {
    settingMidiAuditionInstruments.set(v);
    (window as any).__beatbax_midiStepEntry?.setAuditionInstruments?.(v);
  }));
  el.appendChild(noteText('When enabled and the cursor is on an inst definition, the MIDI keyboard plays notes through that instrument so you can preview it live.'));

  if (!MidiStepEntryService.isSupported()) {
    el.appendChild(noteText('⚠ Your browser does not support the Web MIDI API. MIDI step entry requires Chrome or Edge.'));
  }

  return el;
}

export function resetEditorDefaults(): void {
  settingAutoSave.set(true);
  settingWordWrap.set(false);
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
  settingMidiAuditionNotes.set(true);
  settingMidiAuditionInstruments.set(true);
}
