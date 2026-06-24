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
  markChatRead,
  pushChatMessage,
  recordChatPrompt,
  updateChatSettings,
  type AISettings,
  type ChatMessage,
  type ChatMode,
} from '@beatbax/app-core/stores/chat.store';
import { icon } from '../../desktop-web-ui/utils/icons';

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
  return DOMPurify.sanitize(marked.parse(content) as string, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
  });
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

function extractBaxCode(content: string): string | null {
  const match = content.match(/```bax\s*\n([\s\S]*?)```/);
  return match ? match[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() : null;
}

function addedLineNumbers(previous: string, next: string): number[] {
  const oldLines = previous.split('\n');
  const newLines = next.split('\n');
  const added: number[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index++) {
    if (oldLines[index] !== newLines[index] && newLines[index] !== undefined) {
      added.push(index + 1);
    }
  }
  return added;
}

function assembleContext(
  settings: AISettings,
  mode: ChatMode,
  getEditorContent: () => string,
  getDiagnostics: () => Diagnostic[],
): string {
  const editorContent = getEditorContent();
  const maxChars = settings.maxContextChars || MAX_EDITOR_CHARS;
  const truncated = editorContent.length > maxChars
    ? `${editorContent.slice(0, maxChars)}\n...[truncated]`
    : editorContent;
  const diagnostics = getDiagnostics();
  const diagBlock = diagnostics.length > 0
    ? diagnostics.map((diag) => `  ${diag.severity.padEnd(7)} line ${diag.startLine}, col ${diag.startColumn}: ${diag.message}`).join('\n')
    : '  No current errors or warnings.';
  const modeHint = mode === 'edit'
    ? [
        'When editing, return ONLY the full updated song in a single ```bax fenced code block.',
        'Do not add prose before or after the code block.',
        'The returned song must parse as valid BeatBax. If diagnostics are present, fix them instead of adding new features.',
        'Prefer minimal edits to the current song; preserve comments, metadata, instruments, channel structure, and play directives unless the user asks otherwise.',
      ].join(' ')
    : 'Answer questions about BeatBax. Do not edit the song unless asked.';
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

  return [
    '[SYSTEM]',
    'You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.',
    modeHint,
    '',
    '[BEATBAX SYNTAX REFERENCE]',
    syntaxGuide,
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

function settingsSubtitle(settings: AISettings): string {
  if (settings.endpoint.includes('localhost') || settings.endpoint.includes('127.0.0.1')) return 'via local model';
  if (settings.endpoint.includes('groq.com')) return 'via Groq';
  if (settings.endpoint.includes('openai.com')) return 'via OpenAI';
  return settings.endpoint;
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
  onInsertSnippet,
  onReplaceSelection,
  onReplaceEditor,
}: {
  message: ChatMessage;
  mode: ChatMode;
  onInsertSnippet: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onReplaceEditor: (text: string) => void;
}): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="bb-chat-msg bb-chat-msg--user">
        <span className="bb-chat-msg-label">You</span>
        <p className="bb-chat-msg-text">{message.content}</p>
      </div>
    );
  }

  return (
    <div className="bb-chat-msg bb-chat-msg--assistant">
      <span className="bb-chat-msg-label">Copilot</span>
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
                  <button className="bb-chat-action-btn" onClick={() => void navigator.clipboard?.writeText(part.value)} type="button">
                    ⧉ Copy
                  </button>
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

  const generate = useCallback(async (userText: string, effectiveSettings: AISettings): Promise<string> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: assembleContext(effectiveSettings, mode, getEditorContent, getDiagnostics) },
      ...history.slice(-10).map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userText },
    ];
    const createAIChatCompletion = window.electronAPI?.createAIChatCompletion;
    if (typeof createAIChatCompletion === 'function') {
      return createAIChatCompletion({
        endpoint: effectiveSettings.endpoint,
        apiKey: effectiveSettings.apiKey,
        model: effectiveSettings.model,
        messages,
        temperature: 0.7,
        maxTokens: 1024,
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveSettings.apiKey) headers.Authorization = `Bearer ${effectiveSettings.apiKey.trim()}`;
    const response = await fetch(`${effectiveSettings.endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: effectiveSettings.model,
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? '(no response)';
  }, [getDiagnostics, getEditorContent, history, mode]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
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
    setInput('');
    promptHistoryIndexRef.current = null;
    promptDraftRef.current = '';
    recordChatPrompt(text);
    pushChatMessage('user', text);
    chatLoading.set(true);
    try {
      const response = await generate(text, effectiveSettings);
      if (mode === 'edit') {
        const baxCode = extractBaxCode(response);
        if (baxCode !== null) {
          const previous = getEditorContent();
          onReplaceEditor(baxCode);
          const added = addedLineNumbers(previous, baxCode);
          if (added.length > 0 && previous.trim()) onHighlightChanges(added, previous);
        }
      }
      pushChatMessage('assistant', response);
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
  }, [generate, getEditorContent, input, loading, mode, onHighlightChanges, onReplaceEditor, settings]);

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
        <span className="bb-chat-subtitle">{settingsSubtitle(settings)}</span>
      </div>

      <div className="bb-chat-status" style={{ display: status ? 'block' : 'none' }}>{status}</div>

      <div className="bb-chat-messages" ref={messagesRef}>
        {history.map((message) => (
          <ChatMessageView
            key={`${message.timestamp}-${message.role}`}
            message={message}
            mode={mode}
            onInsertSnippet={onInsertSnippet}
            onReplaceEditor={onReplaceEditor}
            onReplaceSelection={onReplaceSelection}
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
        <button className="bb-chat-clear-btn" onClick={clearChatHistory} type="button">Clear chat</button>
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
