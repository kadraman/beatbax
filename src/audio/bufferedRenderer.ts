import { playPulse as playPulseImpl } from '../chips/gameboy/pulse';
import { playWavetable as playWavetableImpl } from '../chips/gameboy/wave';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise';
import type TickScheduler from '../scheduler/tickScheduler';

type RenderEvent = {
  localStart: number; // seconds within the segment
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

  constructor(ctx: BaseAudioContext, scheduler: TickScheduler, opts: { segmentDuration?: number; lookahead?: number; maxPreRenderSegments?: number } = {}) {
    this.ctx = ctx;
    this.scheduler = scheduler;
    this.segmentDur = opts.segmentDuration || 0.5; // seconds
    this.lookahead = opts.lookahead || 0.25; // seconds
    this.maxPreRenderSegments = opts.maxPreRenderSegments;
  }

  private segmentKeyForTime(t: number) {
    return Math.floor(t / this.segmentDur) * this.segmentDur;
  }

  enqueueEvent(absTime: number, dur: number, renderFn: (offlineCtx: OfflineAudioContext) => void, chId?: number) {
    const segStart = this.segmentKeyForTime(absTime);
    const localStart = absTime - segStart;
    const arr = this.segments.get(segStart) || [];
    // store chId on event if provided so we can attribute scheduled nodes
    const ev = { localStart, dur, renderFn } as any;
    // allow caller to pass chId via renderFn closure or via parameter
    if ((renderFn as any).__chId !== undefined) ev.chId = (renderFn as any).__chId;
    if (typeof chId === 'number') ev.chId = chId;
    arr.push(ev);
    this.segments.set(segStart, arr);

    // If not already scheduled, schedule a render job for this segment
    if (!this.pendingRenders.has(segStart)) {
      // enforce max pre-render depth if configured
      if (typeof this.maxPreRenderSegments === 'number') {
        const pendingCount = this.pendingRenders.size;
        if (pendingCount >= this.maxPreRenderSegments) {
          // signal caller that we couldn't enqueue for pre-render (caller should fallback)
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
    // avoid double-render
    if (!this.pendingRenders.has(segStart)) return;
    this.pendingRenders.delete(segStart);
    const events = this.segments.get(segStart) || [];
    if (!events.length) return;

    const sampleRate = (this.ctx && (this.ctx as any).sampleRate) ? (this.ctx as any).sampleRate : 44100;
    const renderDur = this.segmentDur + 0.05;
    const length = Math.ceil(renderDur * sampleRate);
    const offline = new (globalThis as any).OfflineAudioContext(1, length, sampleRate) as OfflineAudioContext;

    // call each event's renderFn with the offline context; they should schedule nodes at local start times
    for (const ev of events) {
      try {
        ev.renderFn(offline);
      } catch (e) {
        // continue
      }
    }

    try {
      const rendered = await offline.startRendering();
      // schedule playback of the rendered buffer on the real context
      const src = (this.ctx as any).createBufferSource();
      src.buffer = rendered;
      src.loop = false;
      const gain = (this.ctx as any).createGain();
      src.connect(gain);
      gain.connect((this.ctx as any).destination);
      // start at the absolute segment start time
      try { src.start(segStart); } catch (e) { try { src.start(); } catch (_) {} }
      // stop after duration
      try { src.stop(segStart + renderDur); } catch (e) {}
      // track scheduled nodes so caller can stop/disconnect them if needed
      // attach chId info if events included it
      const chId = (events && events.length && (events[0] as any).chId) ? (events[0] as any).chId : undefined;
      this.scheduledNodes.push({ src, gain, segStart, chId });
    } catch (e) {
      // If OfflineAudioContext not available or rendering failed, fall back to firing events directly
      for (const ev of events) {
        try { ev.renderFn(undefined as any); } catch (_) {}
      }
    }
    // clear events for this segment
    this.segments.delete(segStart);
  }

  /**
   * Stop pending renders and scheduled playbacks. If `chId` is provided,
   * only stop nodes/events for that channel; otherwise stop everything.
   */
  stop(chId?: number) {
    if (typeof chId === 'number') {
      // remove matching events from segments and cancel renders for empty segments
      for (const [segStart, events] of Array.from(this.segments.entries())) {
        const remaining = events.filter((ev: any) => ev.chId !== chId);
        if (remaining.length) this.segments.set(segStart, remaining);
        else {
          this.segments.delete(segStart);
          this.pendingRenders.delete(segStart);
        }
      }
      // stop/disconnect scheduled nodes for this channel
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
      // stop all pending renders and scheduled nodes
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

  /**
   * Drain and return scheduled nodes (BufferSource + Gain) so callers can stop/disconnect them.
   * This empties the internal tracking list.
   */
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

  // Convenience helpers to enqueue specific instrument types
  enqueuePulse(absTime: number, freq: number, duty: number, dur: number, inst: any, chId?: number) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      // playPulseImpl expects ctx, freq, duty, start, dur, inst
      const local = absTime - (this.segmentKeyForTime(absTime));
      try { playPulseImpl(offlineCtx as any, freq, duty, local, dur, inst); } catch (e) {
        // ignore
      }
    }, chId);
    if (!enq) {
      // fallback: schedule direct playback on the real context
      this.scheduler.schedule(absTime, () => {
        try { playPulseImpl(this.ctx as any, freq, duty, absTime, dur, inst); } catch (_) {}
      });
    }
    return enq;
  }

  enqueueWavetable(absTime: number, freq: number, table: number[], dur: number, inst: any, chId?: number) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      const local = absTime - (this.segmentKeyForTime(absTime));
      try { playWavetableImpl(offlineCtx as any, freq, table, local, dur, inst); } catch (e) {
        // ignore
      }
    }, chId);
    if (!enq) {
      this.scheduler.schedule(absTime, () => {
        try { playWavetableImpl(this.ctx as any, freq, table, absTime, dur, inst); } catch (_) {}
      });
    }
    return enq;
  }

  enqueueNoise(absTime: number, dur: number, inst: any, chId?: number) {
    const enq = this.enqueueEvent(absTime, dur, (offlineCtx) => {
      const local = absTime - (this.segmentKeyForTime(absTime));
      try { playNoiseImpl(offlineCtx as any, local, dur, inst); } catch (e) {
        // ignore
      }
    }, chId);
    if (!enq) {
      this.scheduler.schedule(absTime, () => {
        try { playNoiseImpl(this.ctx as any, absTime, dur, inst); } catch (_) {}
      });
    }
    return enq;
  }
}

export default BufferedRenderer;
