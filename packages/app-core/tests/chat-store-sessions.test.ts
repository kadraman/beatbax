import {
  addCopilotSessionUsage,
  chatHistory,
  clearChatHistory,
  copilotSessions,
  createCopilotSession,
  deleteCopilotSession,
  activeCopilotSessionId,
  getActiveCopilotSession,
  pushChatMessage,
  switchCopilotSession,
  titleFromMessages,
  type ChatMessage,
} from '../src/stores/chat.store.js';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  return {
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  };
}

describe('Copilot sessions', () => {
  afterEach(() => {
    while (copilotSessions.get().length > 1) {
      const extra = copilotSessions.get().find((session) => session.id !== activeCopilotSessionId.get())
        ?? copilotSessions.get()[1];
      deleteCopilotSession(extra.id);
    }
    clearChatHistory();
  });

  it('titles a session from the first user prompt', () => {
    expect(titleFromMessages([
      msg({ role: 'user', content: 'Make the drums louder please' }),
    ])).toBe('Make the drums louder please');
    expect(titleFromMessages([
      msg({ role: 'user', content: 'x'.repeat(80) }),
    ]).endsWith('…')).toBe(true);
  });

  it('creates a new session and switches without losing the previous transcript', () => {
    pushChatMessage('user', 'first song edit');
    const firstId = activeCopilotSessionId.get();
    const secondId = createCopilotSession({ songHint: 'sample.bax' });
    expect(secondId).not.toBe(firstId);
    expect(chatHistory.get()).toEqual([]);
    expect(getActiveCopilotSession()?.songHint).toBe('sample.bax');

    switchCopilotSession(firstId);
    expect(chatHistory.get().some((message) => message.content === 'first song edit')).toBe(true);
  });

  it('reuses an empty current session instead of spawning duplicates', () => {
    const id = activeCopilotSessionId.get();
    expect(createCopilotSession()).toBe(id);
    expect(copilotSessions.get()).toHaveLength(1);
  });

  it('accumulates session token totals', () => {
    addCopilotSessionUsage({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });
    addCopilotSessionUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(getActiveCopilotSession()?.tokenTotals).toEqual({ prompt: 110, completion: 25 });
  });

  it('clearing chat wipes the active session messages', () => {
    pushChatMessage('user', 'hello');
    clearChatHistory();
    expect(chatHistory.get()).toEqual([]);
    expect(getActiveCopilotSession()?.tokenTotals).toEqual({ prompt: 0, completion: 0 });
  });
});
