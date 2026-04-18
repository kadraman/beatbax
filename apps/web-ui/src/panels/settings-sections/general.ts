/**
 * General settings section — Appearance and Panels.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { eventBus } from '../../utils/event-bus';
import {
  settingTheme, settingToolbarStyle,
  settingShowToolbar, settingShowTransportBar,
  settingShowPatternGrid, settingShowChannelMixer, settingShowSongVisualizer,
  settingVizBgEffect, settingVizBgImage,
  settingChannelCompact,
  settingFeatureDawMixer,
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
      { value: 'icons+labels', label: 'Icons with labels' },
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
    settingChannelCompact.subscribe,
  ));

  // ── Panels ────────────────────────────────────────────────────────────────
  el.appendChild(sectionHeading('Panels'));

  el.appendChild(toggle('Show toolbar', settingShowToolbar.get(), (v) => {
    settingShowToolbar.set(v);
    eventBus.emit('panel:toggled', { panel: 'toolbar', visible: v });
  }, settingShowToolbar.subscribe));

  el.appendChild(toggle('Show transport bar', settingShowTransportBar.get(), (v) => {
    settingShowTransportBar.set(v);
    eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: v });
  }, settingShowTransportBar.subscribe));

  el.appendChild(toggle('Show pattern grid', settingShowPatternGrid.get(), (v) => {
    settingShowPatternGrid.set(v);
    eventBus.emit('panel:toggled', { panel: 'pattern-grid', visible: v });
  }, settingShowPatternGrid.subscribe));

  const mixerRow = toggle('Show channel mixer', settingShowChannelMixer.get(), (v) => {
    settingShowChannelMixer.set(v);
    eventBus.emit('panel:toggled', { panel: 'daw-mixer', visible: v });
  }, settingShowChannelMixer.subscribe);
  // Disable the toggle when the Channel Mixer feature flag is off.
  const mixerInput = mixerRow.querySelector<HTMLInputElement>('input');
  const applyMixerFeatureGate = (featureEnabled: boolean): void => {
    if (!mixerInput) return;
    mixerInput.disabled = !featureEnabled;
    (mixerRow as HTMLElement).style.opacity = featureEnabled ? '' : '0.5';
    (mixerRow as HTMLElement).title = featureEnabled
      ? ''
      : 'Enable Channel Mixer in Settings → Features first';
  };
  let firstMixerFeatCall = true;
  const unsubMixerFeat = settingFeatureDawMixer.subscribe((v) => {
    if (firstMixerFeatCall) { firstMixerFeatCall = false; }
    applyMixerFeatureGate(v);
  });
  const mixerFeatObserver = new MutationObserver(() => {
    if (!(mixerRow as HTMLElement).isConnected) {
      unsubMixerFeat();
      mixerFeatObserver.disconnect();
    }
  });
  mixerFeatObserver.observe(document.body, { childList: true, subtree: true });
  el.appendChild(mixerRow);

  el.appendChild(toggle('Show song visualizer', settingShowSongVisualizer.get(), (v) => {
    settingShowSongVisualizer.set(v);
    eventBus.emit('panel:toggled', { panel: 'song-visualizer', visible: v });
  }, settingShowSongVisualizer.subscribe));

  const bgEffectSelect = selectField(
    'Song visualizer background',
    [
      { value: 'none',         label: 'None' },
      { value: 'starfield',    label: 'Starfield' },
      { value: 'scanlines',    label: 'CRT Scanlines' },
      { value: 'custom-image', label: 'Custom image' },
    ],
    settingVizBgEffect.get(),
    (v) => {
      const next = v as 'none' | 'starfield' | 'scanlines' | 'custom-image';
      settingVizBgEffect.set(next);
      // Show image row only when custom-image is selected
      imageRow.style.display = next === 'custom-image' ? '' : 'none';
      if (next !== 'custom-image') {
        // Clear stored image when switching away from the image mode
        settingVizBgImage.set('');
        fileInput.value = '';
        uploadBtn.textContent = 'Upload image';
        clearBtn.style.display = 'none';
        eventBus.emit('song-visualizer:settings-changed', { key: 'bgImage', value: '' });
      }
      eventBus.emit('song-visualizer:settings-changed', { key: 'bgEffect', value: v });
    },
  );
  el.appendChild(bgEffectSelect);

  // ── Visualizer background image (only shown when Custom image is selected) ─
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'bb-settings-file';
  fileInput.style.display = 'none';
  fileInput.id = 'bb-viz-bg-image-input';

  // Thumbnail + filename shown after an image is chosen
  const imgPreview = document.createElement('img');
  imgPreview.className = 'bb-settings-img-preview';
  imgPreview.alt = 'Background preview';

  const fileNameEl = document.createElement('span');
  fileNameEl.className = 'bb-settings-img-name';

  // Restore preview from stored data URL (page reload with existing image)
  const storedImg = settingVizBgImage.get();
  if (storedImg) {
    imgPreview.src = storedImg;
    imgPreview.style.display = '';
    fileNameEl.textContent = 'Current image';
    fileNameEl.style.display = '';
  } else {
    imgPreview.style.display = 'none';
    fileNameEl.style.display = 'none';
  }

  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'bb-settings-btn';
  uploadBtn.textContent = storedImg ? 'Replace image' : 'Upload image';
  uploadBtn.addEventListener('click', () => fileInput.click());

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'bb-settings-btn bb-settings-btn--danger';
  clearBtn.textContent = 'Clear';
  clearBtn.style.display = storedImg ? '' : 'none';
  clearBtn.addEventListener('click', () => {
    settingVizBgImage.set('');
    settingVizBgEffect.set('none');
    const sel = bgEffectSelect.querySelector<HTMLSelectElement>('select');
    if (sel) sel.value = 'none';
    uploadBtn.textContent = 'Upload image';
    clearBtn.style.display = 'none';
    fileInput.value = '';
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    fileNameEl.textContent = '';
    fileNameEl.style.display = 'none';
    imageRow.style.display = 'none';
    eventBus.emit('song-visualizer:settings-changed', { key: 'bgImage', value: '' });
    eventBus.emit('song-visualizer:settings-changed', { key: 'bgEffect', value: 'none' });
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      settingVizBgImage.set(dataUrl);
      imgPreview.src = dataUrl;
      imgPreview.style.display = '';
      fileNameEl.textContent = file.name;
      fileNameEl.style.display = '';
      uploadBtn.textContent = 'Replace image';
      clearBtn.style.display = '';
      eventBus.emit('song-visualizer:settings-changed', { key: 'bgImage', value: dataUrl });
    };
    reader.readAsDataURL(file);
  });

  const imageRow = document.createElement('div');
  imageRow.className = 'bb-settings-row bb-settings-row--column';
  imageRow.style.display = settingVizBgEffect.get() === 'custom-image' ? '' : 'none';

  const imageLbl = document.createElement('span');
  imageLbl.className = 'bb-settings-label';
  imageLbl.textContent = 'Visualizer background image';

  const imageControls = document.createElement('div');
  imageControls.className = 'bb-settings-img-controls';
  imageControls.append(fileInput, uploadBtn, clearBtn);

  const imagePreviewWrap = document.createElement('div');
  imagePreviewWrap.className = 'bb-settings-img-preview-wrap';
  imagePreviewWrap.append(imgPreview, fileNameEl);

  imageRow.append(imageLbl, imageControls, imagePreviewWrap);
  el.appendChild(imageRow);

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
  settingShowSongVisualizer.set(false);
  settingVizBgEffect.set('none');
  settingVizBgImage.set('');
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
  /** Optional nanostores-compatible subscribe fn to keep the checkbox in sync with an external store. */
  externalSubscribe?: (listener: (v: boolean) => void) => () => void,
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

  // If an external store subscribe fn is provided, keep the checkbox in sync.
  if (externalSubscribe) {
    // nanostores calls the listener immediately with the current value (first call),
    // then on every subsequent change.
    let first = true;
    const unsub = externalSubscribe((v) => {
      if (first) { first = false; return; } // skip the immediate call — initial already set
      input.checked = v;
    });

    // Use a MutationObserver to detect when the row is removed from the DOM
    // and unsubscribe at that point. Standard DOM elements never fire a
    // 'disconnected' event, so the previous approach leaked the subscription.
    const observer = new MutationObserver(() => {
      if (!row.isConnected) {
        unsub();
        observer.disconnect();
      }
    });
    // Observe the nearest ancestor that is guaranteed to be in the document
    // when the row is live. document.body is always a safe fallback.
    observer.observe(document.body, { childList: true, subtree: true });
  }

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

export function rangeField(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  unit: string,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bb-settings-row bb-settings-range-row';

  const lbl = document.createElement('label');
  lbl.className = 'bb-settings-label';
  lbl.textContent = label;

  const right = document.createElement('div');
  right.className = 'bb-settings-range-right';

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'bb-settings-range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  lbl.setAttribute('for', input.id = `bb-range-${label.replace(/\s+/g, '-').toLowerCase()}`);

  const valueLabel = document.createElement('span');
  valueLabel.className = 'bb-settings-range-value';
  valueLabel.textContent = `${initial}${unit}`;

  input.addEventListener('input', () => {
    const v = Number(input.value);
    valueLabel.textContent = `${v}${unit}`;
    onChange(v);
  });

  right.append(input, valueLabel);
  row.append(lbl, right);
  return row;
}
