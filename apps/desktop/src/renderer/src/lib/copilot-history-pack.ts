import type { ChatMessage } from '@beatbax/app-core/stores/chat.store';
import {
  estimateTokens,
  HISTORY_TOKEN_BUDGET,
  MODEL_HISTORY_LIMIT,
} from './copilot-token-budget';

const BAX_FENCE_RE = /```[ \t]*bax\b/i;
const LARGE_EDIT_CHARS = 600;

export interface PackedChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function looksLikeEditPayload(message: ChatMessage): boolean {
  if (message.role !== 'assistant' || message.system) return false;
  if (message.replyMode === 'edit' || message.applied || message.applyBlocked) return true;
  return BAX_FENCE_RE.test(message.content);
}

function isOversizedEditPayload(message: ChatMessage): boolean {
  return looksLikeEditPayload(message)
    && (BAX_FENCE_RE.test(message.content) || message.content.length > LARGE_EDIT_CHARS)
    && message.content.length > LARGE_EDIT_CHARS;
}

/** Short stand-in for a previous full-song Edit reply. */
export function stubEditAssistantContent(message: ChatMessage): string {
  const lines = ['[Previous Edit] Applied a full-song update. The live song is in [EDITOR CONTENT].'];
  const explanation = message.applyExplanation?.trim();
  if (explanation) lines.push(explanation);
  const summary = (message.changeSummary ?? []).filter((item) => item.trim()).slice(0, 8);
  if (summary.length > 0) {
    for (const item of summary) lines.push(`- ${item}`);
  } else {
    lines.push('- Full song was applied to the editor.');
  }
  const stats: string[] = [];
  if (message.changedLines) stats.push(`${message.changedLines} changed lines`);
  if (message.linesAdded) stats.push(`+${message.linesAdded}`);
  if (message.linesRemoved) stats.push(`−${message.linesRemoved}`);
  if (message.linesModified) stats.push(`~${message.linesModified}`);
  if (stats.length > 0) lines.push(`Stats: ${stats.join(', ')}`);
  lines.push('Do not reuse the previous full file from this turn.');
  return lines.join('\n');
}

function dropOldestUntilBudget(packed: PackedChatMessage[], budget: number): PackedChatMessage[] {
  let next = packed;
  while (next.length > 2) {
    const tokens = next.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    if (tokens <= budget) break;
    next = next.slice(1);
  }
  return next;
}

/**
 * Last-N conversation turns for the model: stub oversized prior Edit songs and
 * drop oldest turns if the history token estimate exceeds the soft budget.
 */
export function packCopilotHistoryForModel(
  messages: ChatMessage[],
  limit = MODEL_HISTORY_LIMIT,
): PackedChatMessage[] {
  const recent = messages.filter((message) => !message.system).slice(-limit);
  const packed = recent.map((message) => ({
    role: message.role,
    content: isOversizedEditPayload(message) ? stubEditAssistantContent(message) : message.content,
  }));
  return dropOldestUntilBudget(packed, HISTORY_TOKEN_BUDGET);
}

/**
 * History to send with the current user turn. Drops a trailing user message
 * that matches `userText` so it is not duplicated when the store already
 * contains the in-flight prompt.
 */
export function packHistoryExcludingCurrentUser(
  messages: ChatMessage[],
  userText: string,
  limit = MODEL_HISTORY_LIMIT,
): PackedChatMessage[] {
  const last = messages[messages.length - 1];
  const withoutCurrent = last
    && last.role === 'user'
    && !last.system
    && last.content === userText
    ? messages.slice(0, -1)
    : messages;
  return packCopilotHistoryForModel(withoutCurrent, limit);
}

function lastUserMessageIndex(messages: ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && !message.system) return index;
  }
  return -1;
}

/**
 * Context-meter split: composer draft is "This message" when present;
 * otherwise the last sent user turn is, so the row is not stuck at 0
 * after a reply. That user turn is omitted from Chat so totals still add up.
 */
export function splitContextBudgetMessages(
  messages: ChatMessage[],
  draftUserText: string,
  limit = MODEL_HISTORY_LIMIT,
): { userText: string; historyTexts: string[] } {
  const draft = draftUserText.trim();
  if (draft) {
    return {
      userText: draftUserText,
      historyTexts: packHistoryExcludingCurrentUser(messages, draftUserText, limit)
        .map((message) => message.content),
    };
  }
  const lastUserIndex = lastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    return {
      userText: '',
      historyTexts: packCopilotHistoryForModel(messages, limit).map((message) => message.content),
    };
  }
  const withoutLastUser = messages.slice(0, lastUserIndex).concat(messages.slice(lastUserIndex + 1));
  return {
    userText: messages[lastUserIndex].content,
    historyTexts: packCopilotHistoryForModel(withoutLastUser, limit).map((message) => message.content),
  };
}
