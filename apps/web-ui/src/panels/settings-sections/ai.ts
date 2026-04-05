/**
 * AI Copilot settings section.
 *
 * This section is only shown when the AI Copilot feature flag is enabled.
 * It surfaces the provider configuration currently inside the Copilot panel
 * header so it is easier to find.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import { updateChatSettings } from '../../stores/chat.store';
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

export function buildAISection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  // Security warning
  const warning = document.createElement('div');
  warning.className = 'bb-settings-warning';
  warning.innerHTML = '⚠ The API key is stored in <code>localStorage</code> in plain text. Do not enter a high-spend production key.';
  el.appendChild(warning);

  const cfg = loadChatSettings();
  const mode = storage.get(StorageKey.CHAT_MODE, 'ask') as 'edit' | 'ask';

  el.appendChild(sectionHeading('Provider'));

  // Provider preset
  el.appendChild(radioGroup(
    'Provider preset',
    'bb-ai-provider',
    [
      { value: 'openai',    label: 'OpenAI' },
      { value: 'groq',      label: 'Groq' },
      { value: 'ollama',    label: 'Ollama' },
      { value: 'lmstudio',  label: 'LM Studio' },
      { value: 'custom',    label: 'Custom' },
    ],
    cfg.provider ?? 'openai',
    (v) => saveChatSettings({ provider: v }),
  ));

  // API endpoint
  el.appendChild(textRow('API endpoint (base URL)', cfg.endpoint ?? '', 'url', (v) => {
    saveChatSettings({ endpoint: v });
    updateChatSettings({ endpoint: v });
  }));

  // API key
  el.appendChild(apiKeyRow());

  // Model
  el.appendChild(textRow('Model', cfg.model ?? '', 'text', (v) => {
    saveChatSettings({ model: v });
    updateChatSettings({ model: v });
  }));

  el.appendChild(sectionHeading('Behaviour'));

  // Interaction mode
  el.appendChild(radioGroup(
    'Interaction mode',
    'bb-ai-mode',
    [
      { value: 'ask',  label: 'Ask mode' },
      { value: 'edit', label: 'Edit mode' },
    ],
    mode,
    (v) => storage.set(StorageKey.CHAT_MODE, v),
  ));

  // Max context chars
  const maxCtx = loadChatSettings().maxContextChars ?? 3000;
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
  ctxInput.addEventListener('change', () => saveChatSettings({ maxContextChars: Number(ctxInput.value) }));
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
  storage.set(StorageKey.CHAT_MODE, 'ask');
}
