/**
 * TransportControls - Manages play/pause/stop state machine and keyboard shortcuts
 * Part of Phase 2: Playback & Output
 */

import type { EventBus } from '../utils/event-bus';
import type { PlaybackManager } from './playback-manager';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:transport-controls');

export type TransportState = 'stopped' | 'playing' | 'paused';

export interface TransportControlsConfig {
  playButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  applyButton?: HTMLButtonElement;
  enableKeyboardShortcuts?: boolean;
}

/**
 * Manages transport controls (play/pause/stop) and keyboard shortcuts
 */
export class TransportControls {
  private state: TransportState = 'stopped';
  private config: TransportControlsConfig;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
  private hasErrors: boolean = false;

  constructor(
    config: TransportControlsConfig,
    private playbackManager: PlaybackManager,
    private eventBus: EventBus,
    private getSource: () => string
  ) {
    this.config = config;
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.updateButtonStates();
  }

  /**
   * Set up button click listeners
   */
  private setupEventListeners(): void {
    // Play button
    this.config.playButton.setAttribute('data-has-listener', 'true');
    this.config.playButton.addEventListener('click', () => {
      this.handlePlay();
    });

    // Pause button
    this.config.pauseButton.addEventListener('click', () => {
      this.handlePause();
    });

    // Stop button
    this.config.stopButton.addEventListener('click', () => {
      this.handleStop();
    });

    // Apply button (if provided)
    if (this.config.applyButton) {
      this.config.applyButton.addEventListener('click', () => {
        this.handleApply();
      });
    }

    // Listen to playback events to update state
    this.eventBus.on('playback:started', () => {
      this.setState('playing');
    });

    this.eventBus.on('playback:stopped', () => {
      this.setState('stopped');
    });

    this.eventBus.on('playback:paused', () => {
      this.setState('paused');
    });

    this.eventBus.on('playback:resumed', () => {
      this.setState('playing');
    });

    this.eventBus.on('playback:error', () => {
      this.setState('stopped');
    });
  }

  /**
   * Set up keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    if (!this.config.enableKeyboardShortcuts) return;

    this.keyboardHandler = (e: KeyboardEvent) => {
      // Space = play if stopped, pause/resume if playing
      if (e.code === 'Space' && !this.isTyping(e)) {
        e.preventDefault();
        if (this.state === 'stopped') {
          this.handlePlay();
        } else {
          this.handlePause();
        }
      }

      // Escape = stop
      if (e.code === 'Escape') {
        e.preventDefault();
        this.handleStop();
      }

      // Ctrl+Enter = apply/play
      if ((e.ctrlKey || e.metaKey) && e.code === 'Enter') {
        e.preventDefault();
        this.handleApply();
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Check if user is typing in an input element
   */
  private isTyping(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      target.isContentEditable
    );
  }

  /**
   * Handle play button click (only starts playback when stopped)
   */
  private async handlePlay(): Promise<void> {
    if (this.state !== 'stopped') {
      // Already playing or paused, do nothing
      return;
    }

    // Start playback
    // Disable play button to prevent double-clicks
    this.config.playButton.disabled = true;

    try {
      const source = this.getSource();
      await this.playbackManager.play(source);
    } catch (error) {
      log.error('Playback failed:', error);
      // Error is already emitted by PlaybackManager
    } finally {
      // Re-enable button
      this.config.playButton.disabled = false;
    }
  }

  /**
   * Handle pause button click (toggles between pause and resume)
   */
  private async handlePause(): Promise<void> {
    if (this.state === 'playing') {
      // Pause
      try {
        await this.playbackManager.pause();
      } catch (error) {
        log.error('Pause failed:', error);
      }
      return;
    }

    if (this.state === 'paused') {
      // Resume
      try {
        await this.playbackManager.resume();
      } catch (error) {
        log.error('Resume failed:', error);
      }
      return;
    }
  }

  /**
   * Handle stop button click
   */
  private handleStop(): void {
    if (this.state === 'stopped') {
      // Already stopped, do nothing
      return;
    }

    this.playbackManager.stop();
  }

  /**
   * Handle apply button click
   */
  private async handleApply(): Promise<void> {
    // Apply = stop current playback and start new one
    if (this.state !== 'stopped') {
      this.handleStop();
    }

    // Wait a bit for stop to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Then play
    await this.handlePlay();
  }

  /**
   * Update transport state
   */
  private setState(newState: TransportState): void {
    this.state = newState;
    this.updateButtonStates();
  }

  /**
   * Update button enabled/disabled states
   */
  private updateButtonStates(): void {
    switch (this.state) {
      case 'stopped':
        this.config.playButton.disabled = this.hasErrors;
        this.config.playButton.textContent = '▶ Play';
        this.config.pauseButton.disabled = true;
        this.config.pauseButton.textContent = '⏸ Pause';
        this.config.stopButton.disabled = true;
        if (this.config.applyButton) {
          this.config.applyButton.disabled = this.hasErrors;
        }
        break;

      case 'playing':
        this.config.playButton.disabled = true;
        this.config.pauseButton.disabled = false;
        this.config.pauseButton.textContent = '⏸ Pause';
        this.config.stopButton.disabled = false;
        if (this.config.applyButton) {
          this.config.applyButton.disabled = false;
        }
        break;

      case 'paused':
        this.config.playButton.disabled = true;
        this.config.pauseButton.disabled = false;
        this.config.pauseButton.textContent = '▶ Resume';
        this.config.stopButton.disabled = false;
        if (this.config.applyButton) {
          this.config.applyButton.disabled = false;
        }
        break;
    }
  }

  /**
   * Set whether there are errors (disables play button)
   */
  setHasErrors(hasErrors: boolean): void {
    this.hasErrors = hasErrors;
    this.updateButtonStates();
  }

  /**
   * Get current transport state
   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * Clean up event listeners
   */
  dispose(): void {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
  }
}
