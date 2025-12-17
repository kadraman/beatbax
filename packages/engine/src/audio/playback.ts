/**
 * WebAudio-based playback for BeatBax (migrated into engine package).
 */

type AST = any;
import { playPulse as playPulseImpl, parseEnvelope as pulseParseEnvelope } from '../chips/gameboy/pulse.js';
import { playWavetable as playWavetableImpl, parseWaveTable } from '../chips/gameboy/wave.js';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise.js';
import { noteNameToMidi, midiToFreq } from '../chips/gameboy/apu.js';
import TickScheduler from '../scheduler/tickScheduler.js';
import createScheduler from '../scheduler/index.js';
import BufferedRenderer from './bufferedRenderer.js';

export { midiToFreq, noteNameToMidi };
export { parseWaveTable };
export const parseEnvelope = pulseParseEnvelope;

/**
 * Create an AudioContext suitable for Node.js or browser environments.
 * In Node.js, dynamically imports standardized-audio-context polyfill.
 * In browser, uses native AudioContext.
 */
export async function createAudioContext(opts: { sampleRate?: number; offline?: boolean; duration?: number } = {}): Promise<any> {
  // Browser path: use native AudioContext
  if (typeof window !== 'undefined' && (globalThis as any).AudioContext) {
    const Ctor = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (opts.offline && opts.duration) {
      const OfflineAudioContextCtor = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext;
      const sampleRate = opts.sampleRate ?? 44100;
      const lengthInSamples = Math.ceil(opts.duration * sampleRate);
      return new OfflineAudioContextCtor(2, lengthInSamples, sampleRate);
    }
    return new Ctor({ sampleRate: opts.sampleRate });
  }
  
  // Node.js path: dynamically import standardized-audio-context polyfill
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
    console.error('Error loading standardized-audio-context:', error);
    throw new Error(`Failed to create AudioContext. Install standardized-audio-context for Node.js support: npm install standardized-audio-context (${error.message})`);
  }
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
  private bpmDefault = 120;
  private activeNodes: Array<{ node: any; chId: number }> = [];
  public muted = new Set<number>();
  public solo: number | null = null;
  public onSchedule?: (args: { chId: number; inst: any; token: string; time: number; dur: number }) => void;

  constructor(ctx?: AudioContext, opts: { buffered?: boolean; segmentDuration?: number; bufferedLookahead?: number; maxPreRenderSegments?: number } = {}) {
    const Ctor = (typeof window !== 'undefined' && (window as any).AudioContext) ? (window as any).AudioContext : (globalThis as any).AudioContext;
    this.ctx = ctx ?? new (Ctor || (globalThis as any).AudioContext)();
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
    const chip = (ast && (ast as any).chip) || 'gameboy';
    if (chip !== 'gameboy') {
      throw new Error(`Unsupported chip: ${chip}. Only 'gameboy' is supported at this time.`);
    }

    for (const ch of ast.channels || []) {
      const instsMap = (ast.insts || {});
      let currentInst = instsMap[ch.inst || ''];
      const tokens: any[] = Array.isArray(ch.pat) ? ch.pat : ['.'];
      let tempInst: any = null;
      let tempRemaining = 0;
      let bpm: number;
      if (typeof (ch as any).speed === 'number' && ast && typeof ast.bpm === 'number') bpm = ast.bpm * (ch as any).speed;
      else bpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : this.bpmDefault;
      const secondsPerBeat = 60 / bpm;
      const tickSeconds = secondsPerBeat / 4;

      const startTime = this.ctx.currentTime + 0.1;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const t = startTime + i * tickSeconds;
        if (token && typeof token === 'object' && token.type) {
          if (token.type === 'rest') {}
          else if (token.type === 'named') {
            const instProps = token.instProps || instsMap[token.instrument] || null;
            this.scheduleToken(ch.id, instProps, instsMap, token.token || token.instrument, t, tickSeconds);
          } else if (token.type === 'note') {
            const instProps = token.instProps || (tempRemaining > 0 && tempInst ? tempInst : currentInst);
            this.scheduleToken(ch.id, instProps, instsMap, token.token, t, tickSeconds);
            if (tempRemaining > 0) {
              tempRemaining -= 1;
              if (tempRemaining <= 0) { tempInst = null; tempRemaining = 0; }
            }
          }
          continue;
        }

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
        this.scheduleToken(ch.id, useInst, instsMap, token, t, tickSeconds);

        if (tempRemaining > 0 && token !== '.') {
          tempRemaining -= 1;
          if (tempRemaining <= 0) { tempInst = null; tempRemaining = 0; }
        }
      }
    }

    this.scheduler.start();
  }

  private scheduleToken(chId: number, inst: any, instsMap: Record<string, any>, token: string, time: number, dur: number) {
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
    const m = token.match(/^([A-G][#B]?)(-?\d+)$/i);
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
          buffered.enqueuePulse(time, freq, duty, dur, inst, chId);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playPulse(this.ctx, freq, duty, time, dur, inst, this.scheduler);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          buffered.enqueueWavetable(time, freq, wav, dur, inst, chId);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playWavetable(this.ctx, freq, wav, time, dur, inst, this.scheduler);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
        }
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        const buffered = (this as any)._buffered as any;
        if (buffered) {
          buffered.enqueueNoise(time, dur, inst, chId);
        } else {
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler);
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
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      }
    }
  }

  stop() {
    if (this.scheduler) {
      this.scheduler.clear();
      this.scheduler.stop();
    }
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
