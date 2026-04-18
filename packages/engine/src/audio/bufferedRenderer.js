import { playPulse as playPulseImpl } from '../chips/gameboy/pulse.js';
import { playWavetable as playWavetableImpl } from '../chips/gameboy/wave.js';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise.js';
export class BufferedRenderer {
    ctx;
    scheduler;
    segmentDur;
    lookahead;
    segments = new Map();
    pendingRenders = new Set();
    scheduledNodes = [];
    maxPreRenderSegments;
    applyEffectsToNodes(ctx, nodes, pan, effects, start, dur) {
        // Apply inline effect array first
        if (Array.isArray(effects)) {
            for (const fx of effects) {
                try {
                    const name = fx && fx.type ? fx.type : fx;
                    // If resolver attached normalized duration/delay in seconds, inject them
                    let params = fx && fx.params ? fx.params : (Array.isArray(fx) ? fx : []);
                    if (fx && (typeof fx.durationSec === 'number' || typeof fx.delaySec === 'number')) {
                        // shallow copy so we don't mutate original parsed params
                        const pcopy = Array.isArray(params) ? params.slice() : [];
                        if (typeof fx.durationSec === 'number')
                            pcopy[3] = fx.durationSec;
                        if (typeof fx.delaySec === 'number')
                            pcopy[4] = fx.delaySec;
                        params = pcopy;
                    }
                    const handler = require('../effects/index.js').get(name);
                    if (handler) {
                        try {
                            handler(ctx, nodes, params, start, dur);
                        }
                        catch (e) { }
                    }
                }
                catch (e) { }
            }
        }
        // Apply pan as fallback if provided and not already covered by an effect
        if (pan !== undefined && pan !== null) {
            const handler = require('../effects/index.js').get('pan');
            if (handler) {
                // If pan is object with enum/value, convert to numeric for handler when possible
                if (typeof pan === 'object') {
                    if (pan.value !== undefined)
                        handler(ctx, nodes, [pan.value], start, dur);
                    else if (pan.enum) {
                        const s = String(pan.enum).toUpperCase();
                        const mapped = s === 'L' ? -1 : (s === 'R' ? 1 : 0);
                        handler(ctx, nodes, [mapped], start, dur);
                    }
                }
                else if (typeof pan === 'number') {
                    handler(ctx, nodes, [pan], start, dur);
                }
                else if (typeof pan === 'string') {
                    // L/C/R or numeric string
                    const up = pan.toUpperCase();
                    if (up === 'L' || up === 'R' || up === 'C') {
                        const mapped = up === 'L' ? -1 : (up === 'R' ? 1 : 0);
                        handler(ctx, nodes, [mapped], start, dur);
                    }
                    else {
                        const n = Number(pan);
                        if (!Number.isNaN(n))
                            handler(ctx, nodes, [n], start, dur);
                    }
                }
            }
        }
    }
    constructor(ctx, scheduler, opts = {}) {
        this.ctx = ctx;
        this.scheduler = scheduler;
        // Allow overriding segment duration via options or environment for debugging/exports
        const envSegRaw = typeof process !== 'undefined' && (process.env && process.env.BEATBAX_SEGMENT_DUR) ? process.env.BEATBAX_SEGMENT_DUR : undefined;
        const envSeg = typeof envSegRaw !== 'undefined' ? Number(envSegRaw) : undefined;
        const envSegNum = (typeof envSeg === 'number' && Number.isFinite(envSeg) && envSeg > 0) ? envSeg : undefined;
        this.segmentDur = (typeof opts.segmentDuration === 'number') ? opts.segmentDuration : (envSegNum ?? 0.5);
        this.lookahead = opts.lookahead || 0.25;
        this.maxPreRenderSegments = opts.maxPreRenderSegments;
    }
    segmentKeyForTime(t) {
        return Math.floor(t / this.segmentDur) * this.segmentDur;
    }
    enqueueEvent(absTime, dur, renderFn, chId) {
        const segStart = this.segmentKeyForTime(absTime);
        const localStart = absTime - segStart;
        const arr = this.segments.get(segStart) || [];
        const ev = { localStart, dur, renderFn };
        if (renderFn.__chId !== undefined)
            ev.chId = renderFn.__chId;
        if (typeof chId === 'number')
            ev.chId = chId;
        arr.push(ev);
        this.segments.set(segStart, arr);
        if (!this.pendingRenders.has(segStart)) {
            if (typeof this.maxPreRenderSegments === 'number') {
                const pendingCount = this.pendingRenders.size;
                if (pendingCount >= this.maxPreRenderSegments) {
                    return false;
                }
            }
            this.pendingRenders.add(segStart);
            const renderAt = Math.max(0, segStart - this.lookahead);
            this.scheduler.schedule(renderAt, () => this.renderSegment(segStart));
        }
        return true;
    }
    async renderSegment(segStart) {
        if (!this.pendingRenders.has(segStart))
            return;
        this.pendingRenders.delete(segStart);
        const events = this.segments.get(segStart) || [];
        if (!events.length)
            return;
        const sampleRate = (this.ctx && this.ctx.sampleRate) ? this.ctx.sampleRate : 44100;
        const renderDur = this.segmentDur + 0.05;
        const length = Math.ceil(renderDur * sampleRate);
        const offline = new globalThis.OfflineAudioContext(1, length, sampleRate);
        for (const ev of events) {
            try {
                ev.renderFn(offline);
            }
            catch (e) { }
        }
        try {
            const rendered = await offline.startRendering();
            const src = this.ctx.createBufferSource();
            src.buffer = rendered;
            src.loop = false;
            const gain = this.ctx.createGain();
            src.connect(gain);
            gain.connect(this.ctx.destination);
            try {
                src.start(segStart);
            }
            catch (e) {
                try {
                    src.start();
                }
                catch (_) { }
            }
            try {
                src.stop(segStart + renderDur);
            }
            catch (e) { }
            const chId = (events && events.length && events[0].chId) ? events[0].chId : undefined;
            this.scheduledNodes.push({ src, gain, segStart, chId });
        }
        catch (e) {
            for (const ev of events) {
                try {
                    ev.renderFn(undefined);
                }
                catch (_) { }
            }
        }
        this.segments.delete(segStart);
    }
    stop(chId) {
        if (typeof chId === 'number') {
            for (const [segStart, events] of Array.from(this.segments.entries())) {
                const remaining = events.filter((ev) => ev.chId !== chId);
                if (remaining.length)
                    this.segments.set(segStart, remaining);
                else {
                    this.segments.delete(segStart);
                    this.pendingRenders.delete(segStart);
                }
            }
            const keep = [];
            for (const n of this.scheduledNodes) {
                if (n.chId === chId) {
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
                else
                    keep.push(n);
            }
            this.scheduledNodes = keep;
        }
        else {
            this.segments.clear();
            this.pendingRenders.clear();
            for (const n of this.scheduledNodes) {
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
            this.scheduledNodes = [];
        }
    }
    drainScheduledNodes(chId) {
        if (typeof chId === 'number') {
            const matched = this.scheduledNodes.filter(n => n.chId === chId);
            this.scheduledNodes = this.scheduledNodes.filter(n => n.chId !== chId);
            return matched;
        }
        const out = this.scheduledNodes.slice();
        this.scheduledNodes = [];
        return out;
    }
    enqueuePulse(absTime, freq, duty, dur, inst, chId, pan, effects) {
        const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
            const local = absTime - (this.segmentKeyForTime(absTime));
            try {
                const nodes = playPulseImpl(offlineCtx, freq, duty, local, dur, inst) || [];
                // apply effects and baked pan inside offline render
                try {
                    this.applyEffectsToNodes(offlineCtx, nodes, pan, effects, local, dur);
                }
                catch (e) { }
            }
            catch (e) { }
        }, chId);
        if (!enq) {
            this.scheduler.schedule(absTime, () => {
                try {
                    const nodes = playPulseImpl(this.ctx, freq, duty, absTime, dur, inst) || [];
                    try {
                        this.applyEffectsToNodes(this.ctx, nodes, pan, effects, absTime, dur);
                    }
                    catch (e) { }
                }
                catch (_) { }
            });
        }
        return enq;
    }
    enqueueWavetable(absTime, freq, table, dur, inst, chId, pan, effects) {
        const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
            const local = absTime - (this.segmentKeyForTime(absTime));
            try {
                const nodes = playWavetableImpl(offlineCtx, freq, table, local, dur, inst) || [];
                try {
                    this.applyEffectsToNodes(offlineCtx, nodes, pan, effects, local, dur);
                }
                catch (e) { }
            }
            catch (e) { }
        }, chId);
        if (!enq) {
            this.scheduler.schedule(absTime, () => {
                try {
                    const nodes = playWavetableImpl(this.ctx, freq, table, absTime, dur, inst) || [];
                    try {
                        this.applyEffectsToNodes(this.ctx, nodes, pan, effects, absTime, dur);
                    }
                    catch (e) { }
                }
                catch (_) { }
            });
        }
        return enq;
    }
    enqueueNoise(absTime, dur, inst, chId, pan, effects) {
        const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
            const local = absTime - (this.segmentKeyForTime(absTime));
            try {
                const nodes = playNoiseImpl(offlineCtx, local, dur, inst) || [];
                try {
                    this.applyEffectsToNodes(offlineCtx, nodes, pan, effects, local, dur);
                }
                catch (e) { }
            }
            catch (e) { }
        }, chId);
        if (!enq) {
            this.scheduler.schedule(absTime, () => {
                try {
                    const nodes = playNoiseImpl(this.ctx, absTime, dur, inst) || [];
                    try {
                        this.applyEffectsToNodes(this.ctx, nodes, pan, effects, absTime, dur);
                    }
                    catch (e) { }
                }
                catch (_) { }
            });
        }
        return enq;
    }
}
export default BufferedRenderer;
//# sourceMappingURL=bufferedRenderer.js.map