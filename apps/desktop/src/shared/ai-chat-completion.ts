import type { AIChatCompletionResult, AIChatCompletionUsage, AITokenParam } from './electron-api';

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function readReasoningTokens(record: Record<string, unknown>): number | undefined {
  if (record.reasoningTokens !== undefined) return asFiniteNumber(record.reasoningTokens);
  const details = record.completion_tokens_details ?? record.completionTokensDetails;
  if (!details || typeof details !== 'object') return undefined;
  const detailRecord = details as Record<string, unknown>;
  return asFiniteNumber(detailRecord.reasoning_tokens ?? detailRecord.reasoningTokens);
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
  const reasoningTokens = readReasoningTokens(record);
  return reasoningTokens === undefined
    ? { promptTokens: prompt, completionTokens: completion, totalTokens }
    : { promptTokens: prompt, completionTokens: completion, totalTokens, reasoningTokens };
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Parse a `/chat/completions` JSON body into content, usage and stop signals. */
export function parseAIChatCompletionResponse(data: unknown): AIChatCompletionResult {
  const record = data as {
    choices?: Array<{
      finish_reason?: unknown;
      message?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
    }>;
  } | null;
  const choice = record?.choices?.[0];
  const content = choice?.message?.content;
  const result: AIChatCompletionResult = {
    content: typeof content === 'string' && content.length > 0 ? content : '',
    usage: parseAIChatUsage(data),
  };
  if (typeof choice?.finish_reason === 'string' && choice.finish_reason) {
    result.finishReason = choice.finish_reason;
  }
  if (nonEmptyString(choice?.message?.reasoning) || nonEmptyString(choice?.message?.reasoning_content)) {
    result.reasoningPresent = true;
  }
  return result;
}

/** True when the model returned no usable text (internal sentinel must not be shown in chat). */
export function isEmptyAIChatContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length === 0 || trimmed === '(no response)';
}

/** User-facing assistant text; never surfaces the internal empty-response sentinel. */
export function formatAssistantChatContent(content: string): string {
  if (isEmptyAIChatContent(content)) {
    return 'Copilot returned an empty response. The editor was not changed.';
  }
  return content;
}

function isTokenParam(value: unknown): value is AITokenParam {
  return value === 'max_tokens' || value === 'max_completion_tokens';
}

/** Accept either the new result object or a legacy content string. */
export function normalizeAIChatCompletionResult(value: unknown): AIChatCompletionResult {
  if (typeof value === 'string') {
    return { content: value.length > 0 ? value : '' };
  }
  if (value && typeof value === 'object' && 'content' in value) {
    const record = value as {
      content?: unknown;
      usage?: unknown;
      finishReason?: unknown;
      reasoningPresent?: unknown;
      effectiveReasoningEffort?: unknown;
      tokenParam?: unknown;
    };
    const content = typeof record.content === 'string' && record.content.length > 0
      ? record.content
      : '';
    const usage = parseAIChatUsage({ usage: record.usage });
    const result: AIChatCompletionResult = { content, usage };
    if (typeof record.finishReason === 'string' && record.finishReason) {
      result.finishReason = record.finishReason;
    }
    if (record.reasoningPresent === true) result.reasoningPresent = true;
    const effort = record.effectiveReasoningEffort;
    if (typeof effort === 'string') result.effectiveReasoningEffort = effort;
    else if (effort === null) result.effectiveReasoningEffort = null;
    if (isTokenParam(record.tokenParam)) result.tokenParam = record.tokenParam;
    return result;
  }
  return { content: '' };
}
