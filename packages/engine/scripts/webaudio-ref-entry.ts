/**
 * Browser-only entry for Chromium OfflineAudioContext parity capture.
 * Bundled by capture-webaudio-ref.mjs — do not import from Node.
 */
import { Player } from '../src/audio/playback.js';

export interface CaptureOpts {
  sampleRate?: number;
  durationSec: number;
  /** 1-based channel ids to keep audible; others muted. Omit = all. */
  renderChannels?: number[];
}

export async function renderOfflineWebAudioInBrowser(
  playable: any,
  opts: CaptureOpts,
): Promise<Float32Array> {
  const sampleRate = opts.sampleRate ?? 44100;
  const durationSec = Math.max(0.05, opts.durationSec);
  const length = Math.ceil(durationSec * sampleRate);
  const Offline =
    (globalThis as any).OfflineAudioContext ||
    (globalThis as any).webkitOfflineAudioContext;
  if (typeof Offline !== 'function') {
    throw new Error('OfflineAudioContext not available in this browser');
  }
  const ctx = new Offline(2, length, sampleRate);
  const player = new Player(ctx);

  if (opts.renderChannels && opts.renderChannels.length > 0) {
    const want = new Set(opts.renderChannels);
    for (let id = 1; id <= 8; id++) {
      if (!want.has(id)) player.muted.add(id);
    }
  }

  // Bypass DynamicsCompressor so correlation measures synth/effects, not the live limiter.
  await player.playAST(playable, { scheduleLeadSeconds: 0, bypassMasterLimiter: true });
  try {
    (player as any).scheduler?.flushAll?.();
  } catch (_) { /* ignore */ }
  try {
    const t = (player as any)._completionTimer;
    if (t) clearTimeout(t);
    (player as any)._completionTimer = null;
  } catch (_) { /* ignore */ }

  const audioBuffer = await ctx.startRendering();
  try { player.stop(); } catch (_) { /* ignore */ }

  const ch0 = audioBuffer.getChannelData(0) as Float32Array;
  const ch1 = audioBuffer.numberOfChannels > 1
    ? (audioBuffer.getChannelData(1) as Float32Array)
    : ch0;
  const out = new Float32Array(ch0.length * 2);
  for (let i = 0; i < ch0.length; i++) {
    out[i * 2] = ch0[i];
    out[i * 2 + 1] = ch1[i];
  }
  return out;
}

(globalThis as any).BeatBaxParity = { renderOfflineWebAudioInBrowser };
