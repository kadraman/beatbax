/**
 * Browser entry for the spec 112 SC-001 capture.
 * One real-time play and one offline render, each tapped at masterGain
 * (limiter bypassed) and at channel buses 1–4.
 */
import { Player } from '../../src/audio/playback.js';

function b64(f32: Float32Array): string {
  const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CH)) as unknown as number[]);
  }
  return btoa(s);
}

const RECORDER_SRC = `
class TapRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.store = null;
    this.marks = null;
    this.cap = 0;
    this.port.onmessage = (e) => {
      this.store = new Float32Array(e.data.store);
      this.marks = new Int32Array(e.data.marks);
      this.cap = e.data.cap;
      this.port.postMessage('ready');
    };
  }
  process(inputs) {
    if (!this.store) return true;
    const src0 = inputs[0] && inputs[0][0];
    const n = src0 && src0.length ? src0.length : 128;
    const first = Math.floor(currentFrame / 128);
    const last = Math.floor((currentFrame + n - 1) / 128);
    for (let b = first; b <= last && b < this.marks.length; b++) Atomics.add(this.marks, b, 1);
    for (let c = 0; c < 5; c++) {
      const src = inputs[c] && inputs[c][0];
      if (!src) continue;
      for (let i = 0; i < src.length; i++) {
        const idx = c * this.cap + currentFrame + i;
        if (currentFrame + i < this.cap) this.store[idx] = src[i];
      }
    }
    return true;
  }
}
registerProcessor('tap-recorder', TapRecorder);
`;

function makeRecorder(ctx: BaseAudioContext, cap: number): { rec: AudioWorkletNode; store: Float32Array; marks: Int32Array } {
  const rec = new AudioWorkletNode(ctx, 'tap-recorder', {
    numberOfInputs: 5,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const storeSab = new SharedArrayBuffer(5 * cap * 4);
  const marksSab = new SharedArrayBuffer(Math.ceil(cap / 128) * 4);
  const store = new Float32Array(storeSab);
  const marks = new Int32Array(marksSab);
  return { rec, store, marks };
}

async function armRecorder(rec: AudioWorkletNode, store: Float32Array, marks: Int32Array, cap: number): Promise<void> {
  await new Promise<void>((resolve) => {
    rec.port.onmessage = (ev) => { if (ev.data === 'ready') resolve(); };
    rec.port.postMessage({ store: store.buffer, marks: marks.buffer, cap });
  });
  rec.port.onmessage = null;
}

function armTaps(player: any, rec: AudioWorkletNode, onLoopStart: (t: number) => void): void {
  const origSchedule = player._scheduleAllChannels.bind(player);
  player._scheduleAllChannels = (ast: any, startTime: number) => {
    onLoopStart(startTime);
    try { player.masterGain.connect(rec, 0, 0); } catch { /* already connected on a later pass */ }
    return origSchedule(ast, startTime);
  };
  const origBus = player._getChannelBus.bind(player);
  const tapped = new Set<number>();
  player._getChannelBus = (id: number) => {
    const bus = origBus(id);
    if (id >= 1 && id <= 4 && !tapped.has(id)) {
      bus.connect(rec, 0, id);
      tapped.add(id);
    }
    return bus;
  };
}

export async function captureRealtime(playable: any, opts: { sampleRate: number; durationSec: number }): Promise<{ buffers: string[]; gaps: number; loopStart: number }> {
  const ctx = new AudioContext({ sampleRate: opts.sampleRate, latencyHint: 'playback' });
  const url = URL.createObjectURL(new Blob([RECORDER_SRC], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  await ctx.resume();
  const player: any = new Player(ctx);
  const total = Math.ceil(opts.durationSec * opts.sampleRate);
  const cap = total + opts.sampleRate;
  const { rec, store, marks } = makeRecorder(ctx, cap);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  rec.connect(sink);
  sink.connect(ctx.destination);
  await armRecorder(rec, store, marks, cap);

  let loopStart = Number.NaN;
  armTaps(player, rec, (t) => { if (Number.isNaN(loopStart)) loopStart = t; });
  await player.playAST(playable, { bypassMasterLimiter: true });
  const startFrame = Math.round(loopStart * opts.sampleRate);
  const endBlock = Math.min(marks.length - 1, Math.floor((startFrame + total) / 128));
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      if (Atomics.load(marks, endBlock) > 0) {
        clearInterval(iv);
        resolve();
      }
    }, 40);
  });
  let gaps = 0;
  const gapAt: number[] = [];
  const startBlock = Math.floor(startFrame / 128);
  for (let b = startBlock; b <= endBlock; b++) {
    if (Atomics.load(marks, b) === 0) {
      gaps++;
      if (gapAt.length < 8) gapAt.push(b * 128);
    }
  }
  const buffers = Array.from({ length: 5 }, (_, c) => store.slice(c * cap + startFrame, c * cap + startFrame + total));
  try { player.stop(); } catch { /* ignore */ }
  await ctx.close();
  return { buffers: buffers.map(b64), gaps, gapAt, loopStart };
}

export async function captureOffline(playable: any, opts: { sampleRate: number; durationSec: number }): Promise<{ buffers: string[] }> {
  const total = Math.ceil(opts.durationSec * opts.sampleRate);
  const ctx = new OfflineAudioContext(2, total, opts.sampleRate);
  const url = URL.createObjectURL(new Blob([RECORDER_SRC], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  const player: any = new Player(ctx);
  const { rec, store, marks } = makeRecorder(ctx, total);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  rec.connect(sink);
  sink.connect(ctx.destination);
  await armRecorder(rec, store, marks, total);
  armTaps(player, rec, () => {});
  await player.playAST(playable, { bypassMasterLimiter: true, scheduleLeadSeconds: 0 });
  player.scheduler.flushAll();
  if (player._completionTimer) {
    clearTimeout(player._completionTimer);
    player._completionTimer = null;
  }
  await ctx.startRendering();
  try { player.stop(); } catch { /* ignore */ }
  const buffers = Array.from({ length: 5 }, (_, c) => store.slice(c * total, (c + 1) * total));
  return { buffers: buffers.map(b64) };
}

/** Real-time pre-limiter vs post-limiter, for the FR-013 probe. */
export async function measureLimiter(
  playable: any,
  opts: { sampleRate: number; durationSec: number },
  params: { threshold: number; knee: number; ratio: number; attack: number; release: number },
): Promise<{ pre: string; post: string }> {
  const ctx = new AudioContext({ sampleRate: opts.sampleRate, latencyHint: 'playback' });
  const url = URL.createObjectURL(new Blob([RECORDER_SRC], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  await ctx.resume();
  const total = Math.ceil(opts.durationSec * opts.sampleRate);
  const cap = total + opts.sampleRate;
  const { rec, store, marks } = makeRecorder(ctx, cap);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  rec.connect(sink);
  sink.connect(ctx.destination);
  await armRecorder(rec, store, marks, cap);
  const player: any = new Player(ctx);
  let loopStart = Number.NaN;
  const origSchedule = player._scheduleAllChannels.bind(player);
  player._scheduleAllChannels = (ast: any, startTime: number) => {
    if (Number.isNaN(loopStart)) loopStart = startTime;
    return origSchedule(ast, startTime);
  };
  await player.playAST(playable, { bypassMasterLimiter: false });
  const lim = player.masterLimiter;
  if (lim) {
    const now = ctx.currentTime;
    lim.threshold.setValueAtTime(params.threshold, now);
    lim.knee.setValueAtTime(params.knee, now);
    lim.ratio.setValueAtTime(params.ratio, now);
    lim.attack.setValueAtTime(params.attack, now);
    lim.release.setValueAtTime(params.release, now);
  }
  try { player.masterGain.connect(rec, 0, 0); } catch { /* already */ }
  try { player.masterLimiter.connect(rec, 0, 1); } catch { /* already */ }
  const startFrame = Math.round(loopStart * opts.sampleRate);
  const endBlock = Math.min(marks.length - 1, Math.floor((startFrame + total) / 128));
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      if (Atomics.load(marks, endBlock) > 0) {
        clearInterval(iv);
        resolve();
      }
    }, 40);
  });
  const pre = store.slice(startFrame, startFrame + total);
  const post = store.slice(cap + startFrame, cap + startFrame + total);
  try { player.stop(); } catch { /* ignore */ }
  await ctx.close();
  return { pre: b64(pre), post: b64(post) };
}

(globalThis as any).BeatBaxParityGates = { captureRealtime, captureOffline, measureLimiter };
