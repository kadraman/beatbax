/**
 * WebAudio-based playback for BeatBax (Day 2 target).
 *
 * Provides a Player class that accepts a parsed AST (from `src/parser`) and
 * performs deterministic scheduling using the WebAudio API. This file is
 * intended to run in a browser environment where `window.AudioContext` exists.
 */

type AST = any;
import { playPulse as playPulseImpl, parseEnvelope as pulseParseEnvelope } from '../chips/gameboy/pulse';
import { playWavetable as playWavetableImpl, parseWaveTable } from '../chips/gameboy/wave';
import { playNoise as playNoiseImpl } from '../chips/gameboy/noise';
import { noteNameToMidi, midiToFreq } from '../chips/gameboy/apu';
import TickScheduler from '../scheduler/tickScheduler';
import createScheduler from '../scheduler';
import BufferedRenderer from './bufferedRenderer';

// Re-export helpers for backward compatibility (tests and demo expect these from playback)
export { midiToFreq, noteNameToMidi };
export { parseWaveTable };
export const parseEnvelope = pulseParseEnvelope;

// Local wrappers with stable names so transpiled scheduled functions include
// the readable identifier (tests inspect function source strings).
function playPulse(ctx: any, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any) {
  return playPulseImpl(ctx, freq, duty, start, dur, inst, scheduler);
}

function playWavetable(ctx: any, freq: number, table: number[], start: number, dur: number, inst: any, scheduler?: any) {
  return playWavetableImpl(ctx, freq, table, start, dur, inst, scheduler);
}

function playNoise(ctx: any, start: number, dur: number, inst: any, scheduler?: any) {
  return playNoiseImpl(ctx, start, dur, inst, scheduler);
}

// The `TickScheduler` implementation (in `src/scheduler/tickScheduler.ts`) is used
// for deterministic scheduling. It leverages `AudioContext.currentTime` and a
// configurable lookahead to schedule audio events precisely.

/** Player: constructs channels and schedules notes from the AST */
export class Player {
  private ctx: AudioContext;
  private scheduler: TickScheduler;
  private bpmDefault = 120;
  private activeNodes: Array<{ node: any; chId: number }> = [];
  public muted = new Set<number>();
  public solo: number | null = null;
  // Optional hook called whenever a token is scheduled. Useful for tests.
  public onSchedule?: (args: { chId: number; inst: any; token: string; time: number; dur: number }) => void;

  constructor(ctx?: AudioContext, opts: { buffered?: boolean; segmentDuration?: number; bufferedLookahead?: number; maxPreRenderSegments?: number } = {}) {
    const Ctor = (typeof window !== 'undefined' && (window as any).AudioContext) ? (window as any).AudioContext : (globalThis as any).AudioContext;
    this.ctx = ctx ?? new (Ctor || (globalThis as any).AudioContext)();
    this.scheduler = createScheduler(this.ctx) as TickScheduler;
    if (opts.buffered) {
      (this as any)._buffered = new BufferedRenderer(this.ctx, this.scheduler as any, { segmentDuration: opts.segmentDuration, lookahead: opts.bufferedLookahead, maxPreRenderSegments: opts.maxPreRenderSegments });
    }
  }

  /** Build and play a parsed song AST. */
  async playAST(ast: AST) {
    // simple model: iterate channels and schedule tokens sequentially
    // each token is one tick; tick duration derived from BPM
    // Ensure AudioContext is resumed on user gesture (fixes browser autoplay policies)
    try {
      if (this.ctx && typeof (this.ctx as any).resume === 'function') {
        // only resume if suspended
        try {
          const st = (this.ctx as any).state;
          if (st === 'suspended') await (this.ctx as any).resume();
        } catch (e) {
          // ignore resume errors
        }
      }
    } catch (e) {}
    // Validate chip selection: default to 'gameboy' if not provided. If another
    // chip is requested and not supported, throw a clear error.
    const chip = (ast && (ast as any).chip) || 'gameboy';
    if (chip !== 'gameboy') {
      throw new Error(`Unsupported chip: ${chip}. Only 'gameboy' is supported at this time.`);
    }

    for (const ch of ast.channels || []) {
      const instsMap = (ast.insts || {});
      let currentInst = instsMap[ch.inst || ''];
      // tokens may be an array of strings (pre-resolution) or event objects (resolved ISM)
      const tokens: any[] = Array.isArray(ch.pat) ? ch.pat : ['.'];
      // temporary inline override state
      let tempInst: any = null;
      let tempRemaining = 0;
      // Determine effective BPM: channel.bpm overrides; otherwise use channel.speed * ast.bpm if present;
      // finally fall back to player default.
      let bpm: number;
      if (typeof (ch as any).bpm === 'number') bpm = (ch as any).bpm;
      else if (typeof (ch as any).speed === 'number' && ast && typeof ast.bpm === 'number') bpm = ast.bpm * (ch as any).speed;
      else bpm = (ast && typeof ast.bpm === 'number') ? ast.bpm : this.bpmDefault;
      const secondsPerBeat = 60 / bpm;
      const tickSeconds = secondsPerBeat / 4; // 16th note resolution

      const startTime = this.ctx.currentTime + 0.1; // slight offset
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const t = startTime + i * tickSeconds;

        // If token is a resolved event object, prefer its instProps
        if (token && typeof token === 'object' && token.type) {
          // token is an event object produced by resolver
          if (token.type === 'rest') {
            // nothing to schedule
          } else if (token.type === 'named') {
            const instProps = token.instProps || instsMap[token.instrument] || null;
            // schedule named instrument event (like snare) using instProps if available
            this.scheduleToken(ch.id, instProps, instsMap, token.token || token.instrument, t, tickSeconds);
          } else if (token.type === 'note') {
            const instProps = token.instProps || (tempRemaining > 0 && tempInst ? tempInst : currentInst);
            this.scheduleToken(ch.id, instProps, instsMap, token.token, t, tickSeconds);
            // decrement temporary override only for note events
            if (tempRemaining > 0) {
              tempRemaining -= 1;
              if (tempRemaining <= 0) { tempInst = null; tempRemaining = 0; }
            }
          }
          continue;
        }

        // inline instrument token handling: inst(name) or inst(name,N)
        const mInstInline = typeof token === 'string' && token.match(/^inst\(([^,()\s]+)(?:,(\d+))?\)$/i);
        if (mInstInline) {
          const name = mInstInline[1];
          const count = mInstInline[2] ? parseInt(mInstInline[2], 10) : null;
          const resolved = instsMap[name];
          if (count && resolved) {
            tempInst = resolved;
            tempRemaining = count;
          } else if (resolved) {
            // permanent inline change
            currentInst = resolved;
          }
          // inst(...) token does not itself produce sound, continue
          continue;
        }

        // choose which instrument to use for this token (string token path)
        const useInst = tempRemaining > 0 && tempInst ? tempInst : currentInst;

        // schedule the token with the selected instrument
        this.scheduleToken(ch.id, useInst, instsMap, token, t, tickSeconds);

        // decrement temporary override only for tokens that produce events (not rests or inst tokens)
        if (tempRemaining > 0 && token !== '.') {
          tempRemaining -= 1;
          if (tempRemaining <= 0) {
            tempInst = null;
            tempRemaining = 0;
          }
        }
      }
    }

    this.scheduler.start();
  }

  private scheduleToken(chId: number, inst: any, instsMap: Record<string, any>, token: string, time: number, dur: number) {
    // Allow token to reference a named instrument (e.g., 'snare' or 'hihat')
    if (token === '.') return; // rest
    if (instsMap && typeof token === 'string' && instsMap[token]) {
      const alt = instsMap[token];
      // If the referenced instrument is noise, schedule it immediately on this tick
      if (alt.type && String(alt.type).toLowerCase().includes('noise')) {
        try { console.log('[beatbax] scheduling named noise', { chId, token, time, dur }); } catch (e) {}
        // Invoke test hook so UI indicators/counters receive this scheduling
        try {
          if (typeof (this as any).onSchedule === 'function') {
            (this as any).onSchedule({ chId, inst: alt, token, time, dur });
          }
        } catch (e) { /* swallow */ }
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          try { console.log('[beatbax] firing named noise', { chId, token, time }); } catch (e) {}
          const nodes = playNoise(this.ctx, time, dur, alt);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
        return;
      }
      // Otherwise, fall through and set inst to the referenced instrument (for note playback)
      inst = alt;
    }
    if (!inst) return; // nothing to play

    // Invoke test hook if present so tests can assert scheduling parameters
    try {
      if (typeof (this as any).onSchedule === 'function') {
        (this as any).onSchedule({ chId, inst, token, time, dur });
      }
    } catch (e) { /* swallow hook errors */ }

    // Note may be a note name like C5 or 'x' for drum hit. Try to resolve MIDI
    const m = token.match(/^([A-G][#B]?)(-?\d+)$/i);
    if (m) {
      // convert note string to midi using simple lookup
      const note = m[1].toUpperCase();
      const octave = parseInt(m[2], 10);
      const midi = noteNameToMidi(note, octave);
      if (midi === null) return;
      const freq = midiToFreq(midi);
      // schedule per inst.type
      if (inst.type && inst.type.toLowerCase().includes('pulse')) {
        const duty = inst.duty ? parseFloat(inst.duty) / 100 : 0.5;
        // log immediately when scheduling so we can see attempts in the console
        try { console.log('[beatbax] scheduling pulse', { chId, freq, duty, time, dur }); } catch (e) {}
          const buffered = (this as any)._buffered as any;
          if (buffered) {
            buffered.enqueuePulse(time, freq, duty, dur, inst, chId);
          } else {
            this.scheduler.schedule(time, () => {
              if (this.solo !== null && this.solo !== chId) return;
              if (this.muted.has(chId)) return;
              // runtime guard/log
              try { console.log('[beatbax] firing pulse', { chId, freq, time }); } catch (e) {}
              const nodes = playPulse(this.ctx, freq, duty, time, dur, inst, this.scheduler);
              for (const n of nodes) this.activeNodes.push({ node: n, chId });
            });
          }
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        try { console.log('[beatbax] scheduling wavetable', { chId, freq, time, dur }); } catch (e) {}
          const buffered = (this as any)._buffered as any;
          if (buffered) {
            buffered.enqueueWavetable(time, freq, wav, dur, inst, chId);
          } else {
            this.scheduler.schedule(time, () => {
              if (this.solo !== null && this.solo !== chId) return;
              if (this.muted.has(chId)) return;
              try { console.log('[beatbax] firing wavetable', { chId, freq, time }); } catch (e) {}
              const nodes = playWavetable(this.ctx, freq, wav, time, dur, inst, this.scheduler);
              for (const n of nodes) this.activeNodes.push({ node: n, chId });
            });
          }
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        // noise uses only envelope; schedule a noise burst
            try { console.log('[beatbax] scheduling noise', { chId, time, dur }); } catch (e) {}
            const buffered = (this as any)._buffered as any;
            if (buffered) {
              buffered.enqueueNoise(time, dur, inst, chId);
            } else {
              this.scheduler.schedule(time, () => {
                if (this.solo !== null && this.solo !== chId) return;
                if (this.muted.has(chId)) return;
                try { console.log('[beatbax] firing noise', { chId, time }); } catch (e) {}
                const nodes = playNoise(this.ctx, time, dur, inst, this.scheduler);
                for (const n of nodes) this.activeNodes.push({ node: n, chId });
              });
            }
      }
    } else {
      // token can be 'x' etc. for noise hits
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
  
  /** Stop playback: clear scheduler and stop any active nodes. */
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

    // If using buffered renderer, drain its scheduled nodes and stop/disconnect them as well
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
    } catch (e) {
      // swallow any errors during buffered cleanup
    }
  }

  toggleChannelMute(chId: number) {
    if (this.muted.has(chId)) this.muted.delete(chId);
    else this.muted.add(chId);
  }

  toggleChannelSolo(chId: number) {
    if (this.solo === chId) this.solo = null;
    else this.solo = chId;
  }

  /**
   * Stop playback for a specific channel: stops live-scheduled nodes and
   * any buffered pre-rendered BufferSource nodes attributed to the channel.
   */
  stopChannel(chId: number) {
    // stop live active nodes for this channel
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

    // tell buffered renderer to stop any pending/scheduled nodes for this channel
    try {
      const buffered = (this as any)._buffered as any;
      if (buffered && typeof buffered.stop === 'function') {
        buffered.stop(chId);
      }
    } catch (e) { /* swallow */ }
  }

}

export default Player;
