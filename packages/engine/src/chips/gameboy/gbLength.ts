/**
 * Game Boy hardware length counter helpers (256 Hz frames).
 *
 * BeatBax `length=` on instruments maps to the enabled length counter: the note
 * stops after `length` frames at 256 Hz, or sooner if the pattern step ends.
 *
 * @see songs/gameboy/instruments/gb_percussion_demo.bax
 */

export interface GbMonophonicNoiseState {
  scratch: Float32Array;
  voiceEndSample: number;
}

export function isGbLengthEnabled(inst: Record<string, unknown>): boolean {
  const raw = inst.length ?? inst['gb:length'];
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim();
  return s.length > 0;
}

/** Length counter frames (1–64) when enabled; undefined when length is off. */
export function parseGbLengthFrames(inst: Record<string, unknown>): number | undefined {
  if (!isGbLengthEnabled(inst)) return undefined;
  const n = Number(inst.length ?? inst['gb:length']);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(64, Math.max(1, Math.floor(n)));
}

export function gbLengthFramesToSeconds(frames: number): number {
  return frames / 256;
}

/** Effective audible duration: hardware length cap vs pattern step length. */
export function resolveGbNoiseDurationSec(inst: Record<string, unknown>, stepDurSec: number): number {
  const frames = parseGbLengthFrames(inst);
  if (frames === undefined) return stepDurSec;
  return Math.min(stepDurSec, gbLengthFramesToSeconds(frames));
}

export function resolveGbNoiseDurationSamples(
  durationSamples: number,
  sampleRate: number,
  inst: Record<string, unknown>,
): number {
  const stepSec = durationSamples / sampleRate;
  const effSec = resolveGbNoiseDurationSec(inst, stepSec);
  return Math.min(durationSamples, Math.max(1, Math.ceil(effSec * sampleRate)));
}

export function createGbMonophonicNoiseState(sampleCount: number): GbMonophonicNoiseState {
  return { scratch: new Float32Array(sampleCount), voiceEndSample: 0 };
}

/**
 * Render one CH4 hit with voice reset: a new trigger replaces any still-audible
 * noise on the same channel from the retrigger sample onward.
 */
export function mixGbMonophonicNoise(
  state: GbMonophonicNoiseState,
  target: Float32Array,
  startSample: number,
  durationSamples: number,
  sampleRate: number,
  channels: number,
  gains: { left: number; right: number },
  renderScratch: (scratch: Float32Array, start: number, len: number) => void,
  inst: Record<string, unknown>,
): void {
  const effectiveSamples = resolveGbNoiseDurationSamples(durationSamples, sampleRate, inst);

  if (startSample < state.voiceEndSample) {
    state.scratch.fill(0, startSample, Math.min(state.voiceEndSample, state.scratch.length));
  }

  renderScratch(state.scratch, startSample, effectiveSamples);

  for (let i = 0; i < effectiveSamples; i++) {
    const idx = startSample + i;
    const sample = state.scratch[idx];
    if (channels === 2) {
      const base = idx * 2;
      if (base < target.length) target[base] += sample * gains.left;
      if (base + 1 < target.length) target[base + 1] += sample * gains.right;
    } else if (idx < target.length) {
      target[idx] += sample;
    }
  }

  state.voiceEndSample = startSample + effectiveSamples;
}
