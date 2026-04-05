/**
 * AI Copilot settings section.
 *
 * This section is only shown when the AI Copilot feature flag is enabled.
 * It surfaces the provider configuration currently inside the Copilot panel
 * header so it is easier to find.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { updateChatSettings, chatMode, chatSettings } from '../../stores/chat.store';
import { sectionHeading, radioGroup, noteText } from './general';

interface ChatSettings {
  provider?: string;
  endpoint?: string;
  model?: string;
  maxContextChars?: number;
}

function loadChatSettings(): ChatSettings {
  try {
    const raw = storage.get(StorageKey.CHAT_SETTINGS);
    if (raw) return JSON.parse(raw) as ChatSettings;
  } catch { /* ignore */ }
  return {};
}

function saveChatSettings(patch: Partial<ChatSettings>): void {
  const current = loadChatSettings();
  storage.setJSON(StorageKey.CHAT_SETTINGS, { ...current, ...patch });
}

/** Preset definitions — must stay in sync with ChatPanel PRESETS. */
const PRESETS: Record<string, { endpoint: string; model: string }> = {
  openai:   { endpoint: 'https://api.openai.com/v1',         model: 'gpt-4o-mini' },
  groq:     { endpoint: 'https://api.groq.com/openai/v1',    model: 'llama-3.3-70b-versatile' },
  ollama:   { endpoint: 'http://localhost:11434/v1',          model: 'llama3.2' },
  lmstudio: { endpoint: 'http://localhost:1234/v1',           model: 'local-model' },
  custom:   { endpoint: '', model: '' },
};

/** Derive the preset key from a stored endpoint, falling back to 'custom'. */
function detectPreset(endpoint: string): string {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (key !== 'custom' && endpoint === p.endpoint) return key;
  }
  return endpoint ? 'custom' : 'openai';
}

export function buildAISection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  // Security warning
  const warning = document.createElement('div');
  warning.className = 'bb-settings-warning';
  warning.innerHTML = '⚠ The API key is stored in <code>localStorage</code> in plain text. Do not enter a high-spend production key.';
  el.appendChild(warning);

  el.appendChild(sectionHeading('Provider'));

  // ── Provider preset select ────────────────────────────────────────────────
  const cfg = loadChatSettings();
  const currentPreset = detectPreset(cfg.endpoint ?? '');

  const presetRow = document.createElement('div');
  presetRow.className = 'bb-settings-row';
  const presetLabel = document.createElement('label');
  presetLabel.className = 'bb-settings-label';
  presetLabel.textContent = 'Provider preset';
  presetLabel.setAttribute('for', 'bb-ai-preset');
  const presetSelect = document.createElement('select');
  presetSelect.id = 'bb-ai-preset';
  presetSelect.className = 'bb-settings-select';
  for (const [key, p] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'openai' ? 'OpenAI'
      : key === 'groq'     ? 'Groq (free, fast)'
      : key === 'ollama'   ? 'Ollama (local)'
      : key === 'lmstudio' ? 'LM Studio (local)'
      : 'Custom';
    if (key === currentPreset) opt.selected = true;
    presetSelect.appendChild(opt);
  }
  presetRow.append(presetLabel, presetSelect);
  el.appendChild(presetRow);

  // ── API endpoint ──────────────────────────────────────────────────────────
  const endpointRow = document.createElement('div');
  endpointRow.className = 'bb-settings-row';
  const endpointLabel = document.createElement('label');
  endpointLabel.className = 'bb-settings-label';
  endpointLabel.textContent = 'API endpoint (base URL)';
  endpointLabel.setAttribute('for', 'bb-ai-endpoint');
  const endpointInput = document.createElement('input');
  endpointInput.type = 'url';
  endpointInput.id = 'bb-ai-endpoint';
  endpointInput.className = 'bb-settings-text';
  endpointInput.value = cfg.endpoint ?? PRESETS.openai.endpoint;
  endpointInput.addEventListener('change', () => {
    saveChatSettings({ endpoint: endpointInput.value });
    updateChatSettings({ endpoint: endpointInput.value });
    // Update preset select to reflect custom entry
    presetSelect.value = detectPreset(endpointInput.value);
  });
  endpointRow.append(endpointLabel, endpointInput);
  el.appendChild(endpointRow);

  // ── API key ───────────────────────────────────────────────────────────────
  el.appendChild(apiKeyRow());

  // ── Model ─────────────────────────────────────────────────────────────────
  const modelRow = document.createElement('div');
  modelRow.className = 'bb-settings-row';
  const modelLabel = document.createElement('label');
  modelLabel.className = 'bb-settings-label';
  modelLabel.textContent = 'Model';
  modelLabel.setAttribute('for', 'bb-ai-model');
  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.id = 'bb-ai-model';
  modelInput.className = 'bb-settings-text';
  modelInput.value = cfg.model ?? PRESETS.openai.model;
  modelInput.addEventListener('change', () => {
    saveChatSettings({ model: modelInput.value });
    updateChatSettings({ model: modelInput.value });
  });
  modelRow.append(modelLabel, modelInput);
  el.appendChild(modelRow);

  // ── Wire preset → endpoint + model ───────────────────────────────────────
  presetSelect.addEventListener('change', () => {
    const p = PRESETS[presetSelect.value];
    if (!p || presetSelect.value === 'custom') return; // custom: leave inputs as-is
    endpointInput.value = p.endpoint;
    modelInput.value    = p.model;
    saveChatSettings({ endpoint: p.endpoint, model: p.model });
    updateChatSettings({ endpoint: p.endpoint, model: p.model });
  });

  el.appendChild(sectionHeading('Behaviour'));

  const mode = chatMode.get();

  // Interaction mode
  el.appendChild(radioGroup(
    'Interaction mode',
    'bb-ai-mode',
    [
      { value: 'ask',  label: 'Ask mode' },
      { value: 'edit', label: 'Edit mode' },
    ],
    mode,
    (v) => chatMode.set(v as 'edit' | 'ask'),
  ));

  // Max context chars
  const maxCtx = chatSettings.get().maxContextChars;
  const ctxRow = document.createElement('div');
  ctxRow.className = 'bb-settings-row';
  const ctxLabel = document.createElement('label');
  ctxLabel.className = 'bb-settings-label';
  ctxLabel.textContent = 'Max context chars';
  const ctxInput = document.createElement('input');
  ctxInput.type = 'number';
  ctxInput.className = 'bb-settings-number';
  ctxInput.min = '100';
  ctxInput.max = '32000';
  ctxInput.value = String(maxCtx);
  ctxLabel.setAttribute('for', ctxInput.id = 'bb-ai-max-ctx');
  ctxInput.addEventListener('change', () => {
    const v = Number(ctxInput.value);
    saveChatSettings({ maxContextChars: v });
    updateChatSettings({ maxContextChars: v });
  });
  ctxRow.append(ctxLabel, ctxInput);
  el.appendChild(ctxRow);

  return el;
}

function textRow(label: string, initial: string, inputType: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bb-settings-row';

  const lbl = document.createElement('label');
  lbl.className = 'bb-settings-label';
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = inputType;
  input.className = 'bb-settings-text';
  input.value = initial;
  const id = `bb-ai-text-${label.replace(/\s+/g, '-').toLowerCase()}`;
  input.id = id;
  lbl.setAttribute('for', id);
  input.addEventListener('change', () => onChange(input.value));

  row.append(lbl, input);
  return row;
}

function apiKeyRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'bb-settings-row';

  const lbl = document.createElement('label');
  lbl.className = 'bb-settings-label';
  lbl.textContent = 'API key';
  lbl.setAttribute('for', 'bb-ai-apikey');

  const input = document.createElement('input');
  input.type = 'password';
  input.id = 'bb-ai-apikey';
  input.className = 'bb-settings-text';
  input.placeholder = '(stored — redacted)';
  input.autocomplete = 'off';

  // Load existing key from CHAT_SETTINGS if present
  const cfg = loadChatSettings() as any;
  if (cfg.apiKey) input.value = cfg.apiKey;

  input.addEventListener('change', () => {
    const trimmed = input.value.trim();
    input.value = trimmed;
    saveChatSettings({ apiKey: trimmed } as any);
    updateChatSettings({ apiKey: trimmed });
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'bb-settings-btn-secondary';
  clearBtn.textContent = 'Clear key';
  clearBtn.addEventListener('click', () => {
    input.value = '';
    saveChatSettings({ apiKey: '' } as any);
    updateChatSettings({ apiKey: '' });
  });

  row.append(lbl, input, clearBtn);
  return row;
}

export function resetAIDefaults(): void {
  storage.remove(StorageKey.CHAT_SETTINGS);
  chatMode.set('ask');
}
