/**
 * ChatPanel — BeatBax Copilot AI assistant panel.
 *
 * Renders an expandable chat panel in the right pane. The assistant is powered
 * by WebLLM (in-browser inference via WebGPU) and has access to:
 *  - A static BeatBax language reference (system prompt).
 *  - The current editor content (truncated to 3000 chars).
 *  - The active diagnostics list from DiagnosticsManager.
 *
 * WebLLM is loaded dynamically via import() only when the panel is first opened
 * and the feature flag is enabled. No network requests are made when the flag is
 * disabled.
 *
 * Code blocks fenced in ```bax ... ``` in assistant responses are given action
 * buttons: "Insert at cursor" and "Replace selection".
 */

import type { EventBus } from '../utils/event-bus';
import type { Diagnostic } from '../editor/diagnostics';

const STYLE_ID = 'bb-chat-panel-styles';
const DEFAULT_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC';
const MAX_EDITOR_CHARS = 3000;

// ─── BeatBax language reference injected into the system prompt ───────────────

const BEATBAX_LANGUAGE_REF = `
BeatBax Language Reference (concise):

TOP-LEVEL DIRECTIVES
  chip gameboy          — select Game Boy APU backend (default)
  bpm <n>               — tempo in BPM (default 120)
  time <n>              — beats per bar (default 4)
  ticksPerStep <n>      — tick resolution per step (default 16)

INSTRUMENTS  (inst <name> <fields>)
  type=pulse1|pulse2    duty=<0-100> env=<vol>,<dir>  (dir: up|down)
  type=wave             wave=[<16 nibbles>]
  type=noise            env=<vol>,<dir>

PATTERNS  (pat <name> = <events>)
  Notes: C3–B8, sharps: C#4. Rest: .
  Inline inst change: inst <name>
  Temporary override:  inst(<name>,<n>)  — applies for next n notes

SEQUENCES  (seq <name> = <pattern-refs with optional transforms>)
  Transforms appended with colon: melody:oct(-1)  melody:rev  melody:slow
  Available transforms: oct(+/-N) inst(name) rev slow fast

CHANNELS   (channel <1-4> => inst <name> seq <name>[:<transform>])

PLAY  (play)            — starts deterministic playback
EXPORT  (export json|midi|uge "<file>")
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatPanelOptions {
  container: HTMLElement;
  eventBus: EventBus;
  /** Returns current editor source for context injection. */
  getEditorContent: () => string;
  /** Returns current diagnostics for context injection. */
  getDiagnostics: () => Diagnostic[];
  /** Called with snippet text when user clicks "Insert at cursor". */
  onInsertSnippet: (text: string) => void;
  /** Called with snippet text when user clicks "Replace selection". */
  onReplaceSelection: (text: string) => void;
  /** WebLLM model ID. Defaults to Phi-3.5-mini. */
  modelId?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export class ChatPanel {
  private el: HTMLElement;
  private messagesEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;

  private messages: Message[] = [];
  private engine: any = null; // WebLLM MLCEngine instance (loaded lazily)
  private isLoading = false;
  private visible = false;
  private modelId: string;

  constructor(private opts: ChatPanelOptions) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.el = document.createElement('div');
    this.el.className = 'bb-chat-panel';
    this.injectStyles();
    this.render();
    opts.container.appendChild(this.el);
    this.el.style.display = 'none';
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  show(): void {
    this.visible = true;
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.el.remove();
    this.engine = null;
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  private render(): void {
    this.el.innerHTML = '';
    this.el.style.cssText = [
      'flex-direction: column',
      'height: 100%',
      'overflow: hidden',
      'background: var(--panel-bg, #1e1e1e)',
      'color: var(--text-color, #d4d4d4)',
      'font-family: var(--font-family, "Segoe UI", sans-serif)',
      'font-size: 13px',
    ].join('; ');

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'bb-chat-header';
    header.innerHTML = `
      <span class="bb-chat-title">🤖 BeatBax Copilot</span>
      <span class="bb-chat-subtitle">Powered by WebLLM (on-device)</span>
    `;
    this.el.appendChild(header);

    // ── First-load / WebGPU warning banner ───────────────────────────────────
    if (typeof navigator !== 'undefined' && !(navigator as any).gpu) {
      const banner = document.createElement('div');
      banner.className = 'bb-chat-banner bb-chat-banner--error';
      banner.textContent =
        '⚠ WebGPU is not supported in this browser. Try Chrome 113+ or Edge 113+.';
      this.el.appendChild(banner);
    } else {
      const banner = document.createElement('div');
      banner.className = 'bb-chat-banner';
      banner.innerHTML =
        '💡 First use will download the AI model (~1–2 GB) and cache it in your browser.' +
        '<br><span class="bb-chat-privacy">🔒 All inference runs locally — no data leaves your browser.</span>';
      this.el.appendChild(banner);
    }

    // ── Status / progress bar ─────────────────────────────────────────────────
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'bb-chat-status';
    this.el.appendChild(this.statusEl);

    // ── Messages area ─────────────────────────────────────────────────────────
    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'bb-chat-messages';
    this.el.appendChild(this.messagesEl);

    // ── Input row ─────────────────────────────────────────────────────────────
    const inputRow = document.createElement('div');
    inputRow.className = 'bb-chat-input-row';

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'bb-chat-input';
    this.inputEl.placeholder = 'Ask BeatBax Copilot… (Shift+Enter for newline)';
    this.inputEl.rows = 2;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'bb-chat-send-btn';
    this.sendBtn.textContent = '▶ Send';
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(this.sendBtn);
    this.el.appendChild(inputRow);

    // ── Footer ────────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'bb-chat-footer';

    this.clearBtn = document.createElement('button');
    this.clearBtn.className = 'bb-chat-clear-btn';
    this.clearBtn.textContent = 'Clear chat';
    this.clearBtn.addEventListener('click', () => this.clearChat());
    footer.appendChild(this.clearBtn);

    const modelLabel = document.createElement('span');
    modelLabel.className = 'bb-chat-model-label';
    modelLabel.textContent = this.modelId;
    footer.appendChild(modelLabel);

    this.el.appendChild(footer);
  }

  // ─── Context assembly ────────────────────────────────────────────────────────

  /** Build the full system prompt string for WebLLM. */
  assembleContext(): string {
    const editorContent = this.opts.getEditorContent();
    const truncated = editorContent.length > MAX_EDITOR_CHARS
      ? editorContent.slice(0, MAX_EDITOR_CHARS) + '\n…[truncated]'
      : editorContent;

    const diagnostics = this.opts.getDiagnostics();
    const diagBlock = diagnostics.length > 0
      ? diagnostics
          .map(d => `  ${d.severity.padEnd(7)} line ${d.startLine}, col ${d.startColumn}: ${d.message}`)
          .join('\n')
      : '  No current errors or warnings.';

    return (
      `[SYSTEM]\nYou are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.\n${BEATBAX_LANGUAGE_REF}\n\n` +
      `[EDITOR CONTENT]\n\`\`\`bax\n${truncated}\n\`\`\`\n\n` +
      `[DIAGNOSTICS]\n${diagBlock}`
    );
  }

  // ─── Messaging ───────────────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    // Disable input while processing
    this.setLoading(true);
    this.inputEl.value = '';

    this.addMessage('user', text);

    try {
      const response = await this.generate(text);
      this.addMessage('assistant', response);
    } catch (err: any) {
      this.addMessage('assistant', `⚠ Error: ${err?.message ?? String(err)}`);
    } finally {
      this.setLoading(false);
    }
  }

  private async generate(userText: string): Promise<string> {
    const engine = await this.getEngine();

    const systemContext = this.assembleContext();

    // Build conversation history (last 10 turns to stay within token budget)
    const history = this.messages.slice(-10);
    const chatMessages = [
      { role: 'system' as const, content: systemContext },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userText },
    ];

    const reply = await engine.chat.completions.create({
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 512,
    });

    return reply.choices[0]?.message?.content ?? '(no response)';
  }

  private async getEngine(): Promise<any> {
    if (this.engine) return this.engine;

    this.setStatus('Loading AI model… (this may take a while on first use)');

    // Dynamic import — no WebLLM code is loaded until this point.
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    this.engine = await CreateMLCEngine(this.modelId, {
      initProgressCallback: (progress: any) => {
        const pct = Math.round((progress.progress ?? 0) * 100);
        const text = progress.text ?? '';
        this.setStatus(pct < 100 ? `Downloading model: ${pct}% — ${text}` : 'Model ready.');
      },
    });

    this.setStatus('');
    return this.engine;
  }

  // ─── Message rendering ───────────────────────────────────────────────────────

  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.messages.push({ role, content });
    const el = this.renderMessage(role, content);
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `bb-chat-msg bb-chat-msg--${role}`;

    const label = document.createElement('span');
    label.className = 'bb-chat-msg-label';
    label.textContent = role === 'user' ? 'You' : '🤖 Copilot';
    wrap.appendChild(label);

    // Split content into text and ```bax code blocks
    const parts = this.splitContent(content);
    for (const part of parts) {
      if (part.type === 'text') {
        const p = document.createElement('p');
        p.className = 'bb-chat-msg-text';
        p.textContent = part.value;
        wrap.appendChild(p);
      } else {
        const codeWrap = document.createElement('div');
        codeWrap.className = 'bb-chat-code-block';

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'bb-chat-code';
        code.textContent = part.value;
        pre.appendChild(code);
        codeWrap.appendChild(pre);

        if (role === 'assistant') {
          const actions = document.createElement('div');
          actions.className = 'bb-chat-code-actions';

          const insertBtn = document.createElement('button');
          insertBtn.className = 'bb-chat-action-btn';
          insertBtn.textContent = 'Insert at cursor';
          insertBtn.addEventListener('click', () => this.opts.onInsertSnippet(part.value));

          const replaceBtn = document.createElement('button');
          replaceBtn.className = 'bb-chat-action-btn';
          replaceBtn.textContent = 'Replace selection';
          replaceBtn.addEventListener('click', () => this.opts.onReplaceSelection(part.value));

          actions.appendChild(insertBtn);
          actions.appendChild(replaceBtn);
          codeWrap.appendChild(actions);
        }

        wrap.appendChild(codeWrap);
      }
    }

    return wrap;
  }

  /** Split a response string into alternating text / code segments. */
  splitContent(content: string): Array<{ type: 'text' | 'code'; value: string }> {
    const result: Array<{ type: 'text' | 'code'; value: string }> = [];
    // Match fenced code blocks (```bax or ``` or any language tag)
    const pattern = /```(?:\w*\n)?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const text = content.slice(lastIndex, match.index).trim();
        if (text) result.push({ type: 'text', value: text });
      }
      result.push({ type: 'code', value: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const text = content.slice(lastIndex).trim();
      if (text) result.push({ type: 'text', value: text });
    }

    if (result.length === 0) {
      result.push({ type: 'text', value: content });
    }

    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private clearChat(): void {
    this.messages = [];
    this.messagesEl.innerHTML = '';
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.sendBtn.disabled = loading;
    this.inputEl.disabled = loading;
    this.sendBtn.textContent = loading ? '⏳ …' : '▶ Send';
  }

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
    this.statusEl.style.display = text ? 'block' : 'none';
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bb-chat-panel {
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--panel-bg, #1e1e1e);
        color: var(--text-color, #d4d4d4);
        font-size: 13px;
      }
      .bb-chat-header {
        display: flex;
        flex-direction: column;
        padding: 8px 12px 6px;
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-title {
        font-weight: 700;
        font-size: 13px;
        color: var(--text-color, #d4d4d4);
      }
      .bb-chat-subtitle {
        font-size: 11px;
        color: var(--text-muted, #888);
        margin-top: 2px;
      }
      .bb-chat-banner {
        padding: 6px 12px;
        font-size: 11px;
        background: var(--header-bg, #252526);
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        color: var(--text-muted, #888);
        flex-shrink: 0;
        line-height: 1.5;
      }
      .bb-chat-banner--error {
        color: #f48771;
        background: #3b1f1f;
      }
      .bb-chat-privacy {
        color: #6a9955;
      }
      .bb-chat-status {
        display: none;
        padding: 6px 12px;
        font-size: 11px;
        color: #569cd6;
        background: var(--header-bg, #252526);
        border-bottom: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-messages {
        flex: 1 1 0;
        overflow-y: auto;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .bb-chat-msg {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .bb-chat-msg-label {
        font-size: 11px;
        font-weight: 700;
        color: var(--text-muted, #888);
        text-transform: uppercase;
      }
      .bb-chat-msg--user .bb-chat-msg-label { color: #569cd6; }
      .bb-chat-msg--assistant .bb-chat-msg-label { color: #4ec994; }
      .bb-chat-msg-text {
        margin: 0;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .bb-chat-code-block {
        background: #0d1117;
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 4px;
        overflow: hidden;
      }
      .bb-chat-code-block pre {
        margin: 0;
        padding: 8px 10px;
        overflow-x: auto;
      }
      .bb-chat-code {
        font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
        font-size: 12px;
        color: #d4d4d4;
        white-space: pre;
      }
      .bb-chat-code-actions {
        display: flex;
        gap: 6px;
        padding: 5px 8px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        background: var(--header-bg, #252526);
      }
      .bb-chat-action-btn {
        padding: 3px 8px;
        font-size: 11px;
        background: #0e639c;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s;
      }
      .bb-chat-action-btn:hover { background: #1177bb; }
      .bb-chat-input-row {
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
        align-items: flex-end;
      }
      .bb-chat-input {
        flex: 1;
        resize: none;
        background: var(--input-bg, #3c3c3c);
        color: var(--text-color, #d4d4d4);
        border: 1px solid var(--border-color, #3c3c3c);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 12px;
        font-family: inherit;
        line-height: 1.5;
      }
      .bb-chat-input:focus { outline: 1px solid #569cd6; border-color: #569cd6; }
      .bb-chat-input:disabled { opacity: 0.5; }
      .bb-chat-send-btn {
        padding: 6px 12px;
        background: #0e639c;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: background 0.1s;
      }
      .bb-chat-send-btn:hover:not(:disabled) { background: #1177bb; }
      .bb-chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .bb-chat-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 10px;
        border-top: 1px solid var(--border-color, #3c3c3c);
        flex-shrink: 0;
      }
      .bb-chat-clear-btn {
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 11px;
        padding: 2px 4px;
        border-radius: 3px;
        transition: color 0.1s, background 0.1s;
      }
      .bb-chat-clear-btn:hover { color: var(--text-color, #d4d4d4); background: var(--button-hover-bg, #2a2d2e); }
      .bb-chat-model-label {
        font-size: 10px;
        color: var(--text-muted, #888);
        opacity: 0.7;
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }
}
