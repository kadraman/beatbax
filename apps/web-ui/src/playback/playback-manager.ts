/**
 * PlaybackManager - Manages audio playback lifecycle and state
 * Part of Phase 2: Playback & Output
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong, resolveImports } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import type { EventBus } from '../utils/event-bus';
import type { ChannelState } from './channel-state';
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
 * Phase 2.5: Real-time playback position tracking
 */
export interface PlaybackPosition {
  channelId: number;
  eventIndex: number;
  totalEvents: number;
  currentInstrument: string | null;
  currentPattern: string | null;
  sourceSequence: string | null;
  barNumber: number | null;
  progress: number; // 0.0 to 1.0
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
  // Phase 2.5: Track playback position per channel
  private playbackPosition: Map<number, PlaybackPosition> = new Map();
  private channelEvents: Map<number, any[]> = new Map(); // channelId → event array

  constructor(
    private eventBus: EventBus,
    private channelState?: ChannelState
  ) {}

  /**
   * Parse and start playback
   */
  async play(source: string, options: PlaybackOptions = {}): Promise<void> {
    log.debug('=== PlaybackManager.play() called ===');
    log.debug('Source length:', source.length, 'characters');

    try {
      // Stop any existing playback
      if (this.state.isPlaying) {
        log.debug('Stopping existing playback');
        this.stop();
      }

      // Reset error state
      this.state.error = null;

      // Emit parsing event
      log.debug('Emitting parse:started');
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

      // Phase 2.5: Extract sequence/pattern names BEFORE resolution (resolution will mutate these)
      const channelSequenceNames = new Map<number, string>();
      const channelPatternMaps = new Map<number, Map<number, string>>(); // channelId -> (eventIndex -> patternName)

      if (resolvedAST && (resolvedAST as any).channels) {
        const ast = resolvedAST as any;

        (ast.channels as any[]).forEach((channel: any) => {
          const channelId = channel.id;
          let seqName: string | null = null;

          // Extract sequence or pattern name
          if (channel.seq && typeof channel.seq === 'string') {
            seqName = channel.seq.split(/[\s,]/)[0].trim();
            if (seqName) {
              channelSequenceNames.set(channelId, seqName);
            }
          } else if (channel.pat && typeof channel.pat === 'string') {
            const patName = channel.pat.split(/[\s,]/)[0].trim().split(':')[0].trim();
            if (patName) {
              channelSequenceNames.set(channelId, patName);
              seqName = patName; // Treat direct pattern as a single-pattern sequence
            }
          }

          // Build event index -> pattern name mapping
          if (ast.pats) {
            const patternMap = new Map<number, string>();
            let currentEventIndex = 0;
            let patternTokens: string[] = [];

            // Check if this is a named sequence or inline sequence
            if (channel.seq && typeof channel.seq === 'string') {
              // Could be inline sequence like "wave_seq wave_seq arp_pat"
              // or named sequence reference
              const firstToken = channel.seq.split(/[\s,]/)[0].trim();

              if (ast.seqs && ast.seqs[firstToken]) {
                // Named sequence - get tokens from sequence definition
                const seqDef = ast.seqs[firstToken];
                if (seqDef.tokens && Array.isArray(seqDef.tokens)) {
                  patternTokens = seqDef.tokens.map((t: any) =>
                    typeof t === 'string' ? t : (t.pattern || t.ref || '')
                  );
                }
              } else {
                // Inline sequence - parse the string directly
                patternTokens = channel.seq.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean);
              }
            } else if (channel.pat && typeof channel.pat === 'string') {
              // Direct pattern reference OR inline sequence
              // Check if it contains spaces (inline sequence) or is a single pattern
              if (channel.pat.includes(' ') || channel.pat.includes(',')) {
                // Inline sequence - multiple patterns
                patternTokens = channel.pat.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean);
              } else {
                // Single pattern reference
                patternTokens = [channel.pat];
              }
            }

            // Expand sequence references to pattern names
            const expandedPatternTokens: string[] = [];
            patternTokens.forEach((token: string) => {
              const baseName = token.split(':')[0].trim();

              // Check if this is a sequence reference
              if (ast.seqs && ast.seqs[baseName]) {
                const seqDef = ast.seqs[baseName];

                // The seqDef is directly an array of pattern names
                if (Array.isArray(seqDef)) {
                  seqDef.forEach((patRef: any) => {
                    const patName = typeof patRef === 'string' ? patRef : (patRef.pattern || patRef.ref || '');
                    if (patName) {
                      expandedPatternTokens.push(patName);
                    }
                  });
                }
              } else {
                // It's a direct pattern reference
                expandedPatternTokens.push(token);
              }
            });

            // Map each pattern to event indices
            expandedPatternTokens.forEach((patRef: string) => {
              // Extract pattern name (handle transforms like "melody:inst(bass)" or "wave_seq:oct(-1)")
              const patName = patRef.split(':')[0].trim();

              if (patName && ast.pats[patName]) {
                const pattern = ast.pats[patName];

                // Pattern is directly an array of tokens (notes/rests)
                const patternLength = Array.isArray(pattern) ? pattern.length :
                                     (pattern.tokens ? pattern.tokens.length : 0);

                // Map this range of events to this pattern
                for (let i = 0; i < patternLength; i++) {
                  patternMap.set(currentEventIndex + i, patName);
                }

                currentEventIndex += patternLength;
              }
            });

            if (patternMap.size > 0) {
              channelPatternMaps.set(channelId, patternMap);
            }
          }
        });
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
        log.debug('Player instance created:', this.player);
        log.debug('Player.playAST type:', typeof this.player.playAST);
        log.debug('Player.playAST:', this.player.playAST);

        // Connect player to channelState so mute/solo buttons work
        if (this.channelState) {
          this.channelState.setPlayer(this.player);
        }
      }

      // Set up completion callback to handle natural playback end
      this.player.onComplete = () => {
        this.stop();
      };

      // Set up repeat callback to notify UI when song loops
      this.player.onRepeat = () => {
        this.eventBus.emit('playback:repeated', undefined);
      };

      // Phase 2.5: Set up position tracking
      log.debug('Setting up position tracking callback on player');
      this.setupPositionTracking(this.player, resolved, channelSequenceNames, channelPatternMaps);
      log.debug('Position tracking callback registered:', !!this.player.onPositionChange);

      // Apply channel mute/solo state before playback starts
      if (this.channelState) {
        this.channelState.applyToPlayer(this.player);
      }

      // Start playback (Player will handle AudioContext resume internally)
      log.debug('Calling player.playAST()...');
      await this.player.playAST(resolved as any);
      log.debug('player.playAST() completed');

      // Update state
      this.state.isPlaying = true;
      this.state.isPaused = false;

      // Emit playback started
      log.debug('Emitting playback:started');
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

      // Phase 2.5: Clear position tracking
      this.playbackPosition.clear();
      this.channelEvents.clear();

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
   * Phase 2.5: Set up real-time position tracking
   */
  private setupPositionTracking(
    player: Player,
    ast: any,
    channelSequenceNames: Map<number, string>,
    channelPatternMaps: Map<number, Map<number, string>>
  ): void {
    // Extract channel events from resolved AST
    // (channelSequenceNames and channelPatternMaps already extracted before resolution)

    if (ast && ast.channels) {
      log.debug(`Setting up position tracking for ${ast.channels.length} channels`);

      ast.channels.forEach((channel: any) => {
        const channelId = channel.id;

        if (channel.events && Array.isArray(channel.events)) {
          log.debug(`Channel ${channelId}: ${channel.events.length} events`);
          this.channelEvents.set(channelId, channel.events);
        }
      });

      log.debug(`channelEvents map populated:`, Array.from(this.channelEvents.keys()));
    }

    // Hook into Player's onPositionChange callback
    player.onPositionChange = (channelId: number, eventIndex: number, totalEvents: number) => {
      log.debug(`onPositionChange: ch${channelId}, event ${eventIndex}/${totalEvents}`);

      const events = this.channelEvents.get(channelId) || [];
      const event = events[eventIndex];

      log.debug(`Event data:`, event);

      // Get sequence and pattern names for this channel
      const sequenceName = channelSequenceNames.get(channelId) || null;
      const patternMap = channelPatternMaps.get(channelId);
      const patternName = patternMap ? patternMap.get(eventIndex) || null : null;

      // Create or update position object
      const position: PlaybackPosition = {
        channelId,
        eventIndex,
        totalEvents,
        currentInstrument: event?.instrument || null,
        currentPattern: patternName, // Use the pattern name we extracted
        sourceSequence: sequenceName, // Use the sequence name we extracted
        barNumber: null, // Not needed when showing pattern names
        progress: totalEvents > 0 ? eventIndex / totalEvents : 0,
      };

      this.playbackPosition.set(channelId, position);

      log.debug(`Emitting playback:position-changed for channel ${channelId}`, position);
      this.eventBus.emit('playback:position-changed', { channelId, position });
    };
  }

  /**
   * Phase 2.5: Get current playback position for a channel
   */
  getPlaybackPosition(channelId: number): PlaybackPosition | null {
    return this.playbackPosition.get(channelId) || null;
  }

  /**
   * Phase 2.5: Get all playback positions
   */
  getAllPlaybackPositions(): Map<number, PlaybackPosition> {
    return new Map(this.playbackPosition);
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
