import { SongModel, NoteEvent } from '../song/songModel.js';
import { midiToFreq, noteNameToMidi } from '../chips/gameboy/apu.js';

/**
 * Render a song to PCM samples without using WebAudio.
 * This is a simplified renderer for CLI/offline use.
 */

export interface RenderOptions {
  sampleRate?: number;
  duration?: number; // in seconds
  channels?: 1 | 2;
  bpm?: number;
  renderChannels?: number[]; // Which GB channels to render (1-4), default all
}

export function renderSongToPCM(song: SongModel, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const channels = opts.channels ?? 1;
  const bpm = opts.bpm ?? 128;
  const renderChannels = opts.renderChannels ?? [1, 2, 3, 4];
  
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
  for (const ch of song.channels) {
    if (renderChannels.includes(ch.id)) {
      renderChannel(ch, song.insts, buffer, sampleRate, channels, tickSeconds);
    }
  }
  
  // Normalize to prevent clipping
  normalizeBuffer(buffer);
  
  return buffer;
}

function renderChannel(
  ch: any,
  insts: Record<string, Record<string, string>>,
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

function renderNoteEvent(
  ev: NoteEvent,
  inst: Record<string, string>,
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
  
  if (inst.type && inst.type.toLowerCase().includes('pulse')) {
    renderPulse(buffer, startSample, durationSamples, freq, inst, sampleRate, channels);
  } else if (inst.type && inst.type.toLowerCase().includes('wave')) {
    renderWave(buffer, startSample, durationSamples, freq, inst, sampleRate, channels);
  } else if (inst.type && inst.type.toLowerCase().includes('noise')) {
    renderNoise(buffer, startSample, durationSamples, inst, sampleRate, channels);
  }
}

function renderNamedEvent(
  ev: any,
  inst: Record<string, string>,
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

function renderPulse(
  buffer: Float32Array,
  start: number,
  duration: number,
  freq: number,
  inst: Record<string, string>,
  sampleRate: number,
  channels: number
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
  
  // Generate simple square wave (harmonics were making it sound worse)
  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;
    const phase = (t * freq) % 1.0;
    const square = phase < duty ? 1.0 : -1.0;
    
    // Apply envelope
    const envVal = getEnvelopeValue(t, envelope);
    const sample = square * envVal * 0.6; // Match browser amplitude
    
    const bufferIdx = (start + i) * channels;
    if (bufferIdx < buffer.length) {
      buffer[bufferIdx] += sample;
      if (channels === 2 && bufferIdx + 1 < buffer.length) {
        buffer[bufferIdx + 1] += sample;
      }
    }
  }
}

function renderWave(
  buffer: Float32Array,
  start: number,
  duration: number,
  freq: number,
  inst: Record<string, string>,
  sampleRate: number,
  channels: number
) {
  const waveTable = inst.wave ? parseWaveTable(inst.wave) : [0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0, 3, 6, 9, 12, 15];
  
  for (let i = 0; i < duration; i++) {
    const t = i / sampleRate;
    const phase = (t * freq) % 1.0;
    const idx = Math.floor(phase * waveTable.length) % waveTable.length;
    const sample = (waveTable[idx] / 15.0 * 2.0 - 1.0) * 0.6; // Match browser amplitude
    
    const bufferIdx = (start + i) * channels;
    if (bufferIdx < buffer.length) {
      buffer[bufferIdx] += sample;
      if (channels === 2 && bufferIdx + 1 < buffer.length) {
        buffer[bufferIdx + 1] += sample;
      }
    }
  }
}

function renderNoise(
  buffer: Float32Array,
  start: number,
  duration: number,
  inst: Record<string, string>,
  sampleRate: number,
  channels: number
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
      buffer[bufferIdx] += sample;
      if (channels === 2 && bufferIdx + 1 < buffer.length) {
        buffer[bufferIdx + 1] += sample;
      }
    }
  }
}

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

function normalizeBuffer(buffer: Float32Array): void {
  let max = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > max) max = abs;
  }
  
  if (max > 0.95) {
    const scale = 0.95 / max;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= scale;
    }
  }
}
