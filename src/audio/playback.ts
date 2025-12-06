/**
 * WebAudio-based playback for BeatBax (Day 2 target).
 *
 * Provides a Player class that accepts a parsed AST (from `src/parser`) and
 * performs deterministic scheduling using the WebAudio API. This file is
 * intended to run in a browser environment where `window.AudioContext` exists.
 */

type AST = any;

/** Utility: convert MIDI note number to frequency (Hz). */
export function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Create a PeriodicWave representing a pulse wave with given duty (0..1). */
function createPulsePeriodicWave(ctx: BaseAudioContext, duty = 0.5) {
  // Build a simple waveform in the time domain and transform to Fourier series
  const size = 4096;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);

  // Synthesize a band-limited pulse by adding harmonics
  const maxHarm = 200;
  for (let n = 1; n <= maxHarm; n++) {
    const k = n;
    const a = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    real[k] = 0;
    imag[k] = a;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

/** Simple deterministic scheduler for note events. */
class Scheduler {
  private ctx: BaseAudioContext;
  private lookahead = 0.1; // seconds
  private interval = 25; // ms
  private timer: any = null;
  private queue: Array<{ time: number; fn: () => void }> = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  schedule(time: number, fn: () => void) {
    this.queue.push({ time, fn });
    this.queue.sort((a, b) => a.time - b.time);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  clear() {
    this.queue = [];
  }

  private tick() {
    const now = this.ctx.currentTime;
    const cutoff = now + this.lookahead;
    while (this.queue.length && this.queue[0].time <= cutoff) {
      const ev = this.queue.shift()!;
      try { ev.fn(); } catch (e) { console.error('Scheduled function error', e); }
    }
  }
}

/** Player: constructs channels and schedules notes from the AST */
export class Player {
  private ctx: AudioContext;
  private scheduler: Scheduler;
  private bpmDefault = 120;
  private activeNodes: Array<{ node: any; chId: number }> = [];
  public muted = new Set<number>();
  public solo: number | null = null;

  constructor(ctx?: AudioContext) {
    const Ctor = (typeof window !== 'undefined' && (window as any).AudioContext) ? (window as any).AudioContext : (globalThis as any).AudioContext;
    this.ctx = ctx ?? new (Ctor || (globalThis as any).AudioContext)();
    this.scheduler = new Scheduler(this.ctx);
  }

  /** Build and play a parsed song AST. */
  async playAST(ast: AST) {
    // simple model: iterate channels and schedule tokens sequentially
    // each token is one tick; tick duration derived from BPM
    for (const ch of ast.channels || []) {
      const instsMap = (ast.insts || {});
      let currentInst = instsMap[ch.inst || ''];
      const tokens: string[] = Array.isArray(ch.pat) ? ch.pat : ['.'];
      // temporary inline override state
      let tempInst: any = null;
      let tempRemaining = 0;
      const bpm = ch.bpm || this.bpmDefault;
      const secondsPerBeat = 60 / bpm;
      const tickSeconds = secondsPerBeat / 4; // 16th note resolution

      const startTime = this.ctx.currentTime + 0.1; // slight offset
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const t = startTime + i * tickSeconds;

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

        // choose which instrument to use for this token
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
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          // runtime guard/log
          try { console.log('[beatbax] firing pulse', { chId, freq, time }); } catch (e) {}
          const nodes = playPulse(this.ctx, freq, duty, time, dur, inst);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        try { console.log('[beatbax] scheduling wavetable', { chId, freq, time, dur }); } catch (e) {}
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          try { console.log('[beatbax] firing wavetable', { chId, freq, time }); } catch (e) {}
          const nodes = playWavetable(this.ctx, freq, wav, time, dur, inst);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        // noise uses only envelope; schedule a noise burst
          try { console.log('[beatbax] scheduling noise', { chId, time, dur }); } catch (e) {}
          this.scheduler.schedule(time, () => {
            if (this.solo !== null && this.solo !== chId) return;
            if (this.muted.has(chId)) return;
            try { console.log('[beatbax] firing noise', { chId, time }); } catch (e) {}
            const nodes = playNoise(this.ctx, time, dur, inst);
            for (const n of nodes) this.activeNodes.push({ node: n, chId });
          });
      }
    } else {
      // token can be 'x' etc. for noise hits
      if (inst.type && inst.type.toLowerCase().includes('noise')) {
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playNoise(this.ctx, time, dur, inst);
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
  }

  toggleChannelMute(chId: number) {
    if (this.muted.has(chId)) this.muted.delete(chId);
    else this.muted.add(chId);
  }

  toggleChannelSolo(chId: number) {
    if (this.solo === chId) this.solo = null;
    else this.solo = chId;
  }

}

/** Helpers */
export function noteNameToMidi(name: string, octave: number): number | null {
  const m = name.match(/^([A-G])([#B]?)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = (m[2] || '').toUpperCase();
  const map: Record<string, number> = { C:0, 'C#':1, DB:1, D:2, 'D#':3, EB:3, E:4, F:5, 'F#':6, GB:6, G:7, 'G#':8, AB:8, A:9, 'A#':10, BB:10, B:11 };
  const key = letter + (acc === 'B' ? 'B' : (acc === '#' ? '#' : ''));
  const semi = map[key as keyof typeof map];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

export function parseWaveTable(raw: any): number[] {
  if (!raw) return [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  if (Array.isArray(raw)) return raw.map(n => Number(n) || 0);
  // attempt to parse string like [0,1,2]
  try {
    const s = String(raw);
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(n => Number(n) || 0);
  } catch (_) {}
  return [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
}

/** Play a pulse note with given frequency, duty, duration and inst props. */
function playPulse(ctx: BaseAudioContext, freq: number, duty: number, start: number, dur: number, inst: any) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const pw = createPulsePeriodicWave(ctx, duty);
  try { osc.setPeriodicWave(pw); } catch (e) {
    // Some older implementations throw when using setPeriodicWave on a default oscillator.
    // Fallback to a square oscillator so the channel remains audible for debugging.
    try {
      (osc as any).type = 'square';
    } catch (e2) {
      console.warn('Could not set oscillator type fallback', e2);
    }
    console.warn('setPeriodicWave failed, falling back to square oscillator', e);
  }
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  // envelope
  const env = parseEnvelope(inst.env);
  const g = gain.gain;
  g.setValueAtTime(0.0001, start);
  g.exponentialRampToValueAtTime(env.attackLevel || 1.0, start + (env.attack || 0.001));
  g.setTargetAtTime(env.sustainLevel ?? 0.5, start + (env.attack || 0.001), env.decay || 0.1);
  // schedule release
  g.setTargetAtTime(0.0001, start + dur - (env.release || 0.02), env.release || 0.02);

  osc.start(start);
  // Diagnostic hook: expose a simple counter on window so we can verify pulse starts at runtime
  try {
    const w = (window as any) as any;
    if (!w.__beatbax_diag) w.__beatbax_diag = { pulseStarts: 0 };
    w.__beatbax_diag.pulseStarts = (w.__beatbax_diag.pulseStarts || 0) + 1;
    // also print a short debug line so console shows activity
    if (w.__beatbax_diag.pulseStarts <= 5) {
      console.log('[beatbax] playPulse start', { freq, duty, start, dur, env: inst && inst.env });
    }
  } catch (e) {}
  try { osc.stop(start + dur + 0.02); } catch (e) {}
  return [osc, gain];
}

/** Play wavetable by creating a looping AudioBufferSourceNode shaped by wavetable samples. */
function playWavetable(ctx: BaseAudioContext, freq: number, table: number[], start: number, dur: number, inst: any) {
  // Build a tiny buffer representing one cycle sampled at 8192 Hz then loop and pitch via playbackRate
  const sampleRate = 8192;
  const cycleLen = table.length || 16;
  const buf = ctx.createBuffer(1, cycleLen, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < cycleLen; i++) data[i] = (table[i] / 15) * 0.9; // normalize

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // playbackRate to set frequency: frequency = baseRate * playbackRate / cycleLen
  const baseRate = sampleRate;
  src.playbackRate.value = (freq * cycleLen) / baseRate;

  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.6, start);
  gain.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);

  src.start(start);
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

/** Simple white-noise / LFSR-like buffer playback for noise channel. */
function playNoise(ctx: BaseAudioContext, start: number, dur: number, inst: any) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(Math.min(1, dur + 0.05) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  // Game Boy style noise parameters (read from instrument props if present)
  // width: 7 or 15 (bits). divisor: integer (as encoded in song), shift: integer.
  const width = inst && inst.width ? Number(inst.width) : 15;
  const divisor = inst && inst.divisor ? Number(inst.divisor) : 3;
  const shift = inst && inst.shift ? Number(inst.shift) : 4;

  // GB noise generator clock (CPU clock) ~4.194304 MHz
  const GB_CLOCK = 4194304;

  // Interpret divisor: keep as provided but ensure minimum 1 to avoid divide-by-zero
  const div = Math.max(1, Number.isFinite(divisor) ? divisor : 3);

  // LFSR step frequency: GB_CLOCK / (div * 2^(shift+1))
  const lfsrHz = GB_CLOCK / (div * Math.pow(2, (shift || 0) + 1));

  // We'll advance the LFSR at lfsrHz; to sample into audio buffer, accumulate a phase
  let phase = 0;

  // initial LFSR state (non-zero)
  let lfsr = 1;

  const is7bit = width === 7 || width === 7;

  function stepLFSR(state: number) {
    // feedback is XOR of bit0 and bit1
    const bit = ((state >> 0) ^ (state >> 1)) & 1;
    state = (state >> 1) | (bit << 14); // keep 15-bit LFSR
    if (is7bit) {
      // when width=7, also copy bit to bit6 (7-bit LFSR)
      // emulate by folding into lower 7 bits
      const low7 = ((state >> 8) & 0x7F) >>> 0;
      // produce a 7-bit style value by mirroring into bit6
      const newLow7 = ((low7 >> 1) | ((low7 & 1) << 6)) & 0x7F;
      // merge back into 15-bit state (preserve other bits)
      state = (state & ~(0x7F << 8)) | (newLow7 << 8);
    }
    return state >>> 0;
  }

  // Fill buffer by sampling LFSR at audio sample rate
  for (let i = 0; i < len; i++) {
    phase += lfsrHz / sr;
    // advance LFSR by the integer number of ticks elapsed
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let t = 0; t < ticks; t++) lfsr = stepLFSR(lfsr);
      phase -= ticks;
    }
    // output is based on lowest bit of LFSR (0/1 -> -1/+1)
    const sampleVal = (lfsr & 1) ? 1 : -1;
    // scale by modest amplitude (we'll shape with gain envelope)
    data[i] = sampleVal * 0.8;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);
  // envelope
  gain.gain.setValueAtTime(0.8, start);
  gain.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);

  src.start(start);
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

export function parseEnvelope(envStr: any) {
  // simple env parser: '12,down' or '8,up' or numeric only
  const res: any = { attack: 0.001, decay: 0.05, sustainLevel: 0.6, release: 0.02 };
  if (!envStr) return res;
  const s = String(envStr);
  const m = s.match(/(\d+)/);
  if (m) {
    const v = parseInt(m[1], 10);
    // map 0-15 to durations
    res.decay = Math.max(0.01, (16 - v) * 0.01);
    res.sustainLevel = 0.2 + (v / 15) * 0.8;
  }
  if (s.includes('down')) res.sustainLevel = 0.0;
  return res;
}

export default Player;
