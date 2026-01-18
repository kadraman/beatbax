/**
 * WebAudio-based playback for BeatBax (engine package).
 */

type AST = any;
import { playPulse as playPulseImpl, parseEnvelope as pulseParseEnvelope } from '../chips/gameboy/pulse.js';
import { playWavetable as playWavetableImpl, parseWaveTable } from '../chips/gameboy/wave.js';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise.js';
import { noteNameToMidi, midiToFreq } from '../chips/gameboy/apu.js';
import TickScheduler from '../scheduler/tickScheduler.js';
import { error } from '../util/diag.js';
import createScheduler from '../scheduler/index.js';
import BufferedRenderer from './bufferedRenderer.js';
import { get as getEffect, clearEffectState } from '../effects/index.js';

export { midiToFreq, noteNameToMidi };
export { parseWaveTable };
export const parseEnvelope = pulseParseEnvelope;

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

export async function createAudioContext(opts: AudioContextOptions = {}): Promise<any> {
  const backend = opts.backend ?? 'auto';

  // Try browser if requested and available
  if (backend !== 'node-webaudio' && typeof window !== 'undefined' && (globalThis as any).AudioContext) {
    const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (opts.offline && opts.duration) {
      const OfflineAudioContextCtor = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
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
    } catch (error: any) {
      if (backend === 'node-webaudio') {
        throw new Error(`Failed to load 'standardized-audio-context'. Is it installed? (${error.message})`);
      }
      // If auto, we might just fail later if no context is found
    }
  }

  throw new Error(`No compatible AudioContext found for backend: ${backend}`);
}

function playPulse(ctx: any, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any) {
  return playPulseImpl(ctx, freq, duty, start, dur, inst, scheduler);
}

function playWavetable(ctx: any, freq: number, table: number[], start: number, dur: number, inst: any, scheduler?: any) {
  return playWavetableImpl(ctx, freq, table, start, dur, inst, scheduler);
}

function playNoise(ctx: any, start: number, dur: number, inst: any, scheduler?: any) {
  return playNoiseImpl(ctx, start, dur, inst, scheduler);
}

export class Player {
  private ctx: AudioContext;
  private scheduler: TickScheduler;
  private bpmDefault = 128;
  private activeNodes: Array<{ node: any; chId: number }> = [];
  public muted = new Set<number>();
  public solo: number | null = null;
  public onSchedule?: (args: { chId: number; inst: any; token: string; time: number; dur: number }) => void;
  private _repeatTimer: any = null;

  constructor(ctx?: any, opts: { buffered?: boolean; segmentDuration?: number; bufferedLookahead?: number; maxPreRenderSegments?: number } = {}) {
    if (!ctx) {
      const Ctor = (typeof window !== 'undefined' && (window as any).AudioContext) ? (window as any).AudioContext : (globalThis as any).AudioContext;
      if (!Ctor) {
        throw new Error('No AudioContext constructor found. Please provide an AudioContext to the Player constructor or ensure one is available globally.');
      }
      this.ctx = new Ctor();
    } else {
      this.ctx = ctx;
    }
    this.scheduler = createScheduler(this.ctx) as TickScheduler;
    if (opts.buffered) {
      (this as any)._buffered = new BufferedRenderer(this.ctx, this.scheduler as any, { segmentDuration: opts.segmentDuration, lookahead: opts.bufferedLookahead, maxPreRenderSegments: opts.maxPreRenderSegments });
    }
  }

  async playAST(ast: AST) {
    try {
      if (this.ctx && typeof (this.ctx as any).resume === 'function') {
        try {
          const st = (this.ctx as any).state;
          if (st === 'suspended') await (this.ctx as any).resume();
        } catch (e) {}
      }
    } catch (e) {}

    // ensure a clean slate for each playback run
    try { this.stop(); } catch (e) {}

    const chip = ast.chip || 'gameboy';
    if (chip !== 'gameboy') {
      throw new Error(`Unsupported chip: ${chip}. Only 'gameboy' is supported at this time.`);
    }

    // Track estimated playback duration (seconds) across channels for repeat scheduling
    let globalDurationSec = 0;

    // Clone the instrument table to avoid in-place mutations during scheduling/playback
    // Use structuredClone when available for correctness and performance, fallback to JSON clone.
    const rootInsts = ast.insts || {};
    const instsRootClone = (typeof (globalThis as any).structuredClone === 'function')
      ? (globalThis as any).structuredClone(rootInsts)
      : JSON.parse(JSON.stringify(rootInsts));

    // Store chip info in context for effects to access (e.g., for chip-specific frame rates)
    (this.ctx as any)._chipType = ast.chip || 'gameboy';

    for (const ch of ast.channels || []) {
      const instsMap = instsRootClone;
      let currentInst = instsMap[ch.inst || ''];
      const tokens: any[] = Array.isArray((ch as any).events) ? (ch as any).events : (Array.isArray(ch.pat) ? ch.pat : ['.']);
      let tempInst: any = null;
      let tempRemaining = 0;
      let bpm: number;
      if (typeof (ch as any).speed === 'number' && ast && typeof ast.bpm === 'number') bpm = ast.bpm * (ch as any).speed;
      else bpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : this.bpmDefault;
      const secondsPerBeat = 60 / bpm;
      const tickSeconds = secondsPerBeat / 4;

      const startTime = this.ctx.currentTime + 0.1;
      // estimate channel duration in seconds from token count and ticks
      let lastEndTimeForThisChannel = 0;

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const t = startTime + i * tickSeconds;

        if (token && typeof token === 'object' && token.type) {
          if (token.type === 'rest' || token.type === 'sustain') {
            // ignore explicit rest/sustain objects here
          } else {
            let sustainCount = 0;
            for (let j = i + 1; j < tokens.length; j++) {
              const next = tokens[j];
              if (next && typeof next === 'object' && next.type === 'sustain') sustainCount++;
              else if (next === '_' || next === '-') sustainCount++;
              else break;
            }
            const dur = tickSeconds * (1 + sustainCount);

            if (token.type === 'named') {
              const instProps = token.instProps || instsMap[token.instrument] || null;
              this.scheduleToken(ch.id, instProps, instsMap, token.token || token.instrument, t, dur, tickSeconds);
            } else if (token.type === 'note') {
              const instProps = token.instProps || (tempRemaining > 0 && tempInst ? tempInst : currentInst);
              // Pass the full token object so scheduleToken can honour inline pan/effects
              this.scheduleToken(ch.id, instProps, instsMap, token, t, dur, tickSeconds);
              if (tempRemaining > 0) {
                tempRemaining -= 1;
                if (tempRemaining <= 0) { tempInst = null; tempRemaining = 0; }
              }
            }
            lastEndTimeForThisChannel = Math.max(lastEndTimeForThisChannel, t + dur);
          }
          continue;
        }

        if (token === '_' || token === '-') continue;

        const mInstInline = typeof token === 'string' && token.match(/^inst\(([^,()\s]+)(?:,(\d+))?\)$/i);
        if (mInstInline) {
          const name = mInstInline[1];
          const count = mInstInline[2] ? parseInt(mInstInline[2], 10) : null;
          const resolved = instsMap[name];
          if (count && resolved) {
            tempInst = resolved;
            tempRemaining = count;
          } else if (resolved) {
            currentInst = resolved;
          }
          continue;
        }

        const useInst = tempRemaining > 0 && tempInst ? tempInst : currentInst;

        // Calculate duration by looking ahead for sustains
        let sustainCount = 0;
        for (let j = i + 1; j < tokens.length; j++) {
          const next = tokens[j];
          if (next && typeof next === 'object' && next.type === 'sustain') sustainCount++;
          else if (next === '_' || next === '-') sustainCount++;
          else break;
        }
        const dur = tickSeconds * (1 + sustainCount);

        this.scheduleToken(ch.id, useInst, instsMap, token, t, dur, tickSeconds);
        lastEndTimeForThisChannel = Math.max(lastEndTimeForThisChannel, t + dur);

        if (tempRemaining > 0 && token !== '.') {
          tempRemaining -= 1;
          if (tempRemaining <= 0) { tempInst = null; tempRemaining = 0; }
        }
      }

      // convert channel end (absolute) into a channel duration relative to startTime
      const channelDuration = lastEndTimeForThisChannel > 0 ? (lastEndTimeForThisChannel - (this.ctx.currentTime + 0.1)) : (tokens.length * tickSeconds);
      globalDurationSec = Math.max(globalDurationSec, channelDuration);
    }

    // start the scheduler to begin firing scheduled events
    this.scheduler.start();

    // debug: show estimated global duration for repeat scheduling
    try { console.debug('[player] estimated globalDurationSec=', globalDurationSec); } catch (e) {}

    // If AST requests repeat/looping, schedule a restart when playback ends
    try {
      if (ast.play?.repeat) {
        const delayMs = Math.max(10, Math.round(globalDurationSec * 1000) + 50);
        try { console.debug('[player] scheduling repeat in ms=', delayMs); } catch (e) {}
        if (this._repeatTimer) clearTimeout(this._repeatTimer);
        this._repeatTimer = setTimeout(() => {
          try {
            try { console.debug('[player] repeat timer fired - restarting playback'); } catch (e) {}
            this.stop();
            // replay AST (fire-and-forget)
            this.playAST(ast).catch((e: any) => { error('player', 'Repeat playback failed: ' + (e && e.message ? e.message : String(e))); });
          } catch (e) {}
        }, delayMs);
      }
    } catch (e) {}
  }

  private scheduleToken(chId: number, inst: any, instsMap: Record<string, any>, token: any, time: number, dur: number, tickSeconds?: number) {
    if (token === '.') return;
    if (instsMap && typeof token === 'string' && instsMap[token]) {
      const alt = instsMap[token];
      if (alt.type && String(alt.type).toLowerCase().includes('noise')) {
        try { if (typeof (this as any).onSchedule === 'function') { (this as any).onSchedule({ chId, inst: alt, token, time, dur }); } } catch (e) {}
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playNoise(this.ctx, time, dur, alt);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
        return;
      }
      inst = alt;
    }
    if (!inst) return;
    try { if (typeof (this as any).onSchedule === 'function') { (this as any).onSchedule({ chId, inst, token, time, dur }); } } catch (e) {}

    // token may be a string like "C4" or an object with { type: 'note', token: 'C4', pan, effects }
    let tokenStr: string = typeof token === 'string' ? token : (token && token.token ? token.token : '');
    // compute pan if present: inline token pan takes precedence; inst pan as fallback
    const panVal = (token && token.pan) ? token.pan : (inst && (inst['gb:pan'] || inst['pan']) ? inst['gb:pan'] || inst['pan'] : undefined);

    const m = (typeof tokenStr === 'string' && tokenStr.match(/^([A-G][#B]?)(-?\d+)$/i)) || null;
    if (m) {
      const note = m[1].toUpperCase();
      const octave = parseInt(m[2], 10);
      const midi = noteNameToMidi(note, octave);
      if (midi === null) return;
      const freq = midiToFreq(midi);
      if (inst.type && inst.type.toLowerCase().includes('pulse')) {
        const duty = inst.duty ? parseFloat(inst.duty) / 100 : 0.5;
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          // For buffered rendering, attach pan info into queued item for later panning processing
          buffered.enqueuePulse(time, freq, duty, dur, inst, chId, panVal);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playPulse(this.ctx, freq, duty, time, dur, inst, this.scheduler);
            // apply inline token.effects first (e.g. C4<pan:-1>) then fallback to inline pan/inst pan
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds);
            this.tryApplyPan(this.ctx, nodes, panVal);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          buffered.enqueueWavetable(time, freq, wav, dur, inst, chId, panVal);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playWavetable(this.ctx, freq, wav, time, dur, inst, this.scheduler);
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds);
            this.tryApplyPan(this.ctx, nodes, panVal);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          buffered.enqueueNoise(time, dur, inst, chId, panVal);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler);
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds);
            this.tryApplyPan(this.ctx, nodes, panVal);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      }
    } else {
      if (inst.type && inst.type.toLowerCase().includes('noise')) {
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler);
          this.tryApplyPan(this.ctx, nodes, panVal);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      }
    }
  }

  // Apply registered effects for a scheduled note. `effectsArr` may be an array of
  // objects { type, params } produced by the parser (or legacy arrays). This will
  // look up handlers in the effects registry and invoke them.
  private tryApplyEffects(ctx: any, nodes: any[], effectsArr: any[], start: number, dur: number, chId?: number, tickSeconds?: number) {
    if (!Array.isArray(effectsArr) || effectsArr.length === 0) return;
    for (const fx of effectsArr) {
      try {
        const name = fx && fx.type ? fx.type : fx;
        // Prefer resolver-provided durationSec when available; inject into params[3]
        let params = fx && fx.params ? fx.params : (Array.isArray(fx) ? fx : []);
        if (fx && typeof fx.durationSec === 'number') {
          const pcopy = Array.isArray(params) ? params.slice() : [];
          pcopy[3] = fx.durationSec;
          params = pcopy;
        }
        const handler = getEffect(name);
        if (handler) {
          try { handler(ctx, nodes, params, start, dur, chId, tickSeconds); } catch (e) {}
        }
      } catch (e) {}
    }
  }


  // Try to apply per-note panning. `nodes` is the array returned by play* functions
  // which typically is [oscillatorNode, gainNode]. We attempt to insert a StereoPannerNode
  // between the gain and the destination when available. `panSpec` may be:
  //  - an object { enum: 'L'|'R'|'C' } or { value: number }
  //  - a raw number or string
  private tryApplyPan(ctx: any, nodes: any[], panSpec: any) {
    if (!panSpec) return;
    let p = undefined as number | undefined;
    if (typeof panSpec === 'number') p = Math.max(-1, Math.min(1, panSpec));
    else if (typeof panSpec === 'string') {
      const s = panSpec.toUpperCase();
      if (s === 'L') p = -1;
      else if (s === 'R') p = 1;
      else if (s === 'C') p = 0;
      else { const n = Number(panSpec); if (!Number.isNaN(n)) p = Math.max(-1, Math.min(1, n)); }
    } else if (typeof panSpec === 'object') {
      if (panSpec.value !== undefined) p = Math.max(-1, Math.min(1, Number(panSpec.value)));
      else if (panSpec.enum) {
        const s = String(panSpec.enum).toUpperCase(); if (s === 'L') p = -1; else if (s === 'R') p = 1; else p = 0;
      }
    }
    if (p === undefined) return;

    try {
      const gain = nodes && nodes.length >= 2 ? nodes[1] : null;
      if (!gain || typeof gain.connect !== 'function') return;
      const dest = (ctx as any).destination;
      // create StereoPannerNode if available
      const createPanner = (ctx as any).createStereoPanner;
      if (typeof createPanner === 'function') {
        const panner = (ctx as any).createStereoPanner();
        try { panner.pan.setValueAtTime(p, (ctx as any).currentTime); } catch (e) { try { (panner as any).pan.value = p; } catch (e2) {} }
        try { gain.disconnect(dest); } catch (e) {}
        gain.connect(panner);
        panner.connect(dest);
        // also track panner node so stop/cleanup will disconnect it
        this.activeNodes.push({ node: panner, chId: -1 });
      } else {
        // StereoPanner not available — best-effort: do nothing or optionally implement left/right gains
        // For now, we silently skip (no pan) to avoid complex signal routing.
      }
    } catch (e) {
      // swallow errors — panning is best-effort
    }
  }

  stop() {
    if (this._repeatTimer) {
      try { clearTimeout(this._repeatTimer); } catch (e) {}
      this._repeatTimer = null;
    }
    if (this.scheduler) {
      this.scheduler.clear();
      this.scheduler.stop();
    }

    // Clear effect state (e.g., portamento frequency tracking)
    clearEffectState();

    for (const entry of this.activeNodes) {
      try { if (entry.node && typeof entry.node.stop === 'function') entry.node.stop(); } catch (e) {}
      try { if (entry.node && typeof entry.node.disconnect === 'function') entry.node.disconnect(); } catch (e) {}
    }
    this.activeNodes = [];
    try {
      const buffered = (this as any)._buffered as any;
      if (buffered && typeof buffered.drainScheduledNodes === 'function') {
        const nodes = buffered.drainScheduledNodes();
        for (const n of nodes) {
          try { if (n.src && typeof n.src.stop === 'function') n.src.stop(); } catch (_) {}
          try { if (n.src && typeof n.src.disconnect === 'function') n.src.disconnect(); } catch (_) {}
          try { if (n.gain && typeof n.gain.disconnect === 'function') n.gain.disconnect(); } catch (_) {}
        }
      }
    } catch (e) {}
  }

  toggleChannelMute(chId: number) {
    if (this.muted.has(chId)) this.muted.delete(chId);
    else this.muted.add(chId);
  }

  toggleChannelSolo(chId: number) {
    if (this.solo === chId) this.solo = null;
    else this.solo = chId;
  }

  stopChannel(chId: number) {
    const keep: Array<{ node: any; chId: number }> = [];
    for (const entry of this.activeNodes) {
      if (entry.chId === chId) {
        try { if (entry.node && typeof entry.node.stop === 'function') entry.node.stop(); } catch (e) {}
        try { if (entry.node && typeof entry.node.disconnect === 'function') entry.node.disconnect(); } catch (e) {}
      } else {
        keep.push(entry);
      }
    }
    this.activeNodes = keep;
    try {
      const buffered = (this as any)._buffered as any;
      if (buffered && typeof buffered.stop === 'function') {
        buffered.stop(chId);
      }
    } catch (e) {}
  }
}

export default Player;

