import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
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
import { getProviderSubtitle } from '@beatbax/app-core/stores/ai-models';
import { icon } from '../../utils/icons';

interface DesktopCopilotPanelProps {
  panelRef: Ref<DesktopCopilotPanelHandle>;
  getEditorContent: () => string;
  getDiagnostics: () => Diagnostic[];
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string) => void;
  onHighlightChanges: (addedLineNums: number[], previousContent: string) => void;
  onOpenSettings: () => void;
}

export interface DesktopCopilotPanelHandle {
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

const MAX_EDITOR_CHARS = 3000;

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
 * Returns the 1-based line numbers in `next` that are genuinely added or
 * changed relative to `previous`, using an LCS diff. A naive positional
 * comparison would misreport every line after an insertion as changed (because
 * subsequent lines shift), which is why we align lines with a longest-common-
 * subsequence walk instead.
 */
function addedLineNumbers(previous: string, next: string): number[] {
  const oldLines = previous.split('\n');
  const newLines = next.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  // dp[i][j] = length of LCS of oldLines[i:] and newLines[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++; // line only in old (removed)
    } else {
      added.push(j + 1); // line only in new (added/changed)
      j++;
    }
  }
  while (j < m) {
    added.push(j + 1);
    j++;
  }
  return added;
}

type BaxDefKind = 'pattern' | 'sequence' | 'instrument' | 'effect' | 'channel';

interface BaxDef {
  kind: BaxDefKind;
  name: string;
  /** Whitespace-normalised definition body, used to detect real changes. */
  body: string;
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
      defs.set(`pattern:${m[1]}`, { kind: 'pattern', name: m[1], body: norm(m[2]) });
    } else if ((m = line.match(/^seq\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`sequence:${m[1]}`, { kind: 'sequence', name: m[1], body: norm(m[2]) });
    } else if ((m = line.match(/^effect\s+([A-Za-z_]\w*)\s*=\s*(.*)$/))) {
      defs.set(`effect:${m[1]}`, { kind: 'effect', name: m[1], body: norm(m[2]) });
    } else if ((m = line.match(/^inst\s+([A-Za-z_]\w*)\s+(.*)$/))) {
      defs.set(`instrument:${m[1]}`, { kind: 'instrument', name: m[1], body: norm(m[2]) });
    } else if ((m = line.match(/^channel\s+(\d+)\s*=>\s*(.*)$/))) {
      defs.set(`channel:${m[1]}`, { kind: 'channel', name: m[1], body: norm(m[2]) });
    }
  }
  return defs;
}

function describeBaxDef(def: BaxDef): string {
  if (def.kind === 'channel') return `channel ${def.name}`;
  return `${BAX_DEF_LABEL[def.kind]} \`${def.name}\``;
}

/**
 * Produces a short bullet list summarising the structural edits between two
 * versions of a song (added/updated/removed definitions). Falls back to a
 * line-count note when only comments/metadata/spacing changed.
 */
function summarizeBaxChanges(previous: string, next: string, changedLines: number): string[] {
  const before = collectBaxDefs(previous);
  const after = collectBaxDefs(next);
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];

  for (const [key, def] of after) {
    const prev = before.get(key);
    if (!prev) added.push(describeBaxDef(def));
    else if (prev.body !== def.body) updated.push(describeBaxDef(def));
  }
  for (const [key, def] of before) {
    if (!after.has(key)) removed.push(describeBaxDef(def));
  }

  const bullets = [
    ...added.map((d) => `Added ${d}`),
    ...updated.map((d) => `Updated ${d}`),
    ...removed.map((d) => `Removed ${d}`),
  ];

  const MAX_BULLETS = 12;
  if (bullets.length > MAX_BULLETS) {
    const overflow = bullets.length - MAX_BULLETS;
    return [...bullets.slice(0, MAX_BULLETS), `…and ${overflow} more change${overflow === 1 ? '' : 's'}`];
  }
  if (bullets.length === 0 && changedLines > 0) {
    return [`Adjusted ${changedLines} line${changedLines === 1 ? '' : 's'} (comments, metadata, or spacing)`];
  }
  return bullets;
}

/** Built-in inline effect types (parametric forms like `<vib:3,5>` need no preset). */
const BUILTIN_INLINE_EFFECTS = [
  'pan', 'vib', 'port', 'arp', 'pitch_env', 'volslide', 'trem',
  'cut', 'retrig', 'bend', 'sweep', 'echo',
  'vol_env', 'arp_env', 'noise_rate_env',
] as const;

/** Extracts top-level instrument and effect names defined in the song source. */
function extractDefinedNames(content: string): { instruments: string[]; effects: string[] } {
  const instruments = new Set<string>();
  const effects = new Set<string>();
  const instRe = /^\s*inst\s+([A-Za-z_]\w*)\b/gm;
  const effectRe = /^\s*effect\s+([A-Za-z_]\w*)\s*=/gm;
  let m: RegExpExecArray | null;
  while ((m = instRe.exec(content)) !== null) instruments.add(m[1]);
  while ((m = effectRe.exec(content)) !== null) effects.add(m[1]);
  return { instruments: [...instruments], effects: [...effects] };
}

/** Collects effect heads referenced in `<name>` / `<name:args>` suffixes. */
function extractReferencedEffectNames(content: string): string[] {
  const names = new Set<string>();
  const re = /<([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const head = (m[1].split(':')[0] || '').trim();
    if (head) names.add(head);
  }
  return [...names];
}

function findUndefinedEffectRefs(content: string, definedEffects: string[]): string[] {
  const defined = new Set(definedEffects.map((n) => n.toLowerCase()));
  const builtin = new Set(BUILTIN_INLINE_EFFECTS.map((n) => n.toLowerCase()));
  return extractReferencedEffectNames(content).filter((name) => {
    const lower = name.toLowerCase();
    return !defined.has(lower) && !builtin.has(lower);
  });
}

function assembleContext(
  settings: AISettings,
  mode: ChatMode,
  getEditorContent: () => string,
  getDiagnostics: () => Diagnostic[],
): string {
  const editorContent = getEditorContent();
  const maxChars = settings.maxContextChars || MAX_EDITOR_CHARS;
  // In edit mode the model must rewrite the whole song, so never truncate —
  // a partial song produces unsafe/invalid edits. Ask mode keeps the limit.
  const shouldTruncate = mode !== 'edit' && editorContent.length > maxChars;
  const truncated = shouldTruncate
    ? `${editorContent.slice(0, maxChars)}\n...[truncated]`
    : editorContent;
  const diagnostics = getDiagnostics();
  const diagBlock = diagnostics.length > 0
    ? diagnostics.map((diag) => `  ${diag.severity.padEnd(7)} line ${diag.startLine}, col ${diag.startColumn}: ${diag.message}`).join('\n')
    : '  No current errors or warnings.';
  const modeHint = mode === 'edit'
    ? [
        'You are in EDIT mode. Return ONLY the full updated song as a single fenced code block.',
        'Begin your reply with ```bax on its own line and end with ``` on its own line, with nothing before or after it.',
        'Do NOT use Markdown headings, prose, or explanation — output only the song source.',
        'The returned song must parse as valid BeatBax. If diagnostics are present, fix them instead of adding new features.',
        'If diagnostics warn that an effect is not defined, add `effect name = type:params` before using `<name>`, or replace `<name>` with a built-in parametric form such as `<vib:3,5>`.',
        'Prefer minimal edits to the current song; preserve comments, metadata, instruments, channel structure, and play directives unless the user asks otherwise.',
      ].join(' ')
    : [
        'You are in ASK mode. You can explain, analyse, and show example BeatBax snippets,',
        'but you CANNOT modify, patch, or apply changes to the user\'s song in this mode.',
        'If the user asks you to make or apply a change, do NOT say you will edit or patch',
        'the file, and do NOT ask them to paste the song. Instead: briefly describe the',
        'change, show the suggested BeatBax in a ```bax code block they can copy, then tell',
        'them to switch to Edit mode (the Ask/Edit toggle above the input box) so you can',
        'apply it to the editor automatically.',
        'When suggesting effects (vibrato, arpeggio, portamento, etc.), prefer built-in',
        'parametric syntax such as `C5<vib:3,5>` — or show the `effect preset = ...`',
        'definition together with `C5<preset>`; never use `<preset>` without its definition.',
        'Format your response using Markdown for readability: use short paragraphs,',
        '`##` headings for sections, **bold** for key terms, and `-` bullet lists for',
        'enumerations. Use a Markdown table when comparing structured data (e.g. channel',
        'roles). Wrap BeatBax code in ```bax fenced blocks and inline tokens in backticks.',
      ].join(' ');
  const syntaxGuide = [
    'BeatBax syntax constraints:',
    '- Define note material with `pat name = tokens`, not `seq name` blocks with indented `note`/`length` lines.',
    '- Pattern tokens are whitespace-separated notes/rests/identifiers, e.g. `pat melody = C5 D5 E5 .`.',
    '- Use grouping/repeats like `(C5 E5 G5 C6) * 4`.',
    '- Define sequences with `seq name = pat_name other_pat`, not comma-separated note lists.',
    '- Map playback with `channel N => inst instrumentName seq sequenceName` or `channel N => inst instrumentName pat patternName`.',
    '- Use `play`, `play auto`, or existing `play auto repeat`; do not invent `play a, b, c` arrangements.',
    '- Effects are top-level presets or inline note suffixes: `effect leadVib = vib:3,5` and `pat p = C5<leadVib> D5<vib:3,5>`.',
    '- Valid inline effect shape is `NOTE<effect:args>`; there is no standalone `effect vibrato` line inside a sequence.',
    '- CRITICAL: A named inline effect like `NOTE<leadVib>` ONLY works if a matching top-level `effect leadVib = ...` definition exists; otherwise it is silently ignored.',
    '- If you introduce a new named effect, you MUST add its `effect name = ...` definition line (place it near the other definitions). Otherwise, use a self-contained inline effect such as `NOTE<vib:3,5>` that needs no definition.',
    '- Never reference an instrument or effect name that is not defined in the song (see [DEFINED NAMES]); either reuse an existing one or add its definition.',
    '- Existing transforms such as `:oct(-1)` apply to sequence/channel items, e.g. `seq bass_seq:oct(-1)`.',
    '- For the sample song, make melody variations by adding/modifying `pat ... = ...`, then reference them from `seq lead_seq = ...` while leaving bass/wave/drums channels valid.',
    '',
    'Valid edit example:',
    '```bax',
    'effect leadVib = vib:3,5',
    'pat melody_var = (C5 D5 E5 G5) (A5 G5 E5 D5)',
    'pat melody_var_vib = C5<vib:3,5> E5 D5<vib:3,5> G5 A5<vib:3,5> G5 E5 D5',
    'seq lead_seq = melody_pat melody_var melody_var_vib melody_pat',
    'channel 1 => inst leadA seq lead_seq lead_seq',
    'play auto repeat',
    '```',
  ].join('\n');

  const { instruments, effects } = extractDefinedNames(editorContent);
  const undefinedEffects = findUndefinedEffectRefs(editorContent, effects);
  const effectGuidance = [
    `Built-in inline effects (use as NOTE<type:args> with no preset): ${BUILTIN_INLINE_EFFECTS.join(', ')}.`,
    'Common examples: vibrato `C5<vib:3,5>`, arpeggio `C5<arp:0,4,7>`, portamento `C5<port:16>`.',
    'Named presets: define `effect myVib = vib:3,5` once, then use `C5<myVib>` on any note.',
    'A bare `<myVib>` without a matching `effect myVib = ...` line is silently ignored at playback.',
  ].join('\n');
  const definedNames = [
    `Instruments defined in this song: ${instruments.length > 0 ? instruments.join(', ') : '(none)'}`,
    `Effects defined in this song: ${effects.length > 0 ? effects.join(', ') : '(none)'}`,
    undefinedEffects.length > 0
      ? `Undefined effect references in this song (will be ignored): ${undefinedEffects.join(', ')} — add an effect definition or switch to a built-in form.`
      : 'No undefined effect references detected in pattern tokens.',
    'Only reference instrument/effect names listed above. To use a new named effect, add its `effect name = ...` definition first.',
  ].join('\n');

  return [
    '[SYSTEM]',
    'You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.',
    modeHint,
    '',
    '[BEATBAX SYNTAX REFERENCE]',
    syntaxGuide,
    '',
    '[EFFECT GUIDANCE]',
    effectGuidance,
    '',
    '[DEFINED NAMES]',
    definedNames,
    '',
    '[EDITOR CONTENT]',
    '```bax',
    truncated,
    '```',
    '',
    '[DIAGNOSTICS]',
    diagBlock,
  ].join('\n');
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

  if (message.applied) {
    const count = message.changedLines ?? 0;
    const lineText = count > 0 ? ` — ${count} line${count === 1 ? '' : 's'} changed` : '';
    const summary = message.changeSummary ?? [];
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
          <span className="bb-chat-applied-hint">Press Ctrl+Z, or use the Discard button in the editor, to undo.</span>
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
  ): Promise<string> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: assembleContext(effectiveSettings, activeMode, getEditorContent, getDiagnostics) },
      ...history.filter((msg) => !msg.system).slice(-10).map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userText },
    ];
    // Edit mode must return the entire song, so it needs a generous output
    // budget; ask mode replies are shorter. Too small a limit truncates the
    // song mid-file and leaves no closing code fence to apply.
    const maxTokens = activeMode === 'edit' ? 8192 : 2048;
    const createAIChatCompletion = window.electronAPI?.createAIChatCompletion;
    if (typeof createAIChatCompletion === 'function') {
      return createAIChatCompletion({
        endpoint: effectiveSettings.endpoint,
        apiKey: effectiveSettings.apiKey,
        model: effectiveSettings.model,
        messages,
        temperature: 0.7,
        maxTokens,
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
    chatLoading.set(true);
    try {
      const response = await generate(text, effectiveSettings, activeMode);
      let applied = false;
      let changedLines = 0;
      let changeSummary: string[] = [];
      if (activeMode === 'edit') {
        const baxCode = extractBaxCode(response);
        if (baxCode !== null) {
          const previous = getEditorContent();
          onReplaceEditor(baxCode);
          const added = addedLineNumbers(previous, baxCode);
          if (added.length > 0 && previous.trim()) onHighlightChanges(added, previous);
          setStatus('');
          applied = true;
          changedLines = added.length;
          changeSummary = summarizeBaxChanges(previous, baxCode, changedLines);
        } else {
          setStatus('⚠ Copilot did not return an applicable song, so the editor was not changed. Try again.');
        }
      }
      pushChatMessage(
        'assistant',
        response,
        applied ? { applied: true, changedLines, changeSummary } : undefined,
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        pushChatMessage('assistant', '_(cancelled)_');
      } else {
        pushChatMessage('assistant', `⚠ ${userFacingAIError(error)}`);
      }
    } finally {
      chatLoading.set(false);
      abortRef.current = null;
    }
  }, [generate, getEditorContent, loading, onHighlightChanges, onReplaceEditor, settings]);

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
        <span className="bb-chat-subtitle">{getProviderSubtitle(settings.endpoint)}</span>
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
              if (loading) abortRef.current?.abort();
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
