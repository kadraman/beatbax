import { useEffect, useRef, useState } from 'react';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { chatMode, chatSettings, updateChatSettings } from '@beatbax/app-core/stores/chat.store';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, NumberField, RadioGroup, SectionHeading, SelectField, TextField } from './form';

interface ChatSettingsPatch {
  endpoint?: string;
  model?: string;
  maxContextChars?: number;
}

interface SecureAIKeyStore {
  clearAIAPIKey: () => Promise<void>;
  getAIAPIKey: () => Promise<string>;
  setAIAPIKey: (apiKey: string) => Promise<void>;
  validateAIAPIKey?: (endpoint: string, apiKey: string) => Promise<{ ok: boolean; message: string }>;
}

const PRESETS: Record<string, { endpoint: string; model: string }> = {
  openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { endpoint: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' },
  ollama: { endpoint: 'http://localhost:11434/v1', model: 'llama3.2' },
  lmstudio: { endpoint: 'http://localhost:1234/v1', model: 'local-model' },
  custom: { endpoint: '', model: '' },
};

const PRESET_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'lmstudio', label: 'LM Studio (local)' },
  { value: 'custom', label: 'Custom' },
];

function desktopSecureAIKeyStore(): SecureAIKeyStore | null {
  const api = (window as any).electronAPI;
  return api
    && typeof api.getAIAPIKey === 'function'
    && typeof api.setAIAPIKey === 'function'
    && typeof api.clearAIAPIKey === 'function'
    ? api
    : null;
}

function endpointModelsURL(endpoint: string): string {
  const url = new URL(endpoint.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Endpoint must use http or https.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  url.search = '';
  url.hash = '';
  return url.toString();
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
    let url: string;
    try {
      url = endpointModelsURL(endpoint);
    } catch (error) {
      return { ok: false, message: `Invalid endpoint: ${(error as Error).message}` };
    }

    const response = await fetch(url, {
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

function detectPreset(endpoint: string): string {
  for (const [key, preset] of Object.entries(PRESETS)) {
    if (key !== 'custom' && endpoint === preset.endpoint) return key;
  }
  return endpoint ? 'custom' : 'openai';
}

function saveChatSettings(patch: ChatSettingsPatch): void {
  storage.setJSON(StorageKey.CHAT_SETTINGS, {
    endpoint: chatSettings.get().endpoint,
    model: chatSettings.get().model,
    maxContextChars: chatSettings.get().maxContextChars,
    ...patch,
  });
}

function APIKeyField({ endpoint }: { endpoint: string }): React.JSX.Element {
  const secureStore = desktopSecureAIKeyStore();
  const currentSettings = useStoreValue(chatSettings);
  const [apiKey, setApiKey] = useState(currentSettings.apiKey);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const serialRef = useRef(0);

  useEffect(() => {
    if (!secureStore) {
      setApiKey(chatSettings.get().apiKey);
      return;
    }
    let cancelled = false;
    void secureStore.getAIAPIKey()
      .then((key) => {
        if (cancelled) return;
        setApiKey(key);
        updateChatSettings({ apiKey: key });
      })
      .catch(() => {
        if (!cancelled) setStatus('Secure key unavailable.');
      });
    return () => { cancelled = true; };
  }, [secureStore]);

  const persistKey = async (nextKey: string): Promise<boolean> => {
    const serial = ++serialRef.current;
    const trimmed = nextKey.trim();
    setApiKey(trimmed);
    updateChatSettings({ apiKey: trimmed });
    if (!trimmed) {
      setStatus('No API key set.');
      return false;
    }
    if (secureStore) {
      setStatus('Saving key...');
      try {
        await secureStore.setAIAPIKey(trimmed);
      } catch (error) {
        console.error('Failed to store AI API key securely', error);
        if (serial === serialRef.current) setStatus('Failed to save key securely.');
        return false;
      }
    }
    if (serial !== serialRef.current) return false;
    setStatus(secureStore ? 'API key saved.' : 'API key set for this session.');
    return true;
  };

  return (
    <div className="bb-settings-row bb-settings-row--column bb-ai-key-wrap">
      <div className="bb-settings-row bb-ai-key-row">
        <label className="bb-settings-label" htmlFor="bb-ai-apikey">API key</label>
        <input
          autoComplete="off"
          className="bb-settings-text"
          id="bb-ai-apikey"
          onBlur={() => { void persistKey(apiKey); }}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          placeholder={secureStore ? '(stored - redacted)' : ''}
          type="password"
          value={apiKey}
        />
        <div className="bb-ai-key-actions">
          <button
            className="bb-settings-btn-secondary"
            disabled={busy}
            onClick={() => {
              const serial = ++serialRef.current;
              const trimmed = apiKey.trim();
              setApiKey(trimmed);
              updateChatSettings({ apiKey: trimmed });
              if (!trimmed) {
                setStatus('No API key set.');
                return;
              }
              setBusy(true);
              setStatus(secureStore ? 'Saving key...' : 'Validating key...');
              const savePromise = secureStore ? secureStore.setAIAPIKey(trimmed) : Promise.resolve();
              void savePromise
                .then(() => {
                  if (serial !== serialRef.current) return null;
                  setStatus('Validating key...');
                  return validateAIAPIKey(endpoint, trimmed);
                })
                .then((result) => {
                  if (result && serial === serialRef.current) setStatus(result.message);
                })
                .catch((error: unknown) => {
                  if (serial === serialRef.current) {
                    setStatus(`Could not validate key: ${(error as Error).message || 'request failed'}.`);
                  }
                })
                .finally(() => setBusy(false));
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Validate
          </button>
          <button
            className="bb-settings-btn-secondary"
            disabled={busy}
            onClick={() => {
              const serial = ++serialRef.current;
              setApiKey('');
              updateChatSettings({ apiKey: '' });
              if (!secureStore) {
                setStatus('API key cleared.');
                return;
              }
              setBusy(true);
              setStatus('Clearing key...');
              void secureStore.clearAIAPIKey()
                .then(() => {
                  if (serial === serialRef.current) setStatus('API key cleared.');
                })
                .catch((error: unknown) => {
                  console.error('Failed to clear secure AI API key', error);
                  if (serial === serialRef.current) setStatus('Failed to clear key.');
                })
                .finally(() => setBusy(false));
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            Clear key
          </button>
        </div>
      </div>
      <span aria-live="polite" className="bb-settings-note bb-ai-key-status">{status}</span>
    </div>
  );
}

export function AISettingsSection(): React.JSX.Element {
  const settings = useStoreValue(chatSettings);
  const mode = useStoreValue(chatMode);
  const preset = detectPreset(settings.endpoint);

  return (
    <div className="bb-settings-section">
      <div className="bb-settings-warning">
        {desktopSecureAIKeyStore()
          ? 'API keys are stored with the desktop secure credential store for this OS user.'
          : 'API keys are kept in memory for this browser session and are not saved.'}
      </div>
      <SectionHeading>Provider</SectionHeading>
      <SelectField
        label="Provider preset"
        onChange={(value) => {
          const selected = PRESETS[value];
          if (!selected || value === 'custom') return;
          saveChatSettings({ endpoint: selected.endpoint, model: selected.model });
          updateChatSettings({ endpoint: selected.endpoint, model: selected.model });
        }}
        options={PRESET_OPTIONS}
        value={preset}
      />
      <TextField
        inputType="url"
        label="API endpoint (base URL)"
        onChange={(value) => {
          saveChatSettings({ endpoint: value });
          updateChatSettings({ endpoint: value });
        }}
        value={settings.endpoint}
      />
      <APIKeyField endpoint={settings.endpoint} />
      <TextField
        label="Model"
        onChange={(value) => {
          saveChatSettings({ model: value });
          updateChatSettings({ model: value });
        }}
        value={settings.model}
      />

      <SectionHeading>Behaviour</SectionHeading>
      <RadioGroup
        label="Interaction mode"
        name="bb-ai-mode"
        onChange={(value) => chatMode.set(value as 'edit' | 'ask')}
        options={[
          { value: 'ask', label: 'Ask mode' },
          { value: 'edit', label: 'Edit mode' },
        ]}
        value={mode}
      />
      <NumberField
        label="Max editor characters sent to AI"
        max={32000}
        min={100}
        onChange={(value) => {
          saveChatSettings({ maxContextChars: value });
          updateChatSettings({ maxContextChars: value });
        }}
        value={settings.maxContextChars}
      />
      <NoteText>Larger values give the AI more of your song but may increase latency and token cost.</NoteText>
    </div>
  );
}

export function resetAIDefaults(): void {
  storage.remove(StorageKey.CHAT_SETTINGS);
  chatMode.set('ask');
  updateChatSettings({
    endpoint: PRESETS.openai.endpoint,
    model: PRESETS.openai.model,
    maxContextChars: 3000,
  });
}
