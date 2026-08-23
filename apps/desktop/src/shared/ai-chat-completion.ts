import type { AIChatCompletionResult, AIChatCompletionUsage } from './electron-api';

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

/** Read OpenAI-compatible `usage` (snake_case or camelCase) from a chat completion body. */
export function parseAIChatUsage(data: unknown): AIChatCompletionUsage | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const usage = (data as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const record = usage as Record<string, unknown>;
  const promptTokens = asFiniteNumber(record.prompt_tokens ?? record.promptTokens);
  const completionTokens = asFiniteNumber(record.completion_tokens ?? record.completionTokens);
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  const totalTokens = asFiniteNumber(record.total_tokens ?? record.totalTokens) ?? prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens };
}

/** Parse a `/chat/completions` JSON body into content + optional usage. */
export function parseAIChatCompletionResponse(data: unknown): AIChatCompletionResult {
  const record = data as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const content = record?.choices?.[0]?.message?.content;
  return {
    content: typeof content === 'string' && content.length > 0 ? content : '(no response)',
    usage: parseAIChatUsage(data),
  };
}

/** Accept either the new result object or a legacy content string. */
export function normalizeAIChatCompletionResult(value: unknown): AIChatCompletionResult {
  if (typeof value === 'string') {
    return { content: value.length > 0 ? value : '(no response)' };
  }
  if (value && typeof value === 'object' && 'content' in value) {
    const record = value as { content?: unknown; usage?: unknown };
    const content = typeof record.content === 'string' && record.content.length > 0
      ? record.content
      : '(no response)';
    const usage = parseAIChatUsage({ usage: record.usage }) ?? (
      record.usage && typeof record.usage === 'object'
        ? parseAIChatUsage({ usage: {
          prompt_tokens: (record.usage as AIChatCompletionUsage).promptTokens,
          completion_tokens: (record.usage as AIChatCompletionUsage).completionTokens,
          total_tokens: (record.usage as AIChatCompletionUsage).totalTokens,
        } })
        : undefined
    );
    return { content, usage };
  }
  return { content: '(no response)' };
}
