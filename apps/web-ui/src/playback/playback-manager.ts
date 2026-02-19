/**
 * PlaybackManager - Manages audio playback lifecycle and state
 * Part of Phase 2: Playback & Output
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong, resolveImports } from '@beatbax/engine/song';
import Player from '@beatbax/engine/audio/playback';
import type { EventBus } from '../utils/event-bus';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:playback');

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;
  duration: number;
  error: Error | null;
  ast: any | null;
}

export interface PlaybackOptions {
  onWarn?: (warning: any) => void;
}

/**
 * Manages audio playback lifecycle and state
 */
export class PlaybackManager {
  private state: PlaybackState = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    error: null,
    ast: null,
  };

  private player: Player | null = null;

  constructor(private eventBus: EventBus) {}

  /**
   * Parse and start playback
   */
  async play(source: string, options: PlaybackOptions = {}): Promise<void> {
    try {
      // Stop any existing playback
      if (this.state.isPlaying) {
        this.stop();
      }

      // Reset error state
      this.state.error = null;

      // Emit parsing event
      this.eventBus.emit('parse:started', undefined);

      // Parse source
      const ast = parse(source);

      // Collect warnings
      const warnings: Array<{ component: string; message: string; file?: string; loc?: any }> = [];

      // Resolve imports (if any)
      let resolvedAST = ast;
      if ((ast as any).imports && (ast as any).imports.length > 0) {
        try {
          resolvedAST = await resolveImports(ast as any, {
            onWarn: (message: string, loc?: any) => {
              warnings.push({ component: 'import-resolver', message, loc });
            },
          });
        } catch (importErr: any) {
          const error = new Error(`Import failed: ${importErr.message || String(importErr)}`);
          this.state.error = error;
          this.eventBus.emit('parse:error', { error, message: error.message });
          this.eventBus.emit('playback:error', { error });
          throw error;
        }
      }

      // Resolve song
      const resolved = resolveSong(resolvedAST as any, {
        onWarn: (w: any) => {
          warnings.push(w);
          if (options.onWarn) {
            options.onWarn(w);
          }
        }
      });

      // Note: We don't emit validation:warnings here because validation is
      // handled by the editor's live validation system. Emitting here would
      // overwrite the editor's validation warnings with only resolveSong warnings.

      // Store AST
      this.state.ast = resolved;

      // Emit parse success
      this.eventBus.emit('parse:success', { ast: resolved });

      // Create player if needed
      if (!this.player) {
        this.player = new Player();
      }

      // Set up completion callback to handle natural playback end
      this.player.onComplete = () => {
        this.stop();
      };

      // Set up repeat callback to notify UI when song loops
      this.player.onRepeat = () => {
        this.eventBus.emit('playback:repeated', undefined);
      };

      // Start playback (Player will handle AudioContext resume internally)
      await this.player.playAST(resolved as any);

      // Update state
      this.state.isPlaying = true;
      this.state.isPaused = false;

      // Emit playback started
      this.eventBus.emit('playback:started', undefined);

    } catch (error: any) {
      this.state.error = error as Error;
      const errorMessage = this.formatParseError(error);
      this.eventBus.emit('parse:error', { error: error as Error, message: errorMessage });
      this.eventBus.emit('playback:error', { error: error as Error });
      throw error;
    }
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.player) return;

    try {
      if (typeof this.player.stop === 'function') {
        this.player.stop();
      }

      this.state.isPlaying = false;
      this.state.isPaused = false;
      this.state.currentTime = 0;

      this.eventBus.emit('playback:stopped', undefined);
    } catch (error) {
      log.error('Error stopping playback:', error);
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.state.isPlaying || this.state.isPaused) {
      return;
    }

    if (this.player && typeof this.player.pause === 'function') {
      await this.player.pause();
      this.state.isPaused = true;
      this.eventBus.emit('playback:paused', undefined);
    }
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    if (!this.state.isPlaying || !this.state.isPaused) {
      return;
    }

    if (this.player && typeof this.player.resume === 'function') {
      await this.player.resume();
      this.state.isPaused = false;
      this.eventBus.emit('playback:resumed', undefined);
    }
  }

  /**
   * Get current playback state
   */
  getState(): Readonly<PlaybackState> {
    return { ...this.state };
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state.isPlaying && !this.state.isPaused;
  }

  /**
   * Get the current player instance
   */
  getPlayer(): Player | null {
    return this.player;
  }

  /**
   * Get the current AST
   */
  getAST(): any | null {
    return this.state.ast;
  }

  /**
   * Format parse errors with location info
   */
  private formatParseError(err: any, filename?: string): string {
    if (!err) return 'Parse error: Unknown error';

    const message = err.message || String(err);

    // Check if this is a Peggy parser error with location information
    if (err.location && err.location.start) {
      const line = err.location.start.line;
      const column = err.location.start.column;
      const prefix = filename ? filename : 'source';
      return `Parse error in ${prefix} at line ${line}, column ${column}: ${message}`;
    }

    // Fallback for other errors
    const prefix = filename ? ` in ${filename}` : '';
    return `Parse error${prefix}: ${message}`;
  }
}
