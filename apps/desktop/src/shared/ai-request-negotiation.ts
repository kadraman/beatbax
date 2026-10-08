/**
 * Provider-generic chat-completion parameter negotiation (spec 088).
 *
 * Copilot keeps one set of reasoning-effort levels, sends them only as the
 * string field `reasoning_effort`, and learns from HTTP 400 replies which
 * values, temperature and token-limit parameter each endpoint + model accepts.
 * Endpoint detection is only the first guess for the token parameter.
 */
import type {
  AIChatCompletionRequest,
  AIChatMode,
  AITokenParam,
  ReasoningEffortLevel,
  ReasoningEffortRequest,
} from './electron-api';

export type { ReasoningEffortLevel, ReasoningEffortRequest };

/** FR-009: exact value, nearest cheaper, nearest more expensive; then omit. */
export const REASONING_EFFORT_FALLBACKS: Readonly<Record<Exclude<ReasoningEffortLevel, 'custom'>, readonly string[]>> = {
  off: ['none', 'minimal', 'low'],
  minimal: ['minimal', 'none', 'low'],
  low: ['low'],
  medium: ['medium'],
  high: ['high', 'max'],
};

export const CUSTOM_REASONING_EFFORT_PATTERN = /^[a-z0-9_-]{1,32}$/;

/** FR-012: total attempts per request, including every parameter adaptation. */
export const MAX_CHAT_ATTEMPTS = 6;

export function isReasoningEffortLevel(value: unknown): value is ReasoningEffortLevel {
  return value === 'custom'
    || (typeof value === 'string' && Object.prototype.hasOwnProperty.call(REASONING_EFFORT_FALLBACKS, value));
}

/** Wire values to try, in order. Empty means the field is never sent. */
export function reasoningEffortCandidates(request: ReasoningEffortRequest | undefined): readonly string[] {
  if (!request) return [];
  if (request.level === 'custom') {
    return request.value && CUSTOM_REASONING_EFFORT_PATTERN.test(request.value) ? [request.value] : [];
  }
  return REASONING_EFFORT_FALLBACKS[request.level] ?? [];
}

/** First candidate not yet rejected for this endpoint + model, or `null` to omit the field. */
export function nextReasoningEffortValue(
  request: ReasoningEffortRequest | undefined,
  rejected: ReadonlySet<string>,
): string | null {
  return reasoningEffortCandidates(request).find((value) => !rejected.has(value)) ?? null;
}

/** Provider error message from a JSON error body, else the raw body. */
export function providerErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    /* not JSON */
  }
  return body;
}

/** FR-010: a 400 whose message mentions reasoning or thinking rejects the sent value. */
export function isReasoningEffortRejection(status: number, body: string): boolean {
  if (status !== 400) return false;
  const message = providerErrorMessage(body).toLowerCase();
  return message.includes('reasoning') || message.includes('think');
}

/** A 400 saying the token limit is above the model's maximum output; never clamped silently. */
export function isReplyBudgetTooLarge(status: number, message: string): boolean {
  if (status !== 400) return false;
  const lower = message.toLowerCase();
  return /max_(completion_)?tokens/.test(lower)
    && /(too large|maximum|exceed|at most|less than or equal|upper bound)/.test(lower);
}

/** What one endpoint origin + model has taught us this app session. */
export interface NegotiationState {
  omitTemperature: boolean;
  tokenParam?: AITokenParam;
  rejectedReasoningValues: Set<string>;
}

export function createNegotiationState(): NegotiationState {
  return { omitTemperature: false, rejectedReasoningValues: new Set() };
}

function endpointOrigin(endpoint: string): string {
  const trimmed = endpoint.trim();
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

/** Cache key: URL origin (path and trailing slash ignored) + model id. */
export function negotiationKey(endpoint: string, model: string): string {
  return `${endpointOrigin(endpoint)}|${model.trim()}`;
}

export interface NegotiationCache {
  /** Live state for this endpoint and model; `negotiateChatCompletion` records adaptations on it. */
  stateFor(endpoint: string, model: string): NegotiationState;
  clear(): void;
}

/** Session-only (FR-011): lost on restart so provider upgrades are picked up. */
export function createNegotiationCache(): NegotiationCache {
  const states = new Map<string, NegotiationState>();
  return {
    stateFor(endpoint, model) {
      const key = negotiationKey(endpoint, model);
      let state = states.get(key);
      if (!state) {
        state = createNegotiationState();
        states.set(key, state);
      }
      return state;
    },
    clear() {
      states.clear();
    },
  };
}

/** Initial token-parameter guess; corrected by 400 replies and then cached. */
export function usesCompletionTokensParam(endpoint: string): boolean {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === 'openai.com' || hostname.endsWith('.openai.com');
  } catch {
    return false;
  }
}

export function initialTokenParam(endpoint: string): AITokenParam {
  return usesCompletionTokensParam(endpoint) ? 'max_completion_tokens' : 'max_tokens';
}

const MINUTE_MS = 60_000;
const REMOTE_ASK_MIN_MS = MINUTE_MS;
const REMOTE_EDIT_MIN_MS = 2 * MINUTE_MS;
/** Local models (16k ctx + full-song Edit) often need several minutes on first load. */
const LOCAL_MIN_MS = 5 * MINUTE_MS;
const TIMEOUT_CAP_MS = 10 * MINUTE_MS;

/**
 * FR-014: request timeout scaled by the reply budget, keeping today's minimums.
 * The minimum follows the request mode, since an explicit Edit budget can be as
 * small as the Ask default.
 */
export function chatTimeoutMs(options: { local: boolean; mode?: AIChatMode; maxTokens: number }): number {
  const scaled = Math.ceil(Math.max(1, options.maxTokens) / 8192) * MINUTE_MS;
  const minimum = options.local
    ? LOCAL_MIN_MS
    : options.mode === 'ask' ? REMOTE_ASK_MIN_MS : REMOTE_EDIT_MIN_MS;
  return Math.max(minimum, Math.min(TIMEOUT_CAP_MS, scaled));
}

export interface ChatAttemptResponse {
  ok: boolean;
  status: number;
  /** Parsed JSON body on success. */
  data?: unknown;
  /** Raw body text on failure. */
  text?: string;
}

export type ChatAttemptSender = (body: Record<string, unknown>) => Promise<ChatAttemptResponse>;

export interface NegotiatedChatSuccess {
  ok: true;
  data: unknown;
  effectiveReasoningEffort: string | null;
  tokenParam: AITokenParam;
}

export interface NegotiatedChatFailure {
  ok: false;
  status: number;
  text: string;
}

export type NegotiatedChatResult = NegotiatedChatSuccess | NegotiatedChatFailure;

/**
 * Send one chat completion, adapting temperature, token parameter and
 * `reasoning_effort` on parameter-related 400 replies. `state` is mutated with
 * every adaptation so the caller can keep it for later requests (FR-011).
 * `maxTokens` is sent unchanged on every attempt: the renderer's meter and
 * pre-send check reserved that value, and a learned token parameter only
 * changes the Auto ceiling from the next request on.
 */
export async function negotiateChatCompletion(
  payload: AIChatCompletionRequest,
  state: NegotiationState,
  send: ChatAttemptSender,
): Promise<NegotiatedChatResult> {
  for (let attempt = 0; attempt < MAX_CHAT_ATTEMPTS; attempt += 1) {
    const tokenParam = state.tokenParam ?? initialTokenParam(payload.endpoint);
    const reasoningEffort = nextReasoningEffortValue(payload.reasoningEffort, state.rejectedReasoningValues);
    const includeTemperature = !state.omitTemperature && typeof payload.temperature === 'number';
    const body: Record<string, unknown> = {
      model: payload.model,
      messages: payload.messages,
      stream: false,
      [tokenParam]: payload.maxTokens,
    };
    if (includeTemperature) body.temperature = payload.temperature;
    if (reasoningEffort !== null) body.reasoning_effort = reasoningEffort;

    const response = await send(body);
    if (response.ok) {
      return { ok: true, data: response.data, effectiveReasoningEffort: reasoningEffort, tokenParam };
    }

    const text = response.text ?? '';
    if (response.status !== 400 || attempt === MAX_CHAT_ATTEMPTS - 1) {
      return { ok: false, status: response.status, text };
    }

    const lower = text.toLowerCase();
    // A too-large budget rejects the limit's value, not its name; flipping dialects would only bounce.
    const dialectRejection = !isReplyBudgetTooLarge(response.status, providerErrorMessage(text));
    let adapted = false;
    if (dialectRejection && tokenParam === 'max_tokens' && lower.includes('max_completion_tokens')) {
      state.tokenParam = 'max_completion_tokens';
      adapted = true;
    } else if (
      dialectRejection
      && tokenParam === 'max_completion_tokens'
      && lower.includes('max_completion_tokens')
      && (lower.includes('unsupported') || lower.includes('not supported') || lower.includes('unrecognized'))
    ) {
      state.tokenParam = 'max_tokens';
      adapted = true;
    }
    if (includeTemperature && lower.includes('temperature')) {
      state.omitTemperature = true;
      adapted = true;
    }
    if (reasoningEffort !== null && isReasoningEffortRejection(response.status, text)) {
      state.rejectedReasoningValues.add(reasoningEffort);
      adapted = true;
    }
    if (!adapted) return { ok: false, status: response.status, text };
  }
  return { ok: false, status: 400, text: '' };
}
