import { useCallback, useEffect, useRef, useState } from 'react';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { chatMode, chatSettings, updateChatSettings } from '@beatbax/app-core/stores/chat.store';
import {
  AI_PROVIDER_OPTIONS,
  AI_PROVIDERS,
  CUSTOM_MODEL_VALUE,
  filterChatModels,
  getModelsForProvider,
  getProviderByEndpoint,
  mergeModelLists,
  type AIProviderKey,
} from '@beatbax/app-core/stores/ai-models';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, NumberField, RadioGroup, SectionHeading, SelectField, TextField } from './form';

interface AIModelListResult {
  ok: boolean;
  models: string[];
  message?: string;
}

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
  listAIModels?: (endpoint: string, apiKey: string) => Promise<AIModelListResult>;
}

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

async function fetchModelList(endpoint: string, apiKey: string): Promise<AIModelListResult> {
  const desktopLister = desktopSecureAIKeyStore()?.listAIModels;
  if (typeof desktopLister === 'function') {
    return desktopLister(endpoint, apiKey);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    let url: string;
    try {
      url = endpointModelsURL(endpoint);
    } catch (error) {
      return { ok: false, models: [], message: `Invalid endpoint: ${(error as Error).message}` };
    }

    const headers: Record<string, string> = {};
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, models: [], message: 'The provider rejected the API key.' };
      }
      return { ok: false, models: [], message: `Could not load models: provider returned HTTP ${response.status}.` };
    }
    const data = await response.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null;
    const models = Array.isArray(data?.data)
      ? data.data
          .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
          .filter((id): id is string => id.length > 0)
      : [];
    return { ok: true, models };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { ok: false, models: [], message: 'Could not load models: provider did not respond.' };
    }
    return { ok: false, models: [], message: `Could not load models: ${(error as Error).message || 'request failed'}.` };
  } finally {
    window.clearTimeout(timeout);
  }
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

function isLocalEndpoint(endpoint: string): boolean {
  return endpoint.includes('localhost') || endpoint.includes('127.0.0.1');
}

function ModelField({
  endpoint,
  model,
  providerKey,
}: {
  endpoint: string;
  model: string;
  providerKey: AIProviderKey;
}): React.JSX.Element {
  const curated = getModelsForProvider(providerKey);
  const [fetched, setFetched] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [forceCustom, setForceCustom] = useState(false);
  const loadedEndpointRef = useRef('');

  const persistModel = (value: string): void => {
    saveChatSettings({ model: value });
    updateChatSettings({ model: value });
  };

  const loadModels = useCallback(async (silent: boolean): Promise<void> => {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
      if (!silent) setStatus('Enter an API endpoint before loading models.');
      return;
    }
    const apiKey = chatSettings.get().apiKey ?? '';
    if (!isLocalEndpoint(trimmedEndpoint) && !apiKey.trim()) {
      if (!silent) setStatus('Set an API key to load available models.');
      return;
    }
    setBusy(true);
    setStatus('Loading models...');
    try {
      const result = await fetchModelList(trimmedEndpoint, apiKey);
      if (result.ok) {
        const chatModels = filterChatModels(result.models);
        setFetched(chatModels);
        loadedEndpointRef.current = trimmedEndpoint;
        setStatus(chatModels.length
          ? `Loaded ${chatModels.length} models from the provider.`
          : 'Provider returned no chat-capable models.');
      } else {
        setStatus(result.message ?? 'Could not load models.');
      }
    } finally {
      setBusy(false);
    }
  }, [endpoint]);

  // Reset fetched state when the provider preset changes.
  useEffect(() => {
    setForceCustom(false);
    setFetched([]);
    setStatus('');
    loadedEndpointRef.current = '';
  }, [providerKey]);

  // Auto-load once per endpoint when credentials are available.
  useEffect(() => {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint || loadedEndpointRef.current === trimmedEndpoint) return;
    const apiKey = chatSettings.get().apiKey ?? '';
    if (!isLocalEndpoint(trimmedEndpoint) && !apiKey.trim()) return;
    void loadModels(true);
  }, [endpoint, loadModels]);

  const available = mergeModelLists(curated, fetched);
  const selectValue = forceCustom || !available.includes(model)
    ? CUSTOM_MODEL_VALUE
    : model;
  const showCustomInput = selectValue === CUSTOM_MODEL_VALUE;
  const options = [
    ...available.map((entry) => ({ value: entry, label: entry })),
    { value: CUSTOM_MODEL_VALUE, label: 'Custom...' },
  ];

  return (
    <>
      <div className="bb-settings-row bb-ai-model-row">
        <label className="bb-settings-label" htmlFor="bb-ai-model-select">Model</label>
        <select
          className="bb-settings-select"
          id="bb-ai-model-select"
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === CUSTOM_MODEL_VALUE) {
              setForceCustom(true);
              return;
            }
            setForceCustom(false);
            persistModel(value);
          }}
          value={selectValue}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          className="bb-settings-btn-secondary"
          disabled={busy}
          onClick={() => { void loadModels(false); }}
          onMouseDown={(event) => event.preventDefault()}
          type="button"
        >
          {busy ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {showCustomInput ? (
        <TextField
          id="bb-ai-model"
          label="Custom model ID"
          onChange={(value) => {
            setForceCustom(true);
            persistModel(value);
          }}
          value={model}
        />
      ) : null}
      {status ? <NoteText>{status}</NoteText> : null}
    </>
  );
}

export function AISettingsSection(): React.JSX.Element {
  const settings = useStoreValue(chatSettings);
  const mode = useStoreValue(chatMode);
  const providerKey = getProviderByEndpoint(settings.endpoint);

  return (
    <div className="bb-settings-section">
      <div className="bb-settings-warning">
        {desktopSecureAIKeyStore()
          ? 'API keys are stored with the desktop secure credential store for this OS user.'
          : 'API keys are kept in memory for this browser session and are not saved.'}
      </div>
      <SectionHeading>Provider</SectionHeading>
      <SelectField
        id="bb-ai-preset"
        label="Provider preset"
        onChange={(value) => {
          const selected = AI_PROVIDERS[value as AIProviderKey];
          if (!selected || value === 'custom') return;
          saveChatSettings({ endpoint: selected.endpoint, model: selected.defaultModel });
          updateChatSettings({ endpoint: selected.endpoint, model: selected.defaultModel });
        }}
        options={AI_PROVIDER_OPTIONS}
        value={providerKey}
      />
      <TextField
        id="bb-ai-endpoint"
        inputType="url"
        label="API endpoint (base URL)"
        onChange={(value) => {
          saveChatSettings({ endpoint: value });
          updateChatSettings({ endpoint: value });
        }}
        value={settings.endpoint}
      />
      <APIKeyField endpoint={settings.endpoint} />
      <ModelField endpoint={settings.endpoint} model={settings.model} providerKey={providerKey} />

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
        id="bb-ai-max-ctx"
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
    endpoint: AI_PROVIDERS.openai.endpoint,
    model: AI_PROVIDERS.openai.defaultModel,
    maxContextChars: 12000,
  });
}
