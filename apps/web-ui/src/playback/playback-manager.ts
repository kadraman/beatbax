/**
 * PlaybackManager - Manages audio playback lifecycle and state
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong, resolveImports } from '@beatbax/engine/song';
import { Player } from '@beatbax/engine/audio/playback';
import type { EventBus } from '../utils/event-bus';
import { channelStates, setChannelMuted, setChannelSoloed } from '../stores/channel.store';
import { createLogger } from '@beatbax/engine/util/logger';
import { storage, StorageKey } from '../utils/local-storage';
import { settingAudioSampleRate } from '../stores/settings.store';
import {
  playbackStatus,
  playbackBpm,
  playbackPosition as playbackPositionAtom,
  playbackDuration,
  playbackTimeLabel,
  playbackError,
} from '../stores/playback.store';
import {
  parseStatus,
  parsedBpm,
  parsedChip,
} from '../stores/editor.store';

function formatPlaybackTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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
 * Real-time playback position tracking
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
  // If user adjusts master volume before the Player instance is created,
  // store the desired volume here (linear 0.0–1.0). Applied to the Player
  // as soon as it is constructed so playback honors the transport control.
  private _pendingMasterVolume: number | null = null;
  private _loop = false;
  private _bpmOverride: number | null = null;
  private _masterAnalyser: AnalyserNode | null = null;
  // Track playback position per channel
  private playbackPosition: Map<number, PlaybackPosition> = new Map();
  private channelEvents: Map<number, any[]> = new Map(); // channelId → full event array
  // Maps channelId → (noteEventIndex → { seq, pat })
  // Built post-resolution by counting ONLY note/named events, matching the Player's eventIndex counter.
  private channelMetaIndex: Map<number, Map<number, { seq: string | null; pat: string | null }>> = new Map();
  // Parallel note/named-only event arrays so eventIndex (note-only counter) maps correctly for instrument display.
  private channelNoteEvents: Map<number, any[]> = new Map();
  private _lastKnownSeq: Map<number, string> = new Map();
  private _lastKnownPat: Map<number, string> = new Map();
  private _perChannelAnalyserEnabled: boolean = false;

  constructor(
    private eventBus: EventBus,
  ) {
    // Restore per-channel analyser preference from localStorage
    try {
      this._perChannelAnalyserEnabled =
        storage.get(StorageKey.FEATURE_PER_CHANNEL_ANALYSER) === 'true';
    } catch { /* ignore */ }

    // Live-sync mute/solo/volume to the Player whenever the store changes during playback.
    channelStates.subscribe((states) => {
      if (!this.player) return;
      const soloedId = Object.values(states).find(s => s.soloed)?.id ?? null;
      this.player.solo = soloedId;
      this.player.muted.clear();
      if (soloedId === null) {
        for (const info of Object.values(states)) {
          if (info.muted) this.player.muted.add(info.id);
        }
      }
      // Push per-channel volume to the Player's channel bus gain nodes.
      for (const info of Object.values(states)) {
        if (info.volume !== undefined) {
          this.player.setChannelVolume(info.id, info.volume);
        }
      }
    });
  }

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
      playbackError.set(null);

      // Emit parsing event
      log.debug('Emitting parse:started');
      this.eventBus.emit('parse:started', undefined);
      parseStatus.set('parsing');

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
          parseStatus.set('error');
          playbackError.set(error.message);
          throw error;
        }
      }

      // Extract sequence/pattern names BEFORE resolution (resolution will mutate these)
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

      // Capture the source BPM before any override so subscribers can detect
      // real source edits vs transport-bar nudges.
      const sourceBpm: number = (resolved as any).bpm ?? 120;

      // Apply BPM override (set via transport bar nudge buttons) before playback.
      // This mutates the resolved AST copy so the Player and scheduler use the
      // overridden tempo without touching the editor source.
      if (this._bpmOverride !== null) {
        (resolved as any).bpm = this._bpmOverride;
      }

      // Emit parse success — include sourceBpm (pre-override) so the transport
      // bar can distinguish a real source edit from a nudge override.
      this.eventBus.emit('parse:success', { ast: resolved, sourceBpm });
      parseStatus.set('success');
      parsedBpm.set((resolved as any).bpm || 120);
      parsedChip.set((resolved as any).chip || 'gameboy');
      playbackBpm.set((resolved as any).bpm || 120);

      // Create player if needed
      if (!this.player) {
        const sampleRate = parseInt(settingAudioSampleRate.get(), 10) || 44100;
        const Ctor = (typeof window !== 'undefined' && (window as any).AudioContext)
          ? (window as any).AudioContext
          : (globalThis as any).AudioContext;
        if (!Ctor) throw new Error('No AudioContext constructor found.');
        const audioCtx = new Ctor({ sampleRate });
        this.player = new Player(audioCtx);
        // If the user adjusted master volume before playback started, apply it now
        if (this._pendingMasterVolume !== null) {
          try { this.player.setMasterVolume(this._pendingMasterVolume); } catch (e) { /* ignore */ }
        }
         log.debug('Player instance created:', this.player);
         log.debug('Player.playAST type:', typeof this.player.playAST);
         log.debug('Player.playAST:', this.player.playAST);
      }

      // Wire per-channel analyser when enabled
      if (this._perChannelAnalyserEnabled) {
        this.player.setPerChannelAnalyser(true);
        this.player.onChannelWaveform = (payload) => {
          this.eventBus.emit('playback:channel-waveform', payload);
        };
      } else {
        this.player.setPerChannelAnalyser(false);
        this.player.onChannelWaveform = undefined;
      }

      // Set up completion callback to handle natural playback end.
      // When loop mode is active, replay the already-resolved AST directly
      // (no re-parse) rather than stopping. The callback captures `resolved`
      // so the same AST object is reused on every iteration.
      this.player.onComplete = () => {
        if (this._loop) {
          // Start the next iteration first so the Player can apply the effective
          // master volume (user override or AST volume) before we emit the UI message.
          this.player!.playAST(resolved as any).then(() => {
            try {
              const gain = this.player!.getMasterGain();
              const resolvedVol = this._pendingMasterVolume !== null ? this._pendingMasterVolume : (gain ? (gain.gain.value ?? 1) : 1);
              const pct = Math.round((resolvedVol ?? 1) * 100);
              this.eventBus.emit('playback:repeated', pct !== 100 ? { volumePct: pct } : {});
            } catch (e) {
              this.eventBus.emit('playback:repeated', {} as any);
            }
          }).catch((err: unknown) => {
            log.error('Loop restart failed:', err);
            this.stop();
          });
        } else {
          this.stop();
        }
      };

      // Set up repeat callback to notify UI when song loops
      this.player.onRepeat = () => {
        try {
          const gain = this.player!.getMasterGain();
          const resolvedVol = this._pendingMasterVolume !== null ? this._pendingMasterVolume : (gain ? (gain.gain.value ?? 1) : 1);
          const pct = Math.round((resolvedVol ?? 1) * 100);
          this.eventBus.emit('playback:repeated', pct !== 100 ? { volumePct: pct } : {});
        } catch (e) {
          this.eventBus.emit('playback:repeated', {} as any);
        }
      };

      // Set up position tracking
      log.debug('Setting up position tracking callback on player');
      this.setupPositionTracking(this.player, resolved, channelSequenceNames, channelPatternMaps);
      log.debug('Position tracking callback registered:', !!this.player.onPositionChange);

      // Apply channel mute/solo state before playback starts.
      // Reconcile: clear solo/mute for channels that don't exist in the new song.
      const activeChannelIds = new Set<number>((resolved.channels || []).map((ch: any) => ch.id));
      const states = channelStates.get();
      for (const [idStr, info] of Object.entries(states)) {
        const id = Number(idStr);
        if (!activeChannelIds.has(id)) {
          if (info.soloed) setChannelSoloed(id, false);
          if (info.muted) setChannelMuted(id, false);
        }
      }
      // Apply mute/solo to the Player.
      const currentStates = channelStates.get();
      this.player.muted.clear();
      this.player.solo = null;
      let soloedId: number | null = null;
      for (const [idStr, info] of Object.entries(currentStates)) {
        if (info.soloed) { soloedId = Number(idStr); break; }
      }
      if (soloedId !== null) {
        this.player.solo = soloedId;
      } else {
        for (const [idStr, info] of Object.entries(currentStates)) {
          if (info.muted) this.player.muted.add(Number(idStr));
        }
      }

      // Start playback (Player will handle AudioContext resume internally)
      log.debug('Calling player.playAST()...');
      // Ensure any pending master volume (set via transport knob) is applied
      // to the Player before starting so the first scheduled audio uses it.
      if (this._pendingMasterVolume !== null && this.player) {
        try {
          this.player.setMasterVolume(this._pendingMasterVolume);
          // If the Player already created the master GainNode, write the value
          // directly to avoid a race where the first scheduled audio uses the
          // AST volume before the override is applied. This is defensive —
          // Player.setMasterVolume should handle it, but some engine versions
          // may only store overrides and apply them later.
          try {
            const mg = this.player.getMasterGain();
            if (mg && (mg as any).gain && typeof (mg as any).gain.value === 'number') {
              (mg as any).gain.value = this._pendingMasterVolume;
            }
          } catch { /* ignore */ }
        } catch (e) { /* ignore */ }
      }
      await this.player.playAST(resolved as any);
      log.debug('player.playAST() completed');

      // Update state
      this.state.isPlaying = true;
      this.state.isPaused = false;

      // Emit playback started
      log.debug('Emitting playback:started');
      try {
        const gain = this.player.getMasterGain();
        const resolvedVol = this._pendingMasterVolume !== null ? this._pendingMasterVolume : (gain ? (gain.gain.value ?? 1) : 1);
        const pct = Math.round((resolvedVol ?? 1) * 100);
        this.eventBus.emit('playback:started', pct !== 100 ? { volumePct: pct } : {});
      } catch (e) {
        this.eventBus.emit('playback:started', {} as any);
      }
      playbackStatus.set('playing');

    } catch (error: any) {
      this.state.error = error as Error;
      const errorMessage = this.formatParseError(error);
      this.eventBus.emit('parse:error', { error: error as Error, message: errorMessage });
      this.eventBus.emit('playback:error', { error: error as Error });
      parseStatus.set('error');
      playbackError.set(errorMessage);
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

      // Clear position tracking
      this.playbackPosition.clear();
      this.channelEvents.clear();
      this.channelMetaIndex.clear();
      this.channelNoteEvents.clear();
      this._lastKnownSeq.clear();
      this._lastKnownPat.clear();

      this.eventBus.emit('playback:stopped', undefined);
      playbackStatus.set('stopped');
      playbackPositionAtom.set(0);
      playbackDuration.set(0);
      playbackTimeLabel.set('0:00');
      playbackError.set(null);
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
      playbackStatus.set('paused');
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
      playbackStatus.set('playing');
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
   * Set master output volume. volume is 0.0–1.0 (linear gain).
   * Takes effect immediately if a song is playing.
   */
  setMasterVolume(volume: number): void {
    // Always remember the user's intent so the next play() will honor it.
    this._pendingMasterVolume = Math.max(0, Math.min(1, volume));
    try { storage.set(StorageKey.MASTER_VOLUME, String(Math.round(this._pendingMasterVolume * 100))); } catch { /* ignore */ }
    if (!this.player) return;
    this.player.setMasterVolume(this._pendingMasterVolume);
  }

  /**
   * Return (and lazily create) a master AnalyserNode tapped in parallel from
   * the masterGain node. Returns null before the first playback starts.
   * The analyser is connected as a side-branch (masterGain → analyser, floating);
   * audio routing to the destination is unchanged.
   */
  getMasterAnalyser(): AnalyserNode | null {
    if (!this.player) return null;
    const gain = this.player.getMasterGain();
    if (!gain) return null;
    if (!this._masterAnalyser) {
      const ctx = this.player.getAudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      gain.connect(analyser); // parallel tap — not wired to destination
      this._masterAnalyser = analyser;
    }
    return this._masterAnalyser;
  }

  /**
   * Enable or disable per-channel analyser nodes.
   * Enabled state is persisted to localStorage via the unified feature key.
   * When enabled, `playback:channel-waveform` events are emitted at ~30 Hz.
   */
  setPerChannelAnalyser(enabled: boolean): void {
    this._perChannelAnalyserEnabled = enabled;
    try { storage.set(StorageKey.FEATURE_PER_CHANNEL_ANALYSER, String(enabled)); } catch { /* ignore */ }
    if (this.player) {
      this.player.setPerChannelAnalyser(enabled);
      if (enabled) {
        this.player.onChannelWaveform = (payload) => {
          this.eventBus.emit('playback:channel-waveform', payload);
        };
      } else {
        this.player.onChannelWaveform = undefined;
      }
    }
  }

  /** Return current per-channel analyser enabled state. */
  isPerChannelAnalyserEnabled(): boolean {
    return this._perChannelAnalyserEnabled;
  }

  /**
   * Pull the latest analyser buffer for a channel without waiting for an event.
   * Returns null when the analyser is disabled or the channel has no data yet.
   */
  getChannelAnalyserData(channelId: number): { samples: Float32Array; sampleRateHint: number } | null {
    return this.player?.getChannelAnalyserData(channelId) ?? null;
  }

  /**
   * Enable or disable loop mode. When enabled, the song restarts from
   * the resolved AST at the end of each playback iteration without re-parsing.
   */
  setLoop(enabled: boolean): void {
    this._loop = enabled;
  }

  /**
   * Set a runtime BPM override. When non-null, this value replaces the BPM from
   * the parsed AST on the next call to play(). Pass null to clear the override
   * (BPM will be read from the AST again on the next play()).
   */
  setBpmOverride(bpm: number | null): void {
    this._bpmOverride = bpm;
  }

  /** Return the current BPM override, or null if none is set. */
  getBpmOverride(): number | null {
    return this._bpmOverride;
  }

  /**
   * Get the current AST
   */
  getAST(): any | null {
    return this.state.ast;
  }

  /**
   * Set up real-time position tracking
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

          // Build channelMetaIndex: maps noteEventIndex (as counted by the Player's scheduleToken)
          // to {seq, pat}. The Player only increments its counter for note/named events, so we
          // must iterate only those to keep the mapping aligned.
          // Also build channelNoteEvents: the note/named-only event list so that eventIndex
          // (a note-only counter) maps correctly when looking up instrument names.
          const metaMap = new Map<number, { seq: string | null; pat: string | null }>();
          const noteEvents: any[] = [];
          let noteIdx = 0;
          for (const ev of channel.events) {
            if (ev.type === 'note' || ev.type === 'named') {
              metaMap.set(noteIdx++, {
                seq: (ev as any).sourceSequence || null,
                pat: (ev as any).sourcePattern || null,
              });
              noteEvents.push(ev);
            }
          }
          this.channelMetaIndex.set(channelId, metaMap);
          this.channelNoteEvents.set(channelId, noteEvents);
          log.debug(`Channel ${channelId}: metaIndex has ${metaMap.size} note/named entries`);
        }
      });

      log.debug(`channelEvents map populated:`, Array.from(this.channelEvents.keys()));
    }

    // Hook into Player's onPositionChange callback
    player.onPositionChange = (channelId: number, eventIndex: number, totalEvents: number) => {
      log.debug(`onPositionChange: ch${channelId}, event ${eventIndex}/${totalEvents}`);

      // Look up metadata using the note-only index (matches Player's scheduleToken counter exactly)
      const meta = this.channelMetaIndex.get(channelId)?.get(eventIndex);
      const rawSeq = meta?.seq ?? null;
      const rawPat = meta?.pat ?? null;

      // Update last-known fallbacks so glyphs persist between callbacks
      if (rawSeq) this._lastKnownSeq.set(channelId, rawSeq);
      if (rawPat) this._lastKnownPat.set(channelId, rawPat);
      const sequenceName = rawSeq || this._lastKnownSeq.get(channelId) || null;
      const patternName  = rawPat || this._lastKnownPat.get(channelId) || null;

      // currentInstrument: read from the note/named-only events list so that eventIndex
      // (the Player's note-only counter) maps to the correct event.
      const noteEvents = this.channelNoteEvents.get(channelId) || [];
      const approxEvent = noteEvents[eventIndex];

      // Create or update position object
      const position: PlaybackPosition = {
        channelId,
        eventIndex,
        totalEvents,
        currentInstrument: approxEvent?.instrument || null,
        currentPattern: patternName, // Use the pattern name we extracted
        sourceSequence: sequenceName, // Use the sequence name we extracted
        barNumber: null, // Not needed when showing pattern names
        progress: totalEvents > 0 ? eventIndex / totalEvents : 0,
      };

      this.playbackPosition.set(channelId, position);

      log.debug(`Emitting playback:position-changed for channel ${channelId}`, position);
      this.eventBus.emit('playback:position-changed', { channelId, position });

      // Also emit a legacy-style time position event (seconds) so UI
      // components that expect `playback:position` (e.g. StatusBar,
      // TransportBar) continue to receive elapsed time updates.
      try {
        const playerAny: any = player as any;
        const startTs = playerAny._playbackStartTimestamp || 0;
        const pauseTs = playerAny._pauseTimestamp || 0;
        const completionMs = playerAny._completionTimeoutMs || 0;
        let currentSec = 0;
        let totalSec = 0;

        if (startTs) {
          // If paused, _pauseTimestamp contains the timestamp when paused;
          // subtract pause time if present. Keep a simple approximation.
          const now = Date.now();
          const pausedOffset = pauseTs && pauseTs > startTs ? (now - pauseTs) : 0;
          currentSec = Math.max(0, (now - startTs - pausedOffset) / 1000);
        }

        if (completionMs) totalSec = completionMs / 1000;

        this.eventBus.emit('playback:position', { current: currentSec, total: totalSec });
        playbackPositionAtom.set(currentSec);
        playbackDuration.set(totalSec);
        playbackTimeLabel.set(formatPlaybackTime(currentSec));
      } catch (e) {
        // Non-fatal - don't break playback if timing inference fails
      }
    };
  }

  /**
   * Get current playback position for a channel
   */
  getPlaybackPosition(channelId: number): PlaybackPosition | null {
    return this.playbackPosition.get(channelId) || null;
  }

  /**
   * Get all playback positions
   */
  getAllPlaybackPositions(): Map<number, PlaybackPosition> {
    return new Map(this.playbackPosition);
  }

  /**
   * Format parse errors with location info
   */
  private formatParseError(err: any, filename?: string): string {
    if (!err) return 'Parse error: Unknown error';

    const rawMessage: string = err.message || String(err);
    const prefix = filename ? `in ${filename}` : 'at';

    // Peggy parser error — has location and expected array
    if (err.location && err.location.start) {
      const line = err.location.start.line;
      const col = err.location.start.column;

      // Build a compact "Expected ..." summary from Peggy's expected list
      let expectedSummary = '';
      if (Array.isArray(err.expected) && err.expected.length > 0) {
        // Peggy provides descriptions or literal text; deduplicate and cap at 5
        const labels = [...new Set(
          err.expected.map((e: any) => e.description ?? e.text ?? e.type ?? String(e))
        )].slice(0, 5);
        const more = err.expected.length - labels.length;
        expectedSummary = `Expected ${labels.join(', ')}${more > 0 ? `, …(+${more})` : ''}.`;
      }

      // The raw message from Peggy already says "Expected ... but found ...";
      // if our summary matches it closely enough, just use the raw message.
      const body = expectedSummary && !rawMessage.startsWith('Expected')
        ? `${expectedSummary} ${rawMessage}`
        : rawMessage;

      return `Parse error ${prefix} line ${line}, column ${col}: ${body}`;
    }

    // AudioContext autoplay policy (browser blocks audio without a user gesture)
    if (
      rawMessage.includes('AudioContext') ||
      rawMessage.includes('user gesture') ||
      rawMessage.includes('resume') ||
      rawMessage.includes('autoplay')
    ) {
      return `Audio blocked by browser policy. Click anywhere on the page first, then press Play again. (${rawMessage})`;
    }

    // Generic fallback
    const locationPrefix = filename ? ` in ${filename}` : '';
    return `Parse error${locationPrefix}: ${rawMessage}`;
  }
}
