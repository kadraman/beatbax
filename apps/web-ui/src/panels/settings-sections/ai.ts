/**
 * AI Copilot settings section.
 *
 * This section is only shown when the AI Copilot feature flag is enabled.
 * It surfaces the provider configuration currently inside the Copilot panel
 * header so it is easier to find.
 */

import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { updateChatSettings, chatMode, chatSettings } from '@beatbax/app-core/stores/chat.store';
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

function desktopSecureAIKeyStore():
  | {
      getAIAPIKey: () => Promise<string>;
      setAIAPIKey: (apiKey: string) => Promise<void>;
      clearAIAPIKey: () => Promise<void>;
      validateAIAPIKey?: (endpoint: string, apiKey: string) => Promise<{ ok: boolean; message: string }>;
    }
  | null {
  const api = (window as any).electronAPI;
  return api
    && typeof api.getAIAPIKey === 'function'
    && typeof api.setAIAPIKey === 'function'
    && typeof api.clearAIAPIKey === 'function'
    ? api
    : null;
}

function endpointModelsURL(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, '')}/models`;
}

async function validateAIAPIKey(endpoint: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!endpoint.trim()) return { ok: false, message: 'Enter an API endpoint before validating the key.' };
  if (!apiKey.trim()) return { ok: false, message: 'No API key set.' };

  const desktopValidator = desktopSecureAIKeyStore()?.validateAIAPIKey;
  if (typeof desktopValidator === 'function') {
    return desktopValidator(endpoint, apiKey);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpointModelsURL(endpoint), {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, message: 'API key validated.' };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'API key was rejected by the provider.' };
    }
    return { ok: false, message: `Could not validate key: provider returned HTTP ${response.status}.` };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { ok: false, message: 'Could not validate key: provider did not respond.' };
    }
    return { ok: false, message: `Could not validate key: ${(error as Error).message || 'request failed'}.` };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Preset definitions — must stay in sync with ChatPanel PRESETS. */
const PRESETS: Record<string, { endpoint: string; model: string }> = {
  openai:   { endpoint: 'https://api.openai.com/v1',         model: 'gpt-4o-mini' },
  groq:     { endpoint: 'https://api.groq.com/openai/v1',    model: 'openai/gpt-oss-120b' },
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

  // Security note
  const warning = document.createElement('div');
  warning.className = 'bb-settings-warning';
  warning.innerHTML = desktopSecureAIKeyStore()
    ? 'API keys are stored with the desktop secure credential store for this OS user.'
    : 'API keys are kept in memory for this browser session and are not saved.';
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
      : key === 'groq'     ? 'Groq'
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
  el.appendChild(apiKeyRow(() => endpointInput.value.trim()));

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

  // Max editor chars sent to AI
  const maxCtx = chatSettings.get().maxContextChars;
  const ctxRow = document.createElement('div');
  ctxRow.className = 'bb-settings-row';
  const ctxLabel = document.createElement('label');
  ctxLabel.className = 'bb-settings-label';
  ctxLabel.textContent = 'Max editor characters sent to AI';
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
  el.appendChild(noteText('Larger values give the AI more of your song but may increase latency and token cost.'));

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

function apiKeyRow(getEndpoint: () => string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'bb-settings-row bb-settings-row--column bb-ai-key-wrap';

  const row = document.createElement('div');
  row.className = 'bb-settings-row bb-ai-key-row';

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

  const status = document.createElement('span');
  status.className = 'bb-settings-note bb-ai-key-status';
  status.setAttribute('aria-live', 'polite');

  const setStatus = (message: string): void => {
    status.textContent = message;
  };

  let requestSerial = 0;

  const secureStore = desktopSecureAIKeyStore();
  if (secureStore) {
    void secureStore.getAIAPIKey()
      .then((apiKey) => {
        input.value = apiKey;
        updateChatSettings({ apiKey });
      })
      .catch(() => {
        input.placeholder = '(secure key unavailable)';
      });
  } else if (chatSettings.get().apiKey) {
    input.value = chatSettings.get().apiKey;
  }

  const persistKey = async (): Promise<boolean> => {
    const serial = ++requestSerial;
    const trimmed = input.value.trim();
    input.value = trimmed;
    updateChatSettings({ apiKey: trimmed });
    if (!trimmed) {
      setStatus('No API key set.');
      return false;
    }
    if (secureStore) {
      setStatus('Saving key...');
      try {
        await secureStore.setAIAPIKey(trimmed);
      } catch (error: unknown) {
        console.error('Failed to store AI API key securely', error);
        if (serial === requestSerial) setStatus('Failed to save key securely.');
        return false;
      }
    }
    if (serial !== requestSerial) return false;
    setStatus('API key saved.');
    return true;
  };

  input.addEventListener('change', () => {
    void persistKey();
  });

  const validateBtn = document.createElement('button');
  validateBtn.type = 'button';
  validateBtn.className = 'bb-settings-btn-secondary';
  validateBtn.textContent = 'Validate';
  validateBtn.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  validateBtn.addEventListener('click', () => {
    const serial = ++requestSerial;
    const trimmed = input.value.trim();
    input.value = trimmed;
    updateChatSettings({ apiKey: trimmed });
    if (!trimmed) {
      setStatus('No API key set.');
      return;
    }
    validateBtn.disabled = true;
    clearBtn.disabled = true;
    setStatus(secureStore ? 'Saving key...' : 'Validating key...');
    const savePromise = secureStore ? secureStore.setAIAPIKey(trimmed) : Promise.resolve();
    void savePromise
      .then(() => {
        if (serial !== requestSerial) return null;
        setStatus('Validating key...');
        return validateAIAPIKey(getEndpoint(), trimmed);
      })
      .then((result) => {
        if (result && serial === requestSerial) setStatus(result.message);
      })
      .catch((error: unknown) => {
        if (serial === requestSerial) {
          setStatus(`Could not validate key: ${(error as Error).message || 'request failed'}.`);
        }
      })
      .finally(() => {
        validateBtn.disabled = false;
        clearBtn.disabled = false;
      });
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'bb-settings-btn-secondary';
  clearBtn.textContent = 'Clear key';

  clearBtn.addEventListener('mousedown', (event) => {
    // Avoid blurring the password field first, which would fire a stale save.
    event.preventDefault();
  });

  clearBtn.addEventListener('click', () => {
    const serial = ++requestSerial;
    input.value = '';
    updateChatSettings({ apiKey: '' });
    if (secureStore) {
      clearBtn.disabled = true;
      validateBtn.disabled = true;
      setStatus('Clearing key...');
      void secureStore.clearAIAPIKey()
        .then(() => {
          if (serial === requestSerial) setStatus('API key cleared.');
        })
        .catch((error: unknown) => {
          console.error('Failed to clear secure AI API key', error);
          if (serial === requestSerial) setStatus('Failed to clear key.');
        })
        .finally(() => {
          clearBtn.disabled = false;
          validateBtn.disabled = false;
        });
    } else {
      setStatus('API key cleared.');
    }
  });

  const actions = document.createElement('div');
  actions.className = 'bb-ai-key-actions';
  actions.append(validateBtn, clearBtn);

  row.append(lbl, input, actions);
  wrapper.append(row, status);
  return wrapper;
}

export function resetAIDefaults(): void {
  storage.remove(StorageKey.CHAT_SETTINGS);
  chatMode.set('ask');
}
