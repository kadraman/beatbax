/**
 * WebAudio-based playback for BeatBax (engine package).
 */
import { playPulse as playPulseImpl, parseEnvelope as pulseParseEnvelope } from '../chips/gameboy/pulse.js';
import { playWavetable as playWavetableImpl, parseWaveTable } from '../chips/gameboy/wave.js';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise.js';
import { noteNameToMidi, midiToFreq } from '../chips/gameboy/apu.js';
import createScheduler from '../scheduler/index.js';
import BufferedRenderer from './bufferedRenderer.js';
import { get as getEffect, clearEffectState } from '../effects/index.js';
import { createLogger } from '../util/logger.js';
import { chipRegistry } from '../chips/index.js';
const log = createLogger('player');
export { midiToFreq, noteNameToMidi };
export { parseWaveTable };
export const parseEnvelope = pulseParseEnvelope;
/**
 * Derive a playback frequency from an instrument object's `note` field.
 * Returns 0 when the field is absent, unparseable, or the instrument is
 * noise/DMC (which use register values, not frequency).
 *
 * This is used by the named-instrument plugin paths so that melodic instruments
 * (e.g. `inst lead type=pulse1 note=C4`) play at the correct pitch when
 * referenced as a bare instrument-name token rather than a note token.
 */
function instNoteToFreq(inst) {
    if (!inst)
        return 0;
    // Noise and DMC instruments are not pitch-driven — return 0 so the backend
    // can handle them in its own register-based way.
    const t = inst.type ? String(inst.type).toLowerCase() : '';
    if (t.includes('noise') || t.includes('dmc'))
        return 0;
    const noteStr = inst.note;
    if (!noteStr)
        return 0;
    const m = noteStr.match(/^([A-G][#Bb]?)(-?\d+)$/i);
    if (!m)
        return 0;
    const midi = noteNameToMidi(m[1].toUpperCase(), parseInt(m[2], 10));
    return midi !== null ? midiToFreq(midi) : 0;
}
/**
 * Decimate `src` into `out` (nearest-neighbour), writing exactly `out.length`
 * samples. Both arrays must be pre-allocated by the caller — no heap allocation
 * occurs here.
 */
function decimateInto(src, out) {
    const targetCount = out.length;
    if (src.length <= targetCount) {
        // Source is already at or below target resolution — copy what fits, zero the rest.
        out.set(src.subarray(0, Math.min(src.length, targetCount)));
        if (src.length < targetCount)
            out.fill(0, src.length);
        return;
    }
    const ratio = src.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
        out[i] = src[Math.floor(i * ratio)];
    }
}
export async function createAudioContext(opts = {}) {
    const backend = opts.backend ?? 'auto';
    // Try browser if requested and available
    if (backend !== 'node-webaudio' && typeof window !== 'undefined' && globalThis.AudioContext) {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (opts.offline && opts.duration) {
            const OfflineAudioContextCtor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
            const sampleRate = opts.sampleRate ?? 44100;
            const lengthInSamples = Math.ceil(opts.duration * sampleRate);
            return new OfflineAudioContextCtor(2, lengthInSamples, sampleRate);
        }
        return new Ctor({ sampleRate: opts.sampleRate });
    }
    // Fallback to Node polyfill
    if (backend !== 'browser') {
        try {
            const mod = await import('standardized-audio-context');
            const { AudioContext, OfflineAudioContext } = mod;
            if (opts.offline && opts.duration) {
                const sampleRate = opts.sampleRate ?? 44100;
                const lengthInSamples = Math.ceil(opts.duration * sampleRate);
                return new OfflineAudioContext({ numberOfChannels: 2, length: lengthInSamples, sampleRate });
            }
            return new AudioContext({ sampleRate: opts.sampleRate ?? 44100 });
        }
        catch (error) {
            if (backend === 'node-webaudio') {
                throw new Error(`Failed to load 'standardized-audio-context'. Is it installed? (${error.message})`);
            }
            // If auto, we might just fail later if no context is found
        }
    }
    throw new Error(`No compatible AudioContext found for backend: ${backend}`);
}
function playPulse(ctx, freq, duty, start, dur, inst, scheduler, destination) {
    return playPulseImpl(ctx, freq, duty, start, dur, inst, scheduler, destination);
}
function playWavetable(ctx, freq, table, start, dur, inst, scheduler, destination) {
    return playWavetableImpl(ctx, freq, table, start, dur, inst, scheduler, destination);
}
function playNoise(ctx, start, dur, inst, scheduler, destination) {
    return playNoiseImpl(ctx, start, dur, inst, scheduler, destination);
}
export class Player {
    ctx;
    scheduler;
    bpmDefault = 128;
    masterGain = null;
    activeNodes = [];
    muted = new Set();
    solo = null;
    onSchedule;
    onComplete;
    onRepeat;
    onPositionChange;
    /** Called on each analyser tick (throttled to uiUpdateHz) when per-channel analysers are enabled. */
    onChannelWaveform;
    currentEventIndex = new Map(); // channelId → event index
    totalEvents = new Map(); // channelId → total count
    _repeatTimer = null;
    _preScheduleTimer = null; // Timer for seamless loop pre-scheduling
    _loopEndTime = 0; // Absolute AudioContext time when current loop iteration ends
    // ─── Per-channel analyser state ─────────────────────────────────────────────
    _enableAnalyser = false;
    _analyserFftSize = 512;
    _analyserSmoothing = 0.6;
    _uiUpdateHz = 30;
    _emittedSampleCount = 128;
    _channelAnalysers = new Map();
    _channelBuses = new Map();
    _analyserBuffers = new Map();
    _decimatedBuffers = new Map(); // preallocated output per channel
    _analyserTimer = null;
    _completionTimer = null;
    _completionTimeoutMs = 0; // Total timeout duration
    _playbackStartTimestamp = 0; // When playback started
    _pauseTimestamp = 0; // When pause() was called
    _isRepeatMode = false; // Whether song is in repeat mode
    _currentAST = null; // Current AST for repeat playback
    _isPaused = false; // Whether playback is currently paused
    _isPlaying = false; // True only after scheduler.start() and before stop()
    _debugLog = false; // Whether to log playback events (controlled by localStorage)
    // ─── Plugin chip state ─────────────────────────────────────────────────────
    _pluginBackends = [];
    _pluginProcessor = null;
    /** Check localStorage for debug flag (browser only) */
    static isDebugEnabled() {
        if (typeof localStorage === 'undefined')
            return false;
        return localStorage.getItem('beatbax-debug') === 'true' ||
            localStorage.getItem('beatbax-debug-playback') === 'true';
    }
    constructor(ctx, opts = {}) {
        if (!ctx) {
            const Ctor = (typeof window !== 'undefined' && window.AudioContext) ? window.AudioContext : globalThis.AudioContext;
            if (!Ctor) {
                throw new Error('No AudioContext constructor found. Please provide an AudioContext to the Player constructor or ensure one is available globally.');
            }
            this.ctx = new Ctor();
        }
        else {
            this.ctx = ctx;
        }
        this.scheduler = createScheduler(this.ctx);
        this._debugLog = Player.isDebugEnabled(); // Initialize debug flag from localStorage
        if (opts.enablePerChannelAnalyser) {
            this._enableAnalyser = true;
            if (opts.analyserFftSize)
                this._analyserFftSize = opts.analyserFftSize;
            if (opts.analyserSmoothing !== undefined)
                this._analyserSmoothing = opts.analyserSmoothing;
            if (opts.uiUpdateHz)
                this._uiUpdateHz = opts.uiUpdateHz;
            if (opts.emittedSampleCount)
                this._emittedSampleCount = opts.emittedSampleCount;
        }
        if (opts.buffered) {
            this._buffered = new BufferedRenderer(this.ctx, this.scheduler, { segmentDuration: opts.segmentDuration, lookahead: opts.bufferedLookahead, maxPreRenderSegments: opts.maxPreRenderSegments });
        }
    }
    async playAST(ast) {
        log.debug('=== Player.playAST() called ===');
        log.debug('AST:', ast);
        log.debug('Channels:', ast?.channels?.length);
        this._isPaused = false; // Reset paused state
        try {
            if (this.ctx && typeof this.ctx.resume === 'function') {
                try {
                    const st = this.ctx.state;
                    if (st === 'suspended')
                        await this.ctx.resume();
                }
                catch (e) { }
            }
        }
        catch (e) { }
        // ensure a clean slate for each playback run
        // Note: stop() clears _currentAST, so we restore it immediately after
        try {
            this.stop();
        }
        catch (e) { }
        this._currentAST = ast;
        log.debug('Player cleaned, starting setup...');
        // Create or update master gain node
        // Default to 1.0 (matches hUGETracker behavior - no attenuation)
        const masterVolume = ast.volume !== undefined ? ast.volume : 1.0;
        if (!this.masterGain) {
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
        }
        this.masterGain.gain.setValueAtTime(masterVolume, this.ctx.currentTime);
        const chip = chipRegistry.resolve(ast.chip || 'gameboy');
        const isGameboy = chip === 'gameboy';
        const activePlugin = !isGameboy ? chipRegistry.get(chip) : null;
        if (!isGameboy && !activePlugin) {
            throw new Error(`Unsupported chip: ${ast.chip ?? chip}. No plugin registered for this chip.`);
        }
        // Store chip info in context for effects to access (e.g., for chip-specific frame rates)
        this.ctx._chipType = chip;
        // Tear down any previous plugin processor before setting up a new one
        if (this._pluginProcessor) {
            try {
                this._pluginProcessor.disconnect();
            }
            catch (_e) { }
            this._pluginProcessor = null;
        }
        for (const b of this._pluginBackends) {
            try {
                b.reset();
            }
            catch (_e) { }
        }
        this._pluginBackends = [];
        // Set up plugin channel backends and a ScriptProcessorNode for non-gameboy chips
        if (activePlugin) {
            this._pluginBackends = Array.from({ length: activePlugin.channels }, (_, i) => activePlugin.createChannel(i, this.ctx));
            if (typeof this.ctx.createScriptProcessor === 'function') {
                const plugBufSize = 4096;
                const proc = this.ctx.createScriptProcessor(plugBufSize, 0, 1);
                const backends = this._pluginBackends;
                const plugTempBuf = new Float32Array(plugBufSize);
                // Envelope/macro timing must be driven at the chip frame rate (~60 Hz for NES/GB),
                // NOT once per ScriptProcessorNode callback.  A 4096-sample buffer at 44100 Hz
                // fires every ~93 ms — far too slow for envelope steps that are supposed to tick
                // every ~16.7 ms.  Mirror the accumulator approach used in pcmRenderer.ts:
                // count rendered samples and call applyEnvelope() once per samplesPerFrame samples.
                let plugFrameCounter = 0; // counts completed 60 Hz frames (passed to applyEnvelope)
                let samplesSinceFrame = 0; // accumulates rendered samples between frame ticks
                // samplesPerFrame is computed lazily on first callback so it uses the actual
                // AudioContext sample rate (which may differ from 44100 in some environments).
                let samplesPerFrame = 0;
                proc.onaudioprocess = (_e) => {
                    const sampleRate = _e.outputBuffer.sampleRate;
                    if (samplesPerFrame === 0) {
                        // ~60 Hz for NES/GB; if the chip exposes its own frame rate, prefer that
                        samplesPerFrame = Math.floor(sampleRate / 60);
                    }
                    const outBuf = _e.outputBuffer.getChannelData(0);
                    outBuf.fill(0);
                    // Advance the envelope clock by the number of samples in this callback.
                    samplesSinceFrame += plugBufSize;
                    while (samplesSinceFrame >= samplesPerFrame) {
                        for (const b of backends)
                            b.applyEnvelope(plugFrameCounter);
                        plugFrameCounter++;
                        samplesSinceFrame -= samplesPerFrame;
                    }
                    for (const b of backends) {
                        plugTempBuf.fill(0);
                        b.render(plugTempBuf, sampleRate);
                        for (let i = 0; i < plugBufSize; i++)
                            outBuf[i] += plugTempBuf[i];
                    }
                };
                proc.connect(this.masterGain);
                this._pluginProcessor = proc;
            }
        }
        // Pre-load plugin samples (e.g. remote DMC files) so createPlaybackNodes()
        // finds them in cache on the first call, avoiding silent notes.
        if (activePlugin?.preloadForPCM && ast.insts) {
            await activePlugin.preloadForPCM(ast.insts);
        }
        // Schedule all channels starting 100ms from now on the audio clock
        // (computed after preload so the timestamp is current)
        const loopStart = this.ctx.currentTime + 0.1;
        const globalDurationSec = this._scheduleAllChannels(ast, loopStart);
        this._loopEndTime = loopStart + globalDurationSec;
        // Start the scheduler to begin firing scheduled events
        this.scheduler.start();
        this._isPlaying = true;
        // Start analyser sampling loop when enabled.
        // Channel buses (and their AnalyserNode taps) are created lazily when the
        // first notes play (~100ms from now), so we must NOT gate on
        // _channelAnalysers.size here — start the loop and let it pick up channels
        // as they appear.
        if (this._enableAnalyser) {
            this._startAnalyserSampling();
        }
        // Set up repeat or one-shot completion
        try {
            if (ast.play?.repeat) {
                this._isRepeatMode = true;
                this._playbackStartTimestamp = Date.now();
                this._pauseTimestamp = 0;
                this._completionTimeoutMs = Math.round(globalDurationSec * 1000);
                this._scheduleNextRepeat(ast, globalDurationSec);
            }
            else {
                this._isRepeatMode = false;
                // No repeat - schedule automatic stop when playback completes
                const completionMs = Math.max(10, Math.round(globalDurationSec * 1000) + 100);
                if (this._completionTimer)
                    clearTimeout(this._completionTimer);
                this._completionTimeoutMs = completionMs;
                this._playbackStartTimestamp = Date.now();
                this._pauseTimestamp = 0;
                this._completionTimer = setTimeout(() => {
                    try {
                        if (this._isPaused) {
                            log.debug('Completion timer fired but playback is paused - ignoring');
                            return;
                        }
                        this.stop();
                        if (this.onComplete) {
                            this.onComplete();
                        }
                    }
                    catch (e) {
                        log.error('Exception in completion timer:', e);
                    }
                }, completionMs);
            }
        }
        catch (e) {
            log.error('Exception setting up repeat:', e);
        }
    }
    /**
     * Schedule all channel audio tokens starting at the given absolute AudioContext time.
     * Returns the total song duration in seconds.
     * Called once per loop iteration — safe to call without stopping the scheduler.
     */
    _scheduleAllChannels(ast, startTime) {
        // Clone the instrument table fresh for each pass to avoid in-place mutations
        const rootInsts = ast.insts || {};
        const instsRootClone = (typeof globalThis.structuredClone === 'function')
            ? globalThis.structuredClone(rootInsts)
            : JSON.parse(JSON.stringify(rootInsts));
        // Re-initialize position tracking for this pass
        this.currentEventIndex.clear();
        this.totalEvents.clear();
        // First pass: count total playable events per channel for position tracking
        for (const ch of ast.channels || []) {
            const tokens = Array.isArray(ch.events) ? ch.events : (Array.isArray(ch.pat) ? ch.pat : ['.']);
            let eventCount = 0;
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (token && typeof token === 'object' && token.type) {
                    if (token.type === 'note' || token.type === 'named')
                        eventCount++;
                }
                else if (token !== '_' && token !== '-' && token !== '.' &&
                    !(typeof token === 'string' && token.match(/^inst\(/))) {
                    eventCount++;
                }
            }
            this.totalEvents.set(ch.id, eventCount);
            this.currentEventIndex.set(ch.id, 0);
        }
        let globalDurationSec = 0;
        for (const ch of ast.channels || []) {
            const instsMap = instsRootClone;
            let currentInst = instsMap[ch.inst || ''];
            const tokens = Array.isArray(ch.events) ? ch.events : (Array.isArray(ch.pat) ? ch.pat : ['.']);
            let tempInst = null;
            let tempRemaining = 0;
            let bpm;
            if (typeof ch.speed === 'number' && ast && typeof ast.bpm === 'number')
                bpm = ast.bpm * ch.speed;
            else
                bpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : this.bpmDefault;
            const secondsPerBeat = 60 / bpm;
            const tickSeconds = secondsPerBeat / 4;
            let lastEndTimeForThisChannel = 0;
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                const t = startTime + i * tickSeconds;
                log.debug(`Token ${i}/${tokens.length} for ch${ch.id}:`, token);
                if (token && typeof token === 'object' && token.type) {
                    if (token.type === 'rest' || token.type === 'sustain') {
                        // ignore explicit rest/sustain objects here
                    }
                    else {
                        let sustainCount = 0;
                        for (let j = i + 1; j < tokens.length; j++) {
                            const next = tokens[j];
                            if (next && typeof next === 'object' && next.type === 'sustain')
                                sustainCount++;
                            else if (next === '_' || next === '-')
                                sustainCount++;
                            else
                                break;
                        }
                        const dur = tickSeconds * (1 + sustainCount);
                        if (token.type === 'named') {
                            const instProps = token.instProps || instsMap[token.instrument] || null;
                            // For noise instruments, always use instrument name for lookup
                            // For pulse/wave with defaultNote, use the specified note
                            const isNoise = instProps && instProps.type && String(instProps.type).toLowerCase().includes('noise');
                            const tokenToPlay = (isNoise || !token.defaultNote)
                                ? (token.token || token.instrument)
                                : token.defaultNote;
                            log.debug(`About to scheduleToken (named) for ch${ch.id}, token:`, tokenToPlay);
                            this.scheduleToken(ch.id, instProps, instsMap, tokenToPlay, t, dur, tickSeconds);
                        }
                        else if (token.type === 'note') {
                            const instProps = token.instProps || (tempRemaining > 0 && tempInst ? tempInst : currentInst);
                            // Pass the full token object so scheduleToken can honour inline pan/effects
                            log.debug(`About to scheduleToken (note) for ch${ch.id}, token:`, token);
                            this.scheduleToken(ch.id, instProps, instsMap, token, t, dur, tickSeconds);
                            if (tempRemaining > 0) {
                                tempRemaining -= 1;
                                if (tempRemaining <= 0) {
                                    tempInst = null;
                                    tempRemaining = 0;
                                }
                            }
                        }
                        lastEndTimeForThisChannel = Math.max(lastEndTimeForThisChannel, t + dur);
                    }
                    continue;
                }
                if (token === '_' || token === '-')
                    continue;
                const mInstInline = typeof token === 'string' && token.match(/^inst\(([^,()\s]+)(?:,(\d+))?\)$/i);
                if (mInstInline) {
                    const name = mInstInline[1];
                    const count = mInstInline[2] ? parseInt(mInstInline[2], 10) : null;
                    const resolved = instsMap[name];
                    if (count && resolved) {
                        tempInst = resolved;
                        tempRemaining = count;
                    }
                    else if (resolved) {
                        currentInst = resolved;
                    }
                    continue;
                }
                const useInst = tempRemaining > 0 && tempInst ? tempInst : currentInst;
                let sustainCount = 0;
                for (let j = i + 1; j < tokens.length; j++) {
                    const next = tokens[j];
                    if (next && typeof next === 'object' && next.type === 'sustain')
                        sustainCount++;
                    else if (next === '_' || next === '-')
                        sustainCount++;
                    else
                        break;
                }
                const dur = tickSeconds * (1 + sustainCount);
                this.scheduleToken(ch.id, useInst, instsMap, token, t, dur, tickSeconds);
                lastEndTimeForThisChannel = Math.max(lastEndTimeForThisChannel, t + dur);
                if (tempRemaining > 0 && token !== '.') {
                    tempRemaining -= 1;
                    if (tempRemaining <= 0) {
                        tempInst = null;
                        tempRemaining = 0;
                    }
                }
            }
            // Channel duration relative to the explicit startTime parameter
            const channelDuration = lastEndTimeForThisChannel > 0
                ? (lastEndTimeForThisChannel - startTime)
                : (tokens.length * tickSeconds);
            globalDurationSec = Math.max(globalDurationSec, channelDuration);
        }
        return globalDurationSec;
    }
    /**
     * Arm the pre-schedule timer for seamless looping.
     * Fires ~250ms before the current loop ends, then queues the next iteration's
     * audio directly into the running TickScheduler — no stop/restart needed.
     */
    _scheduleNextRepeat(ast, durationSec) {
        if (this._preScheduleTimer) {
            clearTimeout(this._preScheduleTimer);
            this._preScheduleTimer = null;
        }
        // Fire 250ms before loop end so the next iteration is pre-queued in time
        const preMs = Math.max(10, Math.round((durationSec - 0.25) * 1000));
        this._preScheduleTimer = setTimeout(() => this._fireRepeat(ast), preMs);
    }
    /**
     * Called ~250ms before the loop boundary.
     * Schedules the next iteration starting at the exact audio-clock loop-end time,
     * then re-arms itself for the iteration after that.
     */
    _fireRepeat(ast) {
        this._preScheduleTimer = null;
        try {
            if (!this._isRepeatMode || this._isPaused)
                return;
            // Notify UI that the song is wrapping around
            if (this.onRepeat) {
                try {
                    this.onRepeat();
                }
                catch (e) { }
            }
            // nextStart is the exact audio-clock time the next iteration begins.
            // Guard against clock drift: if we're already past loopEndTime, start 50ms from now.
            const nextStart = Math.max(this._loopEndTime, this.ctx.currentTime + 0.05);
            const nextDuration = this._scheduleAllChannels(ast, nextStart);
            this._loopEndTime = nextStart + nextDuration;
            // Prune audio nodes from fully-elapsed iterations to prevent unbounded growth
            const pruneBeforeTime = this.ctx.currentTime - 0.5;
            this.activeNodes = this.activeNodes.filter(e => !e.endTime || e.endTime > pruneBeforeTime);
            // Arm the next pre-schedule timer
            this._scheduleNextRepeat(ast, nextDuration);
        }
        catch (e) {
            log.error('Exception in _fireRepeat:', e);
        }
    }
    scheduleToken(chId, inst, instsMap, token, time, dur, tickSeconds) {
        if (token === '.')
            return;
        // Track event position (increment happens here during scheduling)
        const currentIdx = this.currentEventIndex.get(chId) || 0;
        const totalEvts = this.totalEvents.get(chId) || 0;
        this.currentEventIndex.set(chId, currentIdx + 1);
        log.debug(`scheduleToken: ch${chId}, token=${typeof token === 'object' ? token.type || token.token : token}, idx=${currentIdx}/${totalEvts}`);
        // NOTE: onPositionChange callback will be called inside scheduler.schedule() when note PLAYS
        if (instsMap && typeof token === 'string' && instsMap[token]) {
            const alt = instsMap[token];
            // Plugin chip path — named instrument token triggers noteOn on the channel backend
            if (this._pluginBackends.length > 0) {
                const backendIdx = chId - 1;
                const backend = this._pluginBackends[backendIdx];
                if (backend) {
                    const capturedAlt = alt;
                    const capturedChId = chId;
                    const capturedDur = dur;
                    // Derive pitch from the instrument's note= field so melodic plugin instruments
                    // play at the correct frequency, not silently at 0 Hz.
                    const capturedFreqFromInst = instNoteToFreq(alt);
                    try {
                        if (typeof this.onSchedule === 'function') {
                            this.onSchedule({ chId, inst: alt, token, time, dur, eventIndex: currentIdx, totalEvents: totalEvts });
                        }
                    }
                    catch (e) { }
                    if (typeof backend.createPlaybackNodes === 'function') {
                        // ── Web Audio path for named-inst percussion ──────────────────────
                        this.scheduler.schedule(time, () => {
                            if (this.onPositionChange) {
                                try {
                                    this.onPositionChange(capturedChId, currentIdx, totalEvts);
                                }
                                catch (e) { }
                            }
                            if (this.solo !== null && this.solo !== capturedChId)
                                return;
                            if (this.muted.has(capturedChId))
                                return;
                            const nodes = backend.createPlaybackNodes(this.ctx, capturedFreqFromInst, time, capturedDur, capturedAlt, this.scheduler, this._getChannelDest(capturedChId));
                            if (nodes && nodes.length > 0) {
                                const endTime = time + capturedDur + 0.1;
                                for (const n of nodes)
                                    this.activeNodes.push({ node: n, chId: capturedChId, endTime });
                            }
                        });
                    }
                    else {
                        // ── PCM fallback path ─────────────────────────────────────────────
                        this.scheduler.schedule(time, () => {
                            if (this.onPositionChange) {
                                try {
                                    this.onPositionChange(capturedChId, currentIdx, totalEvts);
                                }
                                catch (e) { }
                            }
                            if (this.solo !== null && this.solo !== capturedChId)
                                return;
                            if (this.muted.has(capturedChId))
                                return;
                            // Use the instrument's note= frequency; fall back to A4 (440 Hz) only when
                            // no note field is defined and the instrument is not noise/DMC.
                            backend.noteOn(capturedFreqFromInst || 440, capturedAlt);
                        });
                        this.scheduler.schedule(time + capturedDur, () => { backend.noteOff(); });
                    }
                }
                return;
            }
            if (alt.type && String(alt.type).toLowerCase().includes('noise')) {
                try {
                    if (typeof this.onSchedule === 'function') {
                        this.onSchedule({ chId, inst: alt, token, time, dur, eventIndex: currentIdx, totalEvents: totalEvts });
                    }
                }
                catch (e) { }
                this.scheduler.schedule(time, () => {
                    // Emit position callback when note PLAYS
                    if (this.onPositionChange) {
                        try {
                            log.debug(`Calling onPositionChange for ch${chId}, ${currentIdx}/${totalEvts}`);
                            this.onPositionChange(chId, currentIdx, totalEvts);
                        }
                        catch (e) {
                            log.error('Error in onPositionChange callback:', e);
                        }
                    }
                    // Check mute/solo state at PLAYBACK time (dynamic check)
                    if (this.solo !== null && this.solo !== chId) {
                        log.debug(`Skipping ch${chId} (soloed: ch${this.solo})`);
                        return;
                    }
                    if (this.muted.has(chId)) {
                        log.debug(`Skipping ch${chId} (muted)`);
                        return;
                    }
                    if (this._debugLog)
                        log.debug(`Playing ch${chId} noise (named inst) at ${time.toFixed(2)}s`);
                    const nodes = playNoise(this.ctx, time, dur, alt, this.scheduler, this._getChannelDest(chId));
                    const endTime0 = time + dur + 0.1;
                    for (const n of nodes)
                        this.activeNodes.push({ node: n, chId, endTime: endTime0 });
                });
                return;
            }
            inst = alt;
        }
        if (!inst)
            return;
        try {
            if (typeof this.onSchedule === 'function') {
                this.onSchedule({ chId, inst, token, time, dur, eventIndex: currentIdx, totalEvents: totalEvts });
            }
        }
        catch (e) { }
        // token may be a string like "C4" or an object with { type: 'note', token: 'C4', pan, effects }
        let tokenStr = typeof token === 'string' ? token : (token && token.token ? token.token : '');
        // compute pan if present: inline token pan takes precedence; inst pan as fallback
        const panVal = (token && token.pan) ? token.pan : (inst && (inst['gb:pan'] || inst['pan']) ? inst['gb:pan'] || inst['pan'] : undefined);
        const m = (typeof tokenStr === 'string' && tokenStr.match(/^([A-G][#B]?)(-?\d+)$/i)) || null;
        if (m) {
            const note = m[1].toUpperCase();
            const octave = parseInt(m[2], 10);
            const midi = noteNameToMidi(note, octave);
            if (midi === null)
                return;
            const freq = midiToFreq(midi);
            // Plugin chip path — delegate note events to ChipChannelBackend.
            // If the backend provides createPlaybackNodes(), use the Web Audio path so
            // effects (arp, vib, portamento, retrigger, echo, etc.) work via AudioParam
            // automation — identical to the built-in Game Boy channels.
            // Otherwise fall back to PCM rendering via the ScriptProcessorNode loop.
            if (this._pluginBackends.length > 0) {
                const backendIdx = chId - 1;
                const backend = this._pluginBackends[backendIdx];
                if (backend) {
                    const capturedInst = inst;
                    const capturedFreq = freq;
                    const capturedChId = chId;
                    const capturedDur = dur;
                    const capturedToken = token;
                    const capturedPanVal = panVal;
                    const capturedTickSec = tickSeconds;
                    if (typeof backend.createPlaybackNodes === 'function') {
                        // ── Web Audio path ────────────────────────────────────────────────
                        this.scheduler.schedule(time, () => {
                            if (this.onPositionChange) {
                                try {
                                    this.onPositionChange(capturedChId, currentIdx, totalEvts);
                                }
                                catch (e) { }
                            }
                            if (this.solo !== null && this.solo !== capturedChId)
                                return;
                            if (this.muted.has(capturedChId))
                                return;
                            const nodes = backend.createPlaybackNodes(this.ctx, capturedFreq, time, capturedDur, capturedInst, this.scheduler, this._getChannelDest(capturedChId));
                            if (nodes && nodes.length > 0) {
                                this.tryApplyEffects(this.ctx, nodes, capturedToken && capturedToken.effects ? capturedToken.effects : [], time, capturedDur, capturedChId, capturedTickSec, capturedInst);
                                this.tryApplyPan(this.ctx, nodes, capturedPanVal, this._getChannelDest(capturedChId));
                                this.tryScheduleEcho(nodes);
                                this.tryScheduleRetriggers(nodes, capturedFreq, capturedInst, capturedChId, capturedToken, capturedTickSec, capturedPanVal);
                                const endTime = time + capturedDur + 0.1;
                                for (const n of nodes)
                                    this.activeNodes.push({ node: n, chId: capturedChId, endTime });
                            }
                        });
                    }
                    else {
                        // ── PCM fallback path ─────────────────────────────────────────────
                        this.scheduler.schedule(time, () => {
                            if (this.onPositionChange) {
                                try {
                                    this.onPositionChange(capturedChId, currentIdx, totalEvts);
                                }
                                catch (e) { }
                            }
                            if (this.solo !== null && this.solo !== capturedChId)
                                return;
                            if (this.muted.has(capturedChId))
                                return;
                            backend.noteOn(capturedFreq, capturedInst);
                        });
                        this.scheduler.schedule(time + capturedDur, () => { backend.noteOff(); });
                    }
                }
                return;
            }
            if (inst.type && inst.type.toLowerCase().includes('pulse')) {
                const duty = inst.duty ? parseFloat(inst.duty) / 100 : 0.5;
                const buffered = this._buffered;
                if (buffered) {
                    // For buffered rendering, attach pan info into queued item for later panning processing
                    buffered.enqueuePulse(time, freq, duty, dur, inst, chId, panVal);
                }
                else {
                    const capturedInst = inst;
                    this.scheduler.schedule(time, () => {
                        // Emit position callback when note PLAYS
                        if (this.onPositionChange) {
                            try {
                                log.debug(`Calling onPositionChange for ch${chId}, ${currentIdx}/${totalEvts}`);
                                this.onPositionChange(chId, currentIdx, totalEvts);
                            }
                            catch (e) {
                                log.error('Error in onPositionChange callback:', e);
                            }
                        }
                        // Check mute/solo state at PLAYBACK time (dynamic check)
                        if (this.solo !== null && this.solo !== chId) {
                            log.debug(`Skipping ch${chId} pulse (solo=${this.solo})`);
                            return;
                        }
                        if (this.muted.has(chId)) {
                            log.debug(`Skipping ch${chId} pulse (muted)`);
                            return;
                        }
                        if (this._debugLog)
                            log.debug(`Playing ch${chId} pulse at ${time.toFixed(2)}s`);
                        const nodes = playPulse(this.ctx, freq, duty, time, dur, capturedInst, this.scheduler, this._getChannelDest(chId));
                        // apply inline token.effects first (e.g. C4<pan:-1>) then fallback to inline pan/inst pan
                        this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds, capturedInst);
                        // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
                        this.tryApplyPan(this.ctx, nodes, panVal, this._getChannelDest(chId));
                        this.tryScheduleEcho(nodes);
                        this.tryScheduleRetriggers(nodes, freq, capturedInst, chId, token, tickSeconds, panVal);
                        const endTime1 = time + dur + 0.1;
                        for (const n of nodes)
                            this.activeNodes.push({ node: n, chId, endTime: endTime1 });
                    });
                }
            }
            else if (inst.type && inst.type.toLowerCase().includes('wave')) {
                const wav = parseWaveTable(inst.wave);
                const buffered = this._buffered;
                if (buffered) {
                    buffered.enqueueWavetable(time, freq, wav, dur, inst, chId, panVal, token && token.effects ? token.effects : []);
                }
                else {
                    const capturedInst = inst;
                    this.scheduler.schedule(time, () => {
                        // Emit position callback when note PLAYS
                        if (this.onPositionChange) {
                            try {
                                log.debug(`Calling onPositionChange for ch${chId}, ${currentIdx}/${totalEvts}`);
                                this.onPositionChange(chId, currentIdx, totalEvts);
                            }
                            catch (e) {
                                log.error('Error in onPositionChange callback:', e);
                            }
                        }
                        // Check mute/solo state at PLAYBACK time (dynamic check)
                        if (this.solo !== null && this.solo !== chId) {
                            log.debug(`Skipping ch${chId} wave (soloed: ch${this.solo})`);
                            return;
                        }
                        if (this.muted.has(chId)) {
                            log.debug(`Skipping ch${chId} wave (muted)`);
                            return;
                        }
                        if (this._debugLog)
                            log.debug(`Playing ch${chId} wave at ${time.toFixed(2)}s`);
                        const nodes = playWavetable(this.ctx, freq, wav, time, dur, capturedInst, this.scheduler, this._getChannelDest(chId));
                        this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds, capturedInst);
                        // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
                        this.tryApplyPan(this.ctx, nodes, panVal, this._getChannelDest(chId));
                        this.tryScheduleEcho(nodes);
                        this.tryScheduleRetriggers(nodes, freq, capturedInst, chId, token, tickSeconds, panVal);
                        const endTime2 = time + dur + 0.1;
                        for (const n of nodes)
                            this.activeNodes.push({ node: n, chId, endTime: endTime2 });
                    });
                }
            }
            else if (inst.type && inst.type.toLowerCase().includes('noise')) {
                const buffered = this._buffered;
                if (buffered) {
                    buffered.enqueueNoise(time, dur, inst, chId, panVal);
                }
                else {
                    this.scheduler.schedule(time, () => {
                        // Emit position callback when note PLAYS
                        if (this.onPositionChange) {
                            try {
                                log.debug(`Calling onPositionChange for ch${chId}, ${currentIdx}/${totalEvts}`);
                                this.onPositionChange(chId, currentIdx, totalEvts);
                            }
                            catch (e) {
                                log.error('Error in onPositionChange callback:', e);
                            }
                        }
                        // Check mute/solo state at PLAYBACK time (dynamic check)
                        if (this.solo !== null && this.solo !== chId) {
                            log.debug(`Skipping ch${chId} noise (soloed: ch${this.solo})`);
                            return;
                        }
                        if (this.muted.has(chId)) {
                            log.debug(`Skipping ch${chId} noise (muted)`);
                            return;
                        }
                        if (this._debugLog)
                            log.debug(`Playing ch${chId} noise at ${time.toFixed(2)}s`);
                        const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler, this._getChannelDest(chId));
                        this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds);
                        // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
                        this.tryApplyPan(this.ctx, nodes, panVal, this._getChannelDest(chId));
                        this.tryScheduleEcho(nodes);
                        this.tryScheduleRetriggers(nodes, 0, inst, chId, token, tickSeconds, panVal);
                        const endTime3 = time + dur + 0.1;
                        for (const n of nodes)
                            this.activeNodes.push({ node: n, chId, endTime: endTime3 });
                    });
                }
            }
        }
        else {
            if (inst.type && inst.type.toLowerCase().includes('noise')) {
                this.scheduler.schedule(time, () => {
                    // Emit position callback when note PLAYS
                    if (this.onPositionChange) {
                        try {
                            log.debug(`Calling onPositionChange for ch${chId}, ${currentIdx}/${totalEvts}`);
                            this.onPositionChange(chId, currentIdx, totalEvts);
                        }
                        catch (e) {
                            log.error('Error in onPositionChange callback:', e);
                        }
                    }
                    if (this.solo !== null && this.solo !== chId)
                        return;
                    if (this.muted.has(chId))
                        return;
                    const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler, this._getChannelDest(chId));
                    this.tryApplyPan(this.ctx, nodes, panVal, this._getChannelDest(chId));
                    const endTime4 = time + dur + 0.1;
                    for (const n of nodes)
                        this.activeNodes.push({ node: n, chId, endTime: endTime4 });
                });
            }
        }
    }
    // Apply registered effects for a scheduled note. `effectsArr` may be an array of
    // objects { type, params } produced by the parser (or legacy arrays). This will
    // look up handlers in the effects registry and invoke them.
    tryApplyEffects(ctx, nodes, effectsArr, start, dur, chId, tickSeconds, inst) {
        if (!Array.isArray(effectsArr) || effectsArr.length === 0)
            return;
        for (const fx of effectsArr) {
            try {
                const name = fx && fx.type ? fx.type : fx;
                // Prefer resolver-provided durationSec when available; inject into params[3].
                // Also inject delaySec (onset delay) into params[4] for vib/trem.
                let params = fx && fx.params ? fx.params : (Array.isArray(fx) ? fx : []);
                if (fx && (typeof fx.durationSec === 'number' || typeof fx.delaySec === 'number')) {
                    const pcopy = Array.isArray(params) ? params.slice() : [];
                    if (typeof fx.durationSec === 'number')
                        pcopy[3] = fx.durationSec;
                    if (typeof fx.delaySec === 'number')
                        pcopy[4] = fx.delaySec;
                    params = pcopy;
                }
                else if ((name === 'vib' || name === 'trem') && typeof fx.delaySec !== 'number' &&
                    Array.isArray(params) && typeof params[4] === 'number' && params[4] > 0 &&
                    typeof tickSeconds === 'number' && tickSeconds > 0) {
                    // Resolver didn't pre-convert delayRows → delaySec. Convert raw rows to seconds.
                    // Formula matches resolver: delaySec = (delayRows / stepsPerRow) / beatsPerSecond
                    //   stepsPerRow = ticksPerStep/4 = 16/4 = 4,  beatsPerSecond = bpm/60
                    //   → delaySec = delayRows * tickSeconds  (since tickSeconds = secondsPerBeat/4 = 1/(4*bps))
                    const pcopy = Array.isArray(params) ? params.slice() : [];
                    pcopy[4] = params[4] * tickSeconds;
                    params = pcopy;
                }
                const handler = getEffect(name);
                if (handler) {
                    try {
                        handler(ctx, nodes, params, start, dur, chId, tickSeconds, inst);
                    }
                    catch (e) { }
                }
            }
            catch (e) { }
        }
    }
    // Try to apply per-note panning. `nodes` is the array returned by play* functions
    // which typically is [oscillatorNode, gainNode]. We attempt to insert a StereoPannerNode
    // between the gain and the destination when available. `panSpec` may be:
    //  - an object { enum: 'L'|'R'|'C' } or { value: number }
    //  - a raw number or string
    // Schedule retriggered notes if retrigger effect was applied.
    // The retrigger effect handler stores metadata on the nodes array that we read here.
    tryScheduleRetriggers(nodes, freq, inst, chId, token, tickSeconds, panVal) {
        const retrigMeta = nodes.__retrigger;
        if (!retrigMeta)
            return;
        const { interval, volumeDelta, tickDuration, start, dur } = retrigMeta;
        const intervalSec = interval * tickDuration;
        // Schedule retriggered notes at each interval
        let retrigTime = start + intervalSec;
        let volMultiplier = 1.0;
        while (retrigTime < start + dur) {
            // Apply volume delta for fadeout/fadein effect
            // volumeDelta is in Game Boy envelope units (-15 to +15, typically -2 to -5 for fadeout)
            // Normalized to 0-1 range by dividing by 15, so -2 = -0.133 per retrigger
            // Example: -2 delta over 8 retrigs = 8 × -0.133 = -1.064 total (full fadeout)
            if (volumeDelta !== 0) {
                volMultiplier = Math.max(0, Math.min(1, volMultiplier + (volumeDelta / 15)));
            }
            // Create modified instrument with adjusted envelope/volume
            const retrigInst = { ...inst };
            if (retrigInst.env) {
                const envParts = String(retrigInst.env).split(',');
                if (envParts.length > 0) {
                    const envLevel = Math.max(0, Math.min(15, Math.round(parseFloat(envParts[0]) * volMultiplier)));
                    retrigInst.env = `${envLevel},${envParts.slice(1).join(',')}`;
                }
            }
            // Calculate remaining duration for this retrig
            const retrigDur = Math.min(intervalSec, start + dur - retrigTime);
            const capturedTime = retrigTime;
            const capturedInst = retrigInst;
            const capturedToken = token;
            // Schedule the retriggered note
            if (inst.type && inst.type.toLowerCase().includes('pulse')) {
                const duty = inst.duty ? parseFloat(inst.duty) / 100 : 0.5;
                this.scheduler.schedule(capturedTime, () => {
                    if (this.solo !== null && this.solo !== chId)
                        return;
                    if (this.muted.has(chId))
                        return;
                    const retrigNodes = playPulse(this.ctx, freq, duty, capturedTime, retrigDur, capturedInst, this.scheduler, this._getChannelDest(chId));
                    // Don't apply retrigger effect recursively, but apply other effects
                    const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx) => {
                        const fxType = fx && fx.type ? fx.type : fx;
                        return fxType !== 'retrig';
                    });
                    this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
                    this.tryApplyPan(this.ctx, retrigNodes, panVal, this._getChannelDest(chId));
                    const retrigEnd1 = capturedTime + retrigDur + 0.1;
                    for (const n of retrigNodes)
                        this.activeNodes.push({ node: n, chId, endTime: retrigEnd1 });
                });
            }
            else if (inst.type && inst.type.toLowerCase().includes('wave')) {
                const wav = parseWaveTable(capturedInst.wave);
                this.scheduler.schedule(capturedTime, () => {
                    if (this.solo !== null && this.solo !== chId)
                        return;
                    if (this.muted.has(chId))
                        return;
                    const retrigNodes = playWavetable(this.ctx, freq, wav, capturedTime, retrigDur, capturedInst, this.scheduler, this._getChannelDest(chId));
                    const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx) => {
                        const fxType = fx && fx.type ? fx.type : fx;
                        return fxType !== 'retrig';
                    });
                    this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
                    this.tryApplyPan(this.ctx, retrigNodes, panVal, this._getChannelDest(chId));
                    const retrigEnd2 = capturedTime + retrigDur + 0.1;
                    for (const n of retrigNodes)
                        this.activeNodes.push({ node: n, chId, endTime: retrigEnd2 });
                });
            }
            else if (inst.type && inst.type.toLowerCase().includes('noise')) {
                this.scheduler.schedule(capturedTime, () => {
                    if (this.solo !== null && this.solo !== chId)
                        return;
                    if (this.muted.has(chId))
                        return;
                    const retrigNodes = playNoise(this.ctx, capturedTime, retrigDur, capturedInst, this.scheduler, this._getChannelDest(chId));
                    const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx) => {
                        const fxType = fx && fx.type ? fx.type : fx;
                        return fxType !== 'retrig';
                    });
                    this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
                    this.tryApplyPan(this.ctx, retrigNodes, panVal, this._getChannelDest(chId));
                    const retrigEnd3 = capturedTime + retrigDur + 0.1;
                    for (const n of retrigNodes)
                        this.activeNodes.push({ node: n, chId, endTime: retrigEnd3 });
                });
            }
            retrigTime += intervalSec;
        }
    }
    // Schedule echo/delay effect if echo metadata was stored on the nodes array.
    // The echo effect handler stores metadata that we use here to create the delay routing.
    tryScheduleEcho(nodes) {
        const echoMeta = nodes.__echo;
        if (!echoMeta)
            return;
        const { delayTime, feedback, mix, start, dur } = echoMeta;
        try {
            // Find the gain node (typically nodes[1])
            const gainNode = nodes.length > 1 ? nodes[1] : nodes[0];
            if (!gainNode || !gainNode.connect)
                return;
            // Create delay effect nodes
            const delayNode = this.ctx.createDelay(Math.max(5.0, delayTime * 4));
            const feedbackGain = this.ctx.createGain();
            const wetGain = this.ctx.createGain();
            const dryGain = this.ctx.createGain();
            // Set parameters
            // mix controls wet/dry balance: mix=0 (all dry), mix=1 (all wet)
            const wetLevel = mix;
            const dryLevel = 1 - mix;
            try {
                delayNode.delayTime.setValueAtTime(delayTime, start);
                feedbackGain.gain.setValueAtTime(feedback, start);
                wetGain.gain.setValueAtTime(wetLevel, start);
                dryGain.gain.setValueAtTime(dryLevel, start);
            }
            catch (_) {
                delayNode.delayTime.value = delayTime;
                feedbackGain.gain.value = feedback;
                wetGain.gain.value = wetLevel;
                dryGain.gain.value = dryLevel;
            }
            // Find the destination (use masterGain if available)
            const destination = this.masterGain || this.ctx.destination;
            // Disconnect gainNode from its current destination to avoid double-routing
            try {
                gainNode.disconnect();
            }
            catch (_) {
                // Already disconnected or no connections
            }
            // Create proper echo routing with separate dry/wet paths:
            // Dry path: gainNode -> dryGain -> destination
            // Wet path: gainNode -> delayNode -> wetGain -> destination
            // Feedback loop: delayNode -> feedbackGain -> delayNode (internal)
            // Connect dry path
            gainNode.connect(dryGain);
            dryGain.connect(destination);
            // Connect to delay input
            gainNode.connect(delayNode);
            // Connect feedback loop: delay -> feedbackGain -> back to delay input
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            // Connect wet signal: delay -> wetGain -> destination
            delayNode.connect(wetGain);
            wetGain.connect(destination);
            // Track all echo nodes for proper cleanup
            this.activeNodes.push({ node: delayNode, chId: -1 });
            this.activeNodes.push({ node: feedbackGain, chId: -1 });
            this.activeNodes.push({ node: wetGain, chId: -1 });
            this.activeNodes.push({ node: dryGain, chId: -1 });
            // Schedule cleanup after the echo tail has died out
            // Use logarithmic decay formula to calculate tail duration:
            // Time for signal to decay to 1/1000 of original level (-60dB)
            // For feedback close to 1.0, this prevents infinite/excessive durations
            let tailDuration;
            if (feedback < 0.001) {
                // Very low feedback - tail dies out quickly (just one repeat)
                tailDuration = delayTime * 2;
            }
            else if (feedback >= 0.999) {
                // Very high feedback - cap to prevent excessive duration
                tailDuration = Math.min(10.0, delayTime * 20);
            }
            else {
                // Calculate decay time using logarithmic formula
                // Math.log(1000) ≈ 6.9, which represents -60dB decay
                const decayTime = (delayTime * Math.log(1000)) / Math.log(1 / feedback);
                // Cap to reasonable maximum (10 seconds) to prevent excessive memory usage
                tailDuration = Math.min(10.0, decayTime);
            }
            const cleanupTime = start + dur + tailDuration;
            // Schedule proper cleanup: ramp gain to zero, then disconnect all nodes
            this.scheduler.schedule(cleanupTime - 0.1, () => {
                try {
                    // Ramp feedback to zero over 100ms to avoid clicks
                    feedbackGain.gain.setValueAtTime(feedback, this.ctx.currentTime);
                    feedbackGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
                }
                catch (_) {
                    // Scheduling failed, proceed to disconnect anyway
                }
            });
            // Schedule node disconnection after fade-out completes
            this.scheduler.schedule(cleanupTime, () => {
                try {
                    delayNode.disconnect();
                    feedbackGain.disconnect();
                    wetGain.disconnect();
                    dryGain.disconnect();
                }
                catch (_) {
                    // Already disconnected or GC'd
                }
            });
        }
        catch (e) {
            // Echo routing failed, skip silently
        }
    }
    tryApplyPan(ctx, nodes, panSpec, channelDest) {
        if (!panSpec)
            return;
        let p = undefined;
        if (typeof panSpec === 'number')
            p = Math.max(-1, Math.min(1, panSpec));
        else if (typeof panSpec === 'string') {
            const s = panSpec.toUpperCase();
            if (s === 'L')
                p = -1;
            else if (s === 'R')
                p = 1;
            else if (s === 'C')
                p = 0;
            else {
                const n = Number(panSpec);
                if (!Number.isNaN(n))
                    p = Math.max(-1, Math.min(1, n));
            }
        }
        else if (typeof panSpec === 'object') {
            if (panSpec.value !== undefined)
                p = Math.max(-1, Math.min(1, Number(panSpec.value)));
            else if (panSpec.enum) {
                const s = String(panSpec.enum).toUpperCase();
                if (s === 'L')
                    p = -1;
                else if (s === 'R')
                    p = 1;
                else
                    p = 0;
            }
        }
        if (p === undefined)
            return;
        try {
            const gain = nodes && nodes.length >= 2 ? nodes[1] : null;
            if (!gain || typeof gain.connect !== 'function')
                return;
            // Determine the actual destination (channel bus when analyser enabled, otherwise masterGain)
            const dest = channelDest || this.masterGain || ctx.destination;
            // create StereoPannerNode if available
            const createPanner = ctx.createStereoPanner;
            if (typeof createPanner === 'function') {
                const panner = ctx.createStereoPanner();
                try {
                    panner.pan.setValueAtTime(p, ctx.currentTime);
                }
                catch (e) {
                    try {
                        panner.pan.value = p;
                    }
                    catch (e2) { }
                }
                // Disconnect from all destinations (handles both masterGain and ctx.destination cases)
                try {
                    gain.disconnect();
                }
                catch (e) { }
                gain.connect(panner);
                panner.connect(dest);
                // also track panner node so stop/cleanup will disconnect it
                this.activeNodes.push({ node: panner, chId: -1 });
            }
            else {
                // StereoPanner not available — best-effort: do nothing or optionally implement left/right gains
                // For now, we silently skip (no pan) to avoid complex signal routing.
            }
        }
        catch (e) {
            // swallow errors — panning is best-effort
        }
    }
    /**
     * Pause playback by suspending the AudioContext
     */
    async pause() {
        // Set paused flag FIRST to prevent any timer callbacks from executing
        this._isPaused = true;
        // Clear all playback timers and record when we paused
        if (this._preScheduleTimer) {
            clearTimeout(this._preScheduleTimer);
            this._preScheduleTimer = null;
            this._pauseTimestamp = Date.now();
        }
        if (this._completionTimer) {
            clearTimeout(this._completionTimer);
            this._completionTimer = null;
            this._pauseTimestamp = Date.now();
        }
        if (this._repeatTimer) {
            clearTimeout(this._repeatTimer);
            this._repeatTimer = null;
            this._pauseTimestamp = Date.now();
        }
        if (this.ctx && typeof this.ctx.suspend === 'function' && this.ctx.state === 'running') {
            await this.ctx.suspend();
        }
        // Pause the analyser sampling loop
        this._stopAnalyserSampling();
    }
    /**
     * Resume playback by resuming the AudioContext
     */
    async resume() {
        // Capture pause timestamp before clearing it so elapsed time can be computed correctly
        const pausedAt = this._pauseTimestamp;
        // Clear paused flag
        this._isPaused = false;
        this._pauseTimestamp = 0;
        // Restart the appropriate timer after resume
        if (this._isRepeatMode && this._currentAST) {
            // Use the audio clock to compute remaining time until the next pre-schedule moment.
            // ctx.currentTime is frozen while suspended, so this correctly reflects the remaining
            // audio to play before we need to queue the next iteration.
            const timeToPreSchedule = (this._loopEndTime - 0.25) - this.ctx.currentTime;
            const remainingMs = Math.max(10, Math.round(timeToPreSchedule * 1000));
            const capturedAst = this._currentAST;
            this._preScheduleTimer = setTimeout(() => this._fireRepeat(capturedAst), remainingMs);
        }
        else if (!this._isRepeatMode && this._completionTimeoutMs > 0 && this._playbackStartTimestamp > 0) {
            const elapsedBeforePause = (pausedAt || Date.now()) - this._playbackStartTimestamp;
            const remainingMs = Math.max(0, this._completionTimeoutMs - elapsedBeforePause);
            this._playbackStartTimestamp = Date.now() - elapsedBeforePause;
            this._completionTimer = setTimeout(() => {
                try {
                    this.stop();
                    if (this.onComplete)
                        this.onComplete();
                }
                catch (e) {
                    log.error('Exception in completion timer:', e);
                }
            }, remainingMs);
        }
        if (this.ctx && typeof this.ctx.resume === 'function' && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        // Restart the analyser sampling loop
        if (this._enableAnalyser) {
            this._startAnalyserSampling();
        }
    }
    /**
     * Set the master output gain. volume is 0.0–1.0 (linear gain).
     * Takes effect immediately regardless of whether a song is playing.
     */
    setMasterVolume(volume) {
        const clamped = Math.max(0, Math.min(1, volume));
        if (this.masterGain) {
            this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
        }
    }
    /** Expose the AudioContext so UI consumers (e.g. oscilloscope) can create nodes. */
    getAudioContext() {
        return this.ctx;
    }
    /** Expose the master GainNode so UI consumers can tap the post-gain signal. */
    getMasterGain() {
        return this.masterGain;
    }
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
    setPerChannelAnalyser(enabled, config) {
        this._enableAnalyser = enabled;
        // Track which dimensions of config actually changed so we know what to
        // update on already-running AnalyserNodes / the sampling timer.
        let intervalChanged = false;
        let analyserParamsChanged = false;
        if (config) {
            if (config.fftSize && config.fftSize !== this._analyserFftSize) {
                this._analyserFftSize = config.fftSize;
                analyserParamsChanged = true;
            }
            if (config.smoothingTimeConstant !== undefined && config.smoothingTimeConstant !== this._analyserSmoothing) {
                this._analyserSmoothing = config.smoothingTimeConstant;
                analyserParamsChanged = true;
            }
            if (config.uiUpdateHz && config.uiUpdateHz !== this._uiUpdateHz) {
                this._uiUpdateHz = config.uiUpdateHz;
                intervalChanged = true;
            }
            if (config.emittedSampleCount && config.emittedSampleCount !== this._emittedSampleCount) {
                this._emittedSampleCount = config.emittedSampleCount;
                // Resize all preallocated decimated output buffers to the new length.
                for (const [chId] of this._decimatedBuffers) {
                    this._decimatedBuffers.set(chId, new Float32Array(this._emittedSampleCount));
                }
            }
        }
        if (!enabled) {
            this._stopAnalyserSampling();
            // Do NOT call _teardownAnalysers() here — keep buses connected so
            // re-enabling during active playback works without a song restart.
            return;
        }
        // Retrofit AnalyserNodes onto any buses that were created while the
        // feature was disabled (i.e. channels already playing mid-song).
        for (const [chId, bus] of this._channelBuses) {
            this._attachAnalyser(chId, bus);
        }
        // Apply fftSize / smoothingTimeConstant changes to all live AnalyserNodes.
        // fftSize also requires the read-buffer to be reallocated to match the new
        // frequencyBinCount (= fftSize / 2 for frequency data, fftSize for time-domain).
        if (analyserParamsChanged) {
            for (const [chId, analyser] of this._channelAnalysers) {
                try {
                    analyser.fftSize = this._analyserFftSize;
                }
                catch (_) { }
                try {
                    analyser.smoothingTimeConstant = this._analyserSmoothing;
                }
                catch (_) { }
                // Reallocate the read-buffer to match the (possibly changed) fftSize.
                this._analyserBuffers.set(chId, new Float32Array(this._analyserFftSize));
                // Decimated output buffer size depends on _emittedSampleCount, not fftSize —
                // but reallocate anyway to ensure the pair stays consistent.
                this._decimatedBuffers.set(chId, new Float32Array(this._emittedSampleCount));
            }
        }
        // Restart the sampling loop when the timer interval changed (uiUpdateHz),
        // or when first enabling. Only start if playback is actually active —
        // if called before playAST(), playAST() will start the loop itself.
        if (this._isPlaying && !this._isPaused) {
            if (intervalChanged || !this._analyserTimer) {
                // _startAnalyserSampling stops any existing timer before starting a new
                // one, so calling it here is always safe even when the loop is running.
                this._stopAnalyserSampling();
                this._startAnalyserSampling();
            }
        }
    }
    /**
     * Return the most-recent analyser buffer for a channel (pull-based consumers).
     * Returns null when the analyser is disabled or the channel hasn't been set up.
     */
    getChannelAnalyserData(channelId) {
        const analyser = this._channelAnalysers.get(channelId);
        const buf = this._analyserBuffers.get(channelId);
        const out = this._decimatedBuffers.get(channelId);
        if (!analyser || !buf || !out)
            return null;
        analyser.getFloatTimeDomainData(buf);
        decimateInto(buf, out);
        return { samples: out, sampleRateHint: this.ctx.sampleRate };
    }
    /**
     * Get or create the per-channel bus GainNode for the given channel.
     * The AnalyserNode and its buffer are only created/connected when
     * _enableAnalyser is true, keeping the path zero-overhead by default.
     */
    _getChannelBus(chId) {
        let bus = this._channelBuses.get(chId);
        if (!bus) {
            bus = this.ctx.createGain();
            bus.gain.value = 1;
            bus.connect(this.masterGain || this.ctx.destination);
            this._channelBuses.set(chId, bus);
            // Only wire the AnalyserNode when the feature is opted in.
            if (this._enableAnalyser) {
                this._attachAnalyser(chId, bus);
            }
        }
        return bus;
    }
    /**
     * Create and wire an AnalyserNode tap onto an existing bus.
     * Safe to call multiple times — skips channels that already have one.
     */
    _attachAnalyser(chId, bus) {
        if (this._channelAnalysers.has(chId))
            return;
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = this._analyserFftSize;
        analyser.smoothingTimeConstant = this._analyserSmoothing;
        bus.connect(analyser);
        this._channelAnalysers.set(chId, analyser);
        this._analyserBuffers.set(chId, new Float32Array(this._analyserFftSize));
        this._decimatedBuffers.set(chId, new Float32Array(this._emittedSampleCount));
    }
    /**
     * Set the volume (0–1) for a specific channel by id.
     * Adjusts the per-channel bus gain, which is applied after the instrument
     * envelope — equivalent to the channel fader on a mixing desk.
     * Has no effect when the channel bus does not yet exist (e.g. before playback starts).
     */
    setChannelVolume(channelId, volume) {
        const bus = this._channelBuses.get(channelId);
        if (bus) {
            bus.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime);
        }
    }
    /**
     * Return the AudioNode that should be used as the destination for a channel.
     * Notes always route through a per-channel bus GainNode so that per-channel
     * volume (set via `setChannelVolume`) is applied after the instrument envelope.
     * The AnalyserNode tap is only wired to the bus when `_enableAnalyser` is true.
     */
    _getChannelDest(chId) {
        return this._getChannelBus(chId);
    }
    /** Start the throttled sampling loop that emits onChannelWaveform events. */
    _startAnalyserSampling() {
        // Stop any existing timer first — this method may be called to restart
        // the loop after a config change (e.g. uiUpdateHz), so we must not assume
        // the timer is absent.
        this._stopAnalyserSampling();
        const intervalMs = Math.max(16, Math.round(1000 / this._uiUpdateHz));
        this._analyserTimer = setInterval(() => {
            if (this._isPaused)
                return;
            if (typeof document !== 'undefined' && document.hidden)
                return;
            for (const [chId, analyser] of this._channelAnalysers) {
                const buf = this._analyserBuffers.get(chId);
                if (!buf)
                    continue;
                analyser.getFloatTimeDomainData(buf);
                const out = this._decimatedBuffers.get(chId);
                if (!out)
                    continue;
                decimateInto(buf, out);
                if (this.onChannelWaveform) {
                    try {
                        this.onChannelWaveform({
                            channelId: chId,
                            timestamp: Date.now(),
                            samples: out,
                            format: 'float32',
                            sampleCount: this._emittedSampleCount,
                            sampleRateHint: this.ctx.sampleRate,
                        });
                    }
                    catch (_) { }
                }
            }
        }, intervalMs);
    }
    /** Stop the sampling loop (called on pause/stop). */
    _stopAnalyserSampling() {
        if (this._analyserTimer) {
            clearInterval(this._analyserTimer);
            this._analyserTimer = null;
        }
    }
    /** Disconnect and destroy all analyser/channel-bus nodes. */
    _teardownAnalysers() {
        this._stopAnalyserSampling();
        for (const [, analyser] of this._channelAnalysers) {
            try {
                analyser.disconnect();
            }
            catch (_) { }
        }
        for (const [, bus] of this._channelBuses) {
            try {
                bus.disconnect();
            }
            catch (_) { }
        }
        this._channelAnalysers.clear();
        this._channelBuses.clear();
        this._analyserBuffers.clear();
        this._decimatedBuffers.clear();
    }
    stop() {
        // Clear paused flag
        this._isPaused = false;
        this._isPlaying = false;
        if (this._preScheduleTimer) {
            try {
                clearTimeout(this._preScheduleTimer);
            }
            catch (e) { }
            this._preScheduleTimer = null;
        }
        if (this._repeatTimer) {
            try {
                clearTimeout(this._repeatTimer);
            }
            catch (e) { }
            this._repeatTimer = null;
        }
        if (this._completionTimer) {
            try {
                clearTimeout(this._completionTimer);
            }
            catch (e) { }
            this._completionTimer = null;
        }
        // Reset pause/resume tracking
        this._completionTimeoutMs = 0;
        this._playbackStartTimestamp = 0;
        this._pauseTimestamp = 0;
        this._isRepeatMode = false;
        this._currentAST = null;
        if (this.scheduler) {
            this.scheduler.clear();
            this.scheduler.stop();
        }
        // Clean up plugin channel backends and ScriptProcessorNode
        if (this._pluginProcessor) {
            try {
                this._pluginProcessor.disconnect();
            }
            catch (e) { }
            this._pluginProcessor = null;
        }
        for (const b of this._pluginBackends) {
            try {
                b.reset();
            }
            catch (e) { }
        }
        this._pluginBackends = [];
        // Clear effect state (e.g., portamento frequency tracking)
        clearEffectState();
        // Tear down per-channel analysers and buses
        this._teardownAnalysers();
        for (const entry of this.activeNodes) {
            try {
                if (entry.node && typeof entry.node.stop === 'function')
                    entry.node.stop();
            }
            catch (e) { }
            try {
                if (entry.node && typeof entry.node.disconnect === 'function')
                    entry.node.disconnect();
            }
            catch (e) { }
        }
        this.activeNodes = [];
        try {
            const buffered = this._buffered;
            if (buffered && typeof buffered.drainScheduledNodes === 'function') {
                const nodes = buffered.drainScheduledNodes();
                for (const n of nodes) {
                    try {
                        if (n.src && typeof n.src.stop === 'function')
                            n.src.stop();
                    }
                    catch (_) { }
                    try {
                        if (n.src && typeof n.src.disconnect === 'function')
                            n.src.disconnect();
                    }
                    catch (_) { }
                    try {
                        if (n.gain && typeof n.gain.disconnect === 'function')
                            n.gain.disconnect();
                    }
                    catch (_) { }
                }
            }
        }
        catch (e) { }
    }
    toggleChannelMute(chId) {
        if (this.muted.has(chId))
            this.muted.delete(chId);
        else
            this.muted.add(chId);
    }
    toggleChannelSolo(chId) {
        if (this.solo === chId)
            this.solo = null;
        else
            this.solo = chId;
    }
    stopChannel(chId) {
        const keep = [];
        for (const entry of this.activeNodes) {
            if (entry.chId === chId) {
                try {
                    if (entry.node && typeof entry.node.stop === 'function')
                        entry.node.stop();
                }
                catch (e) { }
                try {
                    if (entry.node && typeof entry.node.disconnect === 'function')
                        entry.node.disconnect();
                }
                catch (e) { }
            }
            else {
                keep.push(entry);
            }
        }
        this.activeNodes = keep;
        try {
            const buffered = this._buffered;
            if (buffered && typeof buffered.stop === 'function') {
                buffered.stop(chId);
            }
        }
        catch (e) { }
    }
}
export default Player;
//# sourceMappingURL=playback.js.map