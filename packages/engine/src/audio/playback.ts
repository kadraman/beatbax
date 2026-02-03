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

function playPulse(ctx: any, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode) {
  return playPulseImpl(ctx, freq, duty, start, dur, inst, scheduler, destination);
}

function playWavetable(ctx: any, freq: number, table: number[], start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode) {
  return playWavetableImpl(ctx, freq, table, start, dur, inst, scheduler, destination);
}

function playNoise(ctx: any, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode) {
  return playNoiseImpl(ctx, start, dur, inst, scheduler, destination);
}

export class Player {
  private ctx: AudioContext;
  private scheduler: TickScheduler;
  private bpmDefault = 128;
  private masterGain: GainNode | null = null;
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

    // Create or update master gain node
    // Default to 1.0 (matches hUGETracker behavior - no attenuation)
    const masterVolume = ast.volume !== undefined ? ast.volume : 1.0;
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    }
    this.masterGain.gain.setValueAtTime(masterVolume, this.ctx.currentTime);

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
          const nodes = playNoise(this.ctx, time, dur, alt, this.scheduler, this.masterGain || undefined);
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
          const capturedInst = inst;
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playPulse(this.ctx, freq, duty, time, dur, capturedInst, this.scheduler, this.masterGain || undefined);
            // apply inline token.effects first (e.g. C4<pan:-1>) then fallback to inline pan/inst pan
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds, capturedInst);
            // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
            this.tryApplyPan(this.ctx, nodes, panVal);
            this.tryScheduleEcho(nodes);
            this.tryScheduleRetriggers(nodes, freq, capturedInst, chId, token, tickSeconds, panVal);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          buffered.enqueueWavetable(time, freq, wav, dur, inst, chId, panVal);
        } else {
          const capturedInst = inst;
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playWavetable(this.ctx, freq, wav, time, dur, capturedInst, this.scheduler, this.masterGain || undefined);
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds, capturedInst);
            // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
            this.tryApplyPan(this.ctx, nodes, panVal);
            this.tryScheduleEcho(nodes);
            this.tryScheduleRetriggers(nodes, freq, capturedInst, chId, token, tickSeconds, panVal);
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
            const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler, this.masterGain || undefined);
            this.tryApplyEffects(this.ctx, nodes, token && token.effects ? token.effects : [], time, dur, chId, tickSeconds);
            // Apply panning first, before echo/retrigger, so panner is inserted before echo routing
            this.tryApplyPan(this.ctx, nodes, panVal);
            this.tryScheduleEcho(nodes);
            this.tryScheduleRetriggers(nodes, 0, inst, chId, token, tickSeconds, panVal);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      }
    } else {
      if (inst.type && inst.type.toLowerCase().includes('noise')) {
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler, this.masterGain || undefined);
          this.tryApplyPan(this.ctx, nodes, panVal);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      }
    }
  }

  // Apply registered effects for a scheduled note. `effectsArr` may be an array of
  // objects { type, params } produced by the parser (or legacy arrays). This will
  // look up handlers in the effects registry and invoke them.
  private tryApplyEffects(ctx: any, nodes: any[], effectsArr: any[], start: number, dur: number, chId?: number, tickSeconds?: number, inst?: any) {
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
          try { handler(ctx, nodes, params, start, dur, chId, tickSeconds, inst); } catch (e) {}
        }
      } catch (e) {}
    }
  }


  // Try to apply per-note panning. `nodes` is the array returned by play* functions
  // which typically is [oscillatorNode, gainNode]. We attempt to insert a StereoPannerNode
  // between the gain and the destination when available. `panSpec` may be:
  //  - an object { enum: 'L'|'R'|'C' } or { value: number }
  //  - a raw number or string

  // Schedule retriggered notes if retrigger effect was applied.
  // The retrigger effect handler stores metadata on the nodes array that we read here.
  private tryScheduleRetriggers(nodes: any[], freq: number, inst: any, chId: number, token: any, tickSeconds?: number, panVal?: any) {
    const retrigMeta = (nodes as any).__retrigger;
    if (!retrigMeta) return;

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
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const retrigNodes = playPulse(this.ctx, freq, duty, capturedTime, retrigDur, capturedInst, this.scheduler, this.masterGain || undefined);
          // Don't apply retrigger effect recursively, but apply other effects
          const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx: any) => {
            const fxType = fx && fx.type ? fx.type : fx;
            return fxType !== 'retrig';
          });
          this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
          this.tryApplyPan(this.ctx, retrigNodes, panVal);
          for (const n of retrigNodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(capturedInst.wave);
        this.scheduler.schedule(capturedTime, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const retrigNodes = playWavetable(this.ctx, freq, wav, capturedTime, retrigDur, capturedInst, this.scheduler, this.masterGain || undefined);
          const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx: any) => {
            const fxType = fx && fx.type ? fx.type : fx;
            return fxType !== 'retrig';
          });
          this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
          this.tryApplyPan(this.ctx, retrigNodes, panVal);
          for (const n of retrigNodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        this.scheduler.schedule(capturedTime, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const retrigNodes = playNoise(this.ctx, capturedTime, retrigDur, capturedInst, this.scheduler, this.masterGain || undefined);
          const effectsWithoutRetrig = (capturedToken && capturedToken.effects ? capturedToken.effects : []).filter((fx: any) => {
            const fxType = fx && fx.type ? fx.type : fx;
            return fxType !== 'retrig';
          });
          this.tryApplyEffects(this.ctx, retrigNodes, effectsWithoutRetrig, capturedTime, retrigDur, chId, tickSeconds, capturedInst);
          this.tryApplyPan(this.ctx, retrigNodes, panVal);
          for (const n of retrigNodes) this.activeNodes.push({ node: n, chId });
        });
      }

      retrigTime += intervalSec;
    }
  }

  // Schedule echo/delay effect if echo metadata was stored on the nodes array.
  // The echo effect handler stores metadata that we use here to create the delay routing.
  private tryScheduleEcho(nodes: any[]) {
    const echoMeta = (nodes as any).__echo;
    if (!echoMeta) return;

    const { delayTime, feedback, mix, start, dur } = echoMeta;

    try {
      // Find the gain node (typically nodes[1])
      const gainNode = nodes.length > 1 ? nodes[1] : nodes[0];
      if (!gainNode || !gainNode.connect) return;

      // Create delay effect nodes
      const delayNode = (this.ctx as any).createDelay(Math.max(5.0, delayTime * 4));
      const feedbackGain = (this.ctx as any).createGain();
      const wetGain = (this.ctx as any).createGain();
      const dryGain = (this.ctx as any).createGain();

      // Set parameters
      // mix controls wet/dry balance: mix=0 (all dry), mix=1 (all wet)
      const wetLevel = mix;
      const dryLevel = 1 - mix;

      try {
        delayNode.delayTime.setValueAtTime(delayTime, start);
        feedbackGain.gain.setValueAtTime(feedback, start);
        wetGain.gain.setValueAtTime(wetLevel, start);
        dryGain.gain.setValueAtTime(dryLevel, start);
      } catch (_) {
        delayNode.delayTime.value = delayTime;
        feedbackGain.gain.value = feedback;
        wetGain.gain.value = wetLevel;
        dryGain.gain.value = dryLevel;
      }

      // Find the destination (use masterGain if available)
      const destination = this.masterGain || (this.ctx as any).destination;

      // Disconnect gainNode from its current destination to avoid double-routing
      try {
        gainNode.disconnect();
      } catch (_) {
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
      let tailDuration: number;
      if (feedback < 0.001) {
        // Very low feedback - tail dies out quickly (just one repeat)
        tailDuration = delayTime * 2;
      } else if (feedback >= 0.999) {
        // Very high feedback - cap to prevent excessive duration
        tailDuration = Math.min(10.0, delayTime * 20);
      } else {
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
          feedbackGain.gain.setValueAtTime(feedback, (this.ctx as any).currentTime);
          feedbackGain.gain.linearRampToValueAtTime(0, (this.ctx as any).currentTime + 0.1);
        } catch (_) {
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
        } catch (_) {
          // Already disconnected or GC'd
        }
      });

    } catch (e) {
      // Echo routing failed, skip silently
    }
  }

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
      // Determine the actual destination (masterGain if available, otherwise ctx.destination)
      const dest = this.masterGain || (ctx as any).destination;
      // create StereoPannerNode if available
      const createPanner = (ctx as any).createStereoPanner;
      if (typeof createPanner === 'function') {
        const panner = (ctx as any).createStereoPanner();
        try { panner.pan.setValueAtTime(p, (ctx as any).currentTime); } catch (e) { try { (panner as any).pan.value = p; } catch (e2) {} }
        // Disconnect from all destinations (handles both masterGain and ctx.destination cases)
        try { gain.disconnect(); } catch (e) {}
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

