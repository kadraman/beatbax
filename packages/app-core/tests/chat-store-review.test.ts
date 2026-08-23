import {
  chatHistory,
  resolveStuckPendingAppliedEdits,
  type ChatMessage,
} from '../src/stores/chat.store.js';

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, 'role' | 'content'>): ChatMessage {
  return {
    timestamp: partial.timestamp ?? new Date().toISOString(),
    ...partial,
  };
}

describe('resolveStuckPendingAppliedEdits', () => {
  afterEach(() => {
    chatHistory.set([]);
  });

  it('marks all pending applied edits as kept by default', () => {
    chatHistory.set([
      msg({ role: 'user', content: 'edit drums' }),
      msg({
        role: 'assistant',
        content: 'song',
        applied: true,
        applyOutcome: 'pending',
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
      msg({
        role: 'assistant',
        content: 'song2',
        applied: true,
        applyOutcome: 'pending',
        timestamp: '2026-01-01T00:00:01.000Z',
      }),
    ]);

    expect(resolveStuckPendingAppliedEdits()).toBe(2);
    expect(chatHistory.get().filter((m) => m.applyOutcome === 'pending')).toHaveLength(0);
    expect(chatHistory.get().filter((m) => m.applyOutcome === 'kept')).toHaveLength(2);
  });

  it('returns 0 when nothing is pending', () => {
    chatHistory.set([
      msg({ role: 'assistant', content: 'song', applied: true, applyOutcome: 'kept' }),
    ]);
    expect(resolveStuckPendingAppliedEdits()).toBe(0);
  });
});
