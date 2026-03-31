/**
 * Browser-native MIDI builder
 * Implements a lightweight Standard MIDI File (SMF Type 1) encoder
 * using only TypedArrays - no Node.js Buffer or fs required.
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:midi-builder');

// MIDI constants
const TICKS_PER_QUARTER = 480;
const TICKS_PER_TOKEN = Math.floor(TICKS_PER_QUARTER / 4); // 16th note

// Game Boy channel type -> GM program mapping
const GB_TO_GM_PROGRAM: Record<string, number> = {
  pulse1: 80, // Lead 1 (square)
  pulse2: 34, // Electric Bass
  wave: 81,   // Lead 2 (saw-ish)
  noise: 0,   // Drums (channel 9)
};

/**
 * Encode a variable-length quantity (VLQ) for MIDI delta times
 */
function vlq(value: number): number[] {
  const bytes: number[] = [];
  let v = value & 0x7fffffff;
  bytes.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    bytes.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes.reverse();
}

/**
 * Write a big-endian 32-bit unsigned integer into a byte array
 */
function writeU32BE(arr: number[], val: number): void {
  arr.push((val >> 24) & 0xff);
  arr.push((val >> 16) & 0xff);
  arr.push((val >> 8) & 0xff);
  arr.push(val & 0xff);
}

/**
 * Write a big-endian 16-bit unsigned integer into a byte array
 */
function writeU16BE(arr: number[], val: number): void {
  arr.push((val >> 8) & 0xff);
  arr.push(val & 0xff);
}

/**
 * Write an ASCII string (fixed number of bytes) into a byte array
 */
function writeASCII(arr: number[], str: string): void {
  for (let i = 0; i < str.length; i++) {
    arr.push(str.charCodeAt(i));
  }
}

/**
 * Convert a note name (e.g., "C5", "G#4") to a MIDI note number
 */
function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/i);
  if (!match) return -1;

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const [, pitch, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteIndex = noteNames.indexOf(pitch.toUpperCase());
  if (noteIndex === -1) return -1;

  return (octave + 1) * 12 + noteIndex;
}

/**
 * Build a MIDI track chunk from channel events
 */
function buildTrack(
  ch: any,
  song: any,
  midiChannel: number,
  bpm: number
): number[] {
  const data: number[] = [];
  const insts = song.insts || {};

  // Get GM program for default instrument
  let defaultInstName = ch.defaultInstrument || ch.inst || '';
  let defaultInst = insts[defaultInstName] || {};
  let defaultType = (defaultInst.type || 'pulse1').toLowerCase();
  let isPercussion = midiChannel === 9;

  let gmProgram = GB_TO_GM_PROGRAM[defaultType] ?? GB_TO_GM_PROGRAM.pulse1;

  // Tempo meta event (only on first track, but we put it everywhere for safety)
  const mpq = Math.round(60_000_000 / bpm);
  // delta=0, Set Tempo: FF 51 03 tt tt tt
  data.push(...vlq(0), 0xff, 0x51, 0x03);
  data.push((mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff);

  // Program change (non-percussion channels)
  if (!isPercussion) {
    data.push(...vlq(0), 0xC0 | midiChannel, gmProgram & 0x7f);
  }

  const events = Array.isArray(ch.events) ? ch.events : (Array.isArray(ch.pat) ? ch.pat : []);
  let lastTick = 0;
  let tick = 0;
  let activeNote: { midi: number; startTick: number } | null = null;

  for (const ev of events) {
    if (!ev) { tick += TICKS_PER_TOKEN; continue; }

    const evType = ev.type || '';

    if (evType === 'note') {
      // Close previous note if open
      if (activeNote !== null) {
        const delta = tick - lastTick;
        data.push(...vlq(delta), 0x80 | midiChannel, activeNote.midi & 0x7f, 0x40);
        lastTick = tick;
        activeNote = null;
      }

      // Determine note's MIDI number
      const token = ev.token || '';
      let midiNote = noteNameToMidi(token);
      if (midiNote < 0) {
        tick += TICKS_PER_TOKEN;
        continue;
      }

      // Clamp to MIDI range
      midiNote = Math.max(0, Math.min(127, midiNote));

      // Determine velocity from instrument/event volume
      let velocity = 100;
      if (typeof ev.volume === 'number') {
        velocity = Math.max(1, Math.min(127, Math.round(ev.volume * 127)));
      }

      // Determine GM program for this specific event's instrument
      const evInstName = ev.instrument || defaultInstName;
      const evInst = insts[evInstName] || defaultInst;
      const evType2 = (evInst.type || defaultType).toLowerCase();
      const evProgram = GB_TO_GM_PROGRAM[evType2] ?? gmProgram;

      // Program change if instrument changed
      if (!isPercussion && evProgram !== gmProgram) {
        const delta = tick - lastTick;
        data.push(...vlq(delta), 0xC0 | midiChannel, evProgram & 0x7f);
        lastTick = tick;
        gmProgram = evProgram;
      }

      // Note On
      const delta = tick - lastTick;
      data.push(...vlq(delta), 0x90 | midiChannel, midiNote & 0x7f, velocity & 0x7f);
      lastTick = tick;
      activeNote = { midi: midiNote, startTick: tick };
      tick += TICKS_PER_TOKEN;

    } else if (evType === 'sustain') {
      // Sustain: note keeps playing
      tick += TICKS_PER_TOKEN;

    } else if (evType === 'rest') {
      // Rest: close active note if open
      if (activeNote !== null) {
        const delta = tick - lastTick;
        data.push(...vlq(delta), 0x80 | midiChannel, activeNote.midi & 0x7f, 0x40);
        lastTick = tick;
        activeNote = null;
      }
      tick += TICKS_PER_TOKEN;

    } else if (evType === 'named') {
      // Named event (percussion hit, etc.)
      const instName = ev.token || ev.instrument || '';
      const inst = insts[instName] || {};
      const instType = (inst.type || '').toLowerCase();

      let drumNote = 39; // Default: hand clap
      if (instName.includes('kick') || instName.includes('bass')) drumNote = 36;
      else if (instName.includes('snare') || instName.includes('sn')) drumNote = 38;
      else if (instName.includes('hh') || instName.includes('hihat') || instName.includes('hat')) drumNote = 42;
      else if (instName.includes('crash')) drumNote = 49;
      else if (instName.includes('ride')) drumNote = 51;
      else if (instName.includes('tom')) drumNote = 45;

      // Note On
      const noteOnDelta = tick - lastTick;
      data.push(...vlq(noteOnDelta), 0x90 | midiChannel, drumNote & 0x7f, 100);
      lastTick = tick;
      tick += TICKS_PER_TOKEN;

      // Note Off immediately after
      const noteOffDelta = tick - lastTick;
      data.push(...vlq(noteOffDelta), 0x80 | midiChannel, drumNote & 0x7f, 0x40);
      lastTick = tick;

    } else {
      tick += TICKS_PER_TOKEN;
    }
  }

  // Close any open note at end of track
  if (activeNote !== null) {
    const delta = tick - lastTick;
    data.push(...vlq(delta), 0x80 | midiChannel, activeNote.midi & 0x7f, 0x40);
    lastTick = tick;
  }

  // End of track meta event
  data.push(...vlq(0), 0xff, 0x2f, 0x00);

  return data;
}

/**
 * Build a Standard MIDI File (Type 1) from a resolved song model.
 * Returns a Uint8Array suitable for browser download.
 */
export function buildMIDI(song: any): Uint8Array {
  const bpm = (typeof song.bpm === 'number') ? song.bpm : 128;
  const channels = Array.isArray(song.channels) ? song.channels : [];
  const ntracks = Math.max(1, Math.min(16, channels.length));
  const insts = song.insts || {};

  log.debug(`Building MIDI: ${ntracks} tracks, ${bpm} BPM`);

  // Build track data for each channel
  const trackDataList: number[][] = [];
  for (let ci = 0; ci < ntracks; ci++) {
    const ch = channels[ci];

    // Determine MIDI channel (noise -> percussion channel 9)
    let midiChannel = ci % 16;
    const defaultInstName = ch?.defaultInstrument || ch?.inst || '';
    const defaultInst = insts[defaultInstName] || {};
    const defaultType = (defaultInst.type || '').toLowerCase();

    // Map noise instruments to percussion (channel 9)
    if (defaultType === 'noise') midiChannel = 9;

    const trackData = buildTrack(ch, song, midiChannel, bpm);
    trackDataList.push(trackData);
  }

  // Build MIDI file bytes
  const bytes: number[] = [];

  // Header chunk: MThd
  writeASCII(bytes, 'MThd');
  writeU32BE(bytes, 6);         // Chunk length = 6
  writeU16BE(bytes, 1);         // Format: Type 1 (multi-track)
  writeU16BE(bytes, ntracks);   // Number of tracks
  writeU16BE(bytes, TICKS_PER_QUARTER); // Ticks per quarter note

  // Track chunks: MTrk
  for (const trackData of trackDataList) {
    writeASCII(bytes, 'MTrk');
    writeU32BE(bytes, trackData.length);
    bytes.push(...trackData);
  }

  log.debug(`MIDI built: ${bytes.length} bytes`);
  return new Uint8Array(bytes);
}
