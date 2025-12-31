import { playPulse as playPulseImpl } from '../chips/gameboy/pulse.js';
import { playWavetable as playWavetableImpl } from '../chips/gameboy/wave.js';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise.js';
import type TickScheduler from '../scheduler/tickScheduler.js';

type RenderEvent = {
  localStart: number;
  dur: number;
  renderFn: (offlineCtx: OfflineAudioContext) => void;
};

export class BufferedRenderer {
  private ctx: BaseAudioContext;
  private scheduler: TickScheduler;
  private segmentDur: number;
  private lookahead: number;
  private segments: Map<number, RenderEvent[]> = new Map();
  private pendingRenders: Set<number> = new Set();
  private scheduledNodes: Array<{ src: any; gain: any; segStart: number; chId?: number }> = [];
  private maxPreRenderSegments?: number;

  private applyEffectsToNodes(ctx: any, nodes: any[], pan: any, effects: any[] | undefined, start: number, dur: number) {
    // Apply inline effect array first
    if (Array.isArray(effects)) {
      for (const fx of effects) {
        try {
          const name = fx && fx.type ? fx.type : fx;
          const params = fx && fx.params ? fx.params : (Array.isArray(fx) ? fx : []);
          const handler = (require('../effects/index.js') as any).get(name);
          if (handler) {
            try { handler(ctx, nodes, params, start, dur); } catch (e) {}
          }
        } catch (e) {}
      }
    }

    // Apply pan as fallback if provided and not already covered by an effect
    if (pan !== undefined && pan !== null) {
      const handler = (require('../effects/index.js') as any).get('pan');
      if (handler) {
        // If pan is object with enum/value, convert to numeric for handler when possible
        if (typeof pan === 'object') {
          if (pan.value !== undefined) handler(ctx, nodes, [pan.value], start, dur);
          else if (pan.enum) {
            const s = String(pan.enum).toUpperCase();
            const mapped = s === 'L' ? -1 : (s === 'R' ? 1 : 0);
            handler(ctx, nodes, [mapped], start, dur);
          }
        } else if (typeof pan === 'number') {
          handler(ctx, nodes, [pan], start, dur);
        } else if (typeof pan === 'string') {
          // L/C/R or numeric string
          const up = pan.toUpperCase();
          if (up === 'L' || up === 'R' || up === 'C') {
            const mapped = up === 'L' ? -1 : (up === 'R' ? 1 : 0);
            handler(ctx, nodes, [mapped], start, dur);
          } else {
            const n = Number(pan);
            if (!Number.isNaN(n)) handler(ctx, nodes, [n], start, dur);
          }
        }
      }
    }
  }

  constructor(ctx: BaseAudioContext, scheduler: TickScheduler, opts: { segmentDuration?: number; lookahead?: number; maxPreRenderSegments?: number } = {}) {
    this.ctx = ctx;
    this.scheduler = scheduler;
    this.segmentDur = opts.segmentDuration || 0.5;
    this.lookahead = opts.lookahead || 0.25;
    this.maxPreRenderSegments = opts.maxPreRenderSegments;
  }

  private segmentKeyForTime(t: number) {
    return Math.floor(t / this.segmentDur) * this.segmentDur;
  }

  enqueueEvent(absTime: number, dur: number, renderFn: (offlineCtx: OfflineAudioContext) => void, chId?: number) {
    const segStart = this.segmentKeyForTime(absTime);
    const localStart = absTime - segStart;
    const arr = this.segments.get(segStart) || [];
    const ev = { localStart, dur, renderFn } as any;
    if ((renderFn as any).__chId !== undefined) ev.chId = (renderFn as any).__chId;
    if (typeof chId === 'number') ev.chId = chId;
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

  private async renderSegment(segStart: number) {
    if (!this.pendingRenders.has(segStart)) return;
    this.pendingRenders.delete(segStart);
    const events = this.segments.get(segStart) || [];
    if (!events.length) return;

    const sampleRate = (this.ctx && (this.ctx as any).sampleRate) ? (this.ctx as any).sampleRate : 44100;
    const renderDur = this.segmentDur + 0.05;
    const length = Math.ceil(renderDur * sampleRate);
    const offline = new (globalThis as any).OfflineAudioContext(1, length, sampleRate) as OfflineAudioContext;

    for (const ev of events) {
      try { ev.renderFn(offline); } catch (e) {}
    }

    try {
      const rendered = await offline.startRendering();
      const src = (this.ctx as any).createBufferSource();
      src.buffer = rendered;
      src.loop = false;
      const gain = (this.ctx as any).createGain();
      src.connect(gain);
      gain.connect((this.ctx as any).destination);
      try { src.start(segStart); } catch (e) { try { src.start(); } catch (_) {} }
      try { src.stop(segStart + renderDur); } catch (e) {}
      const chId = (events && events.length && (events[0] as any).chId) ? (events[0] as any).chId : undefined;
      this.scheduledNodes.push({ src, gain, segStart, chId });
    } catch (e) {
      for (const ev of events) { try { ev.renderFn(undefined as any); } catch (_) {} }
    }
    this.segments.delete(segStart);
  }

  stop(chId?: number) {
    if (typeof chId === 'number') {
      for (const [segStart, events] of Array.from(this.segments.entries())) {
        const remaining = events.filter((ev: any) => ev.chId !== chId);
        if (remaining.length) this.segments.set(segStart, remaining);
        else { this.segments.delete(segStart); this.pendingRenders.delete(segStart); }
      }
      const keep: typeof this.scheduledNodes = [] as any;
      for (const n of this.scheduledNodes) {
        if (n.chId === chId) {
          try { if (n.src && typeof n.src.stop === 'function') n.src.stop(); } catch (_) {}
          try { if (n.src && typeof n.src.disconnect === 'function') n.src.disconnect(); } catch (_) {}
          try { if (n.gain && typeof n.gain.disconnect === 'function') n.gain.disconnect(); } catch (_) {}
        } else keep.push(n);
      }
      this.scheduledNodes = keep;
    } else {
      this.segments.clear();
      this.pendingRenders.clear();
      for (const n of this.scheduledNodes) {
        try { if (n.src && typeof n.src.stop === 'function') n.src.stop(); } catch (_) {}
        try { if (n.src && typeof n.src.disconnect === 'function') n.src.disconnect(); } catch (_) {}
        try { if (n.gain && typeof n.gain.disconnect === 'function') n.gain.disconnect(); } catch (_) {}
      }
      this.scheduledNodes = [];
    }
  }

  drainScheduledNodes(chId?: number) {
    if (typeof chId === 'number') {
      const matched = this.scheduledNodes.filter(n => n.chId === chId);
      this.scheduledNodes = this.scheduledNodes.filter(n => n.chId !== chId);
      return matched;
    }
    const out = this.scheduledNodes.slice();
    this.scheduledNodes = [];
    return out;
  }

  enqueuePulse(absTime: number, freq: number, duty: number, dur: number, inst: any, chId?: number, pan?: any, effects?: any[]) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      const local = absTime - (this.segmentKeyForTime(absTime));
      try {
        const nodes = playPulseImpl(offlineCtx as any, freq, duty, local, dur, inst) || [];
        // apply effects and baked pan inside offline render
        try { this.applyEffectsToNodes(offlineCtx as any, nodes, pan, effects, local, dur); } catch (e) {}
      } catch (e) {}
    }, chId);
    if (!enq) {
      this.scheduler.schedule(absTime, () => { try {
        const nodes = playPulseImpl(this.ctx as any, freq, duty, absTime, dur, inst) || [];
        try { this.applyEffectsToNodes(this.ctx as any, nodes, pan, effects, absTime, dur); } catch (e) {}
      } catch (_) {} });
    }
    return enq;
  }

  enqueueWavetable(absTime: number, freq: number, table: number[], dur: number, inst: any, chId?: number, pan?: any, effects?: any[]) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      const local = absTime - (this.segmentKeyForTime(absTime));
      try {
        const nodes = playWavetableImpl(offlineCtx as any, freq, table, local, dur, inst) || [];
        try { this.applyEffectsToNodes(offlineCtx as any, nodes, pan, effects, local, dur); } catch (e) {}
      } catch (e) {}
    }, chId);
    if (!enq) {
      this.scheduler.schedule(absTime, () => { try {
        const nodes = playWavetableImpl(this.ctx as any, freq, table, absTime, dur, inst) || [];
        try { this.applyEffectsToNodes(this.ctx as any, nodes, pan, effects, absTime, dur); } catch (e) {}
      } catch (_) {} });
    }
    return enq;
  }

  enqueueNoise(absTime: number, dur: number, inst: any, chId?: number, pan?: any, effects?: any[]) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      const local = absTime - (this.segmentKeyForTime(absTime));
      try {
        const nodes = playNoiseImpl(offlineCtx as any, local, dur, inst) || [];
        try { this.applyEffectsToNodes(offlineCtx as any, nodes, pan, effects, local, dur); } catch (e) {}
      } catch (e) {}
    }, chId);
    if (!enq) {
      this.scheduler.schedule(absTime, () => { try {
        const nodes = playNoiseImpl(this.ctx as any, absTime, dur, inst) || [];
        try { this.applyEffectsToNodes(this.ctx as any, nodes, pan, effects, absTime, dur); } catch (e) {}
      } catch (_) {} });
    }
    return enq;
  }
}

export default BufferedRenderer;
