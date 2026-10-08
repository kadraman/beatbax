import type { AIChatCompletionRequest } from '../src/shared/electron-api';
import {
  MAX_CHAT_ATTEMPTS,
  REASONING_EFFORT_FALLBACKS,
  chatTimeoutMs,
  createNegotiationCache,
  createNegotiationState,
  isReasoningEffortRejection,
  isReplyBudgetTooLarge,
  negotiateChatCompletion,
  negotiationKey,
  nextReasoningEffortValue,
  reasoningEffortCandidates,
  usesCompletionTokensParam,
  type ChatAttemptResponse,
} from '../src/shared/ai-request-negotiation';

const OK: ChatAttemptResponse = { ok: true, status: 200, data: { choices: [{ message: { content: 'ok' } }] } };

function rejection(message: string): ChatAttemptResponse {
  return { ok: false, status: 400, text: JSON.stringify({ error: { message } }) };
}

function request(partial: Partial<AIChatCompletionRequest> = {}): AIChatCompletionRequest {
  return {
    endpoint: 'http://localhost:11434/v1',
    apiKey: '',
    model: 'qwen3.5',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.7,
    maxTokens: 8192,
    reasoningEffort: { level: 'low' },
    ...partial,
  };
}

/** Simulated server: rejects listed reasoning values and (optionally) temperature. */
function simulatedServer(options: {
  rejectReasoning?: (value: string) => boolean;
  rejectTemperature?: boolean;
  requireCompletionTokens?: boolean;
}) {
  const bodies: Array<Record<string, unknown>> = [];
  const send = async (body: Record<string, unknown>): Promise<ChatAttemptResponse> => {
    bodies.push(body);
    const effort = body.reasoning_effort;
    if (typeof effort === 'string' && options.rejectReasoning?.(effort)) {
      return rejection(`Invalid value '${effort}' for reasoning_effort`);
    }
    if (options.rejectTemperature && 'temperature' in body) {
      return rejection("Unsupported value: 'temperature' does not support 0.7 with this model.");
    }
    if (options.requireCompletionTokens && 'max_tokens' in body) {
      return rejection("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.");
    }
    return OK;
  };
  return { bodies, send };
}

describe('reasoning effort fallbacks', () => {
  it('follows the FR-009 order for each level', () => {
    expect(REASONING_EFFORT_FALLBACKS).toEqual({
      off: ['none', 'minimal', 'low'],
      minimal: ['minimal', 'none', 'low'],
      low: ['low'],
      medium: ['medium'],
      high: ['high', 'max'],
    });
  });

  it('skips rejected values and omits the field when the list is exhausted', () => {
    const off = { level: 'off' as const };
    expect(nextReasoningEffortValue(off, new Set())).toBe('none');
    expect(nextReasoningEffortValue(off, new Set(['none']))).toBe('minimal');
    expect(nextReasoningEffortValue(off, new Set(['none', 'minimal', 'low']))).toBeNull();
  });

  it('gives Custom no fallback and ignores invalid custom values', () => {
    expect(reasoningEffortCandidates({ level: 'custom', value: 'xhigh' })).toEqual(['xhigh']);
    expect(reasoningEffortCandidates({ level: 'custom', value: 'Bad Value' })).toEqual([]);
    expect(nextReasoningEffortValue({ level: 'custom', value: 'xhigh' }, new Set(['xhigh']))).toBeNull();
  });

  it('never sends the field for provider default (no request)', () => {
    expect(nextReasoningEffortValue(undefined, new Set())).toBeNull();
  });
});

describe('isReasoningEffortRejection', () => {
  it('matches reasoning / think wording on HTTP 400 only', () => {
    expect(isReasoningEffortRejection(400, JSON.stringify({ error: { message: "Unrecognized request argument supplied: reasoning_effort" } }))).toBe(true);
    expect(isReasoningEffortRejection(400, 'model does not support Thinking')).toBe(true);
    expect(isReasoningEffortRejection(500, 'reasoning failed')).toBe(false);
    expect(isReasoningEffortRejection(400, JSON.stringify({ error: { message: 'temperature unsupported' } }))).toBe(false);
  });
});

describe('isReplyBudgetTooLarge', () => {
  it('recognises max-output rejections only', () => {
    expect(isReplyBudgetTooLarge(400, 'max_tokens is too large: 65536. This model supports at most 16384 completion tokens')).toBe(true);
    expect(isReplyBudgetTooLarge(400, "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.")).toBe(false);
    expect(isReplyBudgetTooLarge(500, 'max_tokens is too large')).toBe(false);
  });
});

describe('negotiationKey', () => {
  it('ignores path and trailing slash and keys by model', () => {
    expect(negotiationKey('https://api.openai.com/v1/', 'gpt-5.5')).toBe(negotiationKey('https://api.openai.com', 'gpt-5.5'));
    expect(negotiationKey('https://api.openai.com/v1', 'gpt-5.5')).not.toBe(negotiationKey('https://api.openai.com/v1', 'gpt-4o'));
    expect(negotiationKey('http://localhost:11434/v1', 'm')).not.toBe(negotiationKey('http://localhost:1234/v1', 'm'));
  });
});

describe('usesCompletionTokensParam', () => {
  it('guesses max_completion_tokens only for openai.com hosts', () => {
    expect(usesCompletionTokensParam('https://api.openai.com/v1')).toBe(true);
    expect(usesCompletionTokensParam('https://openai.com/v1')).toBe(true);
    expect(usesCompletionTokensParam('https://API.OpenAI.com:8443/v1')).toBe(true);
    expect(usesCompletionTokensParam('https://notopenai.com/v1')).toBe(false);
    expect(usesCompletionTokensParam('https://api.notopenai.com/v1')).toBe(false);
    expect(usesCompletionTokensParam('https://openai.com.example.net/v1')).toBe(false);
    expect(usesCompletionTokensParam('https://api.groq.com/openai/v1')).toBe(false);
    expect(usesCompletionTokensParam('not a url')).toBe(false);
  });
});

describe('chatTimeoutMs', () => {
  it('keeps today’s minimums and scales with the budget up to 10 minutes', () => {
    expect(chatTimeoutMs({ local: false, mode: 'ask', maxTokens: 2048 })).toBe(60_000);
    expect(chatTimeoutMs({ local: false, mode: 'ask', maxTokens: 16384 })).toBe(120_000);
    expect(chatTimeoutMs({ local: false, mode: 'edit', maxTokens: 8192 })).toBe(120_000);
    expect(chatTimeoutMs({ local: false, mode: 'edit', maxTokens: 16384 })).toBe(120_000);
    expect(chatTimeoutMs({ local: false, mode: 'edit', maxTokens: 24576 })).toBe(180_000);
    expect(chatTimeoutMs({ local: false, mode: 'edit', maxTokens: 65536 })).toBe(480_000);
    expect(chatTimeoutMs({ local: true, mode: 'ask', maxTokens: 2048 })).toBe(300_000);
    expect(chatTimeoutMs({ local: true, mode: 'edit', maxTokens: 65536 })).toBe(480_000);
  });

  it('gives an explicit 2,048-token Edit budget the Edit minimum, not the Ask one', () => {
    expect(chatTimeoutMs({ local: false, mode: 'edit', maxTokens: 2048 })).toBe(120_000);
  });

  it('uses the longer Edit minimum when the mode is missing', () => {
    expect(chatTimeoutMs({ local: false, maxTokens: 2048 })).toBe(120_000);
  });
});

describe('negotiateChatCompletion', () => {
  it('SC-004: Auto OpenAI body matches the previous request shape', async () => {
    const server = simulatedServer({});
    const result = await negotiateChatCompletion(
      request({ endpoint: 'https://api.openai.com/v1', model: 'gpt-5.5', maxTokens: 16384 }),
      createNegotiationState(),
      server.send,
    );
    expect(result).toMatchObject({ ok: true, effectiveReasoningEffort: 'low', tokenParam: 'max_completion_tokens' });
    expect(server.bodies).toEqual([{
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      max_completion_tokens: 16384,
      temperature: 0.7,
      reasoning_effort: 'low',
    }]);
  });

  it('SC-004: other endpoints only gain reasoning_effort "low"', async () => {
    const server = simulatedServer({});
    await negotiateChatCompletion(request(), createNegotiationState(), server.send);
    expect(server.bodies[0]).toEqual({
      model: 'qwen3.5',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
      max_tokens: 8192,
      temperature: 0.7,
      reasoning_effort: 'low',
    });
  });

  it('omits reasoning_effort for provider default', async () => {
    const server = simulatedServer({});
    await negotiateChatCompletion(request({ reasoningEffort: undefined }), createNegotiationState(), server.send);
    expect(server.bodies[0]).not.toHaveProperty('reasoning_effort');
  });

  it('SC-005a: server rejecting `none` resolves Off to `minimal`, then sends it directly', async () => {
    const server = simulatedServer({ rejectReasoning: (value) => value === 'none' });
    const state = createNegotiationState();
    const first = await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), state, server.send);
    expect(first).toMatchObject({ ok: true, effectiveReasoningEffort: 'minimal' });
    expect(server.bodies.map((body) => body.reasoning_effort)).toEqual(['none', 'minimal']);

    server.bodies.length = 0;
    await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), state, server.send);
    expect(server.bodies.map((body) => body.reasoning_effort)).toEqual(['minimal']);
  });

  it('SC-005b: server rejecting `minimal` resolves Minimal to `none`, then sends it directly', async () => {
    const server = simulatedServer({ rejectReasoning: (value) => value === 'minimal' });
    const state = createNegotiationState();
    const first = await negotiateChatCompletion(request({ reasoningEffort: { level: 'minimal' } }), state, server.send);
    expect(first).toMatchObject({ ok: true, effectiveReasoningEffort: 'none' });

    server.bodies.length = 0;
    await negotiateChatCompletion(request({ reasoningEffort: { level: 'minimal' } }), state, server.send);
    expect(server.bodies.map((body) => body.reasoning_effort)).toEqual(['none']);
  });

  it('SC-005c: server rejecting every value omits the field, then omits it directly', async () => {
    const server = simulatedServer({ rejectReasoning: () => true });
    const state = createNegotiationState();
    const first = await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), state, server.send);
    expect(first).toMatchObject({ ok: true, effectiveReasoningEffort: null });
    expect(server.bodies.map((body) => body.reasoning_effort)).toEqual(['none', 'minimal', 'low', undefined]);

    server.bodies.length = 0;
    await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), state, server.send);
    expect(server.bodies).toHaveLength(1);
    expect(server.bodies[0]).not.toHaveProperty('reasoning_effort');
  });

  it('re-uses learned rejections when switching levels', async () => {
    const server = simulatedServer({ rejectReasoning: (value) => value === 'none' });
    const state = createNegotiationState();
    await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), state, server.send);
    server.bodies.length = 0;
    await negotiateChatCompletion(request({ reasoningEffort: { level: 'minimal' } }), state, server.send);
    expect(server.bodies.map((body) => body.reasoning_effort)).toEqual(['minimal']);
  });

  it('SC-003: temperature rejection is cached for the next request', async () => {
    const server = simulatedServer({ rejectTemperature: true });
    const state = createNegotiationState();
    await negotiateChatCompletion(request({ endpoint: 'https://api.openai.com/v1' }), state, server.send);
    expect(server.bodies).toHaveLength(2);
    server.bodies.length = 0;
    await negotiateChatCompletion(request({ endpoint: 'https://api.openai.com/v1' }), state, server.send);
    expect(server.bodies).toHaveLength(1);
    expect(server.bodies[0]).not.toHaveProperty('temperature');
  });

  it('learns the token parameter but keeps the turn\'s reply budget on the retry', async () => {
    const server = simulatedServer({ requireCompletionTokens: true });
    const state = createNegotiationState();
    const result = await negotiateChatCompletion(request({ maxTokens: 8192 }), state, server.send);
    expect(result).toMatchObject({ ok: true, tokenParam: 'max_completion_tokens' });
    expect(server.bodies[0]).toMatchObject({ max_tokens: 8192 });
    expect(server.bodies[1]).toMatchObject({ max_completion_tokens: 8192 });
    expect(server.bodies[1]).not.toHaveProperty('max_tokens');
    expect(state.tokenParam).toBe('max_completion_tokens');
  });

  it('returns non-parameter failures without retrying', async () => {
    const send = jest.fn(async () => ({ ok: false, status: 400, text: '{"error":{"message":"context length exceeded"}}' }));
    const result = await negotiateChatCompletion(request(), createNegotiationState(), send);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not flip token parameters on a max-output rejection that says unsupported', async () => {
    const send = jest.fn(async () => rejection('max_completion_tokens is unsupported above the maximum of 16384'));
    const state = createNegotiationState();
    const result = await negotiateChatCompletion(
      request({ endpoint: 'https://api.openai.com/v1', reasoningEffort: undefined, temperature: undefined }),
      state,
      send,
    );
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.tokenParam).toBeUndefined();
  });

  it('does not switch to max_completion_tokens on a max-output rejection that names it', async () => {
    const send = jest.fn(async () => rejection('max_tokens exceeds the maximum; max_completion_tokens must be at most 16384'));
    const state = createNegotiationState();
    const result = await negotiateChatCompletion(request({ reasoningEffort: undefined, temperature: undefined }), state, send);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.tokenParam).toBeUndefined();
  });

  it('caps attempts at 6', async () => {
    const send = jest.fn(async () => rejection('reasoning and temperature and max_completion_tokens unsupported'));
    // The token parameter flips on every reply, so each attempt adapts something.
    const result = await negotiateChatCompletion(request({ reasoningEffort: { level: 'off' } }), createNegotiationState(), send);
    expect(result.ok).toBe(false);
    expect(send).toHaveBeenCalledTimes(MAX_CHAT_ATTEMPTS);
  });
});

describe('createNegotiationCache', () => {
  it('returns one live state per endpoint origin and model', () => {
    const cache = createNegotiationCache();
    const state = cache.stateFor('https://api.openai.com/v1', 'gpt-5.5');
    expect(cache.stateFor('https://api.openai.com/v1/', 'gpt-5.5')).toBe(state);
    expect(cache.stateFor('https://api.openai.com/v1', 'gpt-4o')).not.toBe(state);
    cache.clear();
    expect(cache.stateFor('https://api.openai.com/v1', 'gpt-5.5')).not.toBe(state);
  });

  it('SC-003 / FR-011: the second request to a model skips every learned rejection', async () => {
    const cache = createNegotiationCache();
    const server = simulatedServer({
      rejectTemperature: true,
      requireCompletionTokens: true,
      rejectReasoning: (value) => value === 'none',
    });
    const first = request({ endpoint: 'https://proxy.example/v1', reasoningEffort: { level: 'off' } });
    await negotiateChatCompletion(first, cache.stateFor(first.endpoint, first.model), server.send);
    expect(server.bodies.length).toBeGreaterThan(1);

    server.bodies.length = 0;
    await negotiateChatCompletion(first, cache.stateFor(first.endpoint, first.model), server.send);
    expect(server.bodies).toHaveLength(1);
    expect(server.bodies[0]).not.toHaveProperty('temperature');
    expect(server.bodies[0]).not.toHaveProperty('max_tokens');
    expect(server.bodies[0]).toMatchObject({ max_completion_tokens: 8192, reasoning_effort: 'minimal' });

    server.bodies.length = 0;
    const otherModel = { ...first, model: 'qwen3.6' };
    await negotiateChatCompletion(otherModel, cache.stateFor(otherModel.endpoint, otherModel.model), server.send);
    expect(server.bodies[0]).toHaveProperty('temperature');
    expect(server.bodies[0]).toMatchObject({ reasoning_effort: 'none' });
  });
});
