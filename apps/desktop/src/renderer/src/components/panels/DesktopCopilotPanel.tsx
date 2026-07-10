import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { parseWithPeggy } from '@beatbax/engine/parser';
import type { Diagnostic } from '@beatbax/app-core/editor/diagnostics';
import {
  chatHistory,
  chatLoading,
  chatMode,
  chatPromptHistory,
  chatSettings,
  clearChatHistory,
  clearChatPromptHistory,
  markChatRead,
  pushChatMessage,
  pushChatNotice,
  recordChatPrompt,
  updateChatSettings,
  type AISettings,
  type ChatMessage,
  type ChatMode,
} from '@beatbax/app-core/stores/chat.store';
import { buildCopilotContext } from '../../lib/copilot-context';
import { icon } from '../../utils/icons';

interface DesktopCopilotPanelProps {
  panelRef: Ref<DesktopCopilotPanelHandle>;
  getEditorContent: () => string;
  getDiagnostics: () => Diagnostic[];
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string) => void;
  onHighlightChanges: (diff: AIChangeDiff, previousContent: string) => void;
  onOpenSettings: () => void;
}

export interface DesktopCopilotPanelHandle {
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

/** Line-level diff between previous and applied song content. */
export interface AIChangeDiff {
  /** 1-based lines in the new file that were purely added (not replacements). */
  added: number[];
  /**
   * Pure deletions anchored to a line in the new file (the line after the gap).
   * The removed text is from the previous file.
   */
  removed: Array<{
    line: number;
    removed: Array<{ oldLine: number; text: string }>;
  }>;
  /**
   * In-place line replacements: old text removed and new text inserted at the
   * same position (e.g. fixing commas on one pattern line).
   */
  modified: Array<{
    line: number;
    removed: Array<{ oldLine: number; text: string }>;
    newLines: number[];
  }>;
}

/** User-facing line counts for banners and chat badges. */
export function countAIChangeDiff(diff: AIChangeDiff): {
  added: number;
  removed: number;
  modified: number;
  total: number;
} {
  const added = diff.added.length;
  const removed = diff.removed.reduce((n, a) => n + a.removed.length, 0);
  const modified = diff.modified.length;
  return { added, removed, modified, total: added + removed + modified };
}

export function formatAIChangeBanner(diff: AIChangeDiff): string {
  const { added, removed, modified } = countAIChangeDiff(diff);
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} changed`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (parts.length === 0) return 'AI: no line changes';
  if (parts.length === 1) {
    if (modified > 0) return `AI: ${modified} line${modified !== 1 ? 's' : ''} changed`;
    if (added > 0) return `AI: ${added} line${added !== 1 ? 's' : ''} added`;
    return `AI: ${removed} line${removed !== 1 ? 's' : ''} removed`;
  }
  return `AI: ${parts.join(', ')}`;
}

interface SummarizeContext {
  userPrompt?: string;
  diagnosticsBefore?: Diagnostic[];
}


function safeMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content, { breaks: true, gfm: true }) as string, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  });
}

/** Inline markdown (no block `<p>` wrapping) — for list items and short labels. */
function safeMarkdownInline(content: string): string {
  return DOMPurify.sanitize(marked.parseInline(content, { breaks: true, gfm: true }) as string, {
    ALLOWED_TAGS: ['br', 'strong', 'em', 'code', 'a', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  });
}

/**
 * Builds an explicit Edit-mode prompt from a single snippet the user chose to
 * apply, so the model gets a concrete instruction (and the original intent)
 * rather than the vague original question.
 */
function buildApplyPrompt(userPrompt: string | undefined, snippet: string): string {
  const intro = userPrompt?.trim() ? `Original request: ${userPrompt.trim()}\n\n` : '';
  return `${intro}Apply this specific suggestion to the song now. Integrate the following BeatBax into the existing arrangement and return the full updated song:\n\n\`\`\`bax\n${snippet}\n\`\`\``;
}

/** First non-empty line of a snippet, for a short friendly transcript label. */
function snippetLabel(snippet: string): string {
  const line = snippet.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? 'change';
  const clipped = line.length > 48 ? `${line.slice(0, 48)}…` : line;
  return `Apply: ${clipped}`;
}

function splitBaxBlocks(content: string): Array<{ type: 'text' | 'code'; value: string }> {
  const result: Array<{ type: 'text' | 'code'; value: string }> = [];
  const pattern = /```bax\s*\n([\s\S]*?)```/g;
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

/**
 * LCS line diff between two song versions. Returns added/changed lines in the
 * new file plus deletion anchors (removed lines no longer exist in the editor).
 */
function diffLineChanges(previous: string, next: string): AIChangeDiff {
  const oldLines = previous.split('\n');
  const newLines = next.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const added: number[] = [];
  const removed: AIChangeDiff['removed'] = [];
  let i = 0;
  let j = 0;

  while (i < n || j < m) {
    if (i < n && j < m && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }
    if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      const batch: Array<{ oldLine: number; text: string }> = [];
      while (i < n && (j >= m || (oldLines[i] !== newLines[j] && dp[i + 1][j] >= dp[i][j + 1]))) {
        batch.push({ oldLine: i + 1, text: oldLines[i] });
        i++;
      }
      const anchor = j < m ? j + 1 : Math.max(1, m);
      if (batch.length > 0) removed.push({ line: anchor, removed: batch });
    } else if (j < m) {
      added.push(j + 1);
      j++;
    } else {
      i++;
    }
  }

  return collapseModifications({ added, removed, modified: [] }, next);
}

/**
 * Pair removals with additions at the same anchor so in-place edits read as
 * "changed" rather than "1 added, 1 removed".
 */
function collapseModifications(raw: AIChangeDiff, _next: string): AIChangeDiff {
  const addedSet = new Set(raw.added);
  const modified: AIChangeDiff['modified'] = [];
  const pureRemoved: AIChangeDiff['removed'] = [];

  for (const anchor of raw.removed) {
    const start = anchor.line;
    const newLineNums: number[] = [];
    let line = start;
    while (addedSet.has(line)) {
      newLineNums.push(line);
      addedSet.delete(line);
      line++;
    }
    if (newLineNums.length > 0) {
      modified.push({ line: start, removed: anchor.removed, newLines: newLineNums });
    } else {
      pureRemoved.push(anchor);
    }
  }

  return { added: [...addedSet], removed: pureRemoved, modified };
}

function clipSnippet(text: string, max = 56): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '(empty line)';
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

type BaxDefKind = 'pattern' | 'sequence' | 'instrument' | 'effect' | 'channel';

interface BaxDef {
  kind: BaxDefKind;
  name: string;
  /** Whitespace-normalised definition body, used to detect real changes. */
  body: string;
  /** Full source line as written in the file. */
  line: string;
}

const BAX_DEF_LABEL: Record<BaxDefKind, string> = {
  pattern: 'pattern',
  sequence: 'sequence',
  instrument: 'instrument',
  effect: 'effect',
  channel: 'channel',
};

/**
 * Collects top-level BeatBax definitions keyed by `kind:name`. Comments are NOT
 * stripped (a `#` also denotes a sharp, e.g. `C#5`), but internal whitespace is
 * collapsed so pure reformatting is not reported as a change.
 */
function collectBaxDefs(content: string): Map<string, BaxDef> {
  const defs = new Map<string, BaxDef>();
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^pat\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`pattern:${m[1]}`, { kind: 'pattern', name: m[1], body: norm(m[2]), line });
    } else if ((m = line.match(/^seq\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`sequence:${m[1]}`, { kind: 'sequence', name: m[1], body: norm(m[2]), line });
    } else if ((m = line.match(/^effect\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`effect:${m[1]}`, { kind: 'effect', name: m[1], body: norm(m[2]), line });
    } else if ((m = line.match(/^inst\s+([A-Za-z_]\w*)\s+(.*)$/))) {
      defs.set(`instrument:${m[1]}`, { kind: 'instrument', name: m[1], body: norm(m[2]), line });
    } else if ((m = line.match(/^channel\s+(\d+)\s*=>\s*(.*)$/))) {
      defs.set(`channel:${m[1]}`, { kind: 'channel', name: m[1], body: norm(m[2]), line });
    }
  }
  return defs;
}

function describeBaxDef(def: BaxDef): string {
  if (def.kind === 'channel') return `channel ${def.name}`;
  return `${BAX_DEF_LABEL[def.kind]} \`${def.name}\``;
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

function buildRepairPrompt(errors: string[], brokenSong: string): string {
  const errorList = errors.map((e) => `- ${e}`).join('\n');
  return [
    'Your previous edit could not be applied because the BeatBax parser reported these errors:',
    errorList,
    '',
    'Return ONLY the corrected full song as a single ```bax fenced code block — no prose before or after.',
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
 * Produces a short bullet list summarising the structural edits between two
 * versions of a song (added/updated/removed definitions). Falls back to a
 * line-count note when only comments/metadata/spacing changed.
 */
function summarizeBaxChanges(
  previous: string,
  next: string,
  lineDiff: AIChangeDiff,
  context?: SummarizeContext,
): string[] {
  const before = collectBaxDefs(previous);
  const after = collectBaxDefs(next);
  const bullets: string[] = [];

  const errorsBefore = context?.diagnosticsBefore?.filter((d) => d.severity === 'error') ?? [];
  if (errorsBefore.length > 0) {
    const preview = errorsBefore.slice(0, 2).map((d) => clipSnippet(d.message, 72)).join('; ');
    const extra = errorsBefore.length > 2 ? ` (+${errorsBefore.length - 2} more)` : '';
    bullets.push(`Fixed ${errorsBefore.length} editor error${errorsBefore.length === 1 ? '' : 's'}: ${preview}${extra}`);
  }

  for (const [key, def] of after) {
    const prev = before.get(key);
    if (!prev) {
      bullets.push(`Added ${describeBaxDef(def)} — \`${clipSnippet(def.line)}\``);
    } else if (prev.body !== def.body) {
      bullets.push(
        `Updated ${describeBaxDef(def)} — \`${clipSnippet(def.line)}\` (was: \`${clipSnippet(prev.line)}\`)`,
      );
    }
  }
  for (const [key, def] of before) {
    if (!after.has(key)) {
      bullets.push(`Removed ${describeBaxDef(def)} — \`${clipSnippet(def.line)}\``);
    }
  }

  // Line-level removals not already covered by a removed definition line.
  const removedDefLineTexts = new Set(
    [...before.entries()]
      .filter(([key]) => !after.has(key))
      .map(([, def]) => def.line.trim()),
  );
  for (const anchor of lineDiff.removed) {
    for (const row of anchor.removed) {
      if (removedDefLineTexts.has(row.text.trim())) continue;
      bullets.push(`Removed line ${row.oldLine} — \`${clipSnippet(row.text)}\``);
    }
  }

  const changedLineCount = countAIChangeDiff(lineDiff).total;
  if (bullets.length === 0 && changedLineCount > 0) {
    bullets.push(`Adjusted ${changedLineCount} line${changedLineCount === 1 ? '' : 's'} (comments, metadata, or spacing)`);
  }

  const MAX_BULLETS = 12;
  if (bullets.length > MAX_BULLETS) {
    const overflow = bullets.length - MAX_BULLETS;
    return [...bullets.slice(0, MAX_BULLETS), `…and ${overflow} more change${overflow === 1 ? '' : 's'}`];
  }
  return bullets;
}

function userFacingAIError(error: unknown): string {
  const raw = (error as Error).message || String(error);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

function formatAppliedLineText(message: ChatMessage): string {
  const added = message.linesAdded ?? 0;
  const removed = message.linesRemoved ?? 0;
  const modified = message.linesModified ?? 0;
  const total = message.changedLines ?? added + removed + modified;
  if (total <= 0) return '';
  const parts: string[] = [];
  if (modified > 0) parts.push(`${modified} changed`);
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  if (parts.length === 1) {
    if (modified > 0) return ` — ${modified} line${modified === 1 ? '' : 's'} changed`;
    if (removed > 0) return ` — ${removed} line${removed === 1 ? '' : 's'} removed`;
    return ` — ${added} line${added === 1 ? '' : 's'} added`;
  }
  return ` — ${parts.join(', ')}`;
}

async function readDesktopAIAPIKey(): Promise<string | null> {
  const getAIAPIKey = window.electronAPI?.getAIAPIKey;
  if (typeof getAIAPIKey !== 'function') return null;
  return (await getAIAPIKey()).trim();
}

function ChatMessageView({
  message,
  mode,
  loading,
  userPrompt,
  onApplyInEditMode,
  onInsertSnippet,
  onReplaceSelection,
  onReplaceEditor,
}: {
  message: ChatMessage;
  mode: ChatMode;
  loading: boolean;
  userPrompt?: string;
  onApplyInEditMode: (prompt: string, displayText: string) => void;
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string) => void;
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
        <span className="bb-chat-msg-label">You</span>
        <p className="bb-chat-msg-text">{message.display ?? message.content}</p>
      </div>
    );
  }

  const body = (
    <div className="bb-chat-markdown">
      {splitBaxBlocks(message.content).map((part, index) => {
          if (part.type === 'text') {
            return <div dangerouslySetInnerHTML={{ __html: safeMarkdown(part.value) }} key={`text-${index}`} />;
          }
          return (
            <div className="bb-chat-code-block" key={`code-${index}`}>
              <pre><code className="bb-chat-code">{part.value}</code></pre>
              <div className="bb-chat-code-actions">
                {mode === 'ask' ? (
                  <>
                    <button
                      className="bb-chat-action-btn bb-chat-action-btn--primary"
                      disabled={loading}
                      onClick={() => onApplyInEditMode(buildApplyPrompt(userPrompt, part.value), snippetLabel(part.value))}
                      title="Switch to Edit mode and apply this snippet to the song"
                      type="button"
                    >
                      ⤴ Apply in Edit mode
                    </button>
                    <button className="bb-chat-action-btn" onClick={() => void navigator.clipboard?.writeText(part.value)} type="button">
                      ⧉ Copy
                    </button>
                  </>
                ) : (
                  <>
                    <button className="bb-chat-action-btn bb-chat-action-btn--primary" onClick={() => onReplaceEditor(part.value)} type="button">
                      ↺ Replace editor
                    </button>
                    <button className="bb-chat-action-btn" onClick={() => onInsertSnippet(part.value)} type="button">
                      Insert at cursor
                    </button>
                    <button className="bb-chat-action-btn" onClick={() => onReplaceSelection(part.value)} type="button">
                      Replace selection
                    </button>
                  </>
                )}
              </div>
            </div>
          );
      })}
    </div>
  );

  if (message.applyBlocked) {
    const summary = message.changeSummary ?? [];
    return (
      <div className="bb-chat-msg bb-chat-msg--assistant">
        <span className="bb-chat-msg-label">Copilot</span>
        <div className="bb-chat-applied bb-chat-applied--blocked">
          <span className="bb-chat-applied-badge bb-chat-applied-badge--blocked">⚠ Not applied — song has parse errors</span>
          {summary.length > 0 ? (
            <ul className="bb-chat-applied-summary">
              {summary.map((item, index) => (
                <li dangerouslySetInnerHTML={{ __html: safeMarkdownInline(item) }} key={`err-${index}`} />
              ))}
            </ul>
          ) : null}
          <span className="bb-chat-applied-hint">The editor was left unchanged. Ask Copilot to fix the errors, or edit manually.</span>
        </div>
        <details className="bb-chat-applied-details">
          <summary>View returned song</summary>
          {body}
        </details>
      </div>
    );
  }

  if (message.applied) {
    const lineText = formatAppliedLineText(message);
    const summary = message.changeSummary ?? [];
    const outcome = message.applyOutcome;

    if (outcome === 'discarded') {
      return (
        <div className="bb-chat-msg bb-chat-msg--assistant">
          <span className="bb-chat-msg-label">Copilot</span>
          <div className="bb-chat-applied bb-chat-applied--discarded">
            <span className="bb-chat-applied-badge bb-chat-applied-badge--discarded">↩ Discarded{lineText}</span>
            {summary.length > 0 ? (
              <>
                <span className="bb-chat-applied-hint">Reverted changes:</span>
                <ul className="bb-chat-applied-summary">
                  {summary.map((item, index) => (
                    <li dangerouslySetInnerHTML={{ __html: safeMarkdownInline(item) }} key={`sum-${index}`} />
                  ))}
                </ul>
              </>
            ) : null}
            <span className="bb-chat-applied-hint">Editor restored to the version before this edit.</span>
          </div>
          <details className="bb-chat-applied-details">
            <summary>View returned song</summary>
            {body}
          </details>
        </div>
      );
    }

    if (outcome === 'kept') {
      return (
        <div className="bb-chat-msg bb-chat-msg--assistant">
          <span className="bb-chat-msg-label">Copilot</span>
          <div className="bb-chat-applied">
            <span className="bb-chat-applied-badge">✓ Kept in editor{lineText}</span>
            {summary.length > 0 ? (
              <ul className="bb-chat-applied-summary">
                {summary.map((item, index) => (
                  <li dangerouslySetInnerHTML={{ __html: safeMarkdownInline(item) }} key={`sum-${index}`} />
                ))}
              </ul>
            ) : null}
          </div>
          <details className="bb-chat-applied-details">
            <summary>View returned song</summary>
            {body}
          </details>
        </div>
      );
    }

    return (
      <div className="bb-chat-msg bb-chat-msg--assistant">
        <span className="bb-chat-msg-label">Copilot</span>
        <div className="bb-chat-applied">
          <span className="bb-chat-applied-badge">✓ Applied to editor{lineText}</span>
          {summary.length > 0 ? (
            <ul className="bb-chat-applied-summary">
              {summary.map((item, index) => (
                <li dangerouslySetInnerHTML={{ __html: safeMarkdownInline(item) }} key={`sum-${index}`} />
              ))}
            </ul>
          ) : null}
          <span className="bb-chat-applied-hint">
            {outcome === 'pending'
              ? 'Review highlights in the editor, then choose Keep or Discard in the banner.'
              : 'Press Ctrl+Z, or use the Discard button in the editor, to undo.'}
          </span>
        </div>
        <details className="bb-chat-applied-details">
          <summary>View returned song</summary>
          {body}
        </details>
      </div>
    );
  }

  return (
    <div className="bb-chat-msg bb-chat-msg--assistant">
      <span className="bb-chat-msg-label">Copilot</span>
      {body}
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
}: DesktopCopilotPanelProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const [settings, setSettings] = useState(chatSettings.get());
  const [mode, setMode] = useState(chatMode.get());
  const [history, setHistory] = useState(chatHistory.get());
  const [promptHistory, setPromptHistory] = useState(chatPromptHistory.get());
  const [loading, setLoading] = useState(chatLoading.get());
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const cancelledRef = useRef(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const promptHistoryIndexRef = useRef<number | null>(null);
  const promptDraftRef = useRef('');

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
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

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
    const isLocal = settings.endpoint.includes('localhost') || settings.endpoint.includes('127.0.0.1');
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
  }), []);

  const generate = useCallback(async (
    userText: string,
    effectiveSettings: AISettings,
    activeMode: ChatMode,
    additionalMessages?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: buildCopilotContext(effectiveSettings, activeMode, getEditorContent, getDiagnostics) },
      ...history.filter((msg) => !msg.system).slice(-10).map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userText },
      ...(additionalMessages ?? []),
    ];
    // Edit mode must return the entire song, so it needs a generous output
    // budget; ask mode replies are shorter. Too small a limit truncates the
    // song mid-file and leaves no closing code fence to apply.
    const maxTokens = activeMode === 'edit' ? 8192 : 2048;
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
      return new Promise<string>((resolve, reject) => {
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
            resolve(value);
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
    return data?.choices?.[0]?.message?.content ?? '(no response)';
  }, [getDiagnostics, getEditorContent, history]);

  const submitPrompt = useCallback(async (
    text: string,
    activeMode: ChatMode,
    displayText?: string,
  ): Promise<void> => {
    if (!text || loading) return;
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
    pushChatMessage('user', text, displayText ? { display: displayText } : undefined);
    cancelledRef.current = false;
    const requestGen = ++requestGenRef.current;
    chatLoading.set(true);
    try {
      let response = await generate(text, effectiveSettings, activeMode);
      if (requestGen !== requestGenRef.current || cancelledRef.current) return;
      let applied = false;
      let changedLines = 0;
      let linesAdded: number | undefined;
      let linesRemoved: number | undefined;
      let linesModified: number | undefined;
      let changeSummary: string[] = [];
      let repairAttempts = 0;
      let lineDiff: AIChangeDiff | undefined;
      let reviewPending = false;

      if (activeMode === 'edit') {
        let baxCode = extractBaxCode(response);
        if (baxCode !== null) {
          // Validate and auto-repair: feed parse errors back to the model and retry.
          for (;;) {
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            const validation = validateBaxSource(baxCode);
            if (validation.ok) break;

            if (repairAttempts >= MAX_PARSE_REPAIR_ATTEMPTS) {
              setStatus('⚠ Copilot could not produce valid BeatBax after retries — editor not changed.');
              pushChatMessage('assistant', response, {
                applyBlocked: true,
                changeSummary: validation.errors.slice(0, 8).map((e) => `Parse error: ${e}`),
              });
              return;
            }

            repairAttempts += 1;
            pushChatNotice(
              `Parse errors detected — asking Copilot to fix (${repairAttempts}/${MAX_PARSE_REPAIR_ATTEMPTS})…`,
            );
            const repairPrompt = buildRepairPrompt(validation.errors, baxCode);
            response = await generate(text, effectiveSettings, activeMode, [
              { role: 'assistant', content: response },
              { role: 'user', content: repairPrompt },
            ]);
            if (requestGen !== requestGenRef.current || cancelledRef.current) return;
            const repaired = extractBaxCode(response);
            if (repaired === null) {
              setStatus('⚠ Repair attempt did not return a song — editor not changed.');
              pushChatMessage('assistant', response);
              return;
            }
            baxCode = repaired;
          }

          const diagnosticsBefore = getDiagnostics();
          const previous = getEditorContent();
          onReplaceEditor(baxCode);
          lineDiff = diffLineChanges(previous, baxCode);
          const diffCounts = countAIChangeDiff(lineDiff);
          reviewPending = diffCounts.total > 0 && Boolean(previous.trim());
          if (reviewPending) onHighlightChanges(lineDiff, previous);
          setStatus('');
          applied = true;
          changedLines = diffCounts.total;
          linesAdded = diffCounts.added;
          linesRemoved = diffCounts.removed;
          linesModified = diffCounts.modified;
          changeSummary = summarizeBaxChanges(previous, baxCode, lineDiff, {
            userPrompt: text,
            diagnosticsBefore,
          });
          if (repairAttempts > 0) {
            changeSummary.unshift(
              `Fixed ${repairAttempts} parse error${repairAttempts === 1 ? '' : 's'} automatically on retry`,
            );
          }
        } else {
          setStatus('⚠ Copilot did not return an applicable song, so the editor was not changed. Try again.');
        }
      }
      pushChatMessage(
        'assistant',
        response,
        applied ? {
          applied: true,
          applyOutcome: reviewPending ? 'pending' : 'kept',
          changedLines,
          linesAdded,
          linesRemoved,
          linesModified,
          changeSummary,
        } : undefined,
      );
    } catch (error) {
      if (requestGen !== requestGenRef.current || cancelledRef.current) return;
      const message = userFacingAIError(error);
      if ((error as Error).name === 'AbortError' || /cancelled/i.test(message)) {
        pushChatNotice('Request cancelled.');
      } else {
        pushChatMessage('assistant', `⚠ ${message}`);
      }
    } finally {
      if (requestGen === requestGenRef.current) {
        chatLoading.set(false);
        abortRef.current = null;
      }
    }
  }, [generate, getEditorContent, loading, onHighlightChanges, onReplaceEditor, settings]);

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
    if (!text || loading) return;
    setInput('');
    promptHistoryIndexRef.current = null;
    promptDraftRef.current = '';
    await submitPrompt(text, mode);
  }, [input, loading, mode, submitPrompt]);

  const applyInEditMode = useCallback((prompt: string, displayText: string): void => {
    if (loading) return;
    chatMode.set('edit');
    pushChatNotice('Switched to Edit mode — applying your selected suggestion…');
    void submitPrompt(prompt, 'edit', displayText);
  }, [loading, submitPrompt]);

  const modelLabel = useMemo(() => settings.model || 'model not set', [settings.model]);

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
          <button
            className="bb-chat-settings-btn"
            dangerouslySetInnerHTML={{ __html: icon('cog-6-tooth', 'w-4 h-4') }}
            onClick={onOpenSettings}
            title="Open AI settings"
            type="button"
          />
        </div>
      </div>

      <div className="bb-chat-status" style={{ display: status ? 'block' : 'none' }}>{status}</div>

      <div className="bb-chat-messages" ref={messagesRef}>
        {history.map((message, index) => {
          const previous = index > 0 ? history[index - 1] : undefined;
          const userPrompt = message.role === 'assistant' && previous?.role === 'user'
            ? previous.content
            : undefined;
          return (
            <ChatMessageView
              key={`${message.timestamp}-${message.role}`}
              loading={loading}
              message={message}
              mode={mode}
              onApplyInEditMode={applyInEditMode}
              onInsertSnippet={onInsertSnippet}
              onReplaceEditor={onReplaceEditor}
              onReplaceSelection={onReplaceSelection}
              userPrompt={userPrompt}
            />
          );
        })}
        {loading ? (
          <div className="bb-chat-typing">
            <span className="bb-chat-typing-dot" />
            <span className="bb-chat-typing-dot" />
            <span className="bb-chat-typing-dot" />
          </div>
        ) : null}
      </div>

      <div className="bb-chat-mode-bar">
        <button
          className={`bb-chat-mode-btn${mode === 'ask' ? ' bb-chat-mode-btn--active' : ''}`}
          onClick={() => chatMode.set('ask')}
          title="Get answers and explanations - no automatic edits"
          type="button"
        >
          Ask
        </button>
        <button
          className={`bb-chat-mode-btn${mode === 'edit' ? ' bb-chat-mode-btn--active' : ''}`}
          onClick={() => chatMode.set('edit')}
          title="Apply changes directly to the editor"
          type="button"
        >
          Edit
        </button>
      </div>

      <div className="bb-chat-input-row">
        <div className="bb-chat-input-wrap">
          <textarea
            className="bb-chat-input"
            onChange={(event) => {
              promptHistoryIndexRef.current = null;
              promptDraftRef.current = '';
              setInput(event.target.value);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={mode === 'edit' ? 'Describe a change... (Shift+Enter for newline)' : 'Ask a question... (Shift+Enter for newline)'}
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
        <div className="bb-chat-footer-actions">
          <button className="bb-chat-clear-btn" onClick={clearChatHistory} title="Remove all chat messages" type="button">Clear chat</button>
          <button className="bb-chat-clear-btn" onClick={clearChatPromptHistory} title="Clear the prompt recall history (↑/↓ in the input)" type="button">Clear history</button>
        </div>
        <span className="bb-chat-model-label">{modelLabel}</span>
      </div>
    </div>
  );
}

export function createDesktopCopilotPanel(
  container: HTMLElement,
  props: Omit<DesktopCopilotPanelProps, 'panelRef'>,
): DesktopCopilotPanelHandle {
  const handleRef = { current: null as DesktopCopilotPanelHandle | null };
  let root: Root | null = createRoot(container);

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
    dispose: () => {
      handleRef.current?.dispose();
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
