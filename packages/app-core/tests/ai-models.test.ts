import {
  AI_PROVIDERS,
  CUSTOM_MODEL_VALUE,
  filterChatModels,
  getDefaultAIModel,
  getProviderByEndpoint,
  getProviderSubtitle,
  mergeModelLists,
  providerUsesModelPicker,
  resolveModelSelectValue,
} from '../src/stores/ai-models.js';

describe('ai-models', () => {
  it('defaults to the OpenAI curated default model', () => {
    expect(getDefaultAIModel()).toBe('gpt-5.4-mini');
    expect(AI_PROVIDERS.openai.defaultModel).toBe('gpt-5.4-mini');
    expect(AI_PROVIDERS.openai.models).toContain('gpt-5.4-mini');
  });

  it('maps known endpoints to provider keys', () => {
    expect(getProviderByEndpoint('https://api.openai.com/v1')).toBe('openai');
    expect(getProviderByEndpoint('https://api.groq.com/openai/v1')).toBe('groq');
    expect(getProviderByEndpoint('http://localhost:11434/v1')).toBe('ollama');
    expect(getProviderByEndpoint('https://example.com/v1')).toBe('custom');
    expect(getProviderByEndpoint('')).toBe('openai');
  });

  it('exposes model picker only for remote curated providers', () => {
    expect(providerUsesModelPicker('openai')).toBe(true);
    expect(providerUsesModelPicker('groq')).toBe(true);
    expect(providerUsesModelPicker('ollama')).toBe(false);
    expect(providerUsesModelPicker('custom')).toBe(false);
  });

  it('resolves select value for curated and custom models', () => {
    expect(resolveModelSelectValue('gpt-4.1', 'openai')).toBe('gpt-4.1');
    expect(resolveModelSelectValue('gpt-4o-mini', 'openai')).toBe(CUSTOM_MODEL_VALUE);
    expect(resolveModelSelectValue('llama3.2', 'ollama')).toBe(CUSTOM_MODEL_VALUE);
  });

  it('builds provider subtitles', () => {
    expect(getProviderSubtitle('https://api.openai.com/v1')).toBe('via OpenAI');
    expect(getProviderSubtitle('https://example.com/v1')).toBe('https://example.com/v1');
  });

  it('filters non-chat models and sorts the rest', () => {
    const result = filterChatModels([
      'gpt-4.1',
      'text-embedding-3-small',
      'whisper-large-v3',
      'gpt-4o',
      'dall-e-3',
      'gpt-4o', // duplicate
      '',
    ]);
    expect(result).toEqual(['gpt-4.1', 'gpt-4o']);
  });

  it('merges curated and fetched models, curated first and deduped', () => {
    const result = mergeModelLists(
      ['gpt-5.5', 'gpt-4.1'],
      ['gpt-4.1', 'gpt-4o', 'gpt-5.5'],
    );
    expect(result).toEqual(['gpt-5.5', 'gpt-4.1', 'gpt-4o']);
  });
});
