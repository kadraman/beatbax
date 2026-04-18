/**
 * WebAudio-based playback for BeatBax (engine package).
 */
type AST = any;
import { parseEnvelope as pulseParseEnvelope } from '../chips/gameboy/pulse.js';
import { parseWaveTable } from '../chips/gameboy/wave.js';
import { noteNameToMidi, midiToFreq } from '../chips/gameboy/apu.js';
export { midiToFreq, noteNameToMidi };
export { parseWaveTable };
export declare const parseEnvelope: typeof pulseParseEnvelope;
/** Payload emitted on every analyser tick for one channel. */
export interface ChannelWaveformPayload {
    channelId: number;
    timestamp: number;
    samples: Float32Array<ArrayBuffer>;
    format: 'float32';
    sampleCount: number;
    sampleRateHint: number;
}
/** Configuration for per-channel analyser nodes. */
export interface AnalyserConfig {
    fftSize?: number;
    smoothingTimeConstant?: number;
    uiUpdateHz?: number;
    emittedSampleCount?: number;
}
/**
 * Create an AudioContext suitable for Node.js or browser environments.
 * In Node.js, dynamically imports standardized-audio-context polyfill.
 * In browser, uses native AudioContext.
 */
export interface AudioContextOptions {
    sampleRate?: number;
    offline?: boolean;
    duration?: number;
    backend?: 'auto' | 'browser' | 'node-webaudio';
}
export declare function createAudioContext(opts?: AudioContextOptions): Promise<any>;
export declare class Player {
    private ctx;
    private scheduler;
    private bpmDefault;
    private masterGain;
    private activeNodes;
    muted: Set<number>;
    solo: number | null;
    onSchedule?: (args: {
        chId: number;
        inst: any;
        token: string;
        time: number;
        dur: number;
        eventIndex?: number;
        totalEvents?: number;
    }) => void;
    onComplete?: () => void;
    onRepeat?: () => void;
    onPositionChange?: (channelId: number, eventIndex: number, totalEvents: number) => void;
    /** Called on each analyser tick (throttled to uiUpdateHz) when per-channel analysers are enabled. */
    onChannelWaveform?: (payload: ChannelWaveformPayload) => void;
    private currentEventIndex;
    private totalEvents;
    private _repeatTimer;
    private _preScheduleTimer;
    private _loopEndTime;
    private _enableAnalyser;
    private _analyserFftSize;
    private _analyserSmoothing;
    private _uiUpdateHz;
    private _emittedSampleCount;
    private _channelAnalysers;
    private _channelBuses;
    private _analyserBuffers;
    private _decimatedBuffers;
    private _analyserTimer;
    private _completionTimer;
    private _completionTimeoutMs;
    private _playbackStartTimestamp;
    private _pauseTimestamp;
    private _isRepeatMode;
    private _currentAST;
    private _isPaused;
    private _isPlaying;
    private _debugLog;
    private _pluginBackends;
    private _pluginProcessor;
    /** Check localStorage for debug flag (browser only) */
    private static isDebugEnabled;
    constructor(ctx?: any, opts?: {
        buffered?: boolean;
        segmentDuration?: number;
        bufferedLookahead?: number;
        maxPreRenderSegments?: number;
        enablePerChannelAnalyser?: boolean;
        analyserFftSize?: number;
        analyserSmoothing?: number;
        uiUpdateHz?: number;
        emittedSampleCount?: number;
    });
    playAST(ast: AST): Promise<void>;
    /**
     * Schedule all channel audio tokens starting at the given absolute AudioContext time.
     * Returns the total song duration in seconds.
     * Called once per loop iteration — safe to call without stopping the scheduler.
     */
    private _scheduleAllChannels;
    /**
     * Arm the pre-schedule timer for seamless looping.
     * Fires ~250ms before the current loop ends, then queues the next iteration's
     * audio directly into the running TickScheduler — no stop/restart needed.
     */
    private _scheduleNextRepeat;
    /**
     * Called ~250ms before the loop boundary.
     * Schedules the next iteration starting at the exact audio-clock loop-end time,
     * then re-arms itself for the iteration after that.
     */
    private _fireRepeat;
    private scheduleToken;
    private tryApplyEffects;
    private tryScheduleRetriggers;
    private tryScheduleEcho;
    private tryApplyPan;
    /**
     * Pause playback by suspending the AudioContext
     */
    pause(): Promise<void>;
    /**
     * Resume playback by resuming the AudioContext
     */
    resume(): Promise<void>;
    /**
     * Set the master output gain. volume is 0.0–1.0 (linear gain).
     * Takes effect immediately regardless of whether a song is playing.
     */
    setMasterVolume(volume: number): void;
    /** Expose the AudioContext so UI consumers (e.g. oscilloscope) can create nodes. */
    getAudioContext(): AudioContext;
    /** Expose the master GainNode so UI consumers can tap the post-gain signal. */
    getMasterGain(): GainNode | null;
    /**
     * Enable or disable per-channel analyser nodes at runtime.
     * When enabled, AnalyserNode + GainNode buses are created for each channel
     * and wired in parallel so audio output is unaffected.
     *
     * Config changes (fftSize, smoothingTimeConstant, uiUpdateHz, emittedSampleCount)
     * take effect immediately even when the sampler is already running:
     * - uiUpdateHz: the sampling interval is restarted with the new period.
     * - fftSize: all live AnalyserNodes are reconfigured and their read-buffers
     *   are reallocated to match.
     * - smoothingTimeConstant: applied to all live AnalyserNodes immediately.
     * - emittedSampleCount: used on the next sampling tick automatically.
     *
     * The sampling loop is only started when playback is actually active
     * (i.e. after playAST() has started the scheduler). If called before
     * playAST(), the flag is toggled so the loop begins automatically on the
     * next playAST() or resume(). This avoids idle CPU wakeups when the player
     * has not started yet.
     *
     * NOTE: disabling only STOPS the sampling loop — it does NOT tear down the
     * channel buses. Buses are intentional passthroughs (gain=1) and are kept
     * alive so that re-enabling restarts instantly without waiting for the next
     * loop iteration to recreate them. Full teardown happens in stop().
     */
    setPerChannelAnalyser(enabled: boolean, config?: AnalyserConfig): void;
    /**
     * Return the most-recent analyser buffer for a channel (pull-based consumers).
     * Returns null when the analyser is disabled or the channel hasn't been set up.
     */
    getChannelAnalyserData(channelId: number): {
        samples: Float32Array<ArrayBuffer>;
        sampleRateHint: number;
    } | null;
    /**
     * Get or create the per-channel bus GainNode for the given channel.
     * The AnalyserNode and its buffer are only created/connected when
     * _enableAnalyser is true, keeping the path zero-overhead by default.
     */
    private _getChannelBus;
    /**
     * Create and wire an AnalyserNode tap onto an existing bus.
     * Safe to call multiple times — skips channels that already have one.
     */
    private _attachAnalyser;
    /**
     * Set the volume (0–1) for a specific channel by id.
     * Adjusts the per-channel bus gain, which is applied after the instrument
     * envelope — equivalent to the channel fader on a mixing desk.
     * Has no effect when the channel bus does not yet exist (e.g. before playback starts).
     */
    setChannelVolume(channelId: number, volume: number): void;
    /**
     * Return the AudioNode that should be used as the destination for a channel.
     * Notes always route through a per-channel bus GainNode so that per-channel
     * volume (set via `setChannelVolume`) is applied after the instrument envelope.
     * The AnalyserNode tap is only wired to the bus when `_enableAnalyser` is true.
     */
    private _getChannelDest;
    /** Start the throttled sampling loop that emits onChannelWaveform events. */
    private _startAnalyserSampling;
    /** Stop the sampling loop (called on pause/stop). */
    private _stopAnalyserSampling;
    /** Disconnect and destroy all analyser/channel-bus nodes. */
    private _teardownAnalysers;
    stop(): void;
    toggleChannelMute(chId: number): void;
    toggleChannelSolo(chId: number): void;
    stopChannel(chId: number): void;
}
export default Player;
//# sourceMappingURL=playback.d.ts.map