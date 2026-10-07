/**
 * Out-of-budget diagnostics for Copilot replies (spec 088 US1).
 */
import type { ChatMode, ReasoningEffortSetting } from '@beatbax/app-core/stores/chat.store';
import { formatTokenCount, estimateSongTokens, type ResolvedReplyBudget } from './copilot-token-budget';

/** Extra reply tokens assumed for reasoning when reasoning effort is not Off / Provider default. */
export const REASONING_REPLY_MARGIN_TOKENS = 1024;
/** Reasoning tokens at or above this share of the completion count as "reasoning used the budget". */
const REASONING_EXHAUSTED_SHARE = 0.9;

export type LengthStopKind = 'reasoning-exhausted' | 'cut-off' | 'ask-cut-off';

export interface LengthStopDiagnostic {
  kind: LengthStopKind;
  message: string;
}

function budgetLabel(mode: ChatMode): string {
  return mode === 'edit' ? 'Edit reply budget' : 'Ask reply budget';
}

function tokens(value: number): string {
  return value.toLocaleString('en-US');
}

/** FR-002: explain a `finish_reason: "length"` reply, or `null` for any other stop. */
export function describeLengthStop(input: {
  content: string;
  finishReason?: string;
  usage?: { completionTokens?: number; reasoningTokens?: number };
  reasoningPresent?: boolean;
  budget: number;
  mode: ChatMode;
}): LengthStopDiagnostic | null {
  if (input.finishReason !== 'length') return null;
  const label = budgetLabel(input.mode);
  if (input.mode === 'ask') {
    return {
      kind: 'ask-cut-off',
      message: `This reply was cut off at the ${label} (${tokens(input.budget)} tokens). Raise the ${label} in Settings → AI → Advanced for longer answers.`,
    };
  }

  const empty = input.content.trim().length === 0;
  const reasoningTokens = input.usage?.reasoningTokens;
  const completionTokens = input.usage?.completionTokens ?? 0;
  const reasoningShare = reasoningTokens !== undefined && completionTokens > 0
    ? reasoningTokens / completionTokens
    : 0;
  if (empty && (reasoningShare >= REASONING_EXHAUSTED_SHARE || input.reasoningPresent)) {
    const reported = reasoningTokens !== undefined ? ` (${tokens(reasoningTokens)} reasoning tokens)` : '';
    return {
      kind: 'reasoning-exhausted',
      message: `The model used its whole ${label} (${tokens(input.budget)} tokens) on reasoning${reported} and returned no song. Lower Reasoning effort or raise the ${label} in Settings → AI → Advanced. The editor was not changed.`,
    };
  }
  return {
    kind: 'cut-off',
    message: `The song was cut off at the ${label} (${tokens(input.budget)} tokens) before it was complete. Raise the ${label} in Settings → AI → Advanced, or start a New chat. The editor was not changed.`,
  };
}

export interface ReplyFitWarning {
  estimate: number;
  budget: number;
  windowTokens: number;
  message: string;
}

function reasoningAddsMargin(reasoningEffort: ReasoningEffortSetting | undefined): boolean {
  return reasoningEffort !== 'off' && reasoningEffort !== 'provider-default';
}

/** FR-017: estimated full-song reply tokens for an Edit request. */
export function estimateEditReplyTokens(songChars: number, reasoningEffort: ReasoningEffortSetting | undefined): number {
  return estimateSongTokens(songChars) + (reasoningAddsMargin(reasoningEffort) ? REASONING_REPLY_MARGIN_TOKENS : 0);
}

/** FR-017 pre-send check for Edit mode; `null` when the reply should fit. */
export function checkReplyFits(input: {
  songChars: number;
  budget: Pick<ResolvedReplyBudget, 'tokens' | 'auto'>;
  windowTokens: number;
  reasoningEffort?: ReasoningEffortSetting;
}): ReplyFitWarning | null {
  const estimate = estimateEditReplyTokens(input.songChars, input.reasoningEffort);
  if (estimate <= input.budget.tokens) return null;
  const need = `This song needs about ${formatTokenCount(estimate)} tokens to reply`;
  const message = input.budget.auto
    ? `${need}, but only about ${formatTokenCount(input.budget.tokens)} fit in your ${formatTokenCount(input.windowTokens)} model window. Raise num_ctx and the Model token window, set Reasoning effort to Off, or use a cloud model.`
    : `${need}, but the Edit reply budget is ${formatTokenCount(input.budget.tokens)}. Raise the Edit reply budget (and the Model token window if needed), set Reasoning effort to Off, or use a cloud model.`;
  return { estimate, budget: input.budget.tokens, windowTokens: input.windowTokens, message };
}

function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** Identifies "same song text and settings" so Send anyway is not asked twice in a chat. */
export function replyFitDismissalKey(input: {
  songText: string;
  budget: number;
  reasoningEffort?: string;
  windowTokens: number;
}): string {
  return [hashText(input.songText), input.songText.length, input.budget, input.reasoningEffort ?? 'auto', input.windowTokens].join(':');
}
