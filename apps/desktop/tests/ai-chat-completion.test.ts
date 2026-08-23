import {
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
    expect(parseAIChatCompletionResponse({})).toEqual({ content: '(no response)' });
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
});
