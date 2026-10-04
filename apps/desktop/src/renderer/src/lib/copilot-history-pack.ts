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

function modelMessageContent(message: ChatMessage): string {
  if (message.role === 'user' && message.promptContent?.trim()) {
    return message.promptContent;
  }
  return message.content;
}

function userMessageMatchesPrompt(message: ChatMessage, userText: string): boolean {
  return message.content === userText || message.promptContent === userText;
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
  options: { omitEditTurns?: boolean } = {},
): PackedChatMessage[] {
  let recent = messages.filter((message) => !message.system).slice(-limit);
  if (options.omitEditTurns) {
    recent = recent.filter((message, index) => {
      if (isOversizedEditPayload(message)) return false;
      const next = recent[index + 1];
      return !(message.role === 'user' && next && isOversizedEditPayload(next));
    });
  }
  const packed = recent.map((message) => ({
    role: message.role,
    content: isOversizedEditPayload(message)
      ? stubEditAssistantContent(message)
      : modelMessageContent(message),
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
  options: { omitEditTurns?: boolean } = {},
): PackedChatMessage[] {
  return packCopilotHistoryForModel(withoutCurrentUser(messages, userText), limit, options);
}

function withoutCurrentUser(messages: ChatMessage[], userText: string): ChatMessage[] {
  const last = messages[messages.length - 1];
  return last
    && last.role === 'user'
    && !last.system
    && userMessageMatchesPrompt(last, userText)
    ? messages.slice(0, -1)
    : messages;
}

const EARLIER_REQUEST_MAX = 3;
const EARLIER_REQUEST_CHARS = 200;

/**
 * User requests whose Edit turns `omitEditTurns` leaves out of history, so a
 * follow-up such as "now do the same for the bass" still has its referent.
 */
export function earlierEditRequestsNote(
  messages: ChatMessage[],
  userText: string,
  limit = MODEL_HISTORY_LIMIT,
): string {
  const recent = withoutCurrentUser(messages, userText).filter((message) => !message.system).slice(-limit);
  const requests = recent
    .filter((message, index) => message.role === 'user'
      && recent[index + 1] !== undefined
      && isOversizedEditPayload(recent[index + 1]))
    .map((message) => (message.display ?? message.content).trim().replace(/\s+/g, ' '))
    .filter((text, index, all) => text && all.lastIndexOf(text) === index)
    .slice(-EARLIER_REQUEST_MAX)
    .map((text) => `- ${text.length > EARLIER_REQUEST_CHARS ? `${text.slice(0, EARLIER_REQUEST_CHARS - 1)}…` : text}`);
  if (requests.length === 0) return '';
  return [
    '[Earlier Edit requests in this chat — any changes they made are already in [EDITOR CONTENT]; do not repeat them, use them only to understand references in the new request]',
    ...requests,
  ].join('\n');
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
 * With `omitEditTurns` (Edit mode) the history matches what is sent: prior
 * Edit turns are left out and the earlier-requests note is counted instead.
 */
export function splitContextBudgetMessages(
  messages: ChatMessage[],
  draftUserText: string,
  limit = MODEL_HISTORY_LIMIT,
  options: { omitEditTurns?: boolean } = {},
): { userText: string; historyTexts: string[] } {
  const withNote = (texts: string[], note: string): string[] => (
    options.omitEditTurns && note ? [...texts, note] : texts
  );
  const draft = draftUserText.trim();
  if (draft) {
    return {
      userText: draftUserText,
      historyTexts: withNote(
        packHistoryExcludingCurrentUser(messages, draftUserText, limit, options).map((message) => message.content),
        earlierEditRequestsNote(messages, draftUserText, limit),
      ),
    };
  }
  const lastUserIndex = lastUserMessageIndex(messages);
  if (lastUserIndex < 0) {
    return {
      userText: '',
      historyTexts: packCopilotHistoryForModel(messages, limit, options).map((message) => message.content),
    };
  }
  const lastUser = messages[lastUserIndex];
  const withoutLastUser = messages.slice(0, lastUserIndex).concat(messages.slice(lastUserIndex + 1));
  return {
    userText: lastUser.display ?? lastUser.content,
    historyTexts: withNote(
      packCopilotHistoryForModel(withoutLastUser, limit, options).map((message) => message.content),
      earlierEditRequestsNote(messages.slice(0, lastUserIndex), '', limit),
    ),
  };
}
