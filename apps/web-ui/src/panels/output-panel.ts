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
}

/**
 * Manages console/error output display with tabs
 */
export class OutputPanel {
  private messages: OutputMessage[] = [];
  private container: HTMLElement;
  private maxMessages = 1000; // Prevent memory issues
  private activeTab: 'problems' | 'output' = 'problems';

  constructor(
    container: HTMLElement,
    private eventBus: EventBus
  ) {
    this.container = container;
    this.setupEventListeners();
    this.render();
  }

  /**
   * Subscribe to relevant events
   */
  private setupEventListeners(): void {
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
          message: w.message, // Don't include component - source property handles it
          source: 'validation',
          timestamp: new Date(),
          loc: w.loc,
        }, !isLast); // Skip render for all but last message
      }

      // If no warnings, render to show empty state
      if (warnings.length === 0) {
        this.render();
      }
    });

    // Validation errors
    this.eventBus.on('validation:errors', ({ errors }) => {
      // Clear previous validation errors before adding new ones
      this.clearMessagesBySource('validation', 'error');

      // Add all errors, skipping render until the last one
      for (let i = 0; i < errors.length; i++) {
        const e = errors[i];
        const isLast = i === errors.length - 1;
        this.addMessage({
          type: 'error',
          message: e.message,
          source: 'validation',
          timestamp: new Date(),
          loc: e.loc,
        }, !isLast); // Skip render for all but last message
      }

      // If no errors, render to show empty state
      if (errors.length === 0) {
        this.render();
      }
    });

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

    // Parse success - clear parse errors and optionally log to output
    this.eventBus.on('parse:success', () => {
      // Clear previous parse errors when parse succeeds
      this.clearMessagesBySource('parser', 'error');

      // Optionally add success message to Output tab (commented out to reduce noise)
      // this.addMessage({
      //   type: 'success',
      //   message: 'Parse successful',
      //   source: 'parser',
      //   timestamp: new Date(),
      // });
    });

    // Playback started
    this.eventBus.on('playback:started', () => {
      // Switch to Output tab to show playback messages
      this.activeTab = 'output';

      this.addMessage({
        type: 'info',
        message: 'Playback started',
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Playback paused
    this.eventBus.on('playback:paused', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback paused',
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Playback resumed
    this.eventBus.on('playback:resumed', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback resumed',
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Playback stopped
    this.eventBus.on('playback:stopped', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback stopped',
        source: 'playback',
        timestamp: new Date(),
      });
    });

    // Playback repeated (when song loops)
    this.eventBus.on('playback:repeated', () => {
      this.addMessage({
        type: 'info',
        message: 'Playback repeated',
        source: 'playback',
        timestamp: new Date(),
      });
    });
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

    const html = `
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

    this.container.innerHTML = html;

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

    // Add CSS if not already present
    this.ensureStyles();
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

    // Reverse to show newest messages at the top
    const reversedOutputs = [...outputs].reverse();

    return `
      <div class="output-messages">
        ${reversedOutputs.map(msg => this.renderOutputMessage(msg)).join('')}
      </div>
    `;
  }

  /**
   * Render a problem message (no timestamp)
   */
  private renderProblemMessage(msg: OutputMessage): string {
    const icon = this.getIcon(msg.type);
    const source = msg.source ? `[${msg.source}]` : '';

    let locStr = '';
    if (msg.loc && msg.loc.start) {
      const line = msg.loc.start.line;
      const col = msg.loc.start.column || 0;
      locStr = ` (line ${line}, col ${col})`;
    }

    return `
      <div class="output-message output-${msg.type}">
        <span class="output-icon">${icon}</span>
        ${source ? `<span class="output-source">${source}</span>` : ''}
        <span class="output-text">${this.escapeHtml(msg.message)}${locStr}</span>
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
        <span class="output-icon">${icon}</span>
        <span class="output-time">${time}</span>
        ${source ? `<span class="output-source">${source}</span>` : ''}
        <span class="output-text">${this.escapeHtml(msg.message)}</span>
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
        gap: 8px;
        padding: 4px 0;
        align-items: flex-start;
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
    `;
    document.head.appendChild(style);
  }
}
