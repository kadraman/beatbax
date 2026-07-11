/**
 * Curated AI provider and model catalog for BeatBax Copilot (desktop).
 *
 * Single source of truth for provider presets, default models, and
 * per-provider model pickers. Local/custom providers use free-text model entry.
 */

export type AIProviderKey = 'openai' | 'groq' | 'ollama' | 'lmstudio' | 'custom';

export interface AIProviderConfig {
  label: string;
  endpoint: string;
  defaultModel: string;
  /** Curated model IDs. Empty means free-text only (local/custom). */
  models: string[];
}

/** Select value when the user enters a model not in the curated list. */
export const CUSTOM_MODEL_VALUE = '__custom__';

export const AI_PROVIDERS: Record<AIProviderKey, AIProviderConfig> = {
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    // Curated models verified against the OpenAI API catalog (July 2026).
    // gpt-4o / gpt-4o-mini / o3-mini are deprecated and intentionally omitted.
    defaultModel: 'gpt-5.4-mini',
    models: [
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'o3',
    ],
  },
  groq: {
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    // Groq production text models (July 2026). The llama-3.x models are
    // scheduled for shutdown (2026-08-16) and are intentionally omitted.
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
  },
  ollama: {
    label: 'Ollama (local)',
    endpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    models: [],
  },
  lmstudio: {
    label: 'LM Studio (local)',
    endpoint: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    models: [],
  },
  custom: {
    label: 'Custom',
    endpoint: '',
    defaultModel: '',
    models: [],
  },
};

export const AI_PROVIDER_OPTIONS: Array<{ value: AIProviderKey; label: string }> = [
  { value: 'openai', label: AI_PROVIDERS.openai.label },
  { value: 'groq', label: AI_PROVIDERS.groq.label },
  { value: 'ollama', label: AI_PROVIDERS.ollama.label },
  { value: 'lmstudio', label: AI_PROVIDERS.lmstudio.label },
  { value: 'custom', label: AI_PROVIDERS.custom.label },
];

/** Default model for new Copilot installations (OpenAI preset). */
export function getDefaultAIModel(): string {
  return AI_PROVIDERS.openai.defaultModel;
}

/** Map a stored endpoint URL to a provider preset key. */
export function getProviderByEndpoint(endpoint: string): AIProviderKey {
  const trimmed = endpoint.trim();
  for (const [key, config] of Object.entries(AI_PROVIDERS)) {
    if (key === 'custom') continue;
    if (trimmed === config.endpoint) return key as AIProviderKey;
  }
  return trimmed ? 'custom' : 'openai';
}

export function getProviderConfig(key: AIProviderKey): AIProviderConfig {
  return AI_PROVIDERS[key];
}

/** Curated models for a provider preset. Empty for local/custom providers. */
export function getModelsForProvider(key: AIProviderKey): string[] {
  return AI_PROVIDERS[key].models;
}

/** Whether the provider exposes a curated model dropdown (vs free-text only). */
export function providerUsesModelPicker(key: AIProviderKey): boolean {
  return AI_PROVIDERS[key].models.length > 0;
}

/**
 * Resolve the model `<select>` value for the current stored model.
 * Returns a curated model id or {@link CUSTOM_MODEL_VALUE}.
 */
export function resolveModelSelectValue(model: string, providerKey: AIProviderKey): string {
  const curated = AI_PROVIDERS[providerKey].models;
  if (curated.length === 0) return CUSTOM_MODEL_VALUE;
  return curated.includes(model) ? model : CUSTOM_MODEL_VALUE;
}

/**
 * Model-ID substrings for non-chat models (embeddings, audio, images, etc.).
 * Used to keep live-fetched provider lists focused on chat-capable models.
 */
const NON_CHAT_MODEL_KEYWORDS = [
  'embedding',
  'whisper',
  'tts',
  'dall-e',
  'audio',
  'transcribe',
  'realtime',
  'moderation',
  'image',
  'search',
  'rerank',
  'guard',
];

/** Filter a raw model-ID list down to likely chat models, sorted and deduped. */
export function filterChatModels(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    const lower = id.toLowerCase();
    if (NON_CHAT_MODEL_KEYWORDS.some((keyword) => lower.includes(keyword))) continue;
    seen.add(id);
    result.push(id);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

/**
 * Merge curated models with live-fetched models. Curated entries appear first
 * (preserving their recommended order); fetched-only models follow, deduped.
 */
export function mergeModelLists(curated: string[], fetched: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of [...curated, ...fetched]) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Subtitle shown in the Copilot panel header (e.g. "via OpenAI"). */
export function getProviderSubtitle(endpoint: string): string {
  const key = getProviderByEndpoint(endpoint);
  const config = AI_PROVIDERS[key];
  if (key === 'custom') return endpoint.trim() || 'Custom endpoint';
  return `via ${config.label}`;
}
