import { SongModel, NoteEvent } from '../song/songModel.js';
import { midiToFreq, noteNameToMidi } from '../chips/gameboy/apu.js';
import { parseSweep, parseEnvelope as parsePulseEnvelope } from '../chips/gameboy/pulse.js';
import { registerFromFreq, freqFromRegister } from '../chips/gameboy/periodTables.js';
import { InstMap, InstrumentNode } from '../parser/ast.js';

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
const EXPORTER_VIB_DEPTH_SCALE = 4.0;

// Apply hUGEDriver-style period modification: add `offset` to the low 8 bits
// of the GB period register (NR13 low byte), clamp to valid 11-bit range.
function applyHugeDriverOffset(baseReg: number, offset: number): number {
  // hUGEDriver adds the low-nibble depth to the 16-bit period value.
  const sum = baseReg + offset;
  // Clamp to 11-bit GB period range (0..2047)
  return Math.max(0, Math.min(2047, Math.round(sum)));
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
 * Renders a complete song to a PCM buffer.
 *
 * @param song The song model containing channels and events.
 * @param opts Rendering options (sampleRate, channels, bpm, etc.).
 * @returns a Float32Array containing the interleaved PCM samples.
 */
export function renderSongToPCM(song: SongModel, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const channels = opts.channels ?? 1;
  const bpm = opts.bpm ?? 128;
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
  const chipType = (song.chip || 'gameboy').toLowerCase();
  const isGameBoy = chipType === 'gameboy';
  const vibDepthScale = typeof opts.vibDepthScale === 'number' ? opts.vibDepthScale : EXPORTER_VIB_DEPTH_SCALE;
  const regPerTrackerBaseFactor = typeof opts.regPerTrackerBaseFactor === 'number' ? opts.regPerTrackerBaseFactor : RENDER_REG_PER_TRACKER_BASE_FACTOR;
  const regPerTrackerUnit = typeof opts.regPerTrackerUnit === 'number' ? opts.regPerTrackerUnit : RENDER_REG_PER_TRACKER_UNIT;

  for (const ch of song.channels) {
    if (renderChannels.includes(ch.id)) {
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
        regPerTrackerUnit
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
  regPerTrackerUnit: number
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

    const startSample = Math.floor(time * sampleRate);
    const durationSamples = Math.floor(dur * sampleRate);

    // Debug: log first note duration for channel 1 to diagnose headless vs browser
    try {
        // diagnostic removed
    } catch (e) {}

    if (ev.type === 'note') {
      renderNoteEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels, tickSeconds, chipType, isGameBoy, vibDepthScale, regPerTrackerBaseFactor, regPerTrackerUnit, ch.id);

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
      renderNamedEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels, tickSeconds, isGameBoy, vibDepthScale, regPerTrackerBaseFactor, regPerTrackerUnit, ch.id);

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
  // Equal-power panning
  const angle = ((p + 1) / 2) * (Math.PI / 2);
  const left = Math.cos(angle);
  const right = Math.sin(angle);
  return { left, right };
}

function resolveEventPan(ev: NoteEvent, inst: InstrumentNode): any {
  if (ev && (ev as any).pan) return (ev as any).pan;
  if (inst) {
    if ((inst as any)['gb:pan']) return (inst as any)['gb:pan'];
    if ((inst as any)['pan'] !== undefined) return (inst as any)['pan'];
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
  channelId: number
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
  // Align frequency to Game Boy period table like the WebAudio path does
  const alignedFreq = freqFromRegister(registerFromFreq(freq));

  // Determine pan gains for stereo rendering
  let panSpec = resolveEventPan(ev, inst);
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
      chipType,
      isGameBoy,
      vibDepthScale,
      regPerTrackerBaseFactor,
      regPerTrackerUnit,
      channelId,
      ev.legato || false
    );
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
      ev.legato || false
    );
  } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
    renderNoise(buffer, startSample, durationSamples, inst, sampleRate, channels, gains);
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
  _vibDepthScale?: number,
  _regPerTrackerBaseFactor?: number,
  _regPerTrackerUnit?: number,
  _channelId?: number
) {
  // Named events are typically noise-based percussion
  if (inst.type && inst.type.toLowerCase().includes('noise')) {
    renderNoise(buffer, startSample, durationSamples, inst, sampleRate, channels);
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

  // Generate simple square wave (harmonics were making it sound worse)
  // Vibrato params (depth in register-units, rate in Hz). Support 4th param = duration in rows.
  let vibDepth = 0;
  let vibRate = 0;
  let vibDurationSec: number | undefined = undefined;
  // Portamento params
  let portSpeed = 0;
  let portDurationSec: number | undefined = undefined;
  // Arpeggio params - semitone offsets
  let arpOffsets: number[] = [];
  // Volume slide params
  let volDelta = 0;
  let volSteps: number | undefined = undefined;
  if (Array.isArray(effects)) {
    for (const fx of effects) {
      try {
        if (fx && fx.type === 'vib') {
          const p = fx.params || [];
          vibDepth = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          vibRate = Number(typeof p[1] !== 'undefined' ? p[1] : 0);
          // Prefer resolver-provided durationSec, else fall back to 4th param as rows
          if (typeof fx.durationSec === 'number') {
            vibDurationSec = Number(fx.durationSec);
          } else {
            const durRows = typeof p[3] !== 'undefined' ? Number(p[3]) : undefined;
            if (typeof durRows === 'number' && !Number.isNaN(durRows) && typeof tickSeconds === 'number') {
              vibDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
            }
          }
        } else if (fx && fx.type === 'port') {
          const p = fx.params || [];
          portSpeed = Number(typeof p[0] !== 'undefined' ? p[0] : 16);
          // Prefer resolver-provided durationSec for portamento duration
          if (typeof fx.durationSec === 'number') {
            portDurationSec = Number(fx.durationSec);
          } else {
            const durRows = typeof p[1] !== 'undefined' ? Number(p[1]) : undefined;
            if (typeof durRows === 'number' && !Number.isNaN(durRows) && typeof tickSeconds === 'number') {
              portDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
            }
          }
        } else if (fx && fx.type === 'arp') {
          const p = fx.params || [];
          // Parse semitone offsets - filter out non-numeric values
          arpOffsets = p
            .map((x: any) => Number(x))
            .filter((n: number) => Number.isFinite(n) && n >= 0);
        } else if (fx && fx.type === 'volSlide') {
          const p = fx.params || [];
          volDelta = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          volSteps = typeof p[1] !== 'undefined' ? Number(p[1]) : undefined;
          if (!Number.isFinite(volDelta)) volDelta = 0;
          if (volSteps !== undefined && !Number.isFinite(volSteps)) volSteps = undefined;
        }
      } catch (e) {}
    }
  }

  // Initialize per-channel phase state for continuous phase across notes
  let phase = (typeof channelId === 'number') ? (channelPhaseState.get(channelId) ?? 0) : 0;
  let vibratoPhase = (typeof channelId === 'number') ? (channelVibratoPhase.get(channelId) ?? 0) : 0;

  // For legato notes, retrieve envelope state to sustain at previous level (no decay)
  let envelopeSustainValue: number | undefined = undefined;
  if (legato && typeof channelId === 'number') {
    const envState = channelEnvelopeState.get(channelId);
    if (envState) {
      envelopeSustainValue = envState.lastValue; // Freeze at this level for legato
    }
  }

  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;

    // normal rendering loop

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

    // Apply vibrato. If rendering for a Game Boy target, emulate hUGEDriver's
    // step-based vibrato: on discrete tracker ticks, add/subtract the depth
    // nibble (converted to register units) to the period register. Otherwise
    // fall back to the smoother, phase-LFO approach used historically.
    let effFreq = currentFreq;

    // Apply portamento if enabled
    if (portSpeed > 0 && typeof channelId === 'number') {
      // Get last frequency for this channel from the per-channel state map
      const lastFreq = channelPortamentoState.get(channelId) ?? currentFreq;

      // Calculate portamento progress: speed maps inversely to duration
      // Higher speed = faster transition = shorter duration
      const portDur = typeof portDurationSec === 'number' && portDurationSec > 0
        ? portDurationSec
        : Math.max(0.001, (256 - Math.min(portSpeed, 255)) / 256 * durSec * 0.6);

      if (portDur > 0 && t <= portDur && Math.abs(currentFreq - lastFreq) > 1) {
        // Smooth cubic ease for natural portamento
        const progress = Math.min(1, t / portDur);
        const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
        effFreq = lastFreq + (currentFreq - lastFreq) * easedProgress;
      }
    }

    // Save current frequency for next note's portamento (do this for ALL notes, not just portamento notes)
    if (typeof channelId === 'number' && i === duration - 1) {
      channelPortamentoState.set(channelId, currentFreq);
    }

    // Apply vibrato - use per-channel LFO phase for smooth, continuous vibrato
    if (vibDepth !== 0 && vibRate > 0 && effFreq > 0) {
      if (typeof vibDurationSec === 'undefined' || (i / sampleRate) < vibDurationSec) {
        // Game Boy-accurate vibrato: Convert BeatBax depth -> tracker nibble -> Hz deviation
        const trackerDepth = Math.max(0, Math.min(15, Math.round((vibDepth || 0) * (vibDepthScale ?? EXPORTER_VIB_DEPTH_SCALE))));
        // Match WebAudio formula: use 0.012 multiplier for Hz deviation
        const amplitudeHz = effFreq * trackerDepth * 0.012;
        const lfo = Math.sin(vibratoPhase);
        effFreq = effFreq + (lfo * amplitudeHz);

        // Advance vibrato phase
        vibratoPhase += (2 * Math.PI * vibRate) / sampleRate;
      }
    }

    // Apply arpeggio - rapid pitch cycling
    if (arpOffsets.length > 0 && effFreq > 0) {
      // Chip-specific frame rates (Hz) - must match effects/index.ts CHIP_FRAME_RATES
      // C64: 50 Hz (PAL), Game Boy/NES/Genesis: 60 Hz (NTSC or global standard)
      const CHIP_FRAME_RATES: Record<string, number> = {
        'gameboy': 60,
        'nes': 60,
        'c64': 50,
        'genesis': 60,
        'megadrive': 60,
        'pcengine': 60,
      };
      const frameRate = CHIP_FRAME_RATES[chipType || 'gameboy'] || 60; // Default to 60 Hz
      const cycleDuration = 1 / frameRate; // e.g., ~16.667ms at 60Hz, ~20ms at 50Hz

      // Build arpeggio cycle: [0 (root), ...offsets]
      const allOffsets = [0, ...arpOffsets];

      const offsetIndex = Math.floor((t % (cycleDuration * allOffsets.length)) / cycleDuration);
      const semitoneOffset = allOffsets[offsetIndex % allOffsets.length] || 0;
      // Apply frequency shift: freq * 2^(semitones / 12)
      effFreq = effFreq * Math.pow(2, semitoneOffset / 12);
    }

    // Simple, efficient band-limited pulse wave synthesis using naive square wave
    // with single-pole low-pass filter to reduce aliasing
    let sample = 0;
    if (effFreq > 0 && effFreq < sampleRate / 2) {
      // Advance phase accumulator
      phase += effFreq / sampleRate;
      phase = phase % 1.0; // Keep phase in [0, 1)

      // Generate square wave based on duty cycle
      sample = (phase < duty) ? 1.0 : -1.0;
    }

    // Apply envelope (sustain at previous level for legato notes, otherwise compute normally)
    const envVal = (envelopeSustainValue !== undefined) ? envelopeSustainValue : getEnvelopeValue(t, envelope, durSec);
    sample = sample * envVal;

    // Apply volume slide if enabled
    if (volDelta !== 0) {
      // Extract baseline from instrument envelope initial volume (0-15 on GB, normalized to 0-1)
      let baseline = 1.0;
      let volSlideGain: number;
      if (envelope && envelope.mode === 'gb' && typeof envelope.initial === 'number') {
        baseline = Math.max(0, Math.min(1, envelope.initial / 15));
      }

      if (volSteps !== undefined && typeof tickSeconds === 'number') {
        // Stepped volume slide: divide note duration into discrete steps
        const stepDuration = durSec / volSteps;
        const currentStep = Math.min(volSteps, Math.floor(t / stepDuration));
        // Scale delta across steps: ±1 = ±20% gain change per note
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (volDelta * currentStep / volSteps / 5)));
      } else {
        // Smooth volume slide: linear ramp over note duration
        const progress = Math.min(1, t / durSec);
        // Scale delta: ±1 = ±20% gain change per note, starting from envelope initial volume
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (volDelta * progress / 5)));
      }
      sample = sample * volSlideGain;
    }

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

  // Save phase and vibrato state for next note on this channel
  if (typeof channelId === 'number') {
    channelPhaseState.set(channelId, phase);
    channelVibratoPhase.set(channelId, vibratoPhase);

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
 * Uses a 16-sample 4-bit wavetable.
 *
 * @param buffer The target PCM buffer.
 * @param start The starting sample index.
 * @param duration The duration in samples.
 * @param freq The frequency of the note.
 * @param inst The instrument definition containing the wavetable.
 * @param sampleRate The sample rate.
 * @param channels Number of audio channels.
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
  legato?: boolean
) {
  const waveTable = inst.wave ? parseWaveTable(inst.wave) : [0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15];

  // Resolve volume multiplier
  let volRaw: any = inst.volume !== undefined ? inst.volume : (inst.vol !== undefined ? inst.vol : 100);
  let volNum = 100;
  if (typeof volRaw === 'string') {
    const s = volRaw.trim();
    volNum = s.endsWith('%') ? parseInt(s.slice(0, -1), 10) : parseInt(s, 10);
  } else if (typeof volRaw === 'number') {
    volNum = volRaw;
  }
  const volMulMap: Record<number, number> = { 0: 0, 25: 0.25, 50: 0.5, 100: 1.0 };
  const volMul = volMulMap[volNum] ?? 1.0;

  // Vibrato params
  let vibDepth = 0;
  let vibRate = 0;
  let vibDurationSec: number | undefined = undefined;
  // Portamento params
  let portSpeed = 0;
  let portDurationSec: number | undefined = undefined;
  // Volume slide params
  let volDelta = 0;
  let volSteps: number | undefined = undefined;
  if (Array.isArray(effects)) {
    for (const fx of effects) {
      try {
        if (fx && fx.type === 'vib') {
          const p = fx.params || [];
          vibDepth = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          vibRate = Number(typeof p[1] !== 'undefined' ? p[1] : 0);
          if (typeof fx.durationSec === 'number') vibDurationSec = Number(fx.durationSec);
          else if (typeof p[3] !== 'undefined' && typeof tickSeconds === 'number') {
            const durRows = Number(p[3]);
            if (!Number.isNaN(durRows)) vibDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
          }
        } else if (fx && fx.type === 'port') {
          const p = fx.params || [];
          portSpeed = Number(typeof p[0] !== 'undefined' ? p[0] : 16);
          if (typeof fx.durationSec === 'number') {
            portDurationSec = Number(fx.durationSec);
          } else {
            const durRows = typeof p[1] !== 'undefined' ? Number(p[1]) : undefined;
            if (typeof durRows === 'number' && !Number.isNaN(durRows) && typeof tickSeconds === 'number') {
              portDurationSec = Math.max(0, Math.floor(durRows) * tickSeconds);
            }
          }
        } else if (fx && fx.type === 'volSlide') {
          const p = fx.params || [];
          volDelta = Number(typeof p[0] !== 'undefined' ? p[0] : 0);
          volSteps = typeof p[1] !== 'undefined' ? Number(p[1]) : undefined;
          if (!Number.isFinite(volDelta)) volDelta = 0;
          if (volSteps !== undefined && !Number.isFinite(volSteps)) volSteps = undefined;
        }
      } catch (e) {}
    }
  }

  const durSec = duration / sampleRate;

  // Get or initialize phase accumulator for this channel
  let phase = (typeof channelId === 'number') ? (channelPhaseState.get(channelId) ?? 0) : 0;

  // Get or initialize vibrato LFO phase for this channel
  let vibratoPhase = (typeof channelId === 'number') ? (channelVibratoPhase.get(channelId) ?? 0) : 0;

  // For legato notes, retrieve envelope state to sustain at previous level
  // (Wave channel uses fixed volume, but we track for consistency)
  let volumeSustainValue: number | undefined = undefined;
  if (legato && typeof channelId === 'number') {
    const envState = channelEnvelopeState.get(channelId);
    if (envState) {
      volumeSustainValue = envState.lastValue;
    }
  }

  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;
    let effFreq = freq;

    // Apply portamento if enabled
    if (portSpeed > 0 && typeof channelId === 'number') {
      const lastFreq = channelPortamentoState.get(channelId) ?? freq;

      const portDur = typeof portDurationSec === 'number' && portDurationSec > 0
        ? portDurationSec
        : Math.max(0.001, (256 - Math.min(portSpeed, 255)) / 256 * durSec * 0.6);

      if (portDur > 0 && t <= portDur && Math.abs(freq - lastFreq) > 1) {
        const progress = Math.min(1, t / portDur);
        const easedProgress = progress * progress * (3 - 2 * progress); // smoothstep
        effFreq = lastFreq + (freq - lastFreq) * easedProgress;
      }
    }

    // Save current frequency for next note's portamento (do this for ALL notes, not just portamento notes)
    if (typeof channelId === 'number' && i === duration - 1) {
      channelPortamentoState.set(channelId, freq);
    }

    if (vibDepth !== 0 && vibRate > 0 && freq > 0) {
      if ((renderWave as any).__vibState === undefined) (renderWave as any).__vibState = {};
      const noteKey = String(start);
      let state = (renderWave as any).__vibState[noteKey];
      if (!state) {
        state = { counter: 0, lastTick: -1, currentOffset: 0 } as any;
        (renderWave as any).__vibState[noteKey] = state;
      }

      const globalTime = (start + i) / sampleRate;
      const tickSec = typeof tickSeconds === 'number' ? tickSeconds : (60 / 128) / 4;
      const tickIndex = Math.floor(globalTime / tickSec);

      if (typeof vibDurationSec === 'undefined' || t < vibDurationSec) {
        if (tickIndex !== state.lastTick) {
          state.lastTick = tickIndex;
          state.counter++;
          if (isGameBoy) {
            const speedNibble = Math.max(0, Math.min(15, Math.round(vibRate || 0)));
            const depthNibble = Math.max(0, Math.min(15, Math.round((vibDepth || 0) * (vibDepthScale ?? EXPORTER_VIB_DEPTH_SCALE))));
            const mask = speedNibble & 0x0f;
            if (mask === 0 || (state.counter & mask) === 0) state.currentOffset = depthNibble;
            else state.currentOffset = 0;

            const baseReg = registerFromFreq(freq);
            const effReg = applyHugeDriverOffset(baseReg, state.currentOffset || 0);
            effFreq = freqFromRegister(effReg);
          } else {
            if (state.phase === undefined) state.phase = 0;
            state.phase += vibRate;
            const lfo = Math.sin(state.phase || 0);
            const baseReg = registerFromFreq(freq);
            const trackerDepth = Math.max(0, Math.min(15, Math.round(vibDepth * (vibDepthScale ?? EXPORTER_VIB_DEPTH_SCALE))));
            const regScale = Math.max(1, Math.round(baseReg * (regPerTrackerBaseFactor ?? RENDER_REG_PER_TRACKER_BASE_FACTOR)));
            const unit = regPerTrackerUnit ?? RENDER_REG_PER_TRACKER_UNIT;
            const effReg = Math.max(0, baseReg + lfo * trackerDepth * unit * regScale);
            effFreq = freqFromRegister(Math.max(0, Math.round(effReg)));
          }
        } else {
          if (isGameBoy) {
            const baseReg = registerFromFreq(freq);
            const effReg = applyHugeDriverOffset(baseReg, state.currentOffset || 0);
            effFreq = freqFromRegister(effReg);
          } else {
            if (state.phase === undefined) state.phase = 0;
            const lfo = Math.sin(state.phase || 0);
            const baseReg = registerFromFreq(freq);
            const trackerDepth = Math.max(0, Math.min(15, Math.round(vibDepth * (vibDepthScale ?? EXPORTER_VIB_DEPTH_SCALE))));
            const regScale = Math.max(1, Math.round(baseReg * (regPerTrackerBaseFactor ?? RENDER_REG_PER_TRACKER_BASE_FACTOR)));
            const unit = regPerTrackerUnit ?? RENDER_REG_PER_TRACKER_UNIT;
            const effReg = Math.max(0, baseReg + lfo * trackerDepth * unit * regScale);
            effFreq = freqFromRegister(Math.max(0, Math.round(effReg)));
          }
        }
      }
    }

    const phase = (t * effFreq) % 1.0;
    const tablePos = phase * waveTable.length;
    const i0 = Math.floor(tablePos) % waveTable.length;
    const i1 = (i0 + 1) % waveTable.length;
    const frac = tablePos - Math.floor(tablePos);
    const v0 = (waveTable[i0] / 15.0) * 2.0 - 1.0;
    const v1 = (waveTable[i1] / 15.0) * 2.0 - 1.0;
    // Use sustained volume for legato notes, otherwise use instrument volume
    const effectiveVolMul = (volumeSustainValue !== undefined) ? volumeSustainValue : volMul;
    let sample = ((v0 * (1 - frac) + v1 * frac) * effectiveVolMul);

    // Apply volume slide if enabled
    if (volDelta !== 0) {
      // Use wave instrument volume as baseline (already normalized to 0-1 in volMul)
      const baseline = effectiveVolMul;
      let volSlideGain: number;
      if (volSteps !== undefined && typeof tickSeconds === 'number') {
        // Stepped volume slide: divide note duration into discrete steps
        const stepDuration = durSec / volSteps;
        const currentStep = Math.min(volSteps, Math.floor(t / stepDuration));
        // Scale delta across steps: ±1 = ±20% gain change per note
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (volDelta * currentStep / volSteps / 5)));
      } else {
        // Smooth volume slide
        const progress = Math.min(1, t / durSec);
        // Scale delta: ±1 = ±20% gain change per note, starting from wave instrument volume
        volSlideGain = Math.max(0, Math.min(1.5, baseline + (volDelta * progress / 5)));
      }
      sample = sample * volSlideGain;
    }

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

  // Save phase and vibrato state for next note on this channel
  if (typeof channelId === 'number') {
    channelPhaseState.set(channelId, phase);
    channelVibratoPhase.set(channelId, vibratoPhase);

    // Save volume state (use sustained value if legato, otherwise current volMul)
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

  // Game Boy noise parameters
  const width = inst.width ? Number(inst.width) : 15;
  const divisor = inst.divisor ? Number(inst.divisor) : 3;
  const shift = inst.shift ? Number(inst.shift) : 4;
  const GB_CLOCK = 4194304;

  // Calculate LFSR frequency (matches browser implementation)
  const div = Math.max(1, Number.isFinite(divisor) ? divisor : 3);
  const lfsrHz = GB_CLOCK / (div * Math.pow(2, (shift || 0) + 1));

  let phase = 0;
  let lfsr = 1;
  const is7bit = width === 7;

  // LFSR step function (matches browser)
  function stepLFSR(state: number): number {
    const bit = ((state >> 0) ^ (state >> 1)) & 1;
    state = (state >> 1) | (bit << 14);
    if (is7bit) {
      const low7 = ((state >> 8) & 0x7F) >>> 0;
      const newLow7 = ((low7 >> 1) | ((low7 & 1) << 6)) & 0x7F;
      state = (state & ~(0x7F << 8)) | (newLow7 << 8);
    }
    return state >>> 0;
  }

  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;

    // Update LFSR at proper frequency
    phase += lfsrHz / sampleRate;
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let tick = 0; tick < ticks; tick++) {
        lfsr = stepLFSR(lfsr);
      }
      phase -= ticks;
    }

    const noise = (lfsr & 1) ? 1.0 : -1.0;
    const envVal = getEnvelopeValue(t, envelope, durSec);
    const sample = noise * envVal * 0.85; // slightly higher base to better match WebAudio output

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
 * Parses a wavetable definition into an array of 16 4-bit values (0-15).
 *
 * @param wave The wavetable definition (string or array).
 * @returns An array of 16 numbers representing the wavetable.
 */
function parseWaveTable(wave: any): number[] {
  if (typeof wave === 'string') {
    try {
      // Parse array string like "[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]"
      const parsed = JSON.parse(wave);
      if (Array.isArray(parsed)) {
        return parsed.map(v => Math.max(0, Math.min(15, v)));
      }
    } catch (e) {
      // Fall through to default
    }
  } else if (Array.isArray(wave)) {
    return wave.map(v => Math.max(0, Math.min(15, v)));
  }

  // Default sine-like wave
  return [0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15];
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
    const stepDuration = period * (1 / 64); // same as WebAudio path
    const currentStep = Math.floor(t / stepDuration);
    let volume = envObj.direction === 'up' ? Math.min(15, (initial + currentStep)) : Math.max(0, (initial - currentStep));
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
  let max = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > max) max = abs;
  }

  if (max > 0) {
    if (force || max > 0.95) {
      const scale = 0.95 / max;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] *= scale;
      }
    }
  }
}
