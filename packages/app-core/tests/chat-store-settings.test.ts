type ChatStoreModule = typeof import('../src/stores/chat.store.js');

const SETTINGS_KEY = 'beatbax:ai.settings';

function loadStoreWith(saved: unknown): ChatStoreModule {
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
  let store: ChatStoreModule | undefined;
  jest.isolateModules(() => {
    store = require('../src/stores/chat.store.js') as ChatStoreModule;
  });
  return store!;
}

describe('AI request control settings', () => {
  afterEach(() => localStorage.clear());

  it('loads legacy settings without the new fields as Auto', () => {
    const store = loadStoreWith({
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen3.5',
      maxContextChars: 12000,
      contextWindowTokens: 16384,
    });
    expect(store.chatSettings.get()).toMatchObject({
      editReplyTokens: 'auto',
      askReplyTokens: 'auto',
      reasoningEffort: 'auto',
    });
  });

  it('round-trips explicit values and never persists the API key', () => {
    const store = loadStoreWith({
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      editReplyTokens: 24576,
      askReplyTokens: 4096,
      reasoningEffort: 'custom',
      reasoningEffortCustom: 'xhigh',
    });
    expect(store.chatSettings.get()).toMatchObject({
      editReplyTokens: 24576,
      askReplyTokens: 4096,
      reasoningEffort: 'custom',
      reasoningEffortCustom: 'xhigh',
    });
    store.updateChatSettings({ apiKey: 'sk-secret', reasoningEffort: 'medium' });
    const persisted = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    expect(persisted).not.toHaveProperty('apiKey');
    expect(persisted.reasoningEffort).toBe('medium');
  });

  it('falls back to Auto for an invalid Custom value or unknown level', () => {
    expect(loadStoreWith({ reasoningEffort: 'custom', reasoningEffortCustom: 'Not Valid!' })
      .chatSettings.get().reasoningEffort).toBe('auto');
    expect(loadStoreWith({ reasoningEffort: 'turbo' }).chatSettings.get().reasoningEffort).toBe('auto');
  });

  it('clamps explicit budgets to the documented bounds', () => {
    const store = loadStoreWith({ editReplyTokens: 100, askReplyTokens: 999_999 });
    expect(store.chatSettings.get().editReplyTokens).toBe(2048);
    expect(store.chatSettings.get().askReplyTokens).toBe(16384);
    store.updateChatSettings({ editReplyTokens: 70_000.4 });
    expect(store.chatSettings.get().editReplyTokens).toBe(65536);
    expect(store.clampReplyBudget('auto', 'ask')).toBe('auto');
  });

  it('Reset to Auto restores all three controls', () => {
    const store = loadStoreWith({ editReplyTokens: 4096, askReplyTokens: 1024, reasoningEffort: 'high' });
    store.resetChatRequestControls();
    expect(store.chatSettings.get()).toMatchObject({
      editReplyTokens: 'auto',
      askReplyTokens: 'auto',
      reasoningEffort: 'auto',
    });
  });
});
