/**
 * StatusBar - Displays status information at the bottom of the UI
 */

import type { EventBus } from '../utils/event-bus';
import { playbackStatus, playbackTimeLabel } from '../stores/playback.store';
import { icon } from '../utils/icons';

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
      // Extract BPM and chip from AST — but only update status if there are no
      // validation errors (validation:errors fires separately and sets errorCount).
      if (ast) {
        this.info.bpm = (ast as any).bpm || 120;
        this.info.chip = (ast as any).chip || 'gameboy';
      }
      // Only reset the status text if it was a transient "Parsing…" state.
      if (this.info.status === 'Parsing...') {
        this.info.status = 'Ready';
      }
      this.render();
    });

    this.eventBus.on('parse:error', () => {
      this.setStatus('Parse error');
      this.info.errorCount++;
      this.render();
    });

    // Playback state — subscribe to stores instead of event bus
    playbackStatus.listen((status) => {
      switch (status) {
        case 'playing': this.setStatus('Playing'); break;
        case 'stopped':
          this.info.playbackTime = '0:00';
          this.setStatus('Stopped');
          break;
        case 'paused': this.setStatus('Paused'); break;
      }
    });

    playbackTimeLabel.listen((label) => {
      this.info.playbackTime = label;
      this.render();
    });

    this.eventBus.on('playback:error', () => {
      this.setStatus('Playback error');
      this.info.errorCount++;
      this.render();
    });

    // Validation events
    this.eventBus.on('validation:warnings', ({ warnings }) => {
      this.info.warningCount = warnings.length;
      this.render();
    });

    this.eventBus.on('validation:errors', ({ errors }) => {
      this.info.errorCount = errors.length;
      if (errors.length === 0) {
        if (this.info.status !== 'Playback error' && this.info.status !== 'Parse error') {
          this.info.status = 'Ready';
        }
      } else {
        this.info.status = 'Parse error';
      }
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
            <span class="status-icon">${icon('exclamation-circle', 'w-3.5 h-3.5 inline-block align-middle')}</span>
            <span class="status-count">${this.info.errorCount}</span>
          </div>
        ` : ''}

        ${this.info.warningCount > 0 ? `
          <div class="status-section status-warnings">
            <span class="status-icon">${icon('exclamation-triangle', 'w-3.5 h-3.5 inline-block align-middle')}</span>
            <span class="status-count">${this.info.warningCount}</span>
          </div>
        ` : ''}

        <div class="status-section">
          <span class="status-label">Chip: ${this.info.chip}</span>
        </div>
        <div class="status-section status-brand">
          <a class="status-brand-link" href="https://github.com/kadraman/beatbax" target="_blank" rel="noopener noreferrer" title="BeatBax on GitHub">
            <span class="bb-letter beat-b">B</span>
            <span class="bb-letter beat-e">e</span>
            <span class="bb-letter beat-a">a</span>
            <span class="bb-letter beat-t">t</span>
            <span class="bb-letter bax-b">B</span>
            <span class="bb-letter bax-a">a</span>
            <span class="bb-letter bax-x">x</span>
          </a>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
