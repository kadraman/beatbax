/**
 * Copilot token estimates, reply budgets and context-window budget (spec 088).
 *
 * Prose uses chars/4; BeatBax song text tokenizes at roughly chars/2. The
 * reply budget resolved here is both sent to the provider and reserved by the
 * footer meter.
 */

import type { AISettings, ChatMode } from '@beatbax/app-core/stores/chat.store';
import type { AITokenParam, ReasoningEffortRequest } from '../../../shared/electron-api';

/** Auto reply-budget ceilings for the `max_tokens` dialect. */
export const COMPLETION_TOKEN_LIMIT = {
  edit: 8192,
  ask: 2048,
} as const;

/** Auto Edit ceiling when the endpoint uses `max_completion_tokens` (room for reasoning). */
export const EDIT_COMPLETION_TOKENS_CEILING = 16384;

/** FR-016 floors for Auto budgets that are fitted to a small window. */
export const REPLY_BUDGET_FLOOR = {
  edit: 2048,
  ask: 512,
} as const;

export const SONG_CHARS_PER_TOKEN = 2;
export const TEXT_CHARS_PER_TOKEN = 4;
/** Margin applied to the prompt estimate before fitting the reply budget. */
export const PROMPT_ESTIMATE_MARGIN = 1.1;

export const MODEL_HISTORY_LIMIT = 10;

/** Soft cap for packed conversation history (tokens), excluding system + user. */
export const HISTORY_TOKEN_BUDGET = 2500;

export type ContextBudgetLevel = 'ok' | 'high' | 'full';

export interface ContextBudgetBreakdown {
  system: number;
  history: number;
  message: number;
  reservedOutput: number;
  prompt: number;
  total: number;
  window: number;
  ratio: number;
  level: ContextBudgetLevel;
  percent: number;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / TEXT_CHARS_PER_TOKEN));
}

export function estimateSongTokens(songChars: number): number {
  if (songChars <= 0) return 0;
  return Math.ceil(songChars / SONG_CHARS_PER_TOKEN);
}

export interface PromptEstimate {
  system: number;
  history: number;
  message: number;
  prompt: number;
}

/**
 * Prompt tokens: song text at chars/2, everything else at chars/4.
 * `songChars` is how much of `systemText` is song (the rest is instructions).
 * A provider-reported figure, when given, replaces the estimated total.
 */
export function estimatePromptTokens(input: {
  systemText: string;
  songChars?: number;
  historyTexts: string[];
  userText: string;
  actualPromptTokens?: number;
}): PromptEstimate {
  const songChars = Math.min(Math.max(0, input.songChars ?? 0), input.systemText.length);
  const instructionChars = input.systemText.length - songChars;
  const system = estimateSongTokens(songChars)
    + (instructionChars > 0 ? Math.ceil(instructionChars / TEXT_CHARS_PER_TOKEN) : 0);
  const history = input.historyTexts.reduce((sum, text) => sum + estimateTokens(text), 0);
  const message = input.userText.trim() ? estimateTokens(input.userText) : 0;
  const estimated = system + history + message;
  const prompt = input.actualPromptTokens != null && input.actualPromptTokens > 0
    ? input.actualPromptTokens
    : estimated;
  return { system, history, message, prompt };
}

export function contextBudgetLevel(ratio: number): ContextBudgetLevel {
  if (ratio >= 0.9) return 'full';
  if (ratio >= 0.7) return 'high';
  return 'ok';
}

/** Auto reply-budget ceiling before window fitting (FR-006). */
export function autoReplyCeiling(mode: ChatMode, tokenParam: AITokenParam = 'max_tokens'): number {
  if (mode === 'ask') return COMPLETION_TOKEN_LIMIT.ask;
  return tokenParam === 'max_completion_tokens' ? EDIT_COMPLETION_TOKENS_CEILING : COMPLETION_TOKEN_LIMIT.edit;
}

export function completionTokenLimit(mode: ChatMode, tokenParam: AITokenParam = 'max_tokens'): number {
  return autoReplyCeiling(mode, tokenParam);
}

export type ReplyBudgetSettings = Pick<AISettings, 'editReplyTokens' | 'askReplyTokens'>;

export interface ResolvedReplyBudget {
  tokens: number;
  auto: boolean;
  /** Auto ceiling before fitting (only meaningful when `auto`). */
  ceiling: number;
  /** Auto budget was reduced to fit the model window. */
  fitted: boolean;
}

/**
 * FR-016: explicit numbers are sent as configured; Auto is
 * `max(floor, min(ceiling, window − ceil(prompt × 1.1)))`.
 */
export function resolveReplyBudget(input: {
  mode: ChatMode;
  settings: Partial<ReplyBudgetSettings>;
  tokenParam?: AITokenParam;
  promptTokens: number;
  windowTokens: number;
}): ResolvedReplyBudget {
  const configured = input.mode === 'edit' ? input.settings.editReplyTokens : input.settings.askReplyTokens;
  const ceiling = autoReplyCeiling(input.mode, input.tokenParam);
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return { tokens: Math.round(configured), auto: false, ceiling, fitted: false };
  }
  const room = Math.round(input.windowTokens) - Math.ceil(Math.max(0, input.promptTokens) * PROMPT_ESTIMATE_MARGIN);
  const tokens = Math.max(REPLY_BUDGET_FLOOR[input.mode], Math.min(ceiling, room));
  return { tokens, auto: true, ceiling, fitted: tokens < ceiling };
}

/** Auto budgets for both token-limit dialects, so a dialect learned mid-request uses the right one. */
export function resolveReplyBudgetsByTokenParam(input: {
  mode: ChatMode;
  settings: Partial<ReplyBudgetSettings>;
  promptTokens: number;
  windowTokens: number;
}): Record<AITokenParam, number> {
  return {
    max_tokens: resolveReplyBudget({ ...input, tokenParam: 'max_tokens' }).tokens,
    max_completion_tokens: resolveReplyBudget({ ...input, tokenParam: 'max_completion_tokens' }).tokens,
  };
}

export type ReasoningEffortSettings = Pick<AISettings, 'reasoningEffort' | 'reasoningEffortCustom'>;

/** Maps settings to the request; `undefined` means provider default (field never sent). */
export function resolveReasoningEffort(settings: Partial<ReasoningEffortSettings>): ReasoningEffortRequest | undefined {
  switch (settings.reasoningEffort) {
    case 'provider-default':
      return undefined;
    case 'custom':
      return settings.reasoningEffortCustom
        ? { level: 'custom', value: settings.reasoningEffortCustom }
        : { level: 'low' };
    case 'off':
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
      return { level: settings.reasoningEffort };
    default:
      return { level: 'low' };
  }
}

export function formatTokenCount(value: number): string {
  const n = Math.max(0, Math.round(value));
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function estimateContextBudget(input: {
  systemText: string;
  /** Characters of `systemText` that are song text (counted at chars/2). */
  songChars?: number;
  historyTexts: string[];
  userText: string;
  reservedOutput: number;
  windowTokens: number;
  /** When present, replaces the estimated prompt (system+history+message). */
  actualPromptTokens?: number;
}): ContextBudgetBreakdown {
  const { system, history, message, prompt } = estimatePromptTokens(input);
  const reservedOutput = Math.max(0, Math.round(input.reservedOutput));
  const total = prompt + reservedOutput;
  const window = Math.max(1, Math.round(input.windowTokens));
  const ratio = total / window;
  return {
    system,
    history,
    message,
    reservedOutput,
    prompt,
    total,
    window,
    ratio,
    level: contextBudgetLevel(ratio),
    percent: Math.min(999, Math.round(ratio * 100)),
  };
}

export type ContextBudgetHoverRowKey = 'system' | 'history' | 'message' | 'reservedOutput';

export interface ContextBudgetHoverRow {
  key: ContextBudgetHoverRowKey;
  label: string;
  tokens: number;
  percent: number;
}

export type ContextBudgetHintAction = 'new-chat' | 'open-settings';

export interface ContextBudgetHint {
  text?: string;
  action: ContextBudgetHintAction;
  actionLabel: string;
}

export interface ContextBudgetHoverModel {
  heading: string;
  usedLabel: string;
  percent: number;
  level: ContextBudgetLevel;
  rows: ContextBudgetHoverRow[];
  hint?: ContextBudgetHint;
  lastReply?: string;
}

/**
 * Only suggest a new chat when chat history is actually using the window;
 * otherwise the fixed part (instructions + song + reserved reply) is the cause.
 */
export function contextBudgetHint(budget: ContextBudgetBreakdown): ContextBudgetHint | undefined {
  if (budget.level === 'ok') return undefined;
  if (budget.history > 0) {
    return {
      action: 'new-chat',
      actionLabel: 'Start a new chat',
    };
  }
  return {
    text: 'Instructions, the song, and room for the reply fill most of the window, so a new chat will not free space. Raise the Model token window (and num_ctx for Ollama) for more room.',
    action: 'open-settings',
    actionLabel: 'Open AI settings',
  };
}

/** Segment widths for the hover stacked bar (percent of the model window). */
export function contextBudgetBarShares(budget: ContextBudgetBreakdown): Record<ContextBudgetHoverRowKey, number> {
  const denom = Math.max(budget.window, budget.total, 1);
  return {
    system: (budget.system / denom) * 100,
    history: (budget.history / denom) * 100,
    message: (budget.message / denom) * 100,
    reservedOutput: (budget.reservedOutput / denom) * 100,
  };
}

/** Compact VS Code-style hover for the Copilot footer meter. */
export function contextBudgetHover(budget: ContextBudgetBreakdown, extras?: {
  lastPrompt?: number;
  lastCompletion?: number;
}): ContextBudgetHoverModel {
  const shares = contextBudgetBarShares(budget);
  const rows: ContextBudgetHoverRow[] = [
    { key: 'system', label: 'Instructions + song', tokens: budget.system, percent: shares.system },
    { key: 'history', label: 'Chat history', tokens: budget.history, percent: shares.history },
    { key: 'message', label: 'This message', tokens: budget.message, percent: shares.message },
    { key: 'reservedOutput', label: 'Room for reply', tokens: budget.reservedOutput, percent: shares.reservedOutput },
  ];
  const lastReply = extras?.lastPrompt != null && extras.lastCompletion != null
    ? `${formatTokenCount(extras.lastPrompt)} → ${formatTokenCount(extras.lastCompletion)}`
    : undefined;
  return {
    heading: 'Model window',
    usedLabel: `${formatTokenCount(budget.total)} / ${formatTokenCount(budget.window)}`,
    percent: budget.percent,
    level: budget.level,
    rows,
    hint: contextBudgetHint(budget),
    lastReply,
  };
}
