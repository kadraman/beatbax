/**
 * StatusBar - Displays status information at the bottom of the UI
 * Part of Phase 2: Playback & Output
 */

import type { EventBus } from '../utils/event-bus';

export interface StatusBarConfig {
  container: HTMLElement;
}

export interface StatusInfo {
  line: number;
  column: number;
  errorCount: number;
  warningCount: number;
  bpm: number;
  chip: string;
  playbackTime: string;
  status: string;
}

/**
 * Manages status bar display
 */
export class StatusBar {
  private container: HTMLElement;
  private info: StatusInfo = {
    line: 1,
    column: 1,
    errorCount: 0,
    warningCount: 0,
    bpm: 120,
    chip: 'gameboy',
    playbackTime: '0:00',
    status: 'Ready',
  };

  constructor(
    config: StatusBarConfig,
    private eventBus: EventBus
  ) {
    this.container = config.container;
    this.setupEventListeners();
    this.render();
  }

  /**
   * Subscribe to relevant events
   */
  private setupEventListeners(): void {
    // Parse events
    this.eventBus.on('parse:started', () => {
      this.setStatus('Parsing...');
    });

    this.eventBus.on('parse:success', ({ ast }) => {
      this.setStatus('Parse successful');
      this.info.errorCount = 0;

      // Extract BPM and chip from AST
      if (ast) {
        this.info.bpm = (ast as any).bpm || 120;
        this.info.chip = (ast as any).chip || 'gameboy';
      }

      this.render();
    });

    this.eventBus.on('parse:error', () => {
      this.setStatus('Parse error');
      this.info.errorCount++;
      this.render();
    });

    // Playback events
    this.eventBus.on('playback:started', () => {
      this.setStatus('Playing');
    });

    this.eventBus.on('playback:stopped', () => {
      this.setStatus('Stopped');
      this.info.playbackTime = '0:00';
      this.render();
    });

    this.eventBus.on('playback:paused', () => {
      this.setStatus('Paused');
    });

    this.eventBus.on('playback:error', () => {
      this.setStatus('Playback error');
      this.info.errorCount++;
      this.render();
    });

    this.eventBus.on('playback:position', ({ current, total }) => {
      this.info.playbackTime = this.formatTime(current);
      this.render();
    });

    // Validation events
    this.eventBus.on('validation:warnings', ({ warnings }) => {
      this.info.warningCount = warnings.length;
      this.render();
    });

    this.eventBus.on('validation:errors', ({ errors }) => {
      this.info.errorCount = errors.length;
      this.render();
    });

    // Export events
    this.eventBus.on('export:started', ({ format }) => {
      this.setStatus(`Exporting ${format}...`);
    });

    this.eventBus.on('export:success', ({ format }) => {
      this.setStatus(`Export ${format} successful`);
      // Reset to previous status after 3 seconds
      setTimeout(() => this.setStatus('Ready'), 3000);
    });

    this.eventBus.on('export:error', ({ format }) => {
      this.setStatus(`Export ${format} failed`);
    });
  }

  /**
   * Set status message
   */
  setStatus(status: string): void {
    this.info.status = status;
    this.render();
  }

  /**
   * Set cursor position (line, column)
   */
  setCursorPosition(line: number, column: number): void {
    this.info.line = line;
    this.info.column = column;
    this.render();
  }

  /**
   * Update status info
   */
  updateInfo(partial: Partial<StatusInfo>): void {
    this.info = { ...this.info, ...partial };
    this.render();
  }

  /**
   * Format time in seconds to MM:SS
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Render status bar
   */
  private render(): void {
    const html = `
      <div class="status-bar">
        <div class="status-section status-main">
          <span class="status-text">${this.escapeHtml(this.info.status)}</span>
        </div>

        <div class="status-section">
          <span class="status-label">Ln ${this.info.line}, Col ${this.info.column}</span>
        </div>

        ${this.info.errorCount > 0 ? `
          <div class="status-section status-errors">
            <span class="status-icon">❌</span>
            <span class="status-count">${this.info.errorCount}</span>
          </div>
        ` : ''}

        ${this.info.warningCount > 0 ? `
          <div class="status-section status-warnings">
            <span class="status-icon">⚠️</span>
            <span class="status-count">${this.info.warningCount}</span>
          </div>
        ` : ''}

        <div class="status-section">
          <span class="status-label">BPM: ${this.info.bpm}</span>
        </div>

        <div class="status-section">
          <span class="status-label">Chip: ${this.info.chip}</span>
        </div>

        <div class="status-section">
          <span class="status-label">Time: ${this.info.playbackTime}</span>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.ensureStyles();
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
    const styleId = 'beatbax-status-bar-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .status-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 4px 12px;
        background: var(--status-bar-bg, #007acc);
        color: var(--status-bar-text, #fff);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        border-top: 1px solid var(--border-color, #444);
        height: 24px;
      }

      .status-section {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .status-main {
        flex: 1;
        font-weight: 500;
      }

      .status-text {
        opacity: 0.95;
      }

      .status-label {
        opacity: 0.9;
      }

      .status-icon {
        font-size: 14px;
      }

      .status-count {
        font-weight: 600;
      }

      .status-errors {
        color: var(--error-color-light, #ffc1c1);
      }

      .status-warnings {
        color: var(--warning-color-light, #ffd666);
      }
    `;
    document.head.appendChild(style);
  }
}
