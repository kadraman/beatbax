/**
 * OutputPanel - Displays console/error/warning messages with tabbed interface *
 * Two tabs:
 * - Problems: Errors and warnings (no timestamp, sorted by severity)
 * - Output: Info and success messages (with timestamp, chronological order)
 */

import type * as monaco from 'monaco-editor';
import {
  applyQuickFixSuggestion,
  getQuickFixesForProblem,
} from '@beatbax/app-core/editor/code-actions';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { icon } from '../utils/icons';

export interface OutputMessage {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  timestamp: Date;
  source?: string; // parse, playback, export, etc.
  loc?: { start?: { line?: number; column?: number } };
  /** Optional actionable hint shown below the message in the Problems tab */
  suggestion?: string;
}

/**
 * Manages console/error output display with tabs
 */
export interface OutputPanelOptions {
  singleTab?: 'problems' | 'output';
  /** Editor model — enables Quick Fix on problem rows (right-click). */
  getTextModel?: () => monaco.editor.ITextModel | null;
}

export class OutputPanel {
  private messages: OutputMessage[] = [];
  private container: HTMLElement;
  private maxMessages = 1000; // Prevent memory issues
  private activeTab: 'problems' | 'output' = 'problems';
  private singleTab: 'problems' | 'output' | undefined;
  private getTextModel?: () => monaco.editor.ITextModel | null;
  private quickFixMenu: HTMLElement | null = null;
  private quickFixMenuDismiss?: () => void;

  constructor(
    container: HTMLElement,
    private eventBus: EventBus,
    options: OutputPanelOptions = {},
  ) {
    this.container = container;
    this.singleTab = options.singleTab;
    this.getTextModel = options.getTextModel;
    this.setupEventListeners();
    this.setupQuickFixMenuLifecycle();
    this.render();
  }

  /** Close any open Problems quick-fix menu (safe to call when the panel is hidden). */
  dismissQuickFixMenu(): void {
    this.closeQuickFixMenu();
  }

  /**
   * Subscribe to relevant events.
   * When singleTab is set, only subscribe to events that are relevant for that view:
   *   'problems' → parse/validation/playback errors only
   *   'output'   → playback status and export events only
   * This prevents the two panels from accumulating invisible messages from
   * each other's domains, which would waste the maxMessages budget and could
   * cause subtle clearing side-effects.
   */
  private setupEventListeners(): void {
    const wantsProblems = this.singleTab !== 'output'; // problems or dual-tab
    const wantsOutput   = this.singleTab !== 'problems'; // output or dual-tab

    if (wantsProblems) {
      // Parse errors
      this.eventBus.on('parse:error', ({ error, message }) => {
        // Clear previous parse errors before adding new one
        this.clearMessagesBySource('parser', 'error');

        this.addMessage({
          type: 'error',
          message: message || error.message || String(error),
          source: 'parser',
          timestamp: new Date(),
          loc: (error as any).location,
        });
      });

      // Playback errors
      this.eventBus.on('playback:error', ({ error }) => {
        this.addMessage({
          type: 'error',
          message: `Playback error: ${error.message}`,
          source: 'playback',
          timestamp: new Date(),
        });
      });

      // Validation warnings
      this.eventBus.on('validation:warnings', ({ warnings }) => {
        // If validation ran, that means parsing succeeded - clear parse errors
        this.clearMessagesBySource('parser', 'error');

        // Clear previous validation warnings
        this.clearMessagesBySource('validation', 'warning');

        // Add all warnings, skipping render until the last one
        for (let i = 0; i < warnings.length; i++) {
          const w = warnings[i];
          const isLast = i === warnings.length - 1;
          this.addMessage({
            type: 'warning',
            message: w.message,
            source: 'validation',
            timestamp: new Date(),
            loc: w.loc,
            suggestion: w.suggestion,
          }, !isLast);
        }

        if (warnings.length === 0) {
          this.render();
        }
      });

      // Validation errors
      this.eventBus.on('validation:errors', ({ errors }) => {
        // Clear previous validation errors before adding new ones
        this.clearMessagesBySource('validation', 'error');

        for (let i = 0; i < errors.length; i++) {
          const e = errors[i];
          const isLast = i === errors.length - 1;
          this.addMessage({
            type: 'error',
            message: e.message,
            source: 'validation',
            timestamp: new Date(),
            loc: e.loc,
            suggestion: e.suggestion,
          }, !isLast);
        }

        if (errors.length === 0) {
          this.render();
        }
      });

      // Parse success - clear parse errors
      this.eventBus.on('parse:success', () => {
        this.clearMessagesBySource('parser', 'error');
      });
    }

    if (wantsOutput) {
      // Export events
      this.eventBus.on('export:started', ({ format }) => {
        this.addMessage({
          type: 'info',
          message: `Exporting to ${format}...`,
          source: 'export',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('export:success', ({ format, filename }) => {
        this.addMessage({
          type: 'success',
          message: `Successfully exported to ${filename}`,
          source: 'export',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('export:error', ({ format, error }) => {
        this.addMessage({
          type: 'error',
          message: `Export failed (${format}): ${error.message}`,
          source: 'export',
          timestamp: new Date(),
        });
      });

      // Playback status events
      this.eventBus.on('playback:started', (data: any) => {
        this.activeTab = 'output';
        const volMsg = data && typeof data.volumePct === 'number' ? ` at ${data.volumePct}% volume` : '';
        this.addMessage({
          type: 'info',
          message: `Playback started${volMsg}`,
          source: 'playback',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('playback:paused', () => {
        this.addMessage({
          type: 'info',
          message: 'Playback paused',
          source: 'playback',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('playback:resumed', () => {
        this.addMessage({
          type: 'info',
          message: 'Playback resumed',
          source: 'playback',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('playback:stopped', () => {
        this.addMessage({
          type: 'info',
          message: 'Playback stopped',
          source: 'playback',
          timestamp: new Date(),
        });
      });

      this.eventBus.on('playback:repeated', (data: any) => {
        const volMsg = data && typeof data.volumePct === 'number' ? ` at ${data.volumePct}% volume` : '';
        this.addMessage({
          type: 'info',
          message: `Playback repeated${volMsg}`,
          source: 'playback',
          timestamp: new Date(),
        });
      });
    }
  }

  /** Dismiss the floating menu when panel content or editor context changes. */
  private setupQuickFixMenuLifecycle(): void {
    if (!this.getTextModel || this.singleTab === 'output') return;

    const dismiss = () => this.closeQuickFixMenu();
    this.eventBus.on('parse:started', dismiss);
    this.eventBus.on('validation:errors', dismiss);
    this.eventBus.on('validation:warnings', dismiss);
    this.eventBus.on('navigate:to', dismiss);
  }

  /**
   * Add a message to the output
   */
  addMessage(msg: OutputMessage, skipRender = false): void {
    this.messages.push(msg);

    // Trim old messages if exceeds max
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }

    // Auto-switch to Problems tab when errors/warnings are added
    if (msg.type === 'error' || msg.type === 'warning') {
      this.activeTab = 'problems';
    }

    if (!skipRender) {
      this.render();
    }
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.render();
  }

  /**
   * Clear messages by source and optionally by type
   */
  clearMessagesBySource(source: string, type?: 'error' | 'warning' | 'info' | 'success'): void {
    this.messages = this.messages.filter(msg => {
      // Keep if source doesn't match
      if (msg.source !== source) return true;
      // If type specified, only remove messages with matching type
      if (type && msg.type !== type) return true;
      // Remove if source matches (and type matches if specified)
      return false;
    });
    this.render();
  }

  /**
   * Render messages to DOM with tabs
   */
  private render(): void {
    this.closeQuickFixMenu();

    // Separate messages into problems and output
    const problems = this.messages.filter(msg => msg.type === 'error' || msg.type === 'warning');
    const outputs = this.messages.filter(msg => msg.type === 'info' || msg.type === 'success');

    // Sort problems by severity
    const sortedProblems = [...problems].sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
      return severityOrder[a.type] - severityOrder[b.type];
    });

    // Count by type for tab badges
    const errorCount = problems.filter(m => m.type === 'error').length;
    const warningCount = problems.filter(m => m.type === 'warning').length;
    const problemCount = errorCount + warningCount;

    let html: string;
    if (this.singleTab) {
      const content = this.singleTab === 'problems'
        ? this.renderProblems(sortedProblems, errorCount, warningCount)
        : this.renderOutput(outputs);
      html = `<div class="output-content" style="height:100%">${content}</div>`;
    } else {
      html = `
        <div class="output-tabs">
          <button class="output-tab ${this.activeTab === 'problems' ? 'active' : ''}" data-tab="problems">
            Problems ${problemCount > 0 ? `<span class="tab-badge">${problemCount}</span>` : ''}
          </button>
          <button class="output-tab ${this.activeTab === 'output' ? 'active' : ''}" data-tab="output">
            Output
          </button>
          <button class="clear-btn" title="Clear ${this.activeTab}">Clear</button>
        </div>
        <div class="output-content">
          ${this.activeTab === 'problems'
            ? this.renderProblems(sortedProblems, errorCount, warningCount)
            : this.renderOutput(outputs)
          }
        </div>
      `;
    }

    this.container.innerHTML = html;

    if (!this.singleTab) {
      // Wire up tab buttons
      this.container.querySelectorAll('.output-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = (e.target as HTMLElement).getAttribute('data-tab') as 'problems' | 'output';
          if (tab) {
            this.closeQuickFixMenu();
            this.activeTab = tab;
            this.render();
          }
        });
      });

      // Wire up clear button
      this.container.querySelector('.clear-btn')?.addEventListener('click', () => {
        if (this.activeTab === 'problems') {
          this.messages = this.messages.filter(m => m.type !== 'error' && m.type !== 'warning');
        } else {
          this.messages = this.messages.filter(m => m.type !== 'info' && m.type !== 'success');
        }
        this.render();
      });
    }

    // Wire click-to-navigate on problem rows that have location info
    this.container.querySelectorAll<HTMLElement>('[data-nav-line]').forEach(el => {
      el.addEventListener('click', () => {
        const line = parseInt(el.getAttribute('data-nav-line') ?? '0', 10);
        const column = parseInt(el.getAttribute('data-nav-col') ?? '1', 10);
        if (line > 0) this.eventBus.emit('navigate:to', { line, column });
      });
    });

    this.wireProblemQuickFixes();

    // Scroll the output messages list to the bottom so the latest entry is visible.
    const msgList = this.container.querySelector<HTMLElement>('.output-messages');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;
  }

  /**
   * Render problems tab content
   */
  private renderProblems(problems: OutputMessage[], errorCount: number, warningCount: number): string {
    if (problems.length === 0) {
      return '<div class="empty-state">No problems detected</div>';
    }

    return `
      <div class="problems-summary">
        ${errorCount > 0 ? `<span class="problem-count error-count">${errorCount} error${errorCount > 1 ? 's' : ''}</span>` : ''}
        ${warningCount > 0 ? `<span class="problem-count warning-count">${warningCount} warning${warningCount > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="output-messages">
        ${problems.map(msg => this.renderProblemMessage(msg)).join('')}
      </div>
    `;
  }

  /**
   * Render output tab content
   */
  private renderOutput(outputs: OutputMessage[]): string {
    if (outputs.length === 0) {
      return '<div class="empty-state">No output messages</div>';
    }

    // Chronological order — newest at the bottom; we scroll there after render.
    return `
      <div class="output-messages">
        ${outputs.map(msg => this.renderOutputMessage(msg)).join('')}
      </div>
    `;
  }

  /**
   * Render a problem message (no timestamp)
   */
  private renderProblemMessage(msg: OutputMessage): string {
    const msgIcon = this.getIcon(msg.type);
    const source = msg.source ? `[${msg.source}]` : '';

    let locBadge = '';
    let line = 0, col = 1;
    if (msg.loc && msg.loc.start) {
      line = msg.loc.start.line ?? 0;
      col = msg.loc.start.column ?? 1;
      locBadge = `<span class="output-loc">line ${line}, col ${col}</span>`;
    }

    const suggestionHtml = msg.suggestion
      ? `<div class="output-suggestion">${icon('light-bulb', 'w-3 h-3 inline-block align-middle')} ${this.escapeHtml(msg.suggestion)}</div>`
      : '';

    const navAttrs = line > 0 ? `data-nav-line="${line}" data-nav-col="${col}"` : '';
    const title =
      line > 0
        ? 'Click to jump · Right-click for quick fixes'
        : 'Right-click for quick fixes when available';

    return `
      <div class="output-message output-${msg.type}" ${navAttrs} data-problem-message="${this.escapeAttr(msg.message)}" style="cursor:pointer" title="${this.escapeAttr(title)}">
        <div class="output-message-main">
          <span class="output-icon">${msgIcon}</span>
          ${source ? `<span class="output-source">${source}</span>` : ''}
          <span class="output-text">${this.escapeHtml(msg.message)}</span>
          ${locBadge}
        </div>
        ${suggestionHtml}
      </div>
    `;
  }

  /**
   * Render an output message (with timestamp)
   */
  private renderOutputMessage(msg: OutputMessage): string {
    const msgIcon = this.getIcon(msg.type);
    const time = msg.timestamp.toLocaleTimeString();
    const source = msg.source ? `[${msg.source}]` : '';

    return `
      <div class="output-message output-${msg.type}">
        <div class="output-message-main">
          <span class="output-icon">${msgIcon}</span>
          <span class="output-time">${time}</span>
          ${source ? `<span class="output-source">${source}</span>` : ''}
          <span class="output-text">${this.escapeHtml(msg.message)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Get icon for message type
   */
  private getIcon(type: OutputMessage['type']): string {
    const iconMap: Record<OutputMessage['type'], string> = {
      error:   icon('exclamation-circle',   'w-4 h-4 inline-block align-middle'),
      warning: icon('exclamation-triangle', 'w-4 h-4 inline-block align-middle'),
      info:    icon('information-circle',   'w-4 h-4 inline-block align-middle'),
      success: icon('check-circle',         'w-4 h-4 inline-block align-middle'),
    };
    return iconMap[type];
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  private closeQuickFixMenu(): void {
    this.quickFixMenuDismiss?.();
    this.quickFixMenuDismiss = undefined;
    this.quickFixMenu?.remove();
    this.quickFixMenu = null;
  }

  private wireProblemQuickFixes(): void {
    if (!this.getTextModel || this.singleTab === 'output') return;

    this.container.querySelectorAll<HTMLElement>('.output-message.output-error, .output-message.output-warning').forEach((el) => {
      el.addEventListener('contextmenu', (event) => {
        const model = this.getTextModel?.();
        if (!model) return;

        const message = el.getAttribute('data-problem-message') ?? '';
        const line = parseInt(el.getAttribute('data-nav-line') ?? '0', 10);
        const column = parseInt(el.getAttribute('data-nav-col') ?? '1', 10);
        const loc =
          line > 0
            ? { start: { line, column } }
            : undefined;

        const fixes = getQuickFixesForProblem(model, message, loc);
        if (fixes.length === 0) return;

        event.preventDefault();
        this.showQuickFixMenu(event, model, fixes, line, column);
      });
    });
  }

  private showQuickFixMenu(
    event: MouseEvent,
    model: monaco.editor.ITextModel,
    fixes: ReturnType<typeof getQuickFixesForProblem>,
    line: number,
    column: number,
  ): void {
    this.closeQuickFixMenu();

    const menu = document.createElement('div');
    menu.className = 'problems-quick-fix-menu';
    menu.setAttribute('role', 'menu');

    for (const fix of fixes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'problems-quick-fix-item' + (fix.isPreferred ? ' is-preferred' : '');
      btn.textContent = fix.title;
      btn.setAttribute('role', 'menuitem');
      btn.addEventListener('click', () => {
        if (line > 0) {
          this.eventBus.emit('navigate:to', { line, column });
        }
        applyQuickFixSuggestion(model, fix);
        this.closeQuickFixMenu();
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    this.quickFixMenu = menu;

    const pad = 4;
    let left = event.clientX;
    let top = event.clientY;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
      menu.style.left = `${left}px`;
    }
    if (rect.bottom > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
      menu.style.top = `${top}px`;
    }

    const onDismiss = () => this.closeQuickFixMenu();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    setTimeout(() => {
      document.addEventListener('click', onDismiss, { once: true });
      document.addEventListener('contextmenu', onDismiss, { once: true });
      document.addEventListener('keydown', onKeyDown, { once: true });
    }, 0);
    this.quickFixMenuDismiss = () => {
      document.removeEventListener('click', onDismiss);
      document.removeEventListener('contextmenu', onDismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }
}
