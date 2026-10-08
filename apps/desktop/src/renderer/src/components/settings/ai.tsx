import { useCallback, useEffect, useRef, useState } from 'react';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import {
  chatMode,
  chatSettings,
  updateChatSettings,
  AI_CONTEXT_CHAR_PRESETS,
  MIN_CONTEXT_WINDOW_TOKENS,
  MAX_CONTEXT_WINDOW_TOKENS,
  REPLY_BUDGET_BOUNDS,
  clampContextWindowTokens,
  clampReplyBudget,
  clearChatPromptHistory,
  isValidCustomReasoningEffort,
  persistableChatSettings,
  resetChatRequestControls,
  type AISettings,
  type ChatMode,
  type ReasoningEffortSetting,
  type ReplyBudgetSetting,
} from '@beatbax/app-core/stores/chat.store';
import {
  AI_PROVIDER_OPTIONS,
  AI_PROVIDERS,
  CUSTOM_MODEL_VALUE,
  defaultContextWindowTokens,
  filterChatModels,
  getModelsForProvider,
  getProviderByEndpoint,
  mergeModelLists,
  type AIProviderKey,
} from '@beatbax/app-core/stores/ai-models';
import { isLocalAiEndpoint } from '../../lib/ai-endpoint';
import { autoReplyCeiling, formatTokenCount, resolveReasoningEffort } from '../../lib/copilot-token-budget';
import {
  currentReplyBudget,
  describeAutoReplyBudget,
  describeEffectiveReasoningEffort,
  learnedRequestParams,
  learnedTokenParam,
} from '../../lib/copilot-request-learning';
import { negotiationKey } from '../../../../shared/ai-request-negotiation';
import { useStoreValue } from '../../hooks/useStoreValue';
import { NoteText, PresetRangeField, RadioGroup, SectionHeading, SelectField, TextField } from './form';

const COPILOT_QA_SCENARIOS_URL = 'https://github.com/kadraman/beatbax/blob/main/docs/qa/copilot-test-scenarios.md';
const COPILOT_LOCAL_MODELS_URL = 'https://github.com/kadraman/beatbax/blob/main/docs/ui/copilot-local-models.md';

interface AIModelListResult {
  ok: boolean;
  models: string[];
  message?: string;
}

type ChatSettingsPatch = Partial<Omit<AISettings, 'apiKey'>>;

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
  storage.setJSON(StorageKey.CHAT_SETTINGS, persistableChatSettings({ ...chatSettings.get(), ...patch }));
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
    if (!isLocalAiEndpoint(trimmedEndpoint) && !apiKey.trim()) {
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
    if (!isLocalAiEndpoint(trimmedEndpoint) && !apiKey.trim()) return;
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

function ContextWindowField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (): void => {
    const next = clampContextWindowTokens(Number(draft), value);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="bb-settings-row">
      <label className="bb-settings-label" htmlFor="bb-ai-ctx-window">Model token window</label>
      <input
        className="bb-settings-number"
        id="bb-ai-ctx-window"
        max={MAX_CONTEXT_WINDOW_TOKENS}
        min={MIN_CONTEXT_WINDOW_TOKENS}
        onBlur={commit}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        type="number"
        value={draft}
      />
    </div>
  );
}

const REASONING_EFFORT_OPTIONS: Array<{ value: ReasoningEffortSetting; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'provider-default', label: 'Provider default' },
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'custom', label: 'Custom...' },
];

function ReplyBudgetField({
  id,
  label,
  mode,
  settings,
  value,
}: {
  id: string;
  label: string;
  mode: ChatMode;
  settings: AISettings;
  value: ReplyBudgetSetting;
}): React.JSX.Element {
  const snapshot = useStoreValue(currentReplyBudget);
  useStoreValue(learnedRequestParams);
  const bounds = REPLY_BUDGET_BOUNDS[mode];
  const field = mode === 'edit' ? 'editReplyTokens' : 'askReplyTokens';
  const autoLabel = describeAutoReplyBudget(mode, settings.endpoint, settings.model, snapshot);
  const [draft, setDraft] = useState(value === 'auto' ? '' : String(value));
  const [draftFor, setDraftFor] = useState(value);
  if (draftFor !== value) {
    setDraftFor(value);
    setDraft(value === 'auto' ? '' : String(value));
  }

  const commit = (next: ReplyBudgetSetting): void => {
    const clamped = clampReplyBudget(next, mode);
    setDraft(clamped === 'auto' ? '' : String(clamped));
    if (clamped === value) return;
    saveChatSettings({ [field]: clamped });
    updateChatSettings({ [field]: clamped });
  };

  const windowTokens = settings.contextWindowTokens;
  const overflow = typeof value === 'number' && value >= windowTokens
    ? `Fills your whole ${formatTokenCount(windowTokens)} model token window, leaving no room for the song or chat.`
    : '';

  return (
    <>
      <div className="bb-settings-row">
        <label className="bb-settings-label" htmlFor={`${id}-mode`}>{label}</label>
        <div className="bb-settings-control-group">
          <select
            className="bb-settings-select"
            id={`${id}-mode`}
            onChange={(event) => {
              if (event.currentTarget.value === 'auto') commit('auto');
              else commit(autoReplyCeiling(mode, learnedTokenParam(settings.endpoint, settings.model)));
            }}
            value={value === 'auto' ? 'auto' : 'custom'}
          >
            <option value="auto">{autoLabel}</option>
            <option value="custom">Custom</option>
          </select>
          {value !== 'auto' ? (
            <input
              aria-label={`${label} (tokens)`}
              className="bb-settings-number"
              id={id}
              max={bounds.max}
              min={bounds.min}
              onBlur={() => commit(draft.trim() ? Number(draft) : 'auto')}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              title={`${bounds.min.toLocaleString()}–${bounds.max.toLocaleString()} tokens`}
              type="number"
              value={draft}
            />
          ) : null}
        </div>
      </div>
      {overflow ? <div className="bb-settings-inline-warning">{overflow}</div> : null}
    </>
  );
}

function ReasoningEffortField({ settings }: { settings: AISettings }): React.JSX.Element {
  const learned = useStoreValue(learnedRequestParams);
  const [pickingCustom, setPickingCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState(settings.reasoningEffortCustom ?? '');
  const [customDraftFor, setCustomDraftFor] = useState(settings.reasoningEffortCustom);
  const [customError, setCustomError] = useState('');
  if (customDraftFor !== settings.reasoningEffortCustom) {
    setCustomDraftFor(settings.reasoningEffortCustom);
    setCustomDraft(settings.reasoningEffortCustom ?? '');
  }

  const selectValue = pickingCustom ? 'custom' : settings.reasoningEffort;
  const showCustom = selectValue === 'custom';
  const persist = (patch: Pick<ChatSettingsPatch, 'reasoningEffort' | 'reasoningEffortCustom'>): void => {
    saveChatSettings(patch);
    updateChatSettings(patch);
  };

  const commitCustom = (): void => {
    const value = customDraft.trim();
    if (!isValidCustomReasoningEffort(value)) {
      setCustomError('Use 1–32 lowercase letters, digits, "-" or "_".');
      return;
    }
    setCustomError('');
    setPickingCustom(false);
    persist({ reasoningEffort: 'custom', reasoningEffortCustom: value });
  };

  const effectiveNote = describeEffectiveReasoningEffort(
    learned[negotiationKey(settings.endpoint, settings.model)],
    resolveReasoningEffort(settings),
  );
  const options = REASONING_EFFORT_OPTIONS.map((option) => (
    option.value === 'auto' ? { ...option, label: 'Auto (Low)' } : option
  ));

  return (
    <>
      <div className="bb-settings-row">
        <label className="bb-settings-label" htmlFor="bb-ai-reasoning-effort">Reasoning effort</label>
        <div className="bb-settings-control-group">
          <select
            className="bb-settings-select"
            id="bb-ai-reasoning-effort"
            onChange={(event) => {
              const next = event.currentTarget.value as ReasoningEffortSetting;
              setCustomError('');
              if (next === 'custom') {
                if (isValidCustomReasoningEffort(settings.reasoningEffortCustom)) {
                  setPickingCustom(false);
                  persist({ reasoningEffort: 'custom' });
                } else {
                  setPickingCustom(true);
                }
                return;
              }
              setPickingCustom(false);
              persist({ reasoningEffort: next });
            }}
            title="Off can help thinking models on small model windows."
            value={selectValue}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
      {showCustom ? (
        <div className="bb-settings-row">
          <label className="bb-settings-label" htmlFor="bb-ai-reasoning-custom">Custom value</label>
          <div className="bb-settings-control-group">
            <input
              className="bb-settings-text"
              id="bb-ai-reasoning-custom"
              maxLength={32}
              onBlur={commitCustom}
              onChange={(event) => setCustomDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              placeholder="e.g. xhigh"
              type="text"
              value={customDraft}
            />
          </div>
        </div>
      ) : null}
      {customError ? <div className="bb-settings-inline-warning">{customError}</div> : null}
      {effectiveNote ? (
        <NoteText>
          {effectiveNote.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}
        </NoteText>
      ) : null}
    </>
  );
}

export function AdvancedRequestControls({ settings }: { settings: AISettings }): React.JSX.Element {
  const [resetCount, setResetCount] = useState(0);
  const resetToAuto = (): void => {
    resetChatRequestControls();
    setResetCount((count) => count + 1);
  };
  return (
    <details className="bb-settings-advanced">
      <summary className="bb-settings-advanced-summary">Advanced</summary>
      <div className="bb-settings-advanced-body">
        <ReplyBudgetField
          id="bb-ai-edit-reply"
          label="Edit reply budget"
          mode="edit"
          settings={settings}
          value={settings.editReplyTokens}
        />
        <ReplyBudgetField
          id="bb-ai-ask-reply"
          label="Ask reply budget"
          mode="ask"
          settings={settings}
          value={settings.askReplyTokens}
        />
        <NoteText>
          Most tokens the model may write per reply, including hidden reasoning. Auto fits the reply to the room left in
          the model token window.
        </NoteText>
        {/* Remounted on reset so a pending Custom selection and its draft are discarded. */}
        <ReasoningEffortField key={resetCount} settings={settings} />
        <div className="bb-settings-row bb-settings-row--end">
          <button className="bb-settings-btn-secondary" onClick={resetToAuto} type="button">
            Reset to Auto
          </button>
        </div>
      </div>
    </details>
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
          const contextWindowTokens = defaultContextWindowTokens(selected.endpoint, selected.defaultModel);
          saveChatSettings({ endpoint: selected.endpoint, model: selected.defaultModel, contextWindowTokens });
          updateChatSettings({ endpoint: selected.endpoint, model: selected.defaultModel, contextWindowTokens });
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
      <PresetRangeField
        description="How much of the open song is pasted into Ask questions. Characters, not model tokens. Edit always sends the full song and ignores this slider."
        id="bb-ai-max-ctx"
        label="Ask song excerpt"
        onChange={(value) => {
          saveChatSettings({ maxContextChars: value });
          updateChatSettings({ maxContextChars: value });
        }}
        presets={AI_CONTEXT_CHAR_PRESETS}
        value={settings.maxContextChars}
        valueText={`${settings.maxContextChars.toLocaleString()} chars`}
        valueTitle={`${settings.maxContextChars.toLocaleString()} characters of the song in Ask mode`}
      />
      <ContextWindowField
        onChange={(value) => {
          saveChatSettings({ contextWindowTokens: value });
          updateChatSettings({ contextWindowTokens: value });
        }}
        value={settings.contextWindowTokens}
      />
      <NoteText>
        The model’s context size, used for the Copilot footer meter. Match Ollama’s <code>num_ctx</code> or the Context Length you load the model with in LM Studio.{' '}
        <a href={COPILOT_LOCAL_MODELS_URL} rel="noreferrer" target="_blank">Local model setup guide</a>
      </NoteText>
      <AdvancedRequestControls settings={settings} />
      <NoteText>
        Checking a model or provider? Run the{' '}
        <a href={COPILOT_QA_SCENARIOS_URL} rel="noreferrer" target="_blank">Copilot test scenarios</a>
        {' '}(including the local Ollama checks).
      </NoteText>
      <div className="bb-settings-row">
        <span className="bb-settings-label">Prompt recall</span>
        <button
          className="bb-settings-btn-secondary"
          onClick={() => clearChatPromptHistory()}
          title="Forget prompts recalled with ↑/↓ in the Copilot input. Chat sessions are unchanged."
          type="button"
        >
          Clear ↑/↓ prompts
        </button>
      </div>
      <NoteText>
        Copilot remembers submitted prompts for the input field (separate from chat sessions). Use New chat or delete a session in the Copilot header to manage conversations.
      </NoteText>
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
    contextWindowTokens: defaultContextWindowTokens(AI_PROVIDERS.openai.endpoint, AI_PROVIDERS.openai.defaultModel),
    editReplyTokens: 'auto',
    askReplyTokens: 'auto',
    reasoningEffort: 'auto',
    reasoningEffortCustom: undefined,
  });
}
