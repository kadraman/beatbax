import { SongModel, NoteEvent } from '../song/songModel.js';
import { midiToFreq, noteNameToMidi } from '../chips/gameboy/apu.js';
import { parseSweep, parseEnvelope as parsePulseEnvelope, PULSE_OUTPUT_GAIN } from '../chips/gameboy/pulse.js';
import { WAVE_PLAYBACK_GAIN } from '../chips/gameboy/wave.js';
import { getPulseFourierCache, bandLimitedPulseSample, type PulseFourierCache } from '../chips/pulseDc.js';
import { noiseClockToLfsrHz, resolveNoiseClock, resolveNoisePlayDurationSec, resolveNoiseWidth, gameBoyNoiseSample, NOISE_OUTPUT_GAIN, stepGameBoyLfsr, triggerGameBoyLfsr } from '../chips/gameboy/noiseNote.js';
import {
  applyTickOffsetToFreq,
  createTickProgramCursor,
  lowerGameBoyInstrumentProgram,
  resolveNoiseClockWithOffset,
  tickRowDutyFraction,
  tickRowVolume,
} from '../chips/gameboy/instrumentProgram.js';
import { resolveWaveVolumeMultiplier, parseWaveTable } from '../chips/gameboy/wave.js';
import { registerFromFreq, freqFromRegister } from '../chips/gameboy/periodTables.js';
import { InstMap, InstrumentNode } from '../parser/ast.js';
import { chipRegistry } from '../chips/registry.js';
import type { ChipChannelBackend } from '../chips/types.js';
import { applyInlineRenderEffects } from './inlineMacroEffects.js';
import { peakLimitForPlayback, PLAYBACK_PEAK_CEILING } from './playbackLimiter.js';
import {
  parseNoteEffects,
  modulatePitchHz,
  advanceVibratoPhase,
  tremoloGain,
  noteCutGain,
  portamentoDurationSec,
  resolveEchoDelaySec,
  VIB_DEPTH_SCALE,
  type ParsedNoteEffects,
} from '../effects/modulation.js';

/** Wave buffer scale — matches WebAudio playWavetable sample fill (`* 0.9`). */
const WAVE_OUTPUT_SCALE = 0.9;

/** FR-011: pulse and noise linear ramp to silence after the nominal end. */
const GB_NOTE_RELEASE_SEC = 0.005;
/** FR-011: wave without a GB envelope fades with this time constant, starting one constant before the end. */
const WAVE_TAIL_SEC = 0.02;

/** 1 during the note, then a linear ramp to 0 over `releaseSec`. */
function linearReleaseGain(t: number, durSec: number, releaseSec: number): number {
  if (t <= durSec || releaseSec <= 0) return 1;
  const u = (t - durSec) / releaseSec;
  if (u >= 1) return 0;
  return 1 - u;
}

/**
 * WebAudio `setTargetAtTime(0.0001, start + dur - tau, tau)` relative to the
 * held gain. The source keeps running until `dur + tau`.
 */
function waveExponentialReleaseGain(t: number, durSec: number, baseGain: number): number {
  const fadeStart = durSec - WAVE_TAIL_SEC;
  if (t < fadeStart) return 1;
  const floor = baseGain > 1e-8 ? 0.0001 / baseGain : 0;
  const elapsed = t - fadeStart;
  return floor + (1 - floor) * Math.exp(-elapsed / WAVE_TAIL_SEC);
}

// How many GB period-register units correspond to one tracker vibrato depth unit (y).
// hUGE appears to treat the tracker `y` as raw register offset units; tune this
// multiplier to convert tracker depth (0..15) into GB register steps.
const RENDER_REG_PER_TRACKER_UNIT = 1;
// Fraction of base register to scale tracker units by (empirical). This
// multiplies the tracker `y` value by a portion of the base period register
// to produce a register offset similar to how hUGEDriver maps depth.
const RENDER_REG_PER_TRACKER_BASE_FACTOR = 0.04;
// Exporter-side vibrato depth scaling (used when exporting to UGE).
// Keep in sync with packages/engine/src/export/ugeWriter.ts VIB_DEPTH_SCALE
const EXPORTER_VIB_DEPTH_SCALE = 1.0;

/**
 * Apply pitch sweep (GB NR10) - hardware-accurate frequency sweep
 * Formula: f_new = f_old ± f_old / 2^shift
 * Each sweep step occurs every (sweepTime/128) seconds
 *
 * @param baseFreq - The base frequency to start the sweep from
 * @param effFreq - The current effective frequency (may already have other modulations applied)
 * @param t - Current time in seconds
 * @param sweepTime - Sweep time parameter (0-7, in 1/128 Hz units)
 * @param sweepShift - Frequency shift amount (0-7, number of bits to shift)
 * @param sweepDirection - Direction of sweep ('up' or 'down')
 * @returns The swept frequency
 */
function applySweepToFrequency(
  baseFreq: number,
  effFreq: number,
  t: number,
  sweepTime: number,
  sweepShift: number,
  sweepDirection: 'up' | 'down'
): number {
  if (sweepTime <= 0 || sweepShift <= 0 || effFreq <= 0) {
    return effFreq;
  }

  const sweepStepTime = sweepTime / 128.0;
  const divisor = Math.pow(2, sweepShift);

  // Calculate which sweep step we're in
  const stepIndex = Math.floor(t / sweepStepTime);

  // Apply iterative sweep formula
  let sweepFreq = baseFreq; // Start from base frequency
  for (let step = 0; step < stepIndex; step++) {
    const delta = sweepFreq / divisor;
    if (sweepDirection === 'up') {
      sweepFreq = sweepFreq + delta;
    } else {
      sweepFreq = sweepFreq - delta;
    }

    // Clamp to audible range
    if (sweepFreq < 20) sweepFreq = 20;
    if (sweepFreq > 20000) sweepFreq = 20000;

    // Stop if change becomes negligible
    if (Math.abs(delta) < 0.1) break;
  }

  return sweepFreq;
}

/**
 * Render a song to PCM samples without using WebAudio.
 * This is a simplified renderer for CLI/offline use.
 */

export interface RenderOptions {
  sampleRate?: number;
  duration?: number; // in seconds
  channels?: 1 | 2;
  bpm?: number;
  renderChannels?: number[]; // Which channels to render, default all
  normalize?: boolean;
  // Calibration overrides (optional): if provided they override the
  // compile-time constants to allow automated calibration without editing
  // source files.
  vibDepthScale?: number;
  regPerTrackerBaseFactor?: number;
  regPerTrackerUnit?: number;
}

/**
 * Per-channel portamento state for PCM rendering.
 * Keyed by channel ID to track the last frequency per channel.
 */
const channelPortamentoState = new Map<number, number>();

/**
 * Per-channel phase accumulator for continuous phase tracking.
 * Prevents phase discontinuities and clicks between notes.
 */
const channelPhaseState = new Map<number, number>();

/**
 * Per-channel vibrato LFO phase for smooth vibrato.
 */
const channelVibratoPhase = new Map<number, number>();

/**
 * Per-channel envelope state for legato/portamento notes.
 * Tracks the current envelope time and value so legato notes can continue without retriggering.
 */
interface EnvelopeState {
  time: number;      // Current time in the envelope (seconds)
  lastValue: number; // Last computed envelope value
  mode: string;      // Envelope mode ('gb' or 'adsr')
}
const channelEnvelopeState = new Map<number, EnvelopeState>();

/**
 * Clear all PCM render effect state (called before each render).
 */
function clearPCMEffectState() {
  channelPortamentoState.clear();
  channelPhaseState.clear();
  channelVibratoPhase.clear();
  channelEnvelopeState.clear();
}

/**
 * Apply echo/delay with feedback to a note region already mixed into `buffer`.
 * Spec 112 / issue #42 — matches WebAudio DelayNode wet/dry + feedback semantics.
 */
function applyPcmEcho(
  buffer: Float32Array,
  startSample: number,
  durationSamples: number,
  sampleRate: number,
  channels: number,
  echo: { delayTimeRaw: number; feedback: number; mix: number },
  tickSeconds?: number
): void {
  const delaySec = Math.min(2, Math.max(0.001, resolveEchoDelaySec(echo.delayTimeRaw, tickSeconds)));
  const delaySamples = Math.max(1, Math.floor(delaySec * sampleRate));
  const feedback = Math.max(0, Math.min(0.95, echo.feedback));
  const mix = Math.max(0, Math.min(1, echo.mix));
  if (mix <= 0) return;

  // Work on a dry copy of the note region so feedback reads are stable
  const regionLen = durationSamples * channels;
  const dry = new Float32Array(regionLen);
  const outStart = startSample * channels;
  for (let i = 0; i < regionLen && outStart + i < buffer.length; i++) {
    dry[i] = buffer[outStart + i];
  }

  // Extend wet writes past the note so echoes are heard (up to ~4 delay periods, capped)
  const tailSamples = Math.min(delaySamples * 4, Math.floor(sampleRate * 2));
  const wetLen = (durationSamples + tailSamples) * channels;
  const wet = new Float32Array(wetLen);

  for (let s = 0; s < durationSamples + tailSamples; s++) {
    for (let c = 0; c < channels; c++) {
      const idx = s * channels + c;
      const delayedIdx = (s - delaySamples) * channels + c;
      let delayed = 0;
      if (delayedIdx >= 0 && delayedIdx < wet.length) delayed = wet[delayedIdx];
      const drySample = s < durationSamples ? dry[s * channels + c] : 0;
      wet[idx] = drySample + delayed * feedback;
    }
  }

  for (let s = 0; s < durationSamples + tailSamples; s++) {
    for (let c = 0; c < channels; c++) {
      const bufIdx = (startSample + s) * channels + c;
      if (bufIdx >= buffer.length) continue;
      const drySample = s < durationSamples ? dry[s * channels + c] : 0;
      const wetSample = wet[s * channels + c];
      // Replace dry region with dry*(1-mix) + wet*mix; for tail, only add wet*mix
      if (s < durationSamples) {
        buffer[bufIdx] = drySample * (1 - mix) + wetSample * mix;
      } else {
        buffer[bufIdx] += wetSample * mix;
      }
    }
  }
}

/**
 * Renders a complete song to a PCM buffer.
 *
 * @param song The song model containing channels and events.
 * @param opts Rendering options (sampleRate, channels, bpm, etc.).
 * @returns a Float32Array containing the interleaved PCM samples.
 */

// ─── Plugin backend PCM helper ────────────────────────────────────────────────

const PCM_PLUGIN_CHUNK = 512;

/**
 * Render a note using a plugin chip backend into the PCM buffer.
 * Drives the backend's noteOn → render (in chunks) → noteOff lifecycle and
 * writes the resulting samples into `buffer` at the correct position.
 */
function renderWithPluginBackend(
  backend: ChipChannelBackend,
  freq: number,
  inst: InstrumentNode,
  buffer: Float32Array,
  startSample: number,
  durationSamples: number,
  sampleRate: number,
  numChannels: number,
  gains: { left: number; right: number } = { left: 1, right: 1 }
): void {
  backend.noteOn(freq, inst);
  if (typeof backend.prepareNoteRender === 'function') {
    backend.prepareNoteRender(durationSamples);
  }
  const chunk = new Float32Array(PCM_PLUGIN_CHUNK);
  const samplesPerFrame = Math.floor(sampleRate / 60);
  let rendered = 0;
  let frame = 0;
  let samplesSinceFrame = 0;
  while (rendered < durationSamples) {
    const len = Math.min(PCM_PLUGIN_CHUNK, durationSamples - rendered);
    // Drive envelope at ~60 Hz
    samplesSinceFrame += len;
    while (samplesSinceFrame >= samplesPerFrame) {
      backend.applyEnvelope(frame++);
      samplesSinceFrame -= samplesPerFrame;
    }
    const slice = len < PCM_PLUGIN_CHUNK ? chunk.subarray(0, len) : chunk;
    slice.fill(0);
    backend.render(slice, sampleRate);
    const outStart = (startSample + rendered) * numChannels;
    if (numChannels === 1) {
      for (let i = 0; i < len; i++) buffer[outStart + i] += slice[i];
    } else {
      for (let i = 0; i < len; i++) {
        buffer[outStart + i * 2]     += slice[i] * gains.left;
        buffer[outStart + i * 2 + 1] += slice[i] * gains.right;
      }
    }
    rendered += len;
  }
  backend.noteOff();
}

export function renderSongToPCM(song: SongModel, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const channels = opts.channels ?? 1;
  const bpm = opts.bpm ?? song.bpm ?? 128;
  const renderChannels = opts.renderChannels ?? song.channels.map(c => c.id);
  const normalize = opts.normalize ?? false;

  // Clear portamento state before rendering
  clearPCMEffectState();

  // Calculate duration from song events
  const secondsPerBeat = 60 / bpm;
  const tickSeconds = secondsPerBeat / 4;

  let maxTicks = 0;
  for (const ch of song.channels) {
    if (ch.events.length > maxTicks) {
      maxTicks = ch.events.length;
    }
  }

  const duration = opts.duration ?? Math.ceil(maxTicks * tickSeconds) + 1; // Add 1 second buffer
  const totalSamples = Math.floor(duration * sampleRate);
  const buffer = new Float32Array(totalSamples * channels);

  // Render each channel (filter by renderChannels option)
  // Deep-clone instrument table to avoid in-place mutations during rendering
  // (some render paths may temporarily modify instrument objects). Cloning
  // ensures each note render sees a stable, independent instrument object.
  const instsClone = song.insts ? JSON.parse(JSON.stringify(song.insts)) : {};
  const chipType = chipRegistry.resolve((song.chip || 'gameboy').toLowerCase());
  const isGameBoy = chipType === 'gameboy';
  const vibDepthScale = typeof opts.vibDepthScale === 'number' ? opts.vibDepthScale : EXPORTER_VIB_DEPTH_SCALE;
  const regPerTrackerBaseFactor = typeof opts.regPerTrackerBaseFactor === 'number' ? opts.regPerTrackerBaseFactor : RENDER_REG_PER_TRACKER_BASE_FACTOR;
  const regPerTrackerUnit = typeof opts.regPerTrackerUnit === 'number' ? opts.regPerTrackerUnit : RENDER_REG_PER_TRACKER_UNIT;

  // Create per-channel plugin backends for non-GameBoy chips.
  // The registry must have been populated via chipRegistry.register() before
  // renderSongToPCM is called (the CLI does this via discoverPlugins()).
  const pluginBackendsMap = new Map<number, ChipChannelBackend>();
  if (!isGameBoy) {
    const plugin = chipRegistry.get(chipType);
    if (plugin) {
      plugin.configureForSong?.({ chip: song.chip, chipRegion: song.chipRegion });
      for (let idx = 0; idx < plugin.channels; idx++) {
        try {
          pluginBackendsMap.set(idx + 1, plugin.createChannel(idx, null as any));
        } catch (_) {}
      }
    }
  }

  for (const ch of song.channels) {
    if (renderChannels.includes(ch.id)) {
      const pluginBackend = pluginBackendsMap.get(ch.id) ?? null;
      renderChannel(
        ch,
        instsClone,
        buffer,
        sampleRate,
        channels,
        tickSeconds,
        chipType,
        isGameBoy,
        vibDepthScale,
        regPerTrackerBaseFactor,
        regPerTrackerUnit,
        pluginBackend
      );
    }
  }

  // Apply master volume (default 1.0 matches hUGETracker behavior - no attenuation)
  const masterVolume = song.volume !== undefined ? song.volume : 1.0;
  if (masterVolume !== 1.0) {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= masterVolume;
    }
  }

  // Normalize to prevent clipping or to maximize volume
  if (normalize) {
    normalizeBuffer(buffer, true);
  } else {
    normalizeBuffer(buffer, false); // Only scale down if clipping
  }

  return buffer;
}

/**
 * Renders a single channel's events into the provided buffer.
 *
 * @param ch The channel object containing events.
 * @param insts The map of available instruments.
 * @param buffer The target PCM buffer.
 * @param sampleRate The sample rate for rendering.
 * @param channels Number of audio channels (1 or 2).
 * @param tickSeconds Duration of a single tick in seconds.
 */
function renderChannel(
  ch: any,
  insts: InstMap,
  buffer: Float32Array,
  sampleRate: number,
  channels: number,
  tickSeconds: number,
  chipType: string,
  isGameBoy: boolean,
  vibDepthScale: number,
  regPerTrackerBaseFactor: number,
  regPerTrackerUnit: number,
  pluginBackend: ChipChannelBackend | null = null
) {
  let currentInstName: string | undefined = ch.defaultInstrument;
  let tempInstName: string | undefined = undefined;
  let tempRemaining = 0;

  for (let i = 0; i < ch.events.length; i++) {
    const ev = ch.events[i];
    const time = i * tickSeconds;

    if (ev.type === 'rest' || ev.type === 'sustain') {
      // Silence or handled by lookahead
      continue;
    }

    // Calculate duration: prefer explicit duration on the event (e.g., C4:64),
    // otherwise look ahead for sustain tokens (_) to extend the note.
    let dur: number;
    if (typeof ev.duration === 'number' && ev.duration > 0) {
      dur = tickSeconds * ev.duration;
    } else {
      let sustainCount = 0;
      for (let j = i + 1; j < ch.events.length; j++) {
        if (ch.events[j].type === 'sustain') {
          sustainCount++;
        } else {
          break;
        }
      }
      dur = tickSeconds * (1 + sustainCount);
    }

    // Resolve instrument
    let instName = ev.instrument || (tempRemaining > 0 ? tempInstName : currentInstName);
    let inst = instName ? insts[instName] : undefined;

    if (!inst) continue;

    // WebAudio starts a note on the nearest sample frame. Tick grids that
    // land on an integer (tutorial_groove at 44100 Hz) are unchanged.
    const startSample = Math.round(time * sampleRate);
    const endSample = Math.round((time + dur) * sampleRate);
    let durationSamples = Math.max(0, endSample - startSample);

    // For sample-based (DMC) instruments, extend the render window to the
    // time of the next non-rest event so the sample rings out naturally,
    // matching NES hardware behaviour (a sample plays until the next DMC
    // note or until the sample ends, whichever comes first).
    if (pluginBackend && inst.type && inst.type.toLowerCase() === 'dmc') {
      let nextIdx = ch.events.length;
      for (let j = i + 1; j < ch.events.length; j++) {
        if (ch.events[j].type !== 'rest' && ch.events[j].type !== 'sustain') {
          nextIdx = j;
          break;
        }
      }
      const extendedDur = (nextIdx - i) * tickSeconds;
      if (extendedDur > dur) durationSamples = Math.floor(extendedDur * sampleRate);
    } else if (isGameBoy && inst.type && inst.type.toLowerCase().includes('noise')) {
      const playDur = resolveNoisePlayDurationSec(inst as Record<string, unknown>, dur);
      if (playDur > dur) durationSamples = Math.floor(playDur * sampleRate);
    }

    if (ev.type === 'note') {
      renderNoteEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels, tickSeconds, chipType, isGameBoy, vibDepthScale, regPerTrackerBaseFactor, regPerTrackerUnit, ch.id, pluginBackend);

      if (tempRemaining > 0) {
        tempRemaining--;
        // Skip temp decrement for sustains? Usually temp overrides apply to N *events*
        // but if a note is sustained, it's still one event.
        if (tempRemaining <= 0) {
          tempInstName = undefined;
        }
      }
    } else if (ev.type === 'named') {
      // Named instrument token (like drum hits)
      renderNamedEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels, tickSeconds, isGameBoy, vibDepthScale, regPerTrackerBaseFactor, regPerTrackerUnit, ch.id, pluginBackend);

      if (tempRemaining > 0) {
        tempRemaining--;
        if (tempRemaining <= 0) {
          tempInstName = undefined;
        }
      }
    }
  }
}

/**
 * Renders a specific note event using the appropriate chip-specific renderer.
 *
 * @param ev The note event to render.
 * @param inst The instrument to use for rendering.
 * @param buffer The target PCM buffer.
 * @param startSample The starting sample index in the buffer.
 * @param durationSamples The duration of the note in samples.
 * @param sampleRate The sample rate for rendering.
 * @param channels Number of audio channels.
 */
function panToGains(panSpec: any): { left: number; right: number } {
  // panSpec may be: { enum:'L'|'R'|'C' } | { value: number } | string | number
  let p: number | null = null;
  if (panSpec === undefined || panSpec === null) p = 0;
  else if (typeof panSpec === 'number') p = Math.max(-1, Math.min(1, panSpec));
  else if (typeof panSpec === 'string') {
    const up = panSpec.toUpperCase();
    if (up === 'L') p = -1;
    else if (up === 'R') p = 1;
    else if (up === 'C') p = 0;
    else {
      const n = Number(panSpec);
      p = Number.isNaN(n) ? 0 : Math.max(-1, Math.min(1, n));
    }
  } else if (typeof panSpec === 'object') {
    if (panSpec.enum) {
      const up = String(panSpec.enum).toUpperCase();
      p = up === 'L' ? -1 : (up === 'R' ? 1 : 0);
    } else if (typeof panSpec.value === 'number') {
      p = Math.max(-1, Math.min(1, panSpec.value));
    } else p = 0;
  }
  // Ensure p is numeric
  if (p === null) p = 0;
  // hUGETracker stereo export uses dual-mono for center (full level on L+R).
  // Equal-power center (√2/2 per channel) is ~3 dB quieter and mismatches hUGE WAVs.
  if (p === 0) return { left: 1, right: 1 };
  // Equal-power panning for hard L/R and in-between positions
  const angle = ((p + 1) / 2) * (Math.PI / 2);
  const left = Math.cos(angle);
  const right = Math.sin(angle);
  return { left, right };
}

function resolveEventPan(ev: NoteEvent, inst: InstrumentNode): any {
  if (ev && (ev as any).pan !== undefined) return (ev as any).pan;
  if (inst) {
    const i = inst as Record<string, unknown>;
    if (i['gb:pan'] !== undefined) return i['gb:pan'];
    if (i['gg:pan'] !== undefined) return i['gg:pan'];
    if (i.gg_pan !== undefined) return i.gg_pan;
    if (i.pan !== undefined) return i.pan;
  }
  return undefined;
}

function renderNoteEvent(
  ev: NoteEvent,
  inst: InstrumentNode,
  buffer: Float32Array,
  startSample: number,
  durationSamples: number,
  sampleRate: number,
  channels: number,
  tickSeconds: number,
  chipType: string,
  isGameBoy: boolean,
  vibDepthScale: number,
  regPerTrackerBaseFactor: number,
  regPerTrackerUnit: number,
  channelId: number,
  pluginBackend: ChipChannelBackend | null = null
) {
  try {
    // removed debug logging
  } catch (e) {}
  const token = ev.token;
  const m = token.match(/^([A-G][#B]?)(-?\d+)$/i);
  if (!m) return;

  const note = m[1].toUpperCase();
  const octave = parseInt(m[2], 10);
  const midi = noteNameToMidi(note, octave);
  if (midi === null) return;

  const freq = midiToFreq(midi);

  // ── Plugin chip delegation ────────────────────────────────────────────────
  if (!isGameBoy && pluginBackend) {
    const panSpec = resolveEventPan(ev, inst);
    const gains = panToGains(panSpec);
    const { effectiveInst } = applyInlineRenderEffects(inst, ev.effects);
    renderWithPluginBackend(pluginBackend, freq, effectiveInst, buffer, startSample, durationSamples, sampleRate, channels, gains);
    return;
  }

  // Align frequency to Game Boy period table like the WebAudio path does
  const alignedFreq = freqFromRegister(registerFromFreq(freq));

  // Determine pan gains for stereo rendering
  let panSpec = resolveEventPan(ev, inst);
  const gains = panToGains(panSpec);

  const parsedFx = parseNoteEffects(ev.effects, durationSamples / sampleRate, tickSeconds);

  // Retrigger: expand into multiple note onsets (spec 112 / #42)
  const retrigTimes: { offsetSamples: number; volMul: number }[] = [{ offsetSamples: 0, volMul: 1 }];
  if (parsedFx.retrig && tickSeconds > 0) {
    const intervalSec = parsedFx.retrig.interval * tickSeconds;
    const intervalSamples = Math.max(1, Math.floor(intervalSec * sampleRate));
    let volMul = 1;
    let t = intervalSamples;
    while (t < durationSamples) {
      if (parsedFx.retrig.volumeDelta !== 0) {
        volMul = Math.max(0, Math.min(1, volMul + (parsedFx.retrig.volumeDelta / 15)));
      }
      retrigTimes.push({ offsetSamples: t, volMul });
      t += intervalSamples;
    }
  }

  // Strip retrig from effects passed to voice renderers (already expanded)
  const voiceEffects = Array.isArray(ev.effects)
    ? ev.effects.filter((fx: any) => fx && fx.type !== 'retrig')
    : ev.effects;

  for (let r = 0; r < retrigTimes.length; r++) {
    const { offsetSamples, volMul } = retrigTimes[r];
    const remaining = durationSamples - offsetSamples;
    if (remaining <= 0) break;
    // Each retrig plays until the next retrig (or note end)
    const nextOffset = r + 1 < retrigTimes.length ? retrigTimes[r + 1].offsetSamples : durationSamples;
    const sliceDur = Math.max(1, nextOffset - offsetSamples);

    let renderInst = inst;
    if (volMul !== 1 && inst.env) {
      const envParts = String(inst.env).split(',');
      if (envParts.length > 0) {
        const envLevel = Math.max(0, Math.min(15, Math.round(parseFloat(envParts[0]) * volMul)));
        renderInst = { ...inst, env: `${envLevel},${envParts.slice(1).join(',')}` };
      }
    }

    const at = startSample + offsetSamples;
    if (inst.type && inst.type.toLowerCase().includes('pulse')) {
      renderPulse(
        buffer,
        at,
        sliceDur,
        alignedFreq,
        renderInst,
        sampleRate,
        channels,
        gains,
        voiceEffects,
        tickSeconds,
        chipType,
        isGameBoy,
        vibDepthScale,
        regPerTrackerBaseFactor,
        regPerTrackerUnit,
        channelId,
        (ev.legato || false) && r === 0
      );
    } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
      renderWave(
        buffer,
        at,
        sliceDur,
        alignedFreq,
        renderInst,
        sampleRate,
        channels,
        gains,
        voiceEffects,
        tickSeconds,
        isGameBoy,
        vibDepthScale,
        regPerTrackerBaseFactor,
        regPerTrackerUnit,
        channelId,
        (ev.legato || false) && r === 0,
        freq
      );
    } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
      if (r === 0 && Array.isArray(ev.effects) && ev.effects.length > 0) {
        // Noise PCM currently supports instrument programs only; warn once via console for note effects
        // (Desktop WebAudio still applies them). Silent drop is forbidden by FR noise edge-case.
        try {
          // eslint-disable-next-line no-console
          console.warn('[pcm] Note effects on noise are not applied in PCM render; use instrument envelopes/programs.');
        } catch (_) {}
      }
      renderNoise(buffer, at, sliceDur, renderInst, sampleRate, channels, gains);
    }
  }
}

/**
 * Renders a named event (e.g., percussion hits) using the appropriate renderer.
 *
 * @param ev The named event to render.
 * @param inst The instrument to use.
 * @param buffer The target PCM buffer.
 * @param startSample The starting sample index.
 * @param durationSamples The duration in samples.
 * @param sampleRate The sample rate.
 * @param channels Number of audio channels.
 */
function renderNamedEvent(
  ev: any,
  inst: InstrumentNode,
  buffer: Float32Array,
  startSample: number,
  durationSamples: number,
  sampleRate: number,
  channels: number,
  tickSeconds: number,
  isGameBoy: boolean,
  vibDepthScale?: number,
  regPerTrackerBaseFactor?: number,
  regPerTrackerUnit?: number,
  channelId?: number,
  pluginBackend: ChipChannelBackend | null = null
) {
  // ── Plugin chip delegation ──────────────────────────────────────────────────
  if (!isGameBoy && pluginBackend) {
    const panSpec = resolveEventPan(ev, inst);
    const gains = panToGains(panSpec);
    // Resolve frequency: use defaultNote pitch for melodic instruments;
    // noise/dmc backends ignore the frequency parameter.
    let freq = 0;
    if (ev.defaultNote) {
      const m = ev.defaultNote.match(/^([A-G][#B]?)(-?\d+)$/i);
      if (m) {
        const midi = noteNameToMidi(m[1].toUpperCase(), parseInt(m[2], 10));
        if (midi !== null) freq = midiToFreq(midi);
      }
    }
    const { effectiveInst } = applyInlineRenderEffects(inst, ev.effects);
    renderWithPluginBackend(pluginBackend, freq, effectiveInst, buffer, startSample, durationSamples, sampleRate, channels, gains);
    return;
  }

  // For noise instruments, ignore defaultNote and render as noise
  // (noise doesn't use traditional pitch; defaultNote is not applicable)
  if (inst.type && inst.type.toLowerCase().includes('noise')) {
    // Determine pan gains for stereo rendering
    const panSpec = resolveEventPan(ev, inst);
    const gains = panToGains(panSpec);
    renderNoise(buffer, startSample, durationSamples, inst, sampleRate, channels, gains);
    return;
  }

  // For pulse/wave instruments with defaultNote, parse and render at specified pitch
  if (ev.defaultNote) {
    const noteToken = ev.defaultNote;
    const m = noteToken.match(/^([A-G][#B]?)(-?\d+)$/i);
    if (m) {
      const note = m[1].toUpperCase();
      const octave = parseInt(m[2], 10);
      const midi = noteNameToMidi(note, octave);
      if (midi !== null) {
        const freq = midiToFreq(midi);
        // Align frequency to Game Boy period table like the WebAudio path does
        const alignedFreq = freqFromRegister(registerFromFreq(freq));

        // Determine pan gains for stereo rendering
        const panSpec = resolveEventPan(ev, inst);
        const gains = panToGains(panSpec);

        if (inst.type && inst.type.toLowerCase().includes('pulse')) {
          renderPulse(
            buffer,
            startSample,
            durationSamples,
            alignedFreq,
            inst,
            sampleRate,
            channels,
            gains,
            ev.effects,
            tickSeconds,
            'gameboy',
            isGameBoy,
            vibDepthScale,
            regPerTrackerBaseFactor,
            regPerTrackerUnit,
            channelId,
            false
          );
          return;
        } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
          renderWave(
            buffer,
            startSample,
            durationSamples,
            alignedFreq,
            inst,
            sampleRate,
            channels,
            gains,
            ev.effects,
            tickSeconds,
            isGameBoy,
            vibDepthScale,
            regPerTrackerBaseFactor,
            regPerTrackerUnit,
            channelId,
            false
          );
          return;
        }
      }
    }
  }
}

/**
 * Renders a Game Boy pulse channel (Pulse 1 or Pulse 2).
 * Supports duty cycle, envelope, and frequency sweep.
 *
 * @param buffer The target PCM buffer.
 * @param start The starting sample index.
 * @param duration The duration in samples.
 * @param freq The base frequency of the note.
 * @param inst The instrument definition.
 * @param sampleRate The sample rate.
 * @param channels Number of audio channels.
 */
function renderPulse(
  buffer: Float32Array,
  start: number,
  duration: number,
  freq: number,
  inst: InstrumentNode,
  sampleRate: number,
  channels: number,
  gains: { left: number; right: number } = { left: 1, right: 1 },
  effects?: any[],
  tickSeconds?: number,
  chipType?: string,
  isGameBoy?: boolean,
  vibDepthScale?: number,
  regPerTrackerBaseFactor?: number,
  regPerTrackerUnit?: number,
  channelId?: number,
  legato?: boolean
) {
  // removed debug logging
  // Parse duty - handle various formats
  let duty = 0.5;
    if (inst.duty) {
    const dutyStr = String(inst.duty);
    const dutyNum = parseFloat(dutyStr);
    if (!isNaN(dutyNum)) {
      duty = dutyNum > 1 ? dutyNum / 100 : dutyNum; // Handle both 50 and 0.5
    }
  }
  const envelope = parsePulseEnvelope(inst.env);
  const durSec = duration / sampleRate;

  const sweep = parseSweep(inst.sweep);
  let currentFreq = freq;
  let currentReg = registerFromFreq(freq);
  const sweepIntervalSamples = sweep ? (sweep.time / 128) * sampleRate : 0;

  // Shared modulation parse (spec 112) — same contract as WebAudio effect handlers
  const noteFx: ParsedNoteEffects = parseNoteEffects(effects, durSec, tickSeconds);
  // Ensure port duration uses note length when resolver did not supply durationSec
  if (noteFx.portSpeed > 0 && !(typeof noteFx.portDurationSec === 'number' && noteFx.portDurationSec > 0)) {
    noteFx.portDurationSec = portamentoDurationSec(noteFx.portSpeed, durSec);
  }

  // Initialize per-channel phase state for continuous phase across notes
  // WebAudio starts a new OscillatorNode + vib LFO per note (phase restart) unless
  // a held portamento voice is reused. Keep carrier/LFO phase only for legato/port.
  const continuePhase = !!(legato || (noteFx.portSpeed > 0));
  let phase = (continuePhase && typeof channelId === 'number')
    ? (channelPhaseState.get(channelId) ?? 0)
    : 0;
  let vibratoPhase = (continuePhase && typeof channelId === 'number')
    ? (channelVibratoPhase.get(channelId) ?? 0)
    : 0;

  // For legato notes, retrieve envelope state to sustain at previous level (no decay)
  let envelopeSustainValue: number | undefined = undefined;
  if (legato && typeof channelId === 'number') {
    const envState = channelEnvelopeState.get(channelId);
    if (envState) {
      envelopeSustainValue = envState.lastValue; // Freeze at this level for legato
    }
  }

  // Game Boy instrument tick program (arp_env / duty_env / pitch_env / vol_env / subpat)
  const instRec = inst as Record<string, unknown>;
  const gbProgram = (isGameBoy || chipType === 'gameboy')
    ? lowerGameBoyInstrumentProgram(instRec)
    : null;
  const useGbProgram = !!(gbProgram && gbProgram.enabled);
  const useGbProgramVolume = useGbProgram && gbProgram!.rows.some((r) => tickRowVolume(r) !== null);
  let programDuty = duty;
  let programOffset: number | null = 0;
  let programVolScale = 1;
  let lastProgramTick = -1;
  const gbCursor = useGbProgram ? createTickProgramCursor(gbProgram!) : null;
  if (gbCursor) {
    const r0 = gbCursor.rowAt(0);
    if (r0) {
      const d0 = tickRowDutyFraction(r0);
      if (d0 !== null) programDuty = d0;
      programOffset = r0.offset === undefined ? 0 : r0.offset;
      if (useGbProgramVolume) {
        const v0 = tickRowVolume(r0);
        if (v0 !== null) programVolScale = v0 / 15;
      }
    }
  }

  // Band-limited pulse cache — matches WebAudio PeriodicWave (#271 / spec 112)
  let pulseCache: PulseFourierCache = getPulseFourierCache(programDuty);

  // 5 ms tail past the nominal end. Phase handed to the next note is the
  // phase at that end, so a portamento join is not shifted by the tail.
  const renderLength = duration + Math.round(GB_NOTE_RELEASE_SEC * sampleRate);
  let phaseAtNominalEnd = phase;
  let vibratoPhaseAtNominalEnd = vibratoPhase;

  for (let i = 0; i < renderLength; i++) {
    const t = i / sampleRate;

    // normal rendering loop

    if (gbCursor) {
      const tick = Math.floor(Math.min(t, durSec) * 60);
      if (tick !== lastProgramTick) {
        lastProgramTick = tick;
        const row = gbCursor.rowAt(tick);
        if (row) {
          const d = tickRowDutyFraction(row);
          if (d !== null) programDuty = d;
          programOffset = row.offset === undefined ? null : row.offset;
          if (useGbProgramVolume) {
            const v = tickRowVolume(row);
            if (v !== null) programVolScale = v / 15;
          }
        }
      }
    }

    // Apply sweep
    const sweepInterval = Math.floor(sweepIntervalSamples);
    if (sweep && sweep.time > 0 && sweepInterval > 0 && i > 0 && i % sweepInterval === 0) {
      const delta = currentReg >> sweep.shift;
      if (sweep.direction === 'up') currentReg += delta;
      else currentReg -= delta;

      if (currentReg < 0) currentReg = 0;
      if (currentReg > 2047) {
        currentFreq = 0; // Silence
      } else {
        currentFreq = freqFromRegister(currentReg);
      }
    }

    let baseForMod = useGbProgram
      ? applyTickOffsetToFreq(currentFreq, programOffset)
      : currentFreq;

    const lastFreq = (typeof channelId === 'number')
      ? (channelPortamentoState.get(channelId) ?? baseForMod)
      : baseForMod;

    const pitched = modulatePitchHz({
      t,
      noteDurSec: durSec,
      baseFreq: baseForMod,
      lastFreq: noteFx.portSpeed > 0 ? lastFreq : undefined,
      fx: noteFx,
      chipType,
      vibDepthScale: vibDepthScale ?? VIB_DEPTH_SCALE,
      vibratoPhase,
      portCurve: 'exponential',
    });
    let effFreq = pitched.freq;
    // Advance LFO only while vib is audible — matches WebAudio lfo.start(lfoStart)
    // (phase must not run during vibDelaySec).
    const vibActive =
      noteFx.vibDepth !== 0 &&
      noteFx.vibRate > 0 &&
      (typeof noteFx.vibDelaySec !== 'number' || t >= noteFx.vibDelaySec) &&
      (typeof noteFx.vibDurationSec === 'undefined' || t < noteFx.vibDurationSec);
    if (vibActive) {
      vibratoPhase = advanceVibratoPhase(vibratoPhase, noteFx.vibRate, sampleRate);
    }

    // Save current frequency for next note's portamento (all notes)
    if (typeof channelId === 'number' && i === duration - 1) {
      channelPortamentoState.set(channelId, currentFreq);
    }

    // Apply pitch sweep (GB NR10) — hardware sweep after note effects
    effFreq = applySweepToFrequency(
      freq,
      effFreq,
      t,
      noteFx.sweepTime,
      noteFx.sweepShift,
      noteFx.sweepDirection
    );

    const activeDuty = useGbProgram ? programDuty : duty;
    pulseCache = getPulseFourierCache(activeDuty, 200, pulseCache);
    let sample = 0;
    if (effFreq > 0 && effFreq < sampleRate / 2) {
      phase += effFreq / sampleRate;
      phase = phase % 1.0;
      // Cap harmonics at Nyquist (matches WebAudio oscillator band-limiting).
      sample = bandLimitedPulseSample(phase, pulseCache, effFreq, sampleRate);
    }

    const envT = Math.min(t, durSec);
    const envVal = useGbProgramVolume
      ? programVolScale
      : ((envelopeSustainValue !== undefined) ? envelopeSustainValue : getEnvelopeValue(envT, envelope, durSec));
    sample = sample * envVal * linearReleaseGain(t, durSec, GB_NOTE_RELEASE_SEC);

    if (noteFx.cutEnabled && typeof tickSeconds === 'number') {
      sample *= noteCutGain(t, noteFx.cutTicks, tickSeconds);
    }

    sample *= tremoloGain(
      t,
      noteFx.tremDepth,
      noteFx.tremRate,
      noteFx.tremWaveform,
      noteFx.tremDurationSec,
      noteFx.tremDelaySec
    );

    if (noteFx.volDelta !== 0) {
      let baseline = 1.0;
      let volSlideGain: number;
      if (envelope && envelope.mode === 'gb' && typeof envelope.initial === 'number') {
        baseline = Math.max(0, Math.min(1, envelope.initial / 15));
      }
      if (noteFx.volSteps !== undefined && typeof tickSeconds === 'number') {
        const stepDuration = durSec / noteFx.volSteps;
        const currentStep = Math.min(noteFx.volSteps, Math.floor(t / stepDuration));
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (noteFx.volDelta * currentStep / noteFx.volSteps / 5)));
      } else {
        const progress = Math.min(1, t / durSec);
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (noteFx.volDelta * progress / 5)));
      }
      sample = sample * volSlideGain;
    }

    sample *= PULSE_OUTPUT_GAIN;

    if (i === duration - 1) {
      phaseAtNominalEnd = phase;
      vibratoPhaseAtNominalEnd = vibratoPhase;
    }

    const bufferIdx = (start + i) * channels;
    if (bufferIdx < buffer.length) {
      if (channels === 2) {
        if (bufferIdx < buffer.length) buffer[bufferIdx] += sample * gains.left;
        if (bufferIdx + 1 < buffer.length) buffer[bufferIdx + 1] += sample * gains.right;
      } else {
        buffer[bufferIdx] += sample;
      }
    }
  }

  // Echo / delay post-process for this note region (spec 112 / #42)
  if (noteFx.echo) {
    applyPcmEcho(buffer, start, duration, sampleRate, channels, noteFx.echo, tickSeconds);
  }

  // Save phase and vibrato state for next note on this channel
  if (typeof channelId === 'number') {
    channelPhaseState.set(channelId, phaseAtNominalEnd);
    channelVibratoPhase.set(channelId, vibratoPhaseAtNominalEnd);

    // Save envelope state for potential legato continuation
    // Use sustained value if this was a legato note, otherwise compute final value
    const finalEnvVal = (envelopeSustainValue !== undefined) ? envelopeSustainValue : getEnvelopeValue(durSec, envelope, durSec);
    channelEnvelopeState.set(channelId, {
      time: durSec,
      lastValue: finalEnvVal,
      mode: envelope.mode || 'adsr'
    });
  }
}

/**
 * Renders a Game Boy wave channel.
 * Uses a 32-nibble 4-bit wavetable matching GB Wave RAM.
 * 16-value inputs are tiled to 32 via shared parseWaveTable (spec 112).
 */
function renderWave(
  buffer: Float32Array,
  start: number,
  duration: number,
  freq: number,
  inst: InstrumentNode,
  sampleRate: number,
  channels: number,
  gains: { left: number; right: number } = { left: 1, right: 1 },
  effects?: any[],
  tickSeconds?: number,
  isGameBoy?: boolean,
  vibDepthScale?: number,
  regPerTrackerBaseFactor?: number,
  regPerTrackerUnit?: number,
  channelId?: number,
  legato?: boolean,
  /** Pitch remembered for the next portamento. WebAudio stores midiToFreq, not the register-aligned frequency. */
  portOriginHz?: number
) {
  const _parsedWave = inst.wave ? parseWaveTable(inst.wave) : null;
  const DEFAULT_WAVE = [0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15, 0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15];
  const waveTable: number[] = (_parsedWave && _parsedWave.length > 0) ? _parsedWave : DEFAULT_WAVE;
  const waveMean = waveTable.reduce((a: number, b: number) => a + b, 0) / waveTable.length;
  const volMul = resolveWaveVolumeMultiplier(inst as { volume?: unknown; vol?: unknown });
  const durSec = duration / sampleRate;

  const noteFx: ParsedNoteEffects = parseNoteEffects(effects, durSec, tickSeconds);
  if (noteFx.portSpeed > 0 && !(typeof noteFx.portDurationSec === 'number' && noteFx.portDurationSec > 0)) {
    noteFx.portDurationSec = portamentoDurationSec(noteFx.portSpeed, durSec);
  }

  // WebAudio starts a new BufferSource (phase 0) and a new vibrato LFO on every
  // wave note, including portamento. Only legato keeps the previous phase.
  const continueWavePhase = !!legato;
  let phase = (continueWavePhase && typeof channelId === 'number')
    ? (channelPhaseState.get(channelId) ?? 0)
    : 0;
  let vibratoPhase = (continueWavePhase && typeof channelId === 'number')
    ? (channelVibratoPhase.get(channelId) ?? 0)
    : 0;

  let volumeSustainValue: number | undefined = undefined;
  if (legato && typeof channelId === 'number') {
    const envState = channelEnvelopeState.get(channelId);
    if (envState) volumeSustainValue = envState.lastValue;
  }

  const instRec = inst as Record<string, unknown>;
  const gbProgram = (isGameBoy) ? lowerGameBoyInstrumentProgram(instRec) : null;
  const useGbProgram = !!(gbProgram && gbProgram.enabled);
  const useGbProgramVolume = useGbProgram && gbProgram!.rows.some((r) => tickRowVolume(r) !== null);
  let programOffset: number | null = 0;
  let programVolScale = 1;
  let lastProgramTick = -1;
  const gbCursor = useGbProgram ? createTickProgramCursor(gbProgram!) : null;
  if (gbCursor) {
    const r0 = gbCursor.rowAt(0);
    if (r0) {
      programOffset = r0.offset === undefined ? 0 : r0.offset;
      if (useGbProgramVolume) {
        const v0 = tickRowVolume(r0);
        if (v0 !== null) programVolScale = v0 / 15;
      }
    }
  }

  const waveEnv = parsePulseEnvelope((inst as { env?: unknown }).env);
  const gbCurve = !!(waveEnv && waveEnv.mode === 'gb' && (waveEnv.period ?? 0) > 0);
  const linearWaveRelease = useGbProgramVolume || gbCurve;
  const waveTailSec = linearWaveRelease ? GB_NOTE_RELEASE_SEC : WAVE_TAIL_SEC;
  const renderLength = duration + Math.round(waveTailSec * sampleRate);
  const waveBaseGain = Math.max(
    1e-8,
    WAVE_PLAYBACK_GAIN * ((volumeSustainValue !== undefined) ? volumeSustainValue : volMul)
  );
  let phaseAtNominalEnd = phase;
  let vibratoPhaseAtNominalEnd = vibratoPhase;

  // One-cycle zero-order-hold buffer, same construction as playWavetable.
  // playbackRate scales with the gliding frequency; linear interpolation matches
  // AudioBufferSourceNode.
  const cycleLen = waveTable.length;
  const bufLen = Math.max(cycleLen, Math.round(sampleRate / Math.max(freq, 1)));
  const baseRate = (freq * bufLen) / sampleRate;
  const waveBuf = new Float32Array(bufLen);
  for (let s = 0; s < bufLen; s++) {
    const step = Math.floor((s * cycleLen) / bufLen) % cycleLen;
    waveBuf[s] = ((waveTable[step] - waveMean) / 15.0) * WAVE_OUTPUT_SCALE;
  }
  let readPos = phase * bufLen;

  for (let i = 0; i < renderLength; i++) {
    const t = i / sampleRate;

    if (gbCursor) {
      const tick = Math.floor(Math.min(t, durSec) * 60);
      if (tick !== lastProgramTick) {
        lastProgramTick = tick;
        const row = gbCursor.rowAt(tick);
        if (row) {
          programOffset = row.offset === undefined ? null : row.offset;
          if (useGbProgramVolume) {
            const v = tickRowVolume(row);
            if (v !== null) programVolScale = v / 15;
          }
        }
      }
    }

    const baseForMod = useGbProgram
      ? applyTickOffsetToFreq(freq, programOffset)
      : freq;

    const lastFreq = (typeof channelId === 'number')
      ? (channelPortamentoState.get(channelId) ?? baseForMod)
      : baseForMod;

    const pitched = modulatePitchHz({
      t,
      noteDurSec: durSec,
      baseFreq: baseForMod,
      lastFreq: noteFx.portSpeed > 0 ? lastFreq : undefined,
      fx: noteFx,
      chipType: isGameBoy ? 'gameboy' : undefined,
      vibDepthScale: vibDepthScale ?? VIB_DEPTH_SCALE,
      vibratoPhase,
      portCurve: 'linear',
    });
    let effFreq = pitched.freq;
    const waveVibActive =
      noteFx.vibDepth !== 0 &&
      noteFx.vibRate > 0 &&
      (typeof noteFx.vibDelaySec !== 'number' || t >= noteFx.vibDelaySec) &&
      (typeof noteFx.vibDurationSec === 'undefined' || t < noteFx.vibDurationSec);
    if (waveVibActive) {
      vibratoPhase = advanceVibratoPhase(vibratoPhase, noteFx.vibRate, sampleRate);
    }

    if (typeof channelId === 'number' && i === duration - 1) {
      channelPortamentoState.set(channelId, portOriginHz ?? freq);
    }

    effFreq = applySweepToFrequency(
      freq,
      effFreq,
      t,
      noteFx.sweepTime,
      noteFx.sweepShift,
      noteFx.sweepDirection
    );

    let v = 0;
    if (effFreq > 0 && effFreq < sampleRate / 2 && freq > 0) {
      const rate = (effFreq / freq) * baseRate;
      const wrapped = readPos % bufLen;
      const i0 = Math.floor(wrapped) % bufLen;
      const frac = wrapped - Math.floor(wrapped);
      const i1 = (i0 + 1) % bufLen;
      v = waveBuf[i0] * (1 - frac) + waveBuf[i1] * frac;
      readPos += rate;
      phase = (readPos % bufLen) / bufLen;
    }
    const effectiveVolMul = (volumeSustainValue !== undefined) ? volumeSustainValue : volMul;
    // WebAudio: buffer (*0.9) × gain (WAVE_PLAYBACK_GAIN × volMul)
    let sample = v * effectiveVolMul * WAVE_PLAYBACK_GAIN * (useGbProgramVolume ? programVolScale : 1);

    sample *= tremoloGain(
      t,
      noteFx.tremDepth,
      noteFx.tremRate,
      noteFx.tremWaveform,
      noteFx.tremDurationSec,
      noteFx.tremDelaySec
    );

    if (noteFx.cutEnabled && typeof tickSeconds === 'number') {
      sample *= noteCutGain(t, noteFx.cutTicks, tickSeconds);
    }

    if (noteFx.volDelta !== 0) {
      const baseline = Math.max(0, Math.min(1, volMul));
      let volSlideGain: number;
      if (noteFx.volSteps !== undefined) {
        const stepDuration = durSec / noteFx.volSteps;
        const currentStep = Math.min(noteFx.volSteps, Math.floor(t / stepDuration));
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (noteFx.volDelta * currentStep / noteFx.volSteps / 5)));
      } else {
        const progress = Math.min(1, t / durSec);
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (noteFx.volDelta * progress / 5)));
      }
      sample *= volSlideGain;
    }

    sample *= linearWaveRelease
      ? linearReleaseGain(t, durSec, GB_NOTE_RELEASE_SEC)
      : waveExponentialReleaseGain(t, durSec, waveBaseGain);

    if (i === duration - 1) {
      phaseAtNominalEnd = phase;
      vibratoPhaseAtNominalEnd = vibratoPhase;
    }

    const bufferIdx = (start + i) * channels;
    if (bufferIdx < buffer.length) {
      if (channels === 2) {
        if (bufferIdx < buffer.length) buffer[bufferIdx] += sample * gains.left;
        if (bufferIdx + 1 < buffer.length) buffer[bufferIdx + 1] += sample * gains.right;
      } else {
        buffer[bufferIdx] += sample;
      }
    }
  }

  if (noteFx.echo) {
    applyPcmEcho(buffer, start, duration, sampleRate, channels, noteFx.echo, tickSeconds);
  }

  if (typeof channelId === 'number') {
    channelPhaseState.set(channelId, phaseAtNominalEnd);
    channelVibratoPhase.set(channelId, vibratoPhaseAtNominalEnd);
    const finalVol = (volumeSustainValue !== undefined) ? volumeSustainValue : volMul;
    channelEnvelopeState.set(channelId, {
      time: durSec,
      lastValue: finalVol,
      mode: 'fixed'
    });
  }
}

/**
 * Renders a Game Boy noise channel.
 * Uses an LFSR (Linear Feedback Shift Register) to generate noise.
 *
 * @param buffer The target PCM buffer.
 * @param start The starting sample index.
 * @param duration The duration in samples.
 * @param inst The instrument definition containing noise parameters.
 * @param sampleRate The sample rate.
 * @param channels Number of audio channels.
 */
function renderNoise(
  buffer: Float32Array,
  start: number,
  duration: number,
  inst: InstrumentNode,
  sampleRate: number,
  channels: number,
  gains: { left: number; right: number } = { left: 1, right: 1 }
) {
  const envelope = parsePulseEnvelope(inst.env);

  const durSec = duration / sampleRate;
  const instRec = inst as Record<string, unknown>;

  const width = resolveNoiseWidth(instRec);
  const width7 = width === 7;
  const GB_CLOCK = 4194304;

  const program = lowerGameBoyInstrumentProgram(instRec);
  const useProgramVolume = program.enabled && program.rows.some((r) => tickRowVolume(r) !== null);

  let currentOffset: number | null = 0;
  let { shift, divisor } = program.enabled
    ? resolveNoiseClockWithOffset(instRec, 0)
    : resolveNoiseClock(instRec);
  let lfsrHz = noiseClockToLfsrHz(shift, divisor, GB_CLOCK);
  let lastTick = -1;
  let volScale = 1;
  const cursor = program.enabled ? createTickProgramCursor(program) : null;

  let phase = 0;
  let lfsr = triggerGameBoyLfsr(width7);

  const renderLength = duration + Math.round(GB_NOTE_RELEASE_SEC * sampleRate);
  for (let i = 0; i < renderLength; i++) {
    const t = i / sampleRate;

    if (cursor) {
      const tick = Math.floor(Math.min(t, durSec) * 60);
      if (tick !== lastTick) {
        lastTick = tick;
        const row = cursor.rowAt(tick);
        if (row) {
          if (row.offset !== currentOffset) {
            currentOffset = row.offset;
            ({ shift, divisor } = resolveNoiseClockWithOffset(instRec, currentOffset));
            lfsrHz = noiseClockToLfsrHz(shift, divisor, GB_CLOCK);
          }
          if (useProgramVolume) {
            const v = tickRowVolume(row);
            if (v !== null) volScale = v / 15;
          }
        }
      }
    }

    // Update LFSR at proper frequency
    phase += lfsrHz / sampleRate;
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let tick = 0; tick < ticks; tick++) {
        lfsr = stepGameBoyLfsr(lfsr, width7);
      }
      phase -= ticks;
    }

    const noise = gameBoyNoiseSample(lfsr) * NOISE_OUTPUT_GAIN;
    const envT = Math.min(t, durSec);
    const envVal = useProgramVolume ? volScale : getEnvelopeValue(envT, envelope, durSec);
    const sample = noise * envVal * linearReleaseGain(t, durSec, GB_NOTE_RELEASE_SEC);

    const bufferIdx = (start + i) * channels;
    if (bufferIdx < buffer.length) {
      if (channels === 2) {
        if (bufferIdx < buffer.length) buffer[bufferIdx] += sample * gains.left;
        if (bufferIdx + 1 < buffer.length) buffer[bufferIdx + 1] += sample * gains.right;
      } else {
        buffer[bufferIdx] += sample; // mono
      }
    }
  }
}

/**
 * Parses an envelope definition into its components.
 * Supports "gb:initial,direction,period" and "initial,direction,period" formats.
 *
 * @param env The envelope definition.
 * @returns An object containing initial volume, direction, and period.
 */
// Use the same envelope parsing as the WebAudio path (pulse.parseEnvelope)
// and approximate ADSR/GB behavior in sample domain for parity.
function getEnvelopeValue(t: number, envObj: any, dur?: number): number {
  if (!envObj) return 1;
  // GB-style envelope
  if (envObj.mode === 'gb' || typeof envObj.initial !== 'undefined' && typeof envObj.period !== 'undefined') {
    const initial = envObj.initial ?? envObj.level ?? 15;
    const period = envObj.period ?? envObj.step ?? 1;
    if (period === 0) return Math.max(0, Math.min(1, (initial / 15)));
    // Match WebAudio setValueCurveAtTime: linear between GB steps for
    // (steps × stepPeriod), then hold the last step until the note ends.
    // Continuing the ramp past the curve made the last frames ~1 dB quiet.
    const stepDuration = period * (65536 / 4194304);
    const noteDur = typeof dur === 'number' && dur > 0 ? dur : t;
    const maxSteps = Math.max(1, Math.floor(noteDur / stepDuration));
    const levels: number[] = [initial];
    let cur = initial;
    for (let s = 1; s <= maxSteps; s++) {
      if (envObj.direction === 'up') cur = Math.min(15, cur + 1);
      else cur = Math.max(0, cur - 1);
      levels.push(cur);
      if (cur === 0 || cur === 15) break;
    }
    const curveDuration = (levels.length - 1) * stepDuration;
    const te = Math.min(Math.max(t, 0), noteDur);
    let volume: number;
    if (te >= curveDuration || levels.length < 2) {
      volume = levels[levels.length - 1];
    } else {
      const stepF = te / stepDuration;
      const i0 = Math.min(levels.length - 2, Math.floor(stepF));
      const frac = stepF - i0;
      volume = levels[i0] + (levels[i0 + 1] - levels[i0]) * frac;
    }
    return Math.max(0, Math.min(1, volume / 15));
  }

  // ADSR-like envelope (mode 'adsr' or parsed ADSR object)
  const env: any = envObj;
  const attack = Math.max(0, env.attack ?? 0.001);
  const decay = Math.max(0.001, env.decay ?? 0.05);
  const sustain = Math.max(0, Math.min(1, env.sustainLevel ?? env.sustain ?? 0.5));
  const release = Math.max(0.001, env.release ?? 0.02);
  const attackLevel = env.attackLevel ?? 1.0;

  if (t < 0) return 0.0001;
  if (t < attack) {
    // exponential-like attack to better match WebAudio gain scheduling
    const tau = Math.max(attack, 1e-6) / 5;
    const x = 1 - Math.exp(-t / tau);
    return 0.0001 + (attackLevel - 0.0001) * x;
  }

  // value at attack
  const vAtAttack = attackLevel;
  const tAfterAttack = t - attack;

  // decay phase: exponential approach from vAtAttack to sustain with time constant = decay
  if (tAfterAttack < decay) {
    const x = tAfterAttack;
    return sustain + (vAtAttack - sustain) * Math.exp(-x / decay);
  }

  // sustain phase
  let current = sustain;

  // handle release if duration provided
  if (typeof dur === 'number') {
    const relStart = Math.max(0, dur - release);
    if (t >= relStart) {
      const vAtRelStart = (relStart <= attack) ? (relStart <= 0 ? 0.0001 : (0.0001 + (attackLevel - 0.0001) * (relStart / attack))) :
        (sustain + (vAtAttack - sustain) * Math.exp(-(relStart - attack) / decay));
      const relT = t - relStart;
      return Math.max(0.0001, 0.0001 + (vAtRelStart - 0.0001) * Math.exp(-relT / release));
    }
  }

  return current;
}

/**
 * Normalizes the audio buffer to a peak of 0.95.
 *
 * @param buffer The audio buffer to normalize.
 * @param force If true, always normalizes the buffer regardless of current peak level.
 *              If false, only normalizes if the peak exceeds 0.95 (to prevent clipping).
 */
function normalizeBuffer(buffer: Float32Array, force: boolean): void {
  if (!force) {
    peakLimitForPlayback(buffer, PLAYBACK_PEAK_CEILING);
    return;
  }

  let max = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > max) max = abs;
  }

  if (max > 0) {
    const scale = PLAYBACK_PEAK_CEILING / max;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= scale;
    }
  }
}
