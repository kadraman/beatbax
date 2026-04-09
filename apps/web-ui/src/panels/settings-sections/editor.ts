/**
 * Editor settings section.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import {
  settingAutoSave, settingWordWrap, settingCodeLens,
  settingBeatDecorations, settingDefaultBpm, settingFontSize,
} from '../../stores/settings.store';
import { sectionHeading, toggle, numberField, noteText } from './general';

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

  el.appendChild(numberField('Font size', 10, 24, settingFontSize.get(), (v) => {
    settingFontSize.set(v);
    (window as any).__beatbax_editor?.editor?.updateOptions?.({ fontSize: v });
  }));

  return el;
}

export function resetEditorDefaults(): void {
  settingAutoSave.set(true);
  settingWordWrap.set(false);
  settingCodeLens.set(true);
  settingBeatDecorations.set(true);
  settingDefaultBpm.set(128);
  settingFontSize.set(14);
}
