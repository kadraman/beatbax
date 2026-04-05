/**
 * General settings section — Appearance and Panels.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { eventBus } from '../../utils/event-bus';
import {
  settingTheme, settingToolbarStyle,
  settingShowToolbar, settingShowTransportBar,
  settingShowPatternGrid, settingShowChannelMixer,
  settingChannelCompact,
} from '../../stores/settings.store';

export function buildGeneralSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  // ── Appearance ────────────────────────────────────────────────────────────
  el.appendChild(sectionHeading('Appearance'));

  el.appendChild(radioGroup(
    'Theme',
    'bb-settings-theme',
    [
      { value: 'dark',   label: 'Dark' },
      { value: 'light',  label: 'Light' },
      { value: 'system', label: 'System' },
    ],
    settingTheme.get(),
    (v) => {
      settingTheme.set(v as any);
      if (v === 'system') {
        // Remove the explicit choice; ThemeManager resumes following the OS.
        (window as any).__beatbax_themeManager?.followSystem();
      } else {
        // Explicit dark/light: ThemeManager applies DOM/Monaco changes, persists, emits theme:changed.
        (window as any).__beatbax_themeManager?.setTheme(v as 'dark' | 'light');
      }
    },
  ));

  el.appendChild(noteText('System follows your OS preference (Settings → Appearance on Windows/macOS). Changes automatically when your OS switches between light and dark mode.'));

  el.appendChild(radioGroup(
    'Toolbar style',
    'bb-settings-toolbar-style',
    [
      { value: 'icons+labels', label: 'Icons + labels' },
      { value: 'icons',        label: 'Icons only' },
    ],
    settingToolbarStyle.get(),
    (v) => {
      settingToolbarStyle.set(v as any);
      (window as any).__beatbax_toolbar?.setStyle(v);
    },
  ));

  el.appendChild(toggle(
    'Compact channel mixer',
    settingChannelCompact.get(),
    (v) => {
      settingChannelCompact.set(v);
      // Persist old key for ChannelMixer compatibility
      try { localStorage.setItem('bb-channel-compact', String(v)); } catch { /* ignore */ }
      // Live-apply on the running mixer instance
      (window as any).__beatbax_channelMixer?.setCompact(v);
    },
  ));

  // ── Panels ────────────────────────────────────────────────────────────────
  el.appendChild(sectionHeading('Panels'));

  el.appendChild(toggle('Show toolbar', settingShowToolbar.get(), (v) => {
    settingShowToolbar.set(v);
    eventBus.emit('panel:toggled', { panel: 'toolbar', visible: v });
  }));

  el.appendChild(toggle('Show transport bar', settingShowTransportBar.get(), (v) => {
    settingShowTransportBar.set(v);
    eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: v });
  }));

  el.appendChild(toggle('Show pattern grid', settingShowPatternGrid.get(), (v) => {
    settingShowPatternGrid.set(v);
    eventBus.emit('panel:toggled', { panel: 'pattern-grid', visible: v });
  }));

  el.appendChild(toggle('Show channel mixer', settingShowChannelMixer.get(), (v) => {
    settingShowChannelMixer.set(v);
    eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: v });
  }));

  return el;
}

export function resetGeneralDefaults(): void {
  settingTheme.set('system');
  // Removing the stored theme key resumes OS-follow; no explicit persist needed.
  (window as any).__beatbax_themeManager?.followSystem();
  settingToolbarStyle.set('icons+labels');
  settingShowToolbar.set(true);
  settingShowTransportBar.set(true);
  settingShowPatternGrid.set(false);
  settingShowChannelMixer.set(true);
  settingChannelCompact.set(true);
}

// ─── Shared form helpers ───────────────────────────────────────────────────

export function sectionHeading(text: string): HTMLElement {
  const h = document.createElement('h3');
  h.className = 'bb-settings-heading';
  h.textContent = text;
  return h;
}

export function toggle(
  label: string,
  initial: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'bb-settings-row bb-settings-toggle-row';

  const span = document.createElement('span');
  span.className = 'bb-settings-label';
  span.textContent = label;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'bb-settings-toggle';
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));

  row.append(span, input);
  return row;
}

export function radioGroup(
  label: string,
  name: string,
  options: Array<{ value: string; label: string }>,
  initial: string,
  onChange: (v: string) => void,
): HTMLElement {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'bb-settings-fieldset';

  const legend = document.createElement('legend');
  legend.className = 'bb-settings-label';
  legend.textContent = label;
  fieldset.appendChild(legend);

  const group = document.createElement('div');
  group.className = 'bb-settings-radio-group';

  for (const opt of options) {
    const lbl = document.createElement('label');
    lbl.className = 'bb-settings-radio-label';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = opt.value;
    input.checked = opt.value === initial;
    input.addEventListener('change', () => { if (input.checked) onChange(opt.value); });

    lbl.append(input, document.createTextNode(' ' + opt.label));
    group.appendChild(lbl);
  }

  fieldset.appendChild(group);
  return fieldset;
}

export function selectField(
  label: string,
  options: Array<{ value: string; label: string }>,
  initial: string,
  onChange: (v: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bb-settings-row';

  const lbl = document.createElement('label');
  lbl.className = 'bb-settings-label';
  lbl.textContent = label;

  const sel = document.createElement('select');
  sel.className = 'bb-settings-select';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    o.selected = opt.value === initial;
    sel.appendChild(o);
  }
  lbl.setAttribute('for', sel.id = `bb-sel-${label.replace(/\s+/g, '-').toLowerCase()}`);
  sel.addEventListener('change', () => onChange(sel.value));

  row.append(lbl, sel);
  return row;
}

export function numberField(
  label: string,
  min: number,
  max: number,
  initial: number,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bb-settings-row';

  const lbl = document.createElement('label');
  lbl.className = 'bb-settings-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'bb-settings-number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(initial);
  lbl.setAttribute('for', input.id = `bb-num-${label.replace(/\s+/g, '-').toLowerCase()}`);
  input.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, Number(input.value)));
    input.value = String(v);
    onChange(v);
  });

  row.append(lbl, input);
  return row;
}

export function noteText(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'bb-settings-note';
  p.textContent = text;
  return p;
}
