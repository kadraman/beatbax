// Browser-compatible Player module for BeatBax demo.
// Exports: Player, midiToFreq, noteNameToMidi, parseWaveTable, parseEnvelope

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function createPulsePeriodicWave(ctx, duty = 0.5) {
  const size = 2048;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  const maxHarm = 200;
  // coerce duty to finite number
  let d = Number(duty);
  if (!Number.isFinite(d)) d = 0.5;
  d = Math.max(0, Math.min(1, d));
  for (let n = 1; n <= maxHarm && n < size; n++) {
    const a = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    real[n] = 0;
    imag[n] = Number.isFinite(a) ? a : 0;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

class Scheduler {
  constructor(ctx) {
    this.ctx = ctx;
    this.lookahead = 0.1;
    this.interval = 25;
    this.timer = null;
    this.queue = [];
  }
  schedule(time, fn) {
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
  tick() {
    const now = this.ctx.currentTime;
    const cutoff = now + this.lookahead;
    while (this.queue.length && this.queue[0].time <= cutoff) {
      const ev = this.queue.shift();
      try { ev.fn(); } catch (e) { console.error('Scheduled function error', e); }
    }
  }
}

export class Player {
  constructor(ctx) {
    this.ctx = ctx || (window.AudioContext ? new window.AudioContext() : null);
    if (!this.ctx) throw new Error('WebAudio not available');
    this.scheduler = new Scheduler(this.ctx);
    this.bpmDefault = 120;
    this.activeNodes = []; // { node, chId }
    this.muted = new Set();
    this.solo = null; // channel id or null
  }

  async playAST(ast) {
    for (const ch of (ast.channels || [])) {
      const inst = (ast.insts || {})[ch.inst || ''];
      const tokens = Array.isArray(ch.pat) ? ch.pat : ['.'];
      const masterBpm = (ast && ast.bpm) || this.bpmDefault;
      const speed = (typeof ch.speed === 'number' && Number.isFinite(ch.speed)) ? ch.speed : 1;
      const bpm = masterBpm * speed;
      const secondsPerBeat = 60 / bpm;
      const tickSeconds = secondsPerBeat / 4;
      const startTime = this.ctx.currentTime + 0.1;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const t = startTime + i * tickSeconds;
        this.scheduleToken(ch.id, inst, token, t, tickSeconds);
      }
    }
    this.scheduler.start();
  }

  scheduleToken(chId, inst, token, time, dur) {
    if (!inst) return;
    if (token === '.') return;
    const m = token.match(/^([A-G][#B]?)(-?\d+)$/i);
    if (m) {
      const note = m[1].toUpperCase();
      const octave = parseInt(m[2], 10);
      const midi = noteNameToMidi(note, octave);
      if (midi === null) return;
      const freq = midiToFreq(midi);
      if (inst.type && inst.type.toLowerCase().includes('pulse')) {
        const duty = inst.duty ? parseFloat(inst.duty) / 100 : 0.5;
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playPulse(this.ctx, freq, duty, time, dur, inst);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
        const wav = parseWaveTable(inst.wave);
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playWavetable(this.ctx, freq, wav, time, dur, inst);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
        this.scheduler.schedule(time, () => {
          if (this.solo !== null && this.solo !== chId) return;
          if (this.muted.has(chId)) return;
          const nodes = playNoise(this.ctx, time, dur, inst);
          for (const n of nodes) this.activeNodes.push({ node: n, chId });
        });
      }
    } else {
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

  stop() {
    // stop future scheduling
    if (this.scheduler) {
      if (typeof this.scheduler.clear === 'function') this.scheduler.clear();
      this.scheduler.stop();
    }
    // stop active nodes
    for (const entry of this.activeNodes) {
      try { if (entry.node && typeof entry.node.stop === 'function') entry.node.stop(); } catch (e) {}
      try { if (entry.node && typeof entry.node.disconnect === 'function') entry.node.disconnect(); } catch (e) {}
    }
    this.activeNodes = [];
  }

  toggleChannelMute(chId) {
    if (this.muted.has(chId)) this.muted.delete(chId);
    else this.muted.add(chId);
  }

  toggleChannelSolo(chId) {
    if (this.solo === chId) this.solo = null;
    else this.solo = chId;
  }
}

export function noteNameToMidi(name, octave) {
  const m = name.match(/^([A-G])([#B]?)$/i);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = (m[2] || '').toUpperCase();
  const map = { C:0, 'C#':1, DB:1, D:2, 'D#':3, EB:3, E:4, F:5, 'F#':6, GB:6, G:7, 'G#':8, AB:8, A:9, 'A#':10, BB:10, B:11 };
  const key = letter + (acc === 'B' ? 'B' : (acc === '#' ? '#' : ''));
  const semi = map[key];
  if (semi === undefined) return null;
  return (octave + 1) * 12 + semi;
}

export function parseWaveTable(raw) {
  if (!raw) return new Array(16).fill(0);
  if (Array.isArray(raw)) return raw.map(n => Number(n) || 0);
  try {
    const s = String(raw);
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(n => Number(n) || 0);
  } catch (_) {}
  return new Array(16).fill(0);
}

function playPulse(ctx, freq, duty, start, dur, inst) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const pw = createPulsePeriodicWave(ctx, duty);
  try { osc.setPeriodicWave(pw); } catch (e) {}
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const env = parseEnvelope(inst.env);
  const g = gain.gain;
  g.setValueAtTime(0.0001, start);
  g.exponentialRampToValueAtTime(env.attackLevel || 1.0, start + (env.attack || 0.001));
  g.setTargetAtTime(env.sustainLevel ?? 0.5, start + (env.attack || 0.001), env.decay || 0.1);
  g.setTargetAtTime(0.0001, start + dur - (env.release || 0.02), env.release || 0.02);
  osc.start(start);
  try { osc.stop(start + dur + 0.02); } catch (e) {}
  return [osc, gain];
}

function playWavetable(ctx, freq, table, start, dur, inst) {
  const sampleRate = 8192;
  const cycleLen = table.length || 16;
  const buf = ctx.createBuffer(1, cycleLen, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < cycleLen; i++) data[i] = (table[i] / 15) * 0.9;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = (freq * cycleLen) / sampleRate;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.6, start);
  gain.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
  src.start(start);
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

function playNoise(ctx, start, dur, inst) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(Math.min(1, dur + 0.05) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  let lfsr = 1;
  for (let i = 0; i < len; i++) {
    const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1;
    lfsr = (lfsr >> 1) | (bit << 14);
    data[i] = ((lfsr & 1) ? 1 : -1) * (Math.random() * 0.2 + 0.05);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.8, start);
  gain.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
  src.start(start);
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

export function parseEnvelope(envStr) {
  const res = { attack: 0.001, decay: 0.05, sustainLevel: 0.6, release: 0.02 };
  if (!envStr) return res;
  const s = String(envStr);
  const m = s.match(/(\d+)/);
  if (m) {
    const v = parseInt(m[1], 10);
    res.decay = Math.max(0.01, (16 - v) * 0.01);
    res.sustainLevel = 0.2 + (v / 15) * 0.8;
  }
  if (s.includes('down')) res.sustainLevel = 0.0;
  return res;
}
