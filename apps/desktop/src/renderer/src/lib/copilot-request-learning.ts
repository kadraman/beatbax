/**
 * Renderer-side memory of what the main process negotiated per endpoint origin
 * and model (spec 088). Feeds the Auto reply budget's token-parameter guess and
 * the Settings → AI "Sent as …" label. Session-only, like the main-process cache.
 */
import type { ChatMode } from '@beatbax/app-core/stores/chat.store';
import type { AITokenParam, ReasoningEffortRequest } from '../../../shared/electron-api';
import {
  autoReplyCeiling,
  formatTokenCount,
  type PromptCalibration,
  type ResolvedReplyBudget,
} from './copilot-token-budget';
import {
  initialTokenParam,
  negotiationKey,
  reasoningEffortCandidates,
} from '../../../shared/ai-request-negotiation';

export interface LearnedRequestParams {
  tokenParam?: AITokenParam;
  /** Reasoning effort the request asked for; `undefined` = provider default. */
  requestedReasoningEffort?: ReasoningEffortRequest;
  /** Value sent on the successful attempt; `null` = field omitted. */
  effectiveReasoningEffort?: string | null;
  /** Prompt usage from the last request that reported it (FR-016). */
  promptCalibration?: PromptCalibration;
}

/** Reply budget the Copilot footer meter currently reserves (same value the next request sends). */
export interface ReplyBudgetSnapshot {
  mode: ChatMode;
  endpoint: string;
  model: string;
  budget: ResolvedReplyBudget;
}

interface ValueStore<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: (next: T) => void): () => void;
}

function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<(next: T) => void>();
  return {
    get: (): T => value,
    set(next: T): void {
      value = next;
      for (const listener of listeners) listener(value);
    },
    subscribe(listener: (next: T) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const learnedStore = createValueStore<Readonly<Record<string, LearnedRequestParams>>>({});
const replyBudgetStore = createValueStore<ReplyBudgetSnapshot | null>(null);

export const learnedRequestParams = {
  get: learnedStore.get,
  subscribe: learnedStore.subscribe,
};

export const currentReplyBudget = {
  get: replyBudgetStore.get,
  subscribe: replyBudgetStore.subscribe,
};

export function recordRequestOutcome(
  endpoint: string,
  model: string,
  requestedReasoningEffort: ReasoningEffortRequest | undefined,
  result: { tokenParam?: AITokenParam; effectiveReasoningEffort?: string | null },
): void {
  const key = negotiationKey(endpoint, model);
  const learned = learnedStore.get();
  const next: LearnedRequestParams = { ...(learned[key] ?? {}), requestedReasoningEffort };
  if (result.tokenParam) next.tokenParam = result.tokenParam;
  if (result.effectiveReasoningEffort !== undefined) next.effectiveReasoningEffort = result.effectiveReasoningEffort;
  learnedStore.set({ ...learned, [key]: next });
}

/** Record prompt usage for a request whose character estimate was `estimated`; ignored without a prompt count. */
export function recordPromptUsage(
  endpoint: string,
  model: string,
  estimated: number,
  usage: { promptTokens?: number } | undefined,
): void {
  const reported = usage?.promptTokens;
  if (!(estimated > 0) || reported == null || !(reported > 0)) return;
  const key = negotiationKey(endpoint, model);
  const learned = learnedStore.get();
  learnedStore.set({ ...learned, [key]: { ...(learned[key] ?? {}), promptCalibration: { estimated, reported } } });
}

export function learnedPromptCalibration(endpoint: string, model: string): PromptCalibration | undefined {
  return learnedStore.get()[negotiationKey(endpoint, model)]?.promptCalibration;
}

export function learnedTokenParam(endpoint: string, model: string): AITokenParam {
  return learnedStore.get()[negotiationKey(endpoint, model)]?.tokenParam ?? initialTokenParam(endpoint);
}

function sameRequest(a: ReasoningEffortRequest | undefined, b: ReasoningEffortRequest | undefined): boolean {
  if (!a || !b) return a === b;
  return a.level === b.level && (a.level !== 'custom' || a.value === b.value);
}

/**
 * Settings note when the last request for this model sent something other than
 * the chosen level's first value; `undefined` when nothing differs or the
 * learned outcome was for a different level.
 */
export function describeEffectiveReasoningEffort(
  entry: LearnedRequestParams | undefined,
  requested: ReasoningEffortRequest | undefined,
): string | undefined {
  if (!entry || !requested || entry.effectiveReasoningEffort === undefined) return undefined;
  if (!sameRequest(entry.requestedReasoningEffort, requested)) return undefined;
  if (entry.effectiveReasoningEffort === null) return 'This model does not accept reasoning effort';
  const preferred = reasoningEffortCandidates(requested)[0];
  if (entry.effectiveReasoningEffort === preferred) return undefined;
  return `Sent as \`${entry.effectiveReasoningEffort}\` for this model`;
}

export function resetLearnedRequestParams(): void {
  learnedStore.set({});
}

export function publishReplyBudget(next: ReplyBudgetSnapshot): void {
  const current = replyBudgetStore.get();
  if (
    current
    && current.mode === next.mode
    && current.endpoint === next.endpoint
    && current.model === next.model
    && current.budget.tokens === next.budget.tokens
    && current.budget.auto === next.budget.auto
    && current.budget.fitted === next.budget.fitted
    && current.budget.ceiling === next.budget.ceiling
  ) {
    return;
  }
  replyBudgetStore.set(next);
}

/** Settings label for an Auto reply budget: the live fitted value when the meter has one, else the ceiling. */
export function describeAutoReplyBudget(
  mode: ChatMode,
  endpoint: string,
  model: string,
  current: ReplyBudgetSnapshot | null,
): string {
  if (
    current
    && current.mode === mode
    && current.endpoint === endpoint
    && current.model === model
    && current.budget.auto
    && current.budget.fitted
  ) {
    return `Auto (about ${formatTokenCount(current.budget.tokens)} for this chat)`;
  }
  const ceiling = autoReplyCeiling(mode, learnedTokenParam(endpoint, model));
  return `Auto (${ceiling.toLocaleString('en-US')} for this endpoint)`;
}
