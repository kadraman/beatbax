import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { flushSync } from 'react-dom';
import type { Root } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { mountReactRoot, unmountReactRoot } from '../../utils/react-root';
import { marked } from 'marked';
import { parseWithPeggy } from '@beatbax/engine/parser';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  addCopilotSessionUsage,
  addTokenUsage,
  chatHistory,
  chatLoading,
  chatMode,
  chatPromptHistory,
  chatSettings,
  copilotReviewActive,
  copilotSessions,
  createCopilotSession,
  deleteCopilotSession,
  activeCopilotSessionId,
  markChatRead,
  pushChatMessage,
  pushChatNotice,
  recordChatPrompt,
  switchCopilotSession,
  updateChatSettings,
  type AISettings,
  type ChatMessage,
  type ChatMode,
  type ChatTokenUsage,
  type CopilotChangeDetail,
  type CopilotSession,
} from '@beatbax/app-core/stores/chat.store';
import { buildCopilotContext } from '../../lib/copilot-context';
import { packHistoryExcludingCurrentUser, splitContextBudgetMessages } from '../../lib/copilot-history-pack';
import {
  completionTokenLimit,
  contextBudgetHover,
  estimateContextBudget,
  formatTokenCount,
  type ContextBudgetBreakdown,
  type ContextBudgetHoverModel,
} from '../../lib/copilot-token-budget';
import {
  normalizeAIChatCompletionResult,
  parseAIChatCompletionResponse,
} from '../../../../shared/ai-chat-completion';
import { buildMinimalEditFixPrompt } from '../../lib/copilot-edit-fix-prompt';
import { formatCopilotErrorPrompt } from '../../lib/copilot-error-prompt';
import {
  buildUserMessageWithReferences,
  createCopilotEditorReference,
  formatCopilotReferenceLabel,
  type CopilotEditorReference,
} from '../../lib/copilot-selection-prompt';
import { adjustCopilotInputHeight } from '../../lib/copilot-input-resize';
import { assessEditApplyGuard, buildIncompleteSongRepairPrompt, tryMergeSnippetIntoSong } from '../../lib/copilot-apply-guard';
import { collectBaxDefs, tryMergeChangedDefinitions } from '../../lib/bax-def-index';
import { buildLegacyChangeSummary, collectCopilotEditChanges } from '../../lib/copilot-edit-changes';
import { extractEditExplanation, wrapBaxTokensForMarkdown } from '../../lib/copilot-edit-explanation';
import { readPersistedDocument } from '../../lib/desktop-session';
import { isLocalAiEndpoint } from '../../lib/ai-endpoint';
import {
  computeLineChangeDiff,
  countAIChangeDiff,
  type AIChangeDiff,
} from '../../lib/line-change-diff';
import { icon } from '../../utils/icons';

interface DesktopCopilotPanelProps {
  panelRef: Ref<DesktopCopilotPanelHandle>;
  getEditorContent: () => string;
  getDiagnostics: () => Diagnostic[];
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string, options?: { beginCopilotReview?: boolean }) => void;
  onHighlightChanges: (diff: AIChangeDiff, previousContent: string) => void;
  onRevealEditorChange: (changeId: string, lineNumber: number) => void;
  onOpenSettings: () => void;
  copilotReviewActions?: CopilotReviewActions;
}

export interface CopilotReviewActions {
  onKeepRemaining: () => void;
  onDiscardRemaining: () => void;
  onRevertEntire: () => void;
}

export interface CopilotAskAboutErrorOptions {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  /** When true, send the prefilled Ask prompt immediately (Problems panel). */
  autoSubmit?: boolean;
}

export interface CopilotAddSelectionOptions {
  text: string;
  startLine: number;
  endLine: number;
}

export interface DesktopCopilotPanelHandle {
  show: () => void;
  hide: () => void;
  dispose: () => void;
  askAboutError: (options: CopilotAskAboutErrorOptions) => void;
  addSelectionToChat: (options: CopilotAddSelectionOptions) => void;
}

export type { AIChangeDiff } from '../../lib/line-change-diff';
export { countAIChangeDiff, formatAIChangeBanner } from '../../lib/line-change-diff';

interface SummarizeContext {
  userPrompt?: string;
  diagnosticsBefore?: Diagnostic[];
}

function safeMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(wrapBaxTokensForMarkdown(content), { breaks: true, gfm: true }) as string, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  });
}

/** Inline markdown (no block `<p>` wrapping) — for list items and short labels. */
function safeMarkdownInline(content: string): string {
  return DOMPurify.sanitize(marked.parseInline(wrapBaxTokensForMarkdown(content), { breaks: true, gfm: true }) as string, {
    ALLOWED_TAGS: ['br', 'strong', 'em', 'code', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  });
}

function splitBaxBlocks(content: string): Array<{ type: 'text' | 'code'; value: string }> {
  const result: Array<{ type: 'text' | 'code'; value: string }> = [];
  const pattern = /```[ \t]*bax[ \t]*\r?\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before) result.push({ type: 'text', value: before });
    result.push({ type: 'code', value: match[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() });
    lastIndex = match.index + match[0].length;
  }
  const remaining = content.slice(lastIndex);
  if (remaining) result.push({ type: 'text', value: remaining });
  return result;
}

function normalizeBax(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/** Heuristic: does this text read like a full BeatBax song rather than prose? */
function looksLikeBeatBaxSong(content: string): boolean {
  const signals = [
    /^\s*chip\s+\w+/m,
    /^\s*bpm\s+\d/m,
    /^\s*pat\s+\w+\s*=/m,
    /^\s*seq\s+\w+\s*=/m,
    /^\s*channel\s+\d+/m,
    /^\s*play\b/m,
  ];
  return signals.filter((re) => re.test(content)).length >= 2;
}

function extractBaxCode(content: string): string | null {
  // Prefer an explicit ```bax fence.
  const baxFence = content.match(/```bax\s*\n([\s\S]*?)```/);
  if (baxFence) return normalizeBax(baxFence[1]);
  // Fall back to any fenced block (model may omit or mislabel the language).
  const anyFence = content.match(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/);
  if (anyFence) return normalizeBax(anyFence[1]);
  // No fence at all — accept the whole reply only if it looks like a song
  // (e.g. the model returned the song as plain text, or the closing fence was
  // lost to output truncation).
  if (looksLikeBeatBaxSong(content)) return normalizeBax(content);
  return null;
}

function clipSnippet(text: string, max = 56): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '(empty line)';
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}


/** Parse a song and return human-readable error messages (if any). */
function validateBaxSource(source: string): { ok: boolean; errors: string[] } {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const result = parseWithPeggy(normalized);
  const errors: string[] = [];
  for (const err of result.errors) errors.push(err.message);
  for (const diag of result.ast.diagnostics ?? []) {
    if (diag.level === 'error') errors.push(diag.message);
  }
  return { ok: errors.length === 0, errors };
}

/** Max automatic repair attempts when Edit-mode output fails parse validation. */
const MAX_PARSE_REPAIR_ATTEMPTS = 2;
/** Max retries when the model returns a snippet instead of the full song. */
const MAX_INCOMPLETE_REPAIR_ATTEMPTS = 2;

function buildRepairPrompt(errors: string[], brokenSong: string): string {
  const errorList = errors.map((e) => `- ${e}`).join('\n');
  return [
    'Your previous edit could not be applied because the BeatBax parser reported these errors:',
    errorList,
    '',
    'Return the corrected full song as a single ```bax fenced code block.',
    'After the closing fence you may keep a 2–4 sentence explanation of what you changed and why.',
    'Do not put prose inside the code fence.',
    'Fix every error above. Pattern tokens are whitespace-separated only (never use `|` bar separators or commas between notes).',
    'Note durations are encoded in-token via `:N` or `/N` suffixes (e.g. `C4:4`). For inline effects, duration comes AFTER the `>`: `C4<vib:3,5>:4`.',
    'Preserve the user\'s intent; change only what is needed to make the song valid.',
    '',
    'Song that failed validation:',
    '```bax',
    brokenSong,
    '```',
  ].join('\n');
}

/**
 * Produces structured edit details plus legacy bullet strings for chat history.
 */
function buildCopilotChangeReport(
  previous: string,
  next: string,
  lineDiff: AIChangeDiff,
  context?: SummarizeContext,
): { details: CopilotChangeDetail[]; notes: string[]; changeSummary: string[] } {
  const details: CopilotChangeDetail[] = collectCopilotEditChanges(previous, next).map((change) => ({
    id: change.id,
    kind: change.kind,
    name: change.name,
    action: change.action,
    previousLine: change.previousLine,
    nextLine: change.nextLine,
    lineNumber: change.lineNumber,
    reviewStatus: 'pending',
  }));

  const notes: string[] = [];
  const errorsBefore = context?.diagnosticsBefore?.filter((d) => d.severity === 'error') ?? [];
  if (errorsBefore.length > 0) {
    const preview = errorsBefore.slice(0, 2).map((d) => clipSnippet(d.message, 72)).join('; ');
    const extra = errorsBefore.length > 2 ? ` (+${errorsBefore.length - 2} more)` : '';
    notes.push(`Fixed ${errorsBefore.length} editor error${errorsBefore.length === 1 ? '' : 's'}: ${preview}${extra}`);
  }

  const before = collectBaxDefs(previous);
  const after = collectBaxDefs(next);
  const removedDefLineTexts = new Set(
    [...before.entries()]
      .filter(([key]) => !after.has(key))
      .map(([, def]) => def.line.trim()),
  );
  for (const anchor of lineDiff.removed) {
    for (const row of anchor.removed) {
      if (removedDefLineTexts.has(row.text.trim())) continue;
      notes.push(`Removed line ${row.oldLine}: \`${clipSnippet(row.text)}\``);
    }
  }

  const changedLineCount = countAIChangeDiff(lineDiff).total;
  if (details.length === 0 && changedLineCount > 0) {
    notes.push(`Adjusted ${changedLineCount} line${changedLineCount === 1 ? '' : 's'} (comments, metadata, or spacing)`);
  }

  const MAX_DETAILS = 20;
  const clippedDetails = details.length > MAX_DETAILS
    ? details.slice(0, MAX_DETAILS)
    : details;
  if (details.length > MAX_DETAILS) {
    notes.push(`…and ${details.length - MAX_DETAILS} more definition change${details.length - MAX_DETAILS === 1 ? '' : 's'}`);
  }

  return {
    details: clippedDetails,
    notes,
    changeSummary: buildLegacyChangeSummary(clippedDetails, notes),
  };
}

const CHANGE_KIND_LABEL: Record<CopilotChangeDetail['kind'], string> = {
  pattern: 'Pattern',
  sequence: 'Sequence',
  instrument: 'Instrument',
  effect: 'Effect',
  channel: 'Channel',
};

const CHANGE_ACTION_LABEL: Record<CopilotChangeDetail['action'], string> = {
  added: 'Added',
  updated: 'Modified',
  removed: 'Removed',
};

function formatEditStats(message: ChatMessage): string {
  const modified = message.linesModified ?? 0;
  const added = message.linesAdded ?? 0;
  const removed = message.linesRemoved ?? 0;
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} modified`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.length > 0 ? parts.join(' · ') : '';
}

function MessageUsage({ usage }: { usage?: ChatTokenUsage }): React.JSX.Element | null {
  if (!usage) return null;
  return (
    <span className="bb-chat-token-usage" title="Prompt tokens → completion tokens">
      {formatTokenCount(usage.promptTokens)} → {formatTokenCount(usage.completionTokens)}
    </span>
  );
}

function CopilotMessageHead({ usage }: { usage?: ChatTokenUsage }): React.JSX.Element {
  return (
    <div className="bb-chat-msg-head">
      <span className="bb-chat-msg-label">Copilot</span>
      <MessageUsage usage={usage} />
    </div>
  );
}

function sessionTokenLabel(session: CopilotSession): string | null {
  const prompt = session.tokenTotals?.prompt ?? 0;
  const completion = session.tokenTotals?.completion ?? 0;
  const total = prompt + completion;
  if (total <= 0) return null;
  return formatTokenCount(total);
}

function CopilotModePicker({
  mode,
  onChange,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (next: ChatMode): void => {
    setOpen(false);
    if (next !== mode) onChange(next);
  };

  return (
    <div className="bb-chat-mode-picker" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="bb-chat-mode-picker__trigger"
        onClick={() => setOpen((value) => !value)}
        title={mode === 'edit'
          ? 'Edit mode — applies changes to the editor'
          : 'Ask mode — answers only, no automatic edits'}
        type="button"
      >
        {mode === 'edit' ? 'Edit' : 'Ask'} ▾
      </button>
      {open ? (
        <div className="bb-chat-mode-picker__panel" role="menu">
          <button
            aria-checked={mode === 'ask'}
            className={`bb-chat-mode-picker__item${mode === 'ask' ? ' bb-chat-mode-picker__item--active' : ''}`}
            onClick={() => select('ask')}
            role="menuitemradio"
            type="button"
          >
            <span className="bb-chat-mode-picker__item-label">Ask</span>
            <span className="bb-chat-mode-picker__item-desc">Answers and explanations — no automatic edits</span>
          </button>
          <button
            aria-checked={mode === 'edit'}
            className={`bb-chat-mode-picker__item${mode === 'edit' ? ' bb-chat-mode-picker__item--active' : ''}`}
            onClick={() => select('edit')}
            role="menuitemradio"
            type="button"
          >
            <span className="bb-chat-mode-picker__item-label">Edit</span>
            <span className="bb-chat-mode-picker__item-desc">Apply changes directly to the editor</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CopilotSessionPicker({
  sessions,
  activeId,
  disabled,
  onSwitch,
  onDelete,
}: {
  sessions: CopilotSession[];
  activeId: string;
  disabled: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const sorted = sessions.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="bb-chat-session-picker" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="bb-chat-session-picker__trigger"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={active?.title ?? 'Chats'}
        type="button"
      >
        <span className="bb-chat-session-picker__title">{active?.title ?? 'New chat'}</span>
        ▾
      </button>
      {open ? (
        <div className="bb-chat-session-picker__panel" role="menu">
          {sorted.map((session) => {
            const tokens = sessionTokenLabel(session);
            return (
              <div
                className={`bb-chat-session-picker__row${session.id === activeId ? ' bb-chat-session-picker__row--active' : ''}`}
                key={session.id}
              >
                <button
                  className="bb-chat-session-picker__item"
                  onClick={() => {
                    setOpen(false);
                    onSwitch(session.id);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="bb-chat-session-picker__item-title">{session.title}</span>
                  <span className="bb-chat-session-picker__item-meta">
                    {session.songHint ? session.songHint : null}
                    {session.songHint && tokens ? ' · ' : null}
                    {tokens ? `${tokens} tokens` : null}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${session.title}`}
                  className="bb-chat-session-picker__delete"
                  dangerouslySetInnerHTML={{ __html: icon('trash', 'w-3.5 h-3.5') }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(session.id);
                  }}
                  title="Delete chat"
                  type="button"
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CopilotContextMeter({
  budget,
  lastPrompt,
  lastCompletion,
}: {
  budget: ContextBudgetBreakdown;
  lastPrompt?: number;
  lastCompletion?: number;
}): React.JSX.Element {
  const hover = useMemo(
    () => contextBudgetHover(budget, { lastPrompt, lastCompletion }),
    [budget, lastCompletion, lastPrompt],
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);

  const clearHoverTimers = useCallback((): void => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);

  const scheduleOpen = useCallback((): void => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setOpen(true), 250);
  }, []);

  const scheduleClose = useCallback((): void => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }, []);

  useEffect(() => () => clearHoverTimers(), [clearHoverTimers]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const width = Math.min(100, Math.max(2, budget.percent));
  const clamped = Math.min(100, budget.percent);

  return (
    <div
      className={`bb-chat-ctx-meter bb-chat-ctx-meter--${budget.level}`}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      ref={rootRef}
    >
      <button
        aria-controls={open ? 'bb-chat-ctx-hover' : undefined}
        aria-expanded={open}
        aria-label={`Model window ${budget.percent} percent`}
        className="bb-chat-ctx-meter__hit"
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) scheduleClose();
        }}
        onClick={() => {
          clearHoverTimers();
          setOpen((current) => !current);
        }}
        onFocus={() => {
          clearHoverTimers();
          setOpen(true);
        }}
        type="button"
      >
        <span
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={clamped}
          aria-valuetext={`${budget.percent} percent of the model token window`}
          className="bb-chat-ctx-meter__track"
          role="meter"
        >
          <span className="bb-chat-ctx-meter__fill" style={{ width: `${width}%` }} />
        </span>
        <span className="bb-chat-ctx-meter__label">{budget.percent}%</span>
      </button>
      {open ? <CopilotContextHover model={hover} /> : null}
    </div>
  );
}

function CopilotContextHover({ model }: { model: ContextBudgetHoverModel }): React.JSX.Element {
  return (
    <div className={`bb-chat-ctx-hover bb-chat-ctx-hover--${model.level}`} id="bb-chat-ctx-hover" role="tooltip">
      <div className="bb-chat-ctx-hover__head">
        <span className="bb-chat-ctx-hover__title">{model.heading}</span>
        <span className="bb-chat-ctx-hover__used">{model.usedLabel}</span>
      </div>
      <div aria-hidden="true" className="bb-chat-ctx-hover__stack">
        {model.rows.map((row) => (
          row.percent <= 0 ? null : (
            <span
              className={`bb-chat-ctx-hover__seg bb-chat-ctx-hover__seg--${row.key}`}
              key={row.key}
              style={{ width: `${row.percent}%` }}
            />
          )
        ))}
      </div>
      <div className="bb-chat-ctx-hover__rows">
        {model.rows.map((row) => (
          <div className="bb-chat-ctx-hover__row" key={row.key}>
            <span className="bb-chat-ctx-hover__key">
              <span aria-hidden="true" className={`bb-chat-ctx-hover__swatch bb-chat-ctx-hover__swatch--${row.key}`} />
              {row.label}
            </span>
            <span className="bb-chat-ctx-hover__val">{formatTokenCount(row.tokens)}</span>
          </div>
        ))}
      </div>
      {model.lastReply ? (
        <p className="bb-chat-ctx-hover__last">Last reply {model.lastReply}</p>
      ) : null}
      {model.hint ? <p className="bb-chat-ctx-hover__hint">{model.hint}</p> : null}
    </div>
  );
}

function CopilotReviewBulkMenu({ actions }: { actions: CopilotReviewActions }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };

  return (
    <div className="bb-copilot-review-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="bb-copilot-review-menu__trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Actions ▾
      </button>
      {open ? (
        <div className="bb-copilot-review-menu__panel" role="menu">
          <button
            className="bb-copilot-review-menu__item bb-copilot-review-menu__item--keep"
            onClick={() => run(actions.onKeepRemaining)}
            role="menuitem"
            type="button"
          >
            Keep remaining
          </button>
          <button
            className="bb-copilot-review-menu__item bb-copilot-review-menu__item--discard"
            onClick={() => run(actions.onDiscardRemaining)}
            role="menuitem"
            type="button"
          >
            Discard remaining
          </button>
          <div className="bb-copilot-review-menu__sep" role="separator" />
          <button
            className="bb-copilot-review-menu__item bb-copilot-review-menu__item--revert"
            onClick={() => run(actions.onRevertEntire)}
            role="menuitem"
            type="button"
          >
            Revert entire edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CopilotEditSummary({
  message,
  outcome,
  onRevealChange,
  reviewActions,
}: {
  message: ChatMessage;
  outcome: 'pending' | 'kept' | 'discarded';
  onRevealChange?: (changeId: string, lineNumber: number) => void;
  reviewActions?: CopilotReviewActions;
}): React.JSX.Element {
  const details = message.changeDetails ?? [];
  const notes = message.applyNotes ?? [];
  const fileName = message.documentName ?? 'current song';
  const stats = formatEditStats(message);
  const keptCount = details.filter((item) => item.reviewStatus === 'kept').length;
  const discardedCount = details.filter((item) => item.reviewStatus === 'discarded').length;

  let badgeText = '✓ Applied to editor';
  let badgeClass = 'bb-chat-applied-badge';
  if (outcome === 'kept') badgeText = '✓ Kept in editor';
  if (outcome === 'discarded') {
    badgeText = '↩ Discarded';
    badgeClass = 'bb-chat-applied-badge bb-chat-applied-badge--discarded';
  }

  return (
    <div className={`bb-chat-applied${outcome === 'discarded' ? ' bb-chat-applied--discarded' : ''}`}>
      <span className={badgeClass}>{badgeText}</span>
      <div className="bb-copilot-edit-summary">
        <div className="bb-copilot-edit-summary__header">
          <span className="bb-copilot-edit-summary__file">{fileName}</span>
          {stats ? <span className="bb-copilot-edit-summary__stats">{stats}</span> : null}
        </div>
        {message.applyExplanation ? (
          <div
            className="bb-copilot-edit-summary__explanation"
            dangerouslySetInnerHTML={{ __html: safeMarkdown(message.applyExplanation) }}
          />
        ) : null}
        {details.length > 0 ? (
          <details className="bb-copilot-edit-summary__fold" defaultOpen={!message.applyExplanation}>
            <summary>
              {details.length} change{details.length === 1 ? '' : 's'}
            </summary>
            {notes.length > 0 ? (
              <div className="bb-copilot-edit-summary__notes">
                {notes.map((note) => (
                  <p className="bb-copilot-edit-summary__note" key={note}>{note}</p>
                ))}
              </div>
            ) : null}
            <div className="bb-copilot-edit-summary__changes">
              {details.map((change) => (
                <div
                  className={`bb-copilot-edit-item bb-copilot-edit-item--${change.action}${change.reviewStatus ? ` bb-copilot-edit-item--${change.reviewStatus}` : ''}${onRevealChange ? ' bb-copilot-edit-item--clickable' : ''}`}
                  key={change.id}
                  onClick={onRevealChange ? () => onRevealChange(change.id, change.lineNumber) : undefined}
                  onKeyDown={onRevealChange ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRevealChange(change.id, change.lineNumber);
                    }
                  } : undefined}
                  role={onRevealChange ? 'button' : undefined}
                  tabIndex={onRevealChange ? 0 : undefined}
                  title={onRevealChange ? 'Go to this change in the editor' : undefined}
                >
                  <div className="bb-copilot-edit-item__header">
                    <span className={`bb-copilot-edit-item__badge bb-copilot-edit-item__badge--${change.action}`}>
                      {CHANGE_ACTION_LABEL[change.action]}
                    </span>
                    <span className="bb-copilot-edit-item__target">
                      {CHANGE_KIND_LABEL[change.kind]} <code>{change.name}</code>
                    </span>
                    {change.reviewStatus === 'kept' ? (
                      <span className="bb-copilot-edit-item__status bb-copilot-edit-item__status--kept">Kept</span>
                    ) : null}
                    {change.reviewStatus === 'discarded' ? (
                      <span className="bb-copilot-edit-item__status bb-copilot-edit-item__status--discarded">Discarded</span>
                    ) : null}
                    {onRevealChange ? (
                      <span className="bb-copilot-edit-item__goto">Go to line {change.lineNumber} →</span>
                    ) : (
                      <span className="bb-copilot-edit-item__line">Line {change.lineNumber}</span>
                    )}
                  </div>
                  {change.action === 'updated' ? (
                    <div className="bb-copilot-edit-item__diff">
                      <pre className="bb-copilot-edit-item__code bb-copilot-edit-item__code--removed">{change.previousLine}</pre>
                      <pre className="bb-copilot-edit-item__code bb-copilot-edit-item__code--added">{change.nextLine}</pre>
                    </div>
                  ) : null}
                  {change.action === 'added' && change.nextLine ? (
                    <pre className="bb-copilot-edit-item__code bb-copilot-edit-item__code--added">{change.nextLine}</pre>
                  ) : null}
                  {change.action === 'removed' && change.previousLine ? (
                    <pre className="bb-copilot-edit-item__code bb-copilot-edit-item__code--removed">{change.previousLine}</pre>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : notes.length > 0 ? (
          <div className="bb-copilot-edit-summary__notes">
            {notes.map((note) => (
              <p className="bb-copilot-edit-summary__note" key={note}>{note}</p>
            ))}
          </div>
        ) : null}
        {outcome === 'pending' && reviewActions ? (
          <CopilotReviewBulkMenu actions={reviewActions} />
        ) : null}
      </div>
      {outcome === 'kept' && message.undoneInEditor ? (
        <span className="bb-chat-applied-hint bb-chat-applied-hint--undone">
          Undone in editor — song restored to the pre-Copilot version (Ctrl+Z).
        </span>
      ) : null}
      {outcome === 'pending' ? (
        <span className="bb-chat-applied-hint">
          Keep or Discard in the editor banner; expand changes to jump to a line.
        </span>
      ) : null}
      {outcome === 'kept' && keptCount > 0 && discardedCount > 0 ? (
        <span className="bb-chat-applied-hint">
          Kept {keptCount} change{keptCount === 1 ? '' : 's'}, discarded {discardedCount}.
        </span>
      ) : null}
      {outcome === 'discarded' ? (
        <span className="bb-chat-applied-hint">Editor restored to the version before this edit.</span>
      ) : null}
    </div>
  );
}

function userFacingAIError(error: unknown): string {
  const raw = (error as Error).message || String(error);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

async function readDesktopAIAPIKey(): Promise<string | null> {
  const getAIAPIKey = window.electronAPI?.getAIAPIKey;
  if (typeof getAIAPIKey !== 'function') return null;
  return (await getAIAPIKey()).trim();
}

function findLatestPendingApplied(history: ChatMessage[]): ChatMessage | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message.role === 'assistant' && message.applied && message.applyOutcome === 'pending') {
      return message;
    }
  }
  return null;
}

function isSameChatMessage(a: ChatMessage, b: ChatMessage): boolean {
  return a.timestamp === b.timestamp && a.role === b.role && a.content === b.content;
}

function ChatMessageView({
  message,
  mode: _mode,
  onFixInEditMode,
  onInsertSnippet,
  onReplaceSelection,
  onReplaceEditor,
  onRevealEditorChange,
  showReviewActions,
  copilotReviewActions,
}: {
  message: ChatMessage;
  mode: ChatMode;
  onFixInEditMode: (snippet?: string, assistantContext?: string) => void;
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string, options?: { beginCopilotReview?: boolean }) => void;
  onRevealEditorChange: (changeId: string, lineNumber: number) => void;
  showReviewActions?: boolean;
  copilotReviewActions?: CopilotReviewActions;
}): React.JSX.Element {
  if (message.system) {
    return (
      <div className="bb-chat-notice">
        <span className="bb-chat-notice-text">{message.content}</span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="bb-chat-msg bb-chat-msg--user">
        <p className="bb-chat-msg-text">{message.display ?? message.content}</p>
      </div>
    );
  }

  const bodyParts = splitBaxBlocks(message.content);
  const hasCodeBlocks = bodyParts.some((part) => part.type === 'code');
  const actionMode = message.replyMode
    ?? (message.applied || message.applyBlocked ? 'edit' : 'ask');

  const body = (
    <div className="bb-chat-markdown">
      {bodyParts.map((part, index) => {
          if (part.type === 'text') {
            return <div dangerouslySetInnerHTML={{ __html: safeMarkdown(part.value) }} key={`text-${index}`} />;
          }
          const showEditActions = actionMode === 'edit';
          return (
            <div className={`bb-chat-code-block${actionMode === 'ask' ? ' bb-chat-code-block--reference' : ''}`} key={`code-${index}`}>
              <pre><code className="bb-chat-code">{part.value}</code></pre>
              {showEditActions ? (
                <div className="bb-chat-code-actions">
                  <button className="bb-chat-action-btn bb-chat-action-btn--primary" onClick={() => onReplaceEditor(part.value)} type="button">
                    ↺ Replace editor
                  </button>
                  <button className="bb-chat-action-btn" onClick={() => onInsertSnippet(part.value)} type="button">
                    Insert at cursor
                  </button>
                  <button className="bb-chat-action-btn" onClick={() => onReplaceSelection(part.value)} type="button">
                    Replace selection
                  </button>
                </div>
              ) : (
                <div className="bb-chat-code-actions bb-chat-code-actions--ask">
                  <button
                    className="bb-chat-action-btn bb-chat-action-btn--primary"
                    onClick={() => onFixInEditMode(part.value, message.content)}
                    type="button"
                  >
                    Apply fix in Edit mode
                  </button>
                </div>
              )}
            </div>
          );
      })}
    </div>
  );

  if (message.applyBlocked) {
    const summary = message.changeSummary ?? [];
    return (
      <div className="bb-chat-msg bb-chat-msg--assistant">
        <CopilotMessageHead usage={message.usage} />
        <div className="bb-chat-applied bb-chat-applied--blocked">
          <span className="bb-chat-applied-badge bb-chat-applied-badge--blocked">⚠ Not applied — editor unchanged</span>
          {summary.length > 0 ? (
            <ul className="bb-chat-applied-summary">
              {summary.map((item, index) => (
                <li dangerouslySetInnerHTML={{ __html: safeMarkdownInline(item) }} key={`err-${index}`} />
              ))}
            </ul>
          ) : null}
          <span className="bb-chat-applied-hint">Fix the issue above and try again, or edit manually.</span>
        </div>
        <details className="bb-chat-applied-details">
          <summary>View returned song</summary>
          {body}
        </details>
      </div>
    );
  }

  if (message.applied) {
    const outcome = message.applyOutcome ?? 'pending';

    if (outcome === 'discarded' || outcome === 'kept' || outcome === 'pending') {
      return (
        <div className="bb-chat-msg bb-chat-msg--assistant">
          <CopilotMessageHead usage={message.usage} />
          <CopilotEditSummary
            message={message}
            onRevealChange={onRevealEditorChange}
            outcome={outcome}
            reviewActions={showReviewActions ? copilotReviewActions : undefined}
          />
        </div>
      );
    }
  }

  return (
    <div className="bb-chat-msg bb-chat-msg--assistant">
      <CopilotMessageHead usage={message.usage} />
      {body}
      {actionMode === 'ask' && !hasCodeBlocks ? (
        <div className="bb-chat-ask-actions">
          <button
            className="bb-chat-action-btn bb-chat-action-btn--primary"
            onClick={() => onFixInEditMode(undefined, message.content)}
            type="button"
          >
            Fix in Edit mode
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DesktopCopilotPanel({
  panelRef,
  getEditorContent,
  getDiagnostics,
  onHighlightChanges,
  onInsertSnippet,
  onOpenSettings,
  onReplaceEditor,
  onReplaceSelection,
  onRevealEditorChange,
  copilotReviewActions,
}: DesktopCopilotPanelProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(chatSettings.get());
  const [mode, setMode] = useState(chatMode.get());
  const [history, setHistory] = useState(chatHistory.get());
  const [promptHistory, setPromptHistory] = useState(chatPromptHistory.get());
  const [loading, setLoading] = useState(chatLoading.get());
  const [reviewActive, setReviewActive] = useState(copilotReviewActive.get());
  const [sessions, setSessions] = useState(copilotSessions.get());
  const [activeSessionId, setActiveSessionId] = useState(activeCopilotSessionId.get());
  const [input, setInput] = useState('');
  const [editorReferences, setEditorReferences] = useState<CopilotEditorReference[]>([]);
  const [status, setStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const cancelledRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const promptHistoryIndexRef = useRef<number | null>(null);
  const promptDraftRef = useRef('');
  const setInputRef = useRef(setInput);
  const submitPromptRef = useRef<(
    text: string,
    activeMode: ChatMode,
    displayText?: string,
  ) => Promise<void>>(async () => {});
  setInputRef.current = setInput;

  useLayoutEffect(() => {
    adjustCopilotInputHeight(inputRef.current);
  }, [input, visible]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const unsubs = [
      chatSettings.subscribe(setSettings),
      chatMode.subscribe(setMode),
      chatHistory.subscribe((value) => setHistory([...value])),
      chatPromptHistory.subscribe((value) => setPromptHistory([...value])),
      chatLoading.subscribe(setLoading),
      copilotReviewActive.subscribe(setReviewActive),
      copilotSessions.subscribe((value) => setSessions([...value])),
      activeCopilotSessionId.subscribe(setActiveSessionId),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  const liveReviewMessage = useMemo(
    () => (reviewActive ? findLatestPendingApplied(history) : null),
    [history, reviewActive],
  );

  useEffect(() => {
    void readDesktopAIAPIKey()
      .then((apiKey) => {
        if (apiKey !== null) updateChatSettings({ apiKey });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (visible) markChatRead();
  }, [visible, history]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [history, loading]);

  useEffect(() => {
    const isLocal = isLocalAiEndpoint(settings.endpoint);
    setStatus(!isLocal && !settings.apiKey ? '⚠ No API key set. Click ⚙ to open AI Settings.' : '');
  }, [settings]);

  useImperativeHandle(panelRef, () => ({
    show: () => {
      void readDesktopAIAPIKey()
        .then((apiKey) => {
          if (apiKey !== null) updateChatSettings({ apiKey });
        })
        .catch(() => undefined);
      flushSync(() => setVisible(true));
    },
    hide: () => flushSync(() => setVisible(false)),
    dispose: () => abortRef.current?.abort(),
    askAboutError: ({ message, source, line, column, autoSubmit }) => {
      chatMode.set('ask');
      const prompt = formatCopilotErrorPrompt(message, { source, line, column });
      promptHistoryIndexRef.current = null;
      promptDraftRef.current = '';
      setInputRef.current('');
      window.requestAnimationFrame(() => {
        setInputRef.current(prompt);
        const textarea = inputRef.current;
        if (textarea) {
          textarea.focus();
          textarea.selectionStart = prompt.length;
          textarea.selectionEnd = prompt.length;
        }
        if (autoSubmit) {
          if (chatLoading.get()) {
            pushChatNotice('Copilot is still busy — wait for the current reply.');
            return;
          }
          void submitPromptRef.current(prompt, 'ask');
        }
      });
    },
    addSelectionToChat: ({ text, startLine, endLine }) => {
      const ref = createCopilotEditorReference({ text, startLine, endLine });
      promptHistoryIndexRef.current = null;
      promptDraftRef.current = '';
      setInputRef.current('');
      setEditorReferences((prev) => {
        const duplicate = prev.some((item) => item.startLine === ref.startLine && item.endLine === ref.endLine);
        return duplicate ? prev : [...prev, ref];
      });
      window.requestAnimationFrame(() => {
        const textarea = inputRef.current;
        if (textarea) {
          textarea.focus();
          textarea.selectionStart = 0;
          textarea.selectionEnd = 0;
        }
      });
    },
  }), []);

  const generate = useCallback(async (
    userText: string,
    effectiveSettings: AISettings,
    activeMode: ChatMode,
    additionalMessages?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ content: string; usage?: ChatTokenUsage }> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const packedHistory = packHistoryExcludingCurrentUser(chatHistory.get(), userText);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildCopilotContext(effectiveSettings, activeMode, getEditorContent, getDiagnostics) },
      ...packedHistory,
      { role: 'user', content: userText },
      ...(additionalMessages ?? []),
    ];
    // Edit mode must return the entire song, so it needs a generous output
    // budget; ask mode replies are shorter. Too small a limit truncates the
    // song mid-file and leaves no closing code fence to apply.
    const maxTokens = completionTokenLimit(activeMode);
    const createAIChatCompletion = window.electronAPI?.createAIChatCompletion;
    if (typeof createAIChatCompletion === 'function') {
      const signal = controller.signal;
      const completion = createAIChatCompletion({
        endpoint: effectiveSettings.endpoint,
        apiKey: effectiveSettings.apiKey,
        model: effectiveSettings.model,
        messages,
        temperature: 0.7,
        maxTokens,
      });
      // Reject promptly when the renderer aborts (stop button), even though
      // the IPC call itself is cancelled via cancelAIChatCompletion in main.
      if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return new Promise((resolve, reject) => {
        const onAbort = (): void => {
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        completion
          .then((value) => {
            signal.removeEventListener('abort', onAbort);
            if (signal.aborted) {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
              return;
            }
            resolve(normalizeAIChatCompletionResult(value));
          })
          .catch((error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
          });
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveSettings.apiKey) headers.Authorization = `Bearer ${effectiveSettings.apiKey.trim()}`;
    // Newer OpenAI models require max_completion_tokens and reject a custom
    // temperature; other providers use max_tokens.
    const isOpenAI = /(^|\.)openai\.com$/i.test((() => {
      try { return new URL(effectiveSettings.endpoint).host; } catch { return ''; }
    })());
    const body: Record<string, unknown> = {
      model: effectiveSettings.model,
      messages,
      stream: false,
      [isOpenAI ? 'max_completion_tokens' : 'max_tokens']: maxTokens,
    };
    if (!isOpenAI) body.temperature = 0.7;
    const response = await fetch(`${effectiveSettings.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    const data = await response.json();
    return parseAIChatCompletionResponse(data);
  }, [getDiagnostics, getEditorContent]);

  const submitPrompt = useCallback(async (
    text: string,
    activeMode: ChatMode,
    displayText?: string,
  ): Promise<void> => {
    if (!text || chatLoading.get()) return;
    if (!settings.endpoint) {
      setStatus('⚠ No endpoint configured. Click the settings icon to set one.');
      return;
    }
    const secureApiKey = await readDesktopAIAPIKey().catch(() => null);
    const effectiveSettings = secureApiKey !== null
      ? { ...settings, apiKey: secureApiKey }
      : settings;
    if (secureApiKey !== null && secureApiKey !== settings.apiKey) {
      updateChatSettings({ apiKey: secureApiKey });
    }
    // Only record real typed prompts for arrow-up recall — not the verbose
    // machine-generated "apply this snippet" instructions.
    if (!displayText) recordChatPrompt(text);
    pushChatMessage('user', text, displayText
      ? { display: displayText, replyMode: activeMode }
      : { replyMode: activeMode });
    cancelledRef.current = false;
    const requestGen = ++requestGenRef.current;
    chatLoading.set(true);
    let turnUsage: ChatTokenUsage | undefined;
    const requestCompletion = async (
      extra?: Array<{ role: 'user' | 'assistant'; content: string }>,
    ): Promise<string> => {
      const result = await generate(text, effectiveSettings, activeMode, extra);
      turnUsage = addTokenUsage(turnUsage, result.usage);
      return result.content;
    };
    const finishAssistant = (content: string, meta?: Parameters<typeof pushChatMessage>[2]): void => {
      pushChatMessage('assistant', content, { ...meta, usage: turnUsage });
      addCopilotSessionUsage(turnUsage);
    };
    try {
      let response = await requestCompletion();
      if (requestGen !== requestGenRef.current || cancelledRef.current) return;
      let applied = false;
      let changedLines = 0;
      let linesAdded: number | undefined;
      let linesRemoved: number | undefined;
      let linesModified: number | undefined;
      let changeSummary: string[] = [];
      let changeDetails: CopilotChangeDetail[] = [];
      let applyNotes: string[] = [];
      let applyExplanation = '';
      let parseRepairAttempts = 0;
      let incompleteRepairAttempts = 0;
      let mergedSnippet = false;
      let mergedDefinitions = false;
      let lineDiff: AIChangeDiff | undefined;
      let reviewPending = false;

      if (activeMode === 'edit') {
        applyExplanation = extractEditExplanation(response);
        let baxCode = extractBaxCode(response);
        if (baxCode !== null) {
          // Validate and auto-repair: feed parse errors back to the model and retry.
          for (;;) {
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            const validation = validateBaxSource(baxCode);
            if (validation.ok) break;

            if (parseRepairAttempts >= MAX_PARSE_REPAIR_ATTEMPTS) {
              setStatus('⚠ Copilot could not produce valid BeatBax after retries — editor not changed.');
              finishAssistant(response, {
                applyBlocked: true,
                replyMode: activeMode,
                changeSummary: validation.errors.slice(0, 8).map((e) => `Parse error: ${e}`),
              });
              return;
            }

            parseRepairAttempts += 1;
            pushChatNotice(
              `Parse errors detected — asking Copilot to fix (${parseRepairAttempts}/${MAX_PARSE_REPAIR_ATTEMPTS})…`,
            );
            const repairPrompt = buildRepairPrompt(validation.errors, baxCode);
            response = await requestCompletion([
              { role: 'assistant', content: response },
              { role: 'user', content: repairPrompt },
            ]);
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            applyExplanation = extractEditExplanation(response) || applyExplanation;
            const repaired = extractBaxCode(response);
            if (repaired === null) {
              setStatus('⚠ Repair attempt did not return a song — editor not changed.');
              finishAssistant(response, { replyMode: activeMode });
              return;
            }
            baxCode = repaired;
          }

          const previous = getEditorContent();
          const trySnippetMerge = (): boolean => {
            if (baxCode === null) return false;
            const merged = tryMergeSnippetIntoSong(previous, baxCode);
            if (!merged) return false;
            const mergedValidation = validateBaxSource(merged);
            const mergedGuard = assessEditApplyGuard(previous, merged);
            if (!mergedValidation.ok || !mergedGuard.ok) return false;
            baxCode = merged;
            mergedSnippet = true;
            return true;
          };

          for (;;) {
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            const completeness = assessEditApplyGuard(previous, baxCode);
            if (completeness.ok) break;

            if (trySnippetMerge()) break;

            if (incompleteRepairAttempts >= MAX_INCOMPLETE_REPAIR_ATTEMPTS) {
              setStatus('⚠ Copilot returned an incomplete song — editor not changed.');
              finishAssistant(response, {
                applyBlocked: true,
                replyMode: activeMode,
                changeSummary: [completeness.reason ?? 'Response was incomplete.'],
              });
              return;
            }

            incompleteRepairAttempts += 1;
            pushChatNotice(
              `Incomplete reply — asking for full song (${incompleteRepairAttempts}/${MAX_INCOMPLETE_REPAIR_ATTEMPTS})…`,
            );
            const incompletePrompt = buildIncompleteSongRepairPrompt(
              text,
              previous,
              baxCode,
              completeness.reason ?? 'Response was incomplete.',
            );
            response = await requestCompletion([
              { role: 'assistant', content: response },
              { role: 'user', content: incompletePrompt },
            ]);
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            applyExplanation = extractEditExplanation(response) || applyExplanation;
            const expanded = extractBaxCode(response);
            if (expanded === null) {
              setStatus('⚠ Repair attempt did not return a song — editor not changed.');
              finishAssistant(response, { replyMode: activeMode });
              return;
            }
            baxCode = expanded;
          }

          const diagnosticsBefore = getDiagnostics();
          let applyCode = baxCode;
          const rawDiffCount = countAIChangeDiff(computeLineChangeDiff(previous, baxCode)).total;
          if (rawDiffCount > 8) {
            const defMerged = tryMergeChangedDefinitions(previous, baxCode);
            if (defMerged) {
              const mergedValidation = validateBaxSource(defMerged);
              if (mergedValidation.ok) {
                const mergedCount = countAIChangeDiff(computeLineChangeDiff(previous, defMerged)).total;
                if (mergedCount > 0 && mergedCount < rawDiffCount) {
                  applyCode = defMerged;
                  mergedDefinitions = true;
                }
              }
            }
          }
          lineDiff = computeLineChangeDiff(previous, applyCode);
          const diffCounts = countAIChangeDiff(lineDiff);
          reviewPending = diffCounts.total > 0 && Boolean(previous.trim());
          onReplaceEditor(applyCode, { beginCopilotReview: reviewPending });
          if (reviewPending) onHighlightChanges(lineDiff, previous);
          setStatus('');
          applied = true;
          changedLines = diffCounts.total;
          linesAdded = diffCounts.added;
          linesRemoved = diffCounts.removed;
          linesModified = diffCounts.modified;
          const report = buildCopilotChangeReport(previous, applyCode, lineDiff, {
            userPrompt: text,
            diagnosticsBefore,
          });
          changeDetails = report.details;
          changeSummary = report.changeSummary;
          applyNotes = [...report.notes];
          if (parseRepairAttempts > 0) {
            applyNotes.unshift(
              `Fixed ${parseRepairAttempts} parse error${parseRepairAttempts === 1 ? '' : 's'} automatically on retry`,
            );
          }
          if (incompleteRepairAttempts > 0 && !mergedSnippet && !mergedDefinitions) {
            applyNotes.unshift(
              `Expanded snippet to full song on retry (${incompleteRepairAttempts} attempt${incompleteRepairAttempts === 1 ? '' : 's'})`,
            );
          }
          if (mergedDefinitions) {
            applyNotes.unshift('Merged definition updates into your song (preserved comments and formatting).');
          }
          if (mergedSnippet) {
            applyNotes.unshift('Applied a single-line pattern/sequence update (model returned a snippet).');
          }
        } else {
          setStatus('⚠ Copilot did not return an applicable song, so the editor was not changed. Try again.');
        }
      }
      finishAssistant(
        response,
        applied ? {
          replyMode: activeMode,
          applied: true,
          applyOutcome: reviewPending ? 'pending' : 'kept',
          changedLines,
          linesAdded,
          linesRemoved,
          linesModified,
          changeSummary,
          changeDetails,
          applyNotes,
          applyExplanation: applyExplanation || undefined,
          documentName: readPersistedDocument().name,
        } : { replyMode: activeMode },
      );
    } catch (error) {
      if (requestGen !== requestGenRef.current || cancelledRef.current) return;
      const message = userFacingAIError(error);
      if ((error as Error).name === 'AbortError' || /cancelled/i.test(message)) {
        pushChatNotice('Request cancelled.');
      } else {
        pushChatMessage('assistant', `⚠ ${message}`, { replyMode: activeMode, usage: turnUsage });
      }
    } finally {
      if (requestGen === requestGenRef.current) {
        chatLoading.set(false);
        abortRef.current = null;
      }
    }
  }, [generate, getEditorContent, loading, onHighlightChanges, onReplaceEditor, settings]);

  submitPromptRef.current = submitPrompt;

  const applyFixInEditMode = useCallback(async (snippet?: string, assistantContext?: string) => {
    if (loading) {
      pushChatNotice('Copilot is still busy — wait for the current reply.');
      return;
    }
    const previous = getEditorContent();
    if (snippet?.trim()) {
      const merged = tryMergeSnippetIntoSong(previous, snippet);
      if (merged) {
        const validation = validateBaxSource(merged);
        if (validation.ok) {
          if (merged === previous) {
            pushChatNotice('That fix is already applied in the editor.');
            return;
          }
          onReplaceEditor(merged);
          pushChatNotice('Applied fix to the editor.');
          return;
        }
      }
    }
    chatMode.set('edit');
    pushChatNotice('Switched to Edit mode — applying fix…');
    const prompt = buildMinimalEditFixPrompt(snippet, assistantContext);
    await submitPromptRef.current(
      prompt,
      'edit',
      snippet?.trim() ? 'Apply suggested fix' : 'Apply fix from explanation',
    );
  }, [getEditorContent, loading, onReplaceEditor]);

  const cancelRequest = useCallback((): void => {
    if (!loading) return;
    cancelledRef.current = true;
    requestGenRef.current += 1;
    abortRef.current?.abort();
    void window.electronAPI?.cancelAIChatCompletion?.().catch(() => undefined);
    chatLoading.set(false);
    abortRef.current = null;
    pushChatNotice('Request cancelled.');
  }, [loading]);

  const sendMessage = useCallback(async (): Promise<void> => {
    const text = input.trim();
    if ((!text && editorReferences.length === 0) || loading) return;
    const resolvedPrompt = buildUserMessageWithReferences(text, editorReferences, getEditorContent());
    const refLabels = editorReferences.map(formatCopilotReferenceLabel).join(', ');
    const displayText = editorReferences.length > 0
      ? (text ? `[${refLabels}] ${text}` : `[${refLabels}]`)
      : undefined;
    setInput('');
    setEditorReferences([]);
    promptHistoryIndexRef.current = null;
    promptDraftRef.current = '';
    if (text) recordChatPrompt(text);
    await submitPrompt(resolvedPrompt, mode, displayText);
  }, [editorReferences, getEditorContent, input, loading, mode, submitPrompt]);


  const modelLabel = useMemo(() => settings.model || 'model not set', [settings.model]);

  const draftUserText = useMemo(
    () => buildUserMessageWithReferences(input.trim(), editorReferences, getEditorContent()),
    [editorReferences, getEditorContent, input],
  );

  const lastUsage = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const message = history[i];
      if (message.role === 'assistant' && !message.system && message.usage) return message.usage;
    }
    return undefined;
  }, [history]);

  const systemPromptText = useMemo(() => {
    if (!visible) return '';
    return buildCopilotContext(settings, mode, getEditorContent, getDiagnostics);
  }, [getDiagnostics, getEditorContent, history, mode, settings, visible]);

  const contextBudget = useMemo(() => {
    const split = splitContextBudgetMessages(history, draftUserText);
    return estimateContextBudget({
      systemText: systemPromptText,
      historyTexts: split.historyTexts,
      userText: split.userText,
      reservedOutput: completionTokenLimit(mode),
      windowTokens: settings.contextWindowTokens,
    });
  }, [draftUserText, history, mode, settings.contextWindowTokens, systemPromptText]);


  const startNewChat = useCallback((): void => {
    if (loading) return;
    createCopilotSession({ songHint: readPersistedDocument().name });
  }, [loading]);

  const handleSwitchSession = useCallback((id: string): void => {
    if (loading) return;
    switchCopilotSession(id);
  }, [loading]);

  const handleDeleteSession = useCallback((id: string): void => {
    if (loading && id === activeSessionId) return;
    deleteCopilotSession(id);
  }, [activeSessionId, loading]);

  const setInputFromHistory = useCallback((value: string): void => {
    setInput(value);
    window.requestAnimationFrame(() => {
      const textarea = inputRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.selectionStart = value.length;
      textarea.selectionEnd = value.length;
    });
  }, []);

  const handleInputKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
      return;
    }
    if (
      (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
      || event.shiftKey
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || promptHistory.length === 0
    ) {
      return;
    }

    const textarea = event.currentTarget;
    const caret = textarea.selectionStart ?? 0;
    const value = textarea.value;
    const beforeCaret = value.slice(0, caret);
    const afterCaret = value.slice(caret);
    const onFirstLine = !beforeCaret.includes('\n');
    const onLastLine = !afterCaret.includes('\n');
    if (event.key === 'ArrowUp' && !onFirstLine) return;
    if (event.key === 'ArrowDown' && !onLastLine) return;

    event.preventDefault();
    const currentIndex = promptHistoryIndexRef.current;
    if (event.key === 'ArrowUp') {
      if (currentIndex === null) {
        promptDraftRef.current = value;
        const nextIndex = promptHistory.length - 1;
        promptHistoryIndexRef.current = nextIndex;
        setInputFromHistory(promptHistory[nextIndex]);
      } else if (currentIndex > 0) {
        const nextIndex = currentIndex - 1;
        promptHistoryIndexRef.current = nextIndex;
        setInputFromHistory(promptHistory[nextIndex]);
      }
      return;
    }

    if (currentIndex === null) return;
    if (currentIndex < promptHistory.length - 1) {
      const nextIndex = currentIndex + 1;
      promptHistoryIndexRef.current = nextIndex;
      setInputFromHistory(promptHistory[nextIndex]);
    } else {
      promptHistoryIndexRef.current = null;
      setInputFromHistory(promptDraftRef.current);
    }
  }, [promptHistory, sendMessage, setInputFromHistory]);

  return (
    <div className="bb-chat-panel" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="bb-chat-header">
        <div className="bb-chat-title-row">
          <span className="bb-chat-title" dangerouslySetInnerHTML={{ __html: `${icon('sparkles', 'w-4 h-4 inline-block mr-1')}BeatBax Copilot` }} />
          <div className="bb-chat-header-actions">
            <CopilotSessionPicker
              activeId={activeSessionId}
              disabled={loading}
              onDelete={handleDeleteSession}
              onSwitch={handleSwitchSession}
              sessions={sessions}
            />
            <button
              aria-label="New chat"
              className="bb-chat-settings-btn"
              dangerouslySetInnerHTML={{ __html: icon('plus', 'w-4 h-4') }}
              disabled={loading}
              onClick={startNewChat}
              title="New chat"
              type="button"
            />
            <button
              aria-label="Open AI settings"
              className="bb-chat-settings-btn"
              dangerouslySetInnerHTML={{ __html: icon('cog-6-tooth', 'w-4 h-4') }}
              onClick={onOpenSettings}
              title="Open AI settings"
              type="button"
            />
          </div>
        </div>
      </div>

      <div className="bb-chat-status" style={{ display: status ? 'block' : 'none' }}>{status}</div>

      <div className="bb-chat-messages" ref={messagesRef}>
        {history.map((message) => (
            <ChatMessageView
              key={`${message.timestamp}-${message.role}`}
              message={message}
              mode={mode}
              onFixInEditMode={applyFixInEditMode}
              onInsertSnippet={onInsertSnippet}
              onReplaceEditor={onReplaceEditor}
              onReplaceSelection={onReplaceSelection}
              onRevealEditorChange={onRevealEditorChange}
              showReviewActions={Boolean(
                liveReviewMessage
                && isSameChatMessage(message, liveReviewMessage),
              )}
              copilotReviewActions={copilotReviewActions}
            />
        ))}
        {loading ? (
          <div className="bb-chat-typing">
            <span className="bb-chat-typing-dot" />
            <span className="bb-chat-typing-dot" />
            <span className="bb-chat-typing-dot" />
          </div>
        ) : null}
      </div>

      <div className="bb-chat-input-row">
        {editorReferences.length > 0 ? (
          <div className="bb-chat-ref-list" aria-label="Referenced editor lines">
            {editorReferences.map((ref) => (
              <span className="bb-chat-ref-chip" key={ref.id} title={ref.preview}>
                <span className="bb-chat-ref-chip-label">{formatCopilotReferenceLabel(ref)}</span>
                <span className="bb-chat-ref-chip-preview">{ref.preview}</span>
                <button
                  aria-label={`Remove reference to ${formatCopilotReferenceLabel(ref)}`}
                  className="bb-chat-ref-chip-remove"
                  onClick={() => {
                    setEditorReferences((prev) => prev.filter((item) => item.id !== ref.id));
                  }}
                  type="button"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="bb-chat-input-wrap">
          <textarea
            className="bb-chat-input"
            onChange={(event) => {
              promptHistoryIndexRef.current = null;
              promptDraftRef.current = '';
              setInput(event.target.value);
              adjustCopilotInputHeight(event.currentTarget);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={mode === 'edit'
              ? (editorReferences.length > 0
                ? 'Describe a change for the referenced line(s)... (Shift+Enter for newline)'
                : 'Describe a change... (Shift+Enter for newline)')
              : (editorReferences.length > 0
                ? 'Ask about the referenced line(s)... (Shift+Enter for newline)'
                : 'Ask a question... (Shift+Enter for newline)')}
            ref={inputRef}
            rows={2}
            value={input}
          />
          <button
            aria-label={loading ? 'Cancel request' : 'Send message'}
            className={`bb-chat-send-btn${loading ? ' bb-chat-send-btn--stop' : ''}`}
            dangerouslySetInnerHTML={{ __html: loading ? '■' : icon('paper-airplane', 'w-5 h-5') }}
            onClick={() => {
              if (loading) cancelRequest();
              else void sendMessage();
            }}
            title={loading ? 'Cancel request' : 'Send message (Enter)'}
            type="button"
          />
        </div>
      </div>

      <div className="bb-chat-footer">
        <div className="bb-chat-footer-meta">
          <CopilotContextMeter
            budget={contextBudget}
            lastCompletion={lastUsage?.completionTokens}
            lastPrompt={lastUsage?.promptTokens}
          />
          <CopilotModePicker mode={mode} onChange={(next) => chatMode.set(next)} />
          <span className="bb-chat-model-label" title={modelLabel}>{modelLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function createDesktopCopilotPanel(
  container: HTMLElement,
  props: Omit<DesktopCopilotPanelProps, 'panelRef'>,
): DesktopCopilotPanelHandle {
  const handleRef = { current: null as DesktopCopilotPanelHandle | null };
  let root: Root | null = mountReactRoot(container);

  flushSync(() => {
    root?.render(
      <DesktopCopilotPanel
        {...props}
        panelRef={(handle) => {
          handleRef.current = handle;
        }}
      />,
    );
  });

  const call = (fn: (handle: DesktopCopilotPanelHandle) => void) => {
    if (handleRef.current) fn(handleRef.current);
  };

  return {
    show: () => call((handle) => handle.show()),
    hide: () => call((handle) => handle.hide()),
    askAboutError: (options) => call((handle) => handle.askAboutError(options)),
    addSelectionToChat: (options) => call((handle) => handle.addSelectionToChat(options)),
    dispose: () => {
      handleRef.current?.dispose();
      unmountReactRoot(container, root);
      root = null;
    },
  };
}
