import {
  currentReplyBudget,
  describeAutoReplyBudget,
  describeEffectiveReasoningEffort,
  learnedRequestParams,
  learnedTokenParam,
  publishReplyBudget,
  recordRequestOutcome,
  resetLearnedRequestParams,
} from '../src/renderer/src/lib/copilot-request-learning';

const OLLAMA = 'http://localhost:11434/v1';

describe('copilot-request-learning', () => {
  afterEach(() => resetLearnedRequestParams());

  it('guesses the token parameter until the main process reports one', () => {
    expect(learnedTokenParam('https://api.openai.com/v1', 'gpt-5.5')).toBe('max_completion_tokens');
    expect(learnedTokenParam(OLLAMA, 'qwen3.5')).toBe('max_tokens');
    recordRequestOutcome(OLLAMA, 'qwen3.5', { level: 'low' }, { tokenParam: 'max_completion_tokens' });
    expect(learnedTokenParam(`${OLLAMA}/`, 'qwen3.5')).toBe('max_completion_tokens');
    expect(learnedTokenParam(OLLAMA, 'llama3')).toBe('max_tokens');
  });

  it('notifies subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = learnedRequestParams.subscribe(listener);
    recordRequestOutcome(OLLAMA, 'qwen3.5', { level: 'low' }, { effectiveReasoningEffort: 'low' });
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('describes a fallback value or an omitted field for the requested level', () => {
    const minimal = { level: 'minimal' as const };
    recordRequestOutcome(OLLAMA, 'qwen3.5', minimal, { effectiveReasoningEffort: 'none' });
    const entry = Object.values(learnedRequestParams.get())[0];
    expect(describeEffectiveReasoningEffort(entry, minimal)).toBe('Sent as `none` for this model');
    expect(describeEffectiveReasoningEffort(entry, { level: 'high' })).toBeUndefined();

    recordRequestOutcome(OLLAMA, 'qwen3.5', minimal, { effectiveReasoningEffort: null });
    expect(describeEffectiveReasoningEffort(Object.values(learnedRequestParams.get())[0], minimal))
      .toBe('This model does not accept reasoning effort');

    recordRequestOutcome(OLLAMA, 'qwen3.5', minimal, { effectiveReasoningEffort: 'minimal' });
    expect(describeEffectiveReasoningEffort(Object.values(learnedRequestParams.get())[0], minimal)).toBeUndefined();
  });

  it('labels Auto with the endpoint ceiling, or the fitted value for the current chat', () => {
    expect(describeAutoReplyBudget('edit', 'https://api.openai.com/v1', 'gpt-5.5', null))
      .toBe('Auto (16,384 for this endpoint)');
    expect(describeAutoReplyBudget('edit', OLLAMA, 'qwen3.5', null)).toBe('Auto (8,192 for this endpoint)');
    expect(describeAutoReplyBudget('ask', OLLAMA, 'qwen3.5', null)).toBe('Auto (2,048 for this endpoint)');

    const fitted = {
      mode: 'edit' as const,
      endpoint: OLLAMA,
      model: 'qwen3.5',
      budget: { tokens: 5200, auto: true, ceiling: 8192, fitted: true },
    };
    expect(describeAutoReplyBudget('edit', OLLAMA, 'qwen3.5', fitted)).toBe('Auto (about 5.2k for this chat)');
    expect(describeAutoReplyBudget('ask', OLLAMA, 'qwen3.5', fitted)).toBe('Auto (2,048 for this endpoint)');
    expect(describeAutoReplyBudget('edit', OLLAMA, 'llama3', fitted)).toBe('Auto (8,192 for this endpoint)');
  });

  it('publishes the meter budget only when it changes', () => {
    const listener = jest.fn();
    const unsubscribe = currentReplyBudget.subscribe(listener);
    const snapshot = {
      mode: 'ask' as const,
      endpoint: OLLAMA,
      model: 'qwen3.5',
      budget: { tokens: 2048, auto: true, ceiling: 2048, fitted: false },
    };
    publishReplyBudget(snapshot);
    publishReplyBudget({ ...snapshot, budget: { ...snapshot.budget } });
    publishReplyBudget({ ...snapshot, budget: { ...snapshot.budget, tokens: 900, fitted: true } });
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentReplyBudget.get()?.budget.tokens).toBe(900);
  });
});
