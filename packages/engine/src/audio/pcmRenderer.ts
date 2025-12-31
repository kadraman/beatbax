import { SongModel, NoteEvent } from '../song/songModel.js';
import { midiToFreq, noteNameToMidi } from '../chips/gameboy/apu.js';
import { parseSweep } from '../chips/gameboy/pulse.js';
import { registerFromFreq, freqFromRegister } from '../chips/gameboy/periodTables.js';
import { InstMap, InstrumentNode } from '../parser/ast.js';

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
}

/**
 * Renders a complete song to a PCM buffer.
 *
 * @param song The song model containing channels and events.
 * @param opts Rendering options (sampleRate, channels, bpm, etc.).
 * @returns A Float32Array containing the interleaved PCM samples.
 */
export function renderSongToPCM(song: SongModel, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const channels = opts.channels ?? 1;
  const bpm = opts.bpm ?? 128;
  const renderChannels = opts.renderChannels ?? song.channels.map(c => c.id);
  const normalize = opts.normalize ?? false;

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
  for (const ch of song.channels) {
    if (renderChannels.includes(ch.id)) {
      renderChannel(ch, instsClone, buffer, sampleRate, channels, tickSeconds);
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
  tickSeconds: number
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

    // Calculate duration by looking ahead for sustains
    let sustainCount = 0;
    for (let j = i + 1; j < ch.events.length; j++) {
      if (ch.events[j].type === 'sustain') {
        sustainCount++;
      } else {
        break;
      }
    }
    const dur = tickSeconds * (1 + sustainCount);

    // Resolve instrument
    let instName = ev.instrument || (tempRemaining > 0 ? tempInstName : currentInstName);
    let inst = instName ? insts[instName] : undefined;

    if (!inst) continue;

    const startSample = Math.floor(time * sampleRate);
    const durationSamples = Math.floor(dur * sampleRate);

    if (ev.type === 'note') {
      renderNoteEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels);

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
      renderNamedEvent(ev, inst, buffer, startSample, durationSamples, sampleRate, channels);

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
  channels: number
) {
  const token = ev.token;
  const m = token.match(/^([A-G][#B]?)(-?\d+)$/i);
  if (!m) return;

  const note = m[1].toUpperCase();
  const octave = parseInt(m[2], 10);
  const midi = noteNameToMidi(note, octave);
  if (midi === null) return;

  const freq = midiToFreq(midi);

  // Determine pan gains for stereo rendering
  let panSpec = resolveEventPan(ev, inst);
  const gains = panToGains(panSpec);

  if (inst.type && inst.type.toLowerCase().includes('pulse')) {
    renderPulse(buffer, startSample, durationSamples, freq, inst, sampleRate, channels, gains);
  } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
    renderWave(buffer, startSample, durationSamples, freq, inst, sampleRate, channels, gains);
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
  channels: number
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
  gains: { left: number; right: number } = { left: 1, right: 1 }
) {
  // Parse duty - handle various formats
  let duty = 0.5;
  if (inst.duty) {
    const dutyStr = String(inst.duty);
    const dutyNum = parseFloat(dutyStr);
    if (!isNaN(dutyNum)) {
      duty = dutyNum > 1 ? dutyNum / 100 : dutyNum; // Handle both 50 and 0.5
    }
  }

  const envelope = parseEnvelope(inst.env);

  const sweep = parseSweep(inst.sweep);
  let currentFreq = freq;
  let currentReg = registerFromFreq(freq);
  const sweepIntervalSamples = sweep ? (sweep.time / 128) * sampleRate : 0;

  // Generate simple square wave (harmonics were making it sound worse)
  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;

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

    const phase = (t * currentFreq) % 1.0;
    const square = currentFreq > 0 ? (phase < duty ? 1.0 : -1.0) : 0;

    // Apply envelope
    const envVal = getEnvelopeValue(t, envelope);
    const sample = square * envVal * 0.6; // Match browser amplitude

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
  gains: { left: number; right: number } = { left: 1, right: 1 }
) {
  const waveTable = inst.wave ? parseWaveTable(inst.wave) : [0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15];

  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;
    const phase = (t * freq) % 1.0;
    const idx = Math.floor(phase * waveTable.length) % waveTable.length;

    // Wave instrument volume: accept `volume` or `vol` as number or percent string
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

    const sample = ((waveTable[idx] / 15.0 * 2.0 - 1.0) * 0.6) * volMul; // Apply wave global volume

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
  const envelope = parseEnvelope(inst.env);

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
    const envVal = getEnvelopeValue(t, envelope);
    const sample = noise * envVal * 0.6; // Match browser amplitude

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
function parseEnvelope(env: any): { initial: number; direction: 'up' | 'down'; period: number } {
  if (!env) return { initial: 15, direction: 'down', period: 1 };

  if (typeof env === 'string') {
    const s = env.trim();

    // Parse "gb:12,down,1" format
    const gbMatch = s.match(/^gb:\s*(\d{1,2})\s*,\s*(up|down)(?:\s*,\s*(\d+))?$/i);
    if (gbMatch) {
      return {
        initial: Math.max(0, Math.min(15, parseInt(gbMatch[1], 10))),
        direction: gbMatch[2].toLowerCase() as 'up' | 'down',
        period: gbMatch[3] ? Math.max(0, Math.min(7, parseInt(gbMatch[3], 10))) : 1
      };
    }

    // Parse simple "12,down,1" format
    const parts = s.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      return {
        initial: parseInt(parts[0]) || 15,
        direction: parts[1] === 'up' ? 'up' : 'down',
        period: parts[2] ? parseInt(parts[2]) : 1
      };
    }
  }

  return { initial: 15, direction: 'down', period: 1 };
}

/**
 * Calculates the current envelope volume at a given time.
 *
 * @param t The time in seconds since the start of the note.
 * @param env The parsed envelope parameters.
 * @returns The normalized volume value (0.0 to 1.0).
 */
function getEnvelopeValue(t: number, env: { initial: number; direction: 'up' | 'down'; period: number }): number {
  if (env.period === 0) return env.initial / 15.0;

  // Game Boy envelope: each step is period * (1/64) seconds
  const stepDuration = env.period * (1 / 64); // ~15.6ms per period unit
  const currentStep = Math.floor(t / stepDuration);

  let volume: number;
  if (env.direction === 'down') {
    volume = Math.max(0, env.initial - currentStep);
  } else {
    volume = Math.min(15, env.initial + currentStep);
  }

  return volume / 15.0;
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
