import {
  formatAssistantChatContent,
  isEmptyAIChatContent,
  normalizeAIChatCompletionResult,
  parseAIChatCompletionResponse,
  parseAIChatUsage,
} from '../src/shared/ai-chat-completion';

describe('parseAIChatUsage', () => {
  it('reads OpenAI snake_case usage', () => {
    expect(parseAIChatUsage({
      usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280 },
    })).toEqual({ promptTokens: 1200, completionTokens: 80, totalTokens: 1280 });
  });

  it('reads camelCase usage and fills total when omitted', () => {
    expect(parseAIChatUsage({
      usage: { promptTokens: 10, completionTokens: 4 },
    })).toEqual({ promptTokens: 10, completionTokens: 4, totalTokens: 14 });
  });

  it('returns undefined when usage is missing', () => {
    expect(parseAIChatUsage({ choices: [] })).toBeUndefined();
  });

  it('reads reasoning tokens from completion_tokens_details', () => {
    expect(parseAIChatUsage({
      usage: {
        prompt_tokens: 12000,
        completion_tokens: 8192,
        total_tokens: 20192,
        completion_tokens_details: { reasoning_tokens: 8192 },
      },
    })).toEqual({ promptTokens: 12000, completionTokens: 8192, totalTokens: 20192, reasoningTokens: 8192 });
  });

  it('omits reasoning tokens when the provider does not report them', () => {
    expect(parseAIChatUsage({
      usage: { prompt_tokens: 1, completion_tokens: 1, completion_tokens_details: {} },
    })).not.toHaveProperty('reasoningTokens');
  });
});

describe('parseAIChatCompletionResponse', () => {
  it('returns content and usage from a chat completion body', () => {
    expect(parseAIChatCompletionResponse({
      choices: [{ message: { content: 'hello' } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    })).toEqual({
      content: 'hello',
      usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
    });
  });

  it('falls back when content is empty', () => {
    expect(parseAIChatCompletionResponse({})).toEqual({ content: '' });
  });

  it('reads finish_reason and reasoning presence', () => {
    const result = parseAIChatCompletionResponse({
      choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'thinking…' } }],
    });
    expect(result.finishReason).toBe('length');
    expect(result.reasoningPresent).toBe(true);
  });

  it('accepts the `reasoning` field name', () => {
    const result = parseAIChatCompletionResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'ok', reasoning: 'x' } }],
    });
    expect(result.reasoningPresent).toBe(true);
  });

  it('leaves stop signals undefined when absent or empty', () => {
    const result = parseAIChatCompletionResponse({
      choices: [{ message: { content: 'ok', reasoning: '   ' } }],
    });
    expect(result.finishReason).toBeUndefined();
    expect(result.reasoningPresent).toBeUndefined();
  });
});

describe('normalizeAIChatCompletionResult', () => {
  it('accepts a legacy content string', () => {
    expect(normalizeAIChatCompletionResult('legacy')).toEqual({ content: 'legacy' });
  });

  it('accepts the new result object', () => {
    expect(normalizeAIChatCompletionResult({
      content: 'ok',
      usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
    })).toEqual({
      content: 'ok',
      usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
    });
  });

  it('carries stop signals and negotiation results through IPC', () => {
    expect(normalizeAIChatCompletionResult({
      content: '',
      usage: { promptTokens: 3, completionTokens: 8, totalTokens: 11, reasoningTokens: 8 },
      finishReason: 'length',
      reasoningPresent: true,
      effectiveReasoningEffort: null,
      tokenParam: 'max_completion_tokens',
    })).toEqual({
      content: '',
      usage: { promptTokens: 3, completionTokens: 8, totalTokens: 11, reasoningTokens: 8 },
      finishReason: 'length',
      reasoningPresent: true,
      effectiveReasoningEffort: null,
      tokenParam: 'max_completion_tokens',
    });
  });
});

describe('formatAssistantChatContent', () => {
  it('replaces empty internal responses with a user-facing message', () => {
    expect(formatAssistantChatContent('')).toBe(
      'Copilot returned an empty response. The editor was not changed.',
    );
    expect(formatAssistantChatContent('(no response)')).toBe(
      'Copilot returned an empty response. The editor was not changed.',
    );
    expect(isEmptyAIChatContent('(no response)')).toBe(true);
  });
});
