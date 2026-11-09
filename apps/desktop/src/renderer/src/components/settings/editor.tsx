import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EDITOR_FONT_FAMILY_CHOICES,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
  EDITOR_VIEW_DEFAULTS,
} from '@beatbax/app-core/editor/editor-view-options';
import { MidiStepEntryService } from '@beatbax/app-core/input/midi-step-entry';
import {
  settingAutoSave,
  settingAutoSaveDelay,
  settingFileReload,
  settingBeatDecorations,
  settingCodeLens,
  settingCodeLensEffects,
  settingCodeLensInstruments,
  settingCodeLensPatterns,
  settingCodeLensSequences,
  settingDefaultBpm,
  settingEditorCursorStyle,
  settingEditorFontFamily,
  settingEditorIndentGuides,
  settingEditorLineNumbers,
  settingEditorMinimap,
  settingEditorMouseWheelZoom,
  settingEditorTabSize,
  settingEditorWhitespace,
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
import {
  applyCommentsFoldPreference,
  applyStoredEditorView,
  scheduleCommentsFoldPreference,
} from '../../lib/editor-view-prefs';
import { NoteText, NumberField, SectionHeading, SelectField, TextField, ToggleRow } from './form';

function openMonaco(): Parameters<typeof applyStoredEditorView>[0] {
  return (window as any).__beatbax_editor?.editor;
}

function openToolbar(): Parameters<typeof scheduleCommentsFoldPreference>[1] {
  return (window as any).__beatbax_toolbar;
}

function applyEditorView(): void {
  applyStoredEditorView(openMonaco());
}

function applyFoldComments(folded: boolean): void {
  if (folded) scheduleCommentsFoldPreference(openMonaco(), openToolbar());
  else applyCommentsFoldPreference(openMonaco(), false, openToolbar());
}

interface MidiDevice {
  id: string;
  name: string;
}

function sameMidiDevices(a: MidiDevice[], b: MidiDevice[]): boolean {
  return a.length === b.length && a.every((device, index) => (
    device.id === b[index]?.id && device.name === b[index]?.name
  ));
}

function midiController(): any {
  return (window as any).__beatbax_midiStepEntry;
}

export function EditorSettingsSection(): React.JSX.Element {
  const autoSave = useStoreValue(settingAutoSave);
  const autoSaveDelay = useStoreValue(settingAutoSaveDelay);
  const fileReload = useStoreValue(settingFileReload);
  const wordWrap = useStoreValue(settingWordWrap);
  const codeLens = useStoreValue(settingCodeLens);
  const codeLensPatterns = useStoreValue(settingCodeLensPatterns);
  const codeLensSequences = useStoreValue(settingCodeLensSequences);
  const codeLensInstruments = useStoreValue(settingCodeLensInstruments);
  const codeLensEffects = useStoreValue(settingCodeLensEffects);
  const beatDecorations = useStoreValue(settingBeatDecorations);
  const defaultBpm = useStoreValue(settingDefaultBpm);
  const songArtist = useStoreValue(settingSongArtist);
  const fontSize = useStoreValue(settingFontSize);
  const fontFamily = useStoreValue(settingEditorFontFamily);
  const tabSize = useStoreValue(settingEditorTabSize);
  const minimap = useStoreValue(settingEditorMinimap);
  const lineNumbers = useStoreValue(settingEditorLineNumbers);
  const whitespace = useStoreValue(settingEditorWhitespace);
  const indentGuides = useStoreValue(settingEditorIndentGuides);
  const cursorStyle = useStoreValue(settingEditorCursorStyle);
  const foldComments = useStoreValue(settingFoldComments);
  const mouseWheelZoom = useStoreValue(settingEditorMouseWheelZoom);
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
  const [refreshStatus, setRefreshStatus] = useState('');
  const isRefreshingDevicesRef = useRef(false);

  const refreshDevices = useCallback(async (force = false): Promise<void> => {
    if (isRefreshingDevicesRef.current && !force) return;
    isRefreshingDevicesRef.current = true;
    setRefreshStatus('Refreshing MIDI devices...');
    try {
      const controller = midiController();
      const accessErr = await controller?.requestMidiAccess?.(force);
      if (typeof accessErr === 'string' && accessErr) {
        setRefreshStatus(accessErr);
        setDevices([]);
        return;
      }
      const nextDevices: MidiDevice[] = controller?.listDevices?.() ?? [];
      let selectedId = settingMidiInputDevice.get();
      // Only clear a saved selection when we successfully enumerated devices and
      // the saved id is truly absent. An empty list often means access is not
      // ready yet (e.g. after HMR) — wiping would forget a still-valid device.
      if (
        selectedId
        && nextDevices.length > 0
        && !nextDevices.some((device) => device.id === selectedId)
      ) {
        selectedId = '';
        if (controller?.setDeviceById) {
          controller.setDeviceById('');
        } else {
          settingMidiInputDevice.set('');
        }
      }
      setDevices((currentDevices) => (
        sameMidiDevices(currentDevices, nextDevices) ? currentDevices : nextDevices
      ));
      const checkedAt = new Date().toLocaleTimeString();
      setRefreshStatus(
        nextDevices.length === 1
          ? `Found 1 MIDI device. Last checked ${checkedAt}.`
          : `Found ${nextDevices.length} MIDI devices. Last checked ${checkedAt}.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRefreshStatus(`MIDI refresh failed: ${msg}`);
    } finally {
      isRefreshingDevicesRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (midiEnabled) {
      void refreshDevices();
    } else {
      setDevices([]);
      setRefreshStatus('');
    }
  }, [midiEnabled, refreshDevices]);

  return (
    <div className="bb-settings-section">
      <SectionHeading>Editor preferences</SectionHeading>
      <ToggleRow checked={autoSave} label="Auto-save" onChange={(value) => settingAutoSave.set(value)} />
      <NoteText>
        When enabled, saves the open file to disk after each successful parse with no errors (requires a saved file path).
      </NoteText>
      <NumberField
        disabled={!autoSave}
        label="Auto-save delay (ms)"
        max={5000}
        min={100}
        onChange={(value) => settingAutoSaveDelay.set(value)}
        value={autoSaveDelay}
      />
      <NoteText>
        Debounce interval before edits trigger a parse and potential disk save. Only applies when auto-save is enabled.
      </NoteText>

      <SelectField
        label="When the open file changes on disk"
        onChange={(value) => settingFileReload.set(value as typeof fileReload)}
        options={[
          { value: 'reloadIfUnmodified', label: 'Reload if unmodified (ask if unsaved)' },
          { value: 'alwaysAsk', label: 'Always ask' },
          { value: 'alwaysReload', label: 'Always reload (discard unsaved edits)' },
          { value: 'off', label: 'Ignore external changes' },
        ]}
        value={fileReload}
      />
      <NoteText>
        BeatBax saves are ignored so auto-save does not look like an external edit.
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
      <div className="bb-settings-subgroup" style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <ToggleRow
          checked={codeLensPatterns}
          disabled={!codeLens}
          label="Pattern previews (pat)"
          onChange={(value) => settingCodeLensPatterns.set(value)}
        />
        <ToggleRow
          checked={codeLensSequences}
          disabled={!codeLens}
          label="Sequence previews (seq)"
          onChange={(value) => settingCodeLensSequences.set(value)}
        />
        <ToggleRow
          checked={codeLensInstruments}
          disabled={!codeLens}
          label="Instrument previews (inst)"
          onChange={(value) => settingCodeLensInstruments.set(value)}
        />
        <ToggleRow
          checked={codeLensEffects}
          disabled={!codeLens}
          label="Effect previews (effect)"
          onChange={(value) => settingCodeLensEffects.set(value)}
        />
      </div>
      <NoteText>CodeLens adds inline preview actions above pat, seq, inst, and effect definitions. Pattern and sequence previews play one item on one channel; use Pattern Grid section focus to hear all channels together.</NoteText>

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
      <TextField
        label="Default song artist"
        onBlur={commitDefaultSongArtist}
        onChange={applyDefaultSongArtistDraft}
        value={songArtist}
      />
      <SectionHeading>View</SectionHeading>
      <SelectField
        label="Font family"
        onChange={(value) => {
          settingEditorFontFamily.set(value as typeof fontFamily);
          applyEditorView();
        }}
        options={EDITOR_FONT_FAMILY_CHOICES.map((choice) => ({ value: choice.id, label: choice.label }))}
        value={fontFamily}
      />
      <NoteText>Default keeps Monaco's platform monospace. The other choices fall back to monospace when that font is not installed.</NoteText>
      <SelectField
        label="Tab size"
        onChange={(value) => {
          settingEditorTabSize.set(Number(value));
          applyEditorView();
        }}
        options={[
          { value: '2', label: '2' },
          { value: '4', label: '4' },
        ]}
        value={String(tabSize)}
      />
      <NoteText>Changes how Tab inserts and how tab characters render. The buffer is not reformatted, and inserts stay spaces.</NoteText>
      <ToggleRow
        checked={minimap}
        label="Minimap"
        onChange={(value) => {
          settingEditorMinimap.set(value);
          applyEditorView();
        }}
      />
      <SelectField
        label="Line numbers"
        onChange={(value) => {
          settingEditorLineNumbers.set(value as typeof lineNumbers);
          applyEditorView();
        }}
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        value={lineNumbers}
      />
      <SelectField
        label="Whitespace"
        onChange={(value) => {
          settingEditorWhitespace.set(value as typeof whitespace);
          applyEditorView();
        }}
        options={[
          { value: 'selection', label: 'Selection' },
          { value: 'all', label: 'All' },
          { value: 'none', label: 'None' },
        ]}
        value={whitespace}
      />
      <ToggleRow
        checked={indentGuides}
        label="Indent guides"
        onChange={(value) => {
          settingEditorIndentGuides.set(value);
          applyEditorView();
        }}
      />
      <SelectField
        label="Cursor"
        onChange={(value) => {
          settingEditorCursorStyle.set(value as typeof cursorStyle);
          applyEditorView();
        }}
        options={[
          { value: 'line', label: 'Line' },
          { value: 'block', label: 'Block' },
          { value: 'underline', label: 'Underline' },
        ]}
        value={cursorStyle}
      />
      <ToggleRow
        checked={foldComments}
        label="Fold comments"
        onChange={(value) => {
          settingFoldComments.set(value);
          applyFoldComments(value);
        }}
      />
      <NoteText>Same preference as the toolbar and View menu.</NoteText>
      <NumberField
        label="Font size"
        max={EDITOR_FONT_SIZE_MAX}
        min={EDITOR_FONT_SIZE_MIN}
        onChange={(value) => {
          settingFontSize.set(value);
          applyEditorView();
        }}
        value={fontSize}
      />
      <ToggleRow
        checked={mouseWheelZoom}
        label="Mouse-wheel zoom"
        onChange={(value) => {
          settingEditorMouseWheelZoom.set(value);
          applyEditorView();
        }}
      />
      <NoteText>Off by default. When on, hold Ctrl (Cmd on macOS) and scroll over the editor to change font size. The wheel alone still scrolls.</NoteText>

      <SectionHeading>MIDI Step Entry</SectionHeading>
      <ToggleRow
        checked={midiEnabled}
        label="Enable MIDI input"
        onChange={(value) => {
          const controller = midiController();
          if (controller?.setEnabled) {
            void controller.setEnabled(value).then(() => {
              if (value) {
                void refreshDevices();
              } else {
                setDevices([]);
                setRefreshStatus('');
              }
            });
            return;
          }

          settingMidiInputEnabled.set(value);
          if (value) {
            void refreshDevices();
          } else {
            setDevices([]);
            setRefreshStatus('');
          }
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
            onClick={() => { void refreshDevices(true); }}
            title="Re-scan for MIDI devices"
            type="button"
          >
            Refresh
          </button>
        </div>
        <NoteText><span aria-live="polite">{refreshStatus || ' '}</span></NoteText>

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

/**
 * Persist Default song artist while the controlled text field is being edited.
 * Must not trim: trimming on every keystroke strips trailing spaces and blocks
 * multi-word names such as "The BeatBax Team".
 */
export function applyDefaultSongArtistDraft(value: string): void {
  settingSongArtist.set(value);
}

/** Normalize leading/trailing whitespace when the Default song artist field blurs. */
export function commitDefaultSongArtist(value: string): void {
  settingSongArtist.set(value.trim());
}

export function resetEditorDefaults(): void {
  settingAutoSave.set(true);
  settingAutoSaveDelay.set(1000);
  settingFileReload.set('reloadIfUnmodified');
  settingWordWrap.set(false);
  settingFoldComments.set(false);
  settingEditorFontFamily.set(EDITOR_VIEW_DEFAULTS.fontFamily);
  settingEditorTabSize.set(EDITOR_VIEW_DEFAULTS.tabSize);
  settingEditorMinimap.set(EDITOR_VIEW_DEFAULTS.minimap);
  settingEditorLineNumbers.set(EDITOR_VIEW_DEFAULTS.lineNumbers);
  settingEditorWhitespace.set(EDITOR_VIEW_DEFAULTS.whitespace);
  settingEditorIndentGuides.set(EDITOR_VIEW_DEFAULTS.indentGuides);
  settingEditorCursorStyle.set(EDITOR_VIEW_DEFAULTS.cursorStyle);
  settingEditorMouseWheelZoom.set(EDITOR_VIEW_DEFAULTS.mouseWheelZoom);
  settingCodeLens.set(true);
  settingCodeLensPatterns.set(true);
  settingCodeLensSequences.set(true);
  settingCodeLensInstruments.set(true);
  settingCodeLensEffects.set(true);
  settingBeatDecorations.set(true);
  settingDefaultBpm.set(128);
  settingSongArtist.set('');
  settingFontSize.set(EDITOR_VIEW_DEFAULTS.fontSize);
  const editor = openMonaco();
  applyStoredEditorView(editor);
  editor?.updateOptions?.({ wordWrap: 'off', codeLens: true });
  openToolbar()?.setWrapActive?.(false);
  applyFoldComments(false);
  (window as any).__beatbax_toggleBeatDecorations?.(true);
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
