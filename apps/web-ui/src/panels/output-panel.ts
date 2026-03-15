/**
 * OutputPanel - Displays console/error/warning messages with tabbed interface
 * Part of Phase 2: Playback & Output
 *
 * Two tabs:
 * - Problems: Errors and warnings (no timestamp, sorted by severity)
 * - Output: Info and success messages (with timestamp, chronological order)
 */

import type { EventBus } from '../utils/event-bus';

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
export class OutputPanel {
  private messages: OutputMessage[] = [];
  private container: HTMLElement;
  private maxMessages = 1000; // Prevent memory issues
  private activeTab: 'problems' | 'output' = 'problems';
  private singleTab: 'problems' | 'output' | undefined;

  constructor(
    container: HTMLElement,
    private eventBus: EventBus,
    options: { singleTab?: 'problems' | 'output' } = {}
  ) {
    this.container = container;
    this.singleTab = options.singleTab;
    this.setupEventListeners();
    this.render();
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
      this.eventBus.on('playback:started', () => {
        this.activeTab = 'output';
        this.addMessage({
          type: 'info',
          message: 'Playback started',
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

      this.eventBus.on('playback:repeated', () => {
        this.addMessage({
          type: 'info',
          message: 'Playback repeated',
          source: 'playback',
          timestamp: new Date(),
        });
      });
    }
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

    // Add CSS if not already present
    this.ensureStyles();

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
    const icon = this.getIcon(msg.type);
    const source = msg.source ? `[${msg.source}]` : '';

    let locBadge = '';
    let line = 0, col = 1;
    if (msg.loc && msg.loc.start) {
      line = msg.loc.start.line ?? 0;
      col = msg.loc.start.column ?? 1;
      locBadge = `<span class="output-loc">line ${line}, col ${col}</span>`;
    }

    const suggestionHtml = msg.suggestion
      ? `<div class="output-suggestion">💡 ${this.escapeHtml(msg.suggestion)}</div>`
      : '';

    const navAttrs = line > 0 ? `data-nav-line="${line}" data-nav-col="${col}" style="cursor:pointer" title="Click to jump to line ${line}"` : '';

    return `
      <div class="output-message output-${msg.type}" ${navAttrs}>
        <div class="output-message-main">
          <span class="output-icon">${icon}</span>
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
    const icon = this.getIcon(msg.type);
    const time = msg.timestamp.toLocaleTimeString();
    const source = msg.source ? `[${msg.source}]` : '';

    return `
      <div class="output-message output-${msg.type}">
        <div class="output-message-main">
          <span class="output-icon">${icon}</span>
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
    const icons = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅',
    };
    return icons[type];
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Ensure CSS styles are present
   */
  private ensureStyles(): void {
    const styleId = 'beatbax-output-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .output-tabs {
        display: flex;
        gap: 4px;
        padding: 4px 8px;
        border-bottom: 1px solid var(--border-color, #444);
        background: var(--header-bg, #2d2d2d);
        align-items: center;
      }

      .output-tab {
        padding: 6px 12px;
        background: transparent;
        border: none;
        color: var(--text-muted, #858585);
        cursor: pointer;
        border-radius: 3px 3px 0 0;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.2s, color 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .output-tab:hover {
        background: var(--button-hover-bg, #3a3a3a);
        color: var(--text-color, #ccc);
      }

      .output-tab.active {
        background: var(--bg-color, #1e1e1e);
        color: var(--text-color, #d4d4d4);
        font-weight: 600;
      }

      .tab-badge {
        background: var(--error-color, #f48771);
        color: #000;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: bold;
        min-width: 20px;
        text-align: center;
      }

      .clear-btn {
        padding: 4px 8px;
        background: var(--button-bg, #444);
        border: 1px solid var(--border-color, #555);
        color: var(--text-color, #ccc);
        cursor: pointer;
        border-radius: 3px;
        font-size: 12px;
        margin-left: auto;
      }

      .clear-btn:hover {
        background: var(--button-hover-bg, #555);
      }

      .output-content {
        height: calc(100% - 36px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--bg-color, #1e1e1e);
      }

      .problems-summary {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color, #444);
        display: flex;
        gap: 12px;
        font-size: 12px;
        background: var(--header-bg, #2d2d2d);
      }

      .problem-count {
        font-weight: 600;
      }

      .error-count {
        color: var(--error-color, #f48771);
      }

      .warning-count {
        color: var(--warning-color, #cca700);
      }

      .empty-state {
        padding: 20px;
        text-align: center;
        color: var(--text-muted, #858585);
        font-size: 13px;
      }

      .output-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
        color: var(--text-color, #d4d4d4);
      }

      .output-message {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0;
      }

      .output-message-main {
        display: flex;
        gap: 8px;
        align-items: baseline;
      }

      .output-error { color: var(--error-color, #f48771); }
      .output-warning { color: var(--warning-color, #cca700); }
      .output-info { color: var(--info-color, #75beff); }
      .output-success { color: var(--success-color, #89d185); }

      .output-icon {
        flex-shrink: 0;
        width: 20px;
      }

      .output-time {
        color: var(--text-muted, #858585);
        min-width: 70px;
        flex-shrink: 0;
        font-size: 11px;
      }

      .output-source {
        color: var(--text-muted, #858585);
        font-weight: bold;
        min-width: 80px;
        flex-shrink: 0;
        font-size: 11px;
      }

      .output-text {
        flex: 1;
        word-break: break-word;
      }

      .output-loc {
        flex-shrink: 0;
        font-size: 11px;
        color: var(--text-muted, #858585);
        padding: 1px 5px;
        border-radius: 3px;
        border: 1px solid var(--border-color, #444);
        white-space: nowrap;
      }

      [data-nav-line]:hover {
        background: var(--button-hover-bg, rgba(255,255,255,0.06));
        border-radius: 3px;
      }

      .output-suggestion {
        margin-left: 28px;
        font-size: 11px;
        color: var(--text-muted, #858585);
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }
}
