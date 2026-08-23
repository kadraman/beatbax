/**
 * Copilot token estimates and context-window budget.
 *
 * Uses chars/4 (same convention as the RAG spec) until a provider `usage`
 * object is available from the last reply.
 */

export const COMPLETION_TOKEN_LIMIT = {
  edit: 8192,
  ask: 2048,
} as const;

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
  return Math.max(1, Math.ceil(text.length / 4));
}

export function contextBudgetLevel(ratio: number): ContextBudgetLevel {
  if (ratio >= 0.9) return 'full';
  if (ratio >= 0.7) return 'high';
  return 'ok';
}

export function completionTokenLimit(mode: 'edit' | 'ask'): number {
  return mode === 'edit' ? COMPLETION_TOKEN_LIMIT.edit : COMPLETION_TOKEN_LIMIT.ask;
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
  historyTexts: string[];
  userText: string;
  reservedOutput: number;
  windowTokens: number;
  /** When present, replaces the estimated prompt (system+history+message). */
  actualPromptTokens?: number;
}): ContextBudgetBreakdown {
  const system = estimateTokens(input.systemText);
  const history = input.historyTexts.reduce((sum, text) => sum + estimateTokens(text), 0);
  const message = input.userText.trim() ? estimateTokens(input.userText) : 0;
  const estimatedPrompt = system + history + message;
  const prompt = input.actualPromptTokens != null && input.actualPromptTokens > 0
    ? input.actualPromptTokens
    : estimatedPrompt;
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

export interface ContextBudgetHoverModel {
  heading: string;
  usedLabel: string;
  percent: number;
  level: ContextBudgetLevel;
  rows: ContextBudgetHoverRow[];
  hint?: string;
  lastReply?: string;
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
    { key: 'history', label: 'Chat', tokens: budget.history, percent: shares.history },
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
    hint: budget.level === 'ok' ? undefined : 'Start a new chat',
    lastReply,
  };
}
