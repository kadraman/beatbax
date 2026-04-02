/**
 * StatusBar - Displays status information at the bottom of the UI
 *
 * Subscribes exclusively to nanostores — no EventBus dependency.
 */

import { playbackStatus, playbackTimeLabel, playbackError } from '../stores/playback.store';
import { parseStatus, parsedBpm, parsedChip, validationErrors, validationWarnings } from '../stores/editor.store';
import { exportStatus, exportFormat } from '../stores/ui.store';
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

  constructor(config: StatusBarConfig) {
    this.container = config.container;
    this.setupStoreSubscriptions();
    this.render();
  }

  private setupStoreSubscriptions(): void {
    // Parse lifecycle
    parseStatus.listen((status) => {
      switch (status) {
        case 'parsing': this.setStatus('Parsing...'); break;
        case 'success':
          if (this.info.status === 'Parsing...') this.info.status = 'Ready';
          this.render();
          break;
        case 'error':
          this.setStatus('Parse error');
          break;
      }
    });

    parsedBpm.listen((bpm) => { this.info.bpm = bpm; this.render(); });
    parsedChip.listen((chip) => { this.info.chip = chip; this.render(); });

    // Validation counts
    validationErrors.listen((errors) => {
      this.info.errorCount = errors.length;
      if (errors.length === 0) {
        if (this.info.status === 'Parse error') this.info.status = 'Ready';
      } else {
        this.info.status = 'Parse error';
      }
      this.render();
    });

    validationWarnings.listen((warnings) => {
      this.info.warningCount = warnings.length;
      this.render();
    });

    // Playback state
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

    playbackError.listen((msg) => {
      if (msg !== null) {
        this.setStatus('Playback error');
        this.info.errorCount++;
        this.render();
      }
    });

    // Export state
    exportStatus.listen((status) => {
      const fmt = exportFormat.get();
      switch (status) {
        case 'exporting': this.setStatus(`Exporting ${fmt}...`); break;
        case 'success':
          this.setStatus(`Export ${fmt} successful`);
          setTimeout(() => this.setStatus('Ready'), 3000);
          break;
        case 'error': this.setStatus(`Export ${fmt} failed`); break;
      }
    });
  }

  setStatus(status: string): void {
    this.info.status = status;
    this.render();
  }

  setCursorPosition(line: number, column: number): void {
    this.info.line = line;
    this.info.column = column;
    this.render();
  }

  updateInfo(partial: Partial<StatusInfo>): void {
    this.info = { ...this.info, ...partial };
    this.render();
  }

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

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
