/**
 * FamiTracker text (.txt) writer.
 *
 * Produces the human-readable format compatible with FamiTracker v0.4.6
 * and importable by FamiStudio.
 */

import type { InstrumentNode } from '@beatbax/engine';
import {
  ChannelEventLike,
  FtmFrame,
  FtmInstrument2A03,
  FtmInstrumentDPCM,
  FtmMacro,
  FtmPattern,
  FtmRow,
  FtmTrack,
  MACRO_TYPE_INDEX,
  MacroTypeName,
  NesChannelType,
  SongLike,
  nesChannelType,
} from './ftm-types.js';
import {
  buildInstrumentMacros,
  deduplicateMacros,
  dutyStringToFtm,
} from './ftm-macros.js';
import {
  buildPatternRows,
  groupEventsIntoFrames,
  patternTickLength,
} from './ftm-patterns.js';

// ─── Channel-to-FTM index mapping ────────────────────────────────────────────

/**
 * Map a BeatBax channel ID (1-based) to a 0-based NES channel index.
 * Channel IDs beyond 5 are clamped.
 */
function channelIdToIndex(id: number): number {
  return Math.max(0, Math.min(4, id - 1));
}

// ─── Instrument resolution ────────────────────────────────────────────────────

interface ResolvedInstruments {
  insts2a03: FtmInstrument2A03[];
  instsDpcm: FtmInstrumentDPCM[];
  allMacros: FtmMacro[];
  instIndexByName: Map<string, number>;
  warnings: string[];
}

function resolveInstruments(song: SongLike): ResolvedInstruments {
  const warnings: string[] = [];
  const allMacros: FtmMacro[] = [];
  const insts2a03: FtmInstrument2A03[] = [];
  const instsDpcm: FtmInstrumentDPCM[] = [];
  const instIndexByName = new Map<string, number>();

  // Determine which channel each instrument belongs to by scanning channel events
  const instChannelType = new Map<string, NesChannelType>();
  for (const ch of song.channels) {
    const chIdx = channelIdToIndex(ch.id);
    const chType = nesChannelType(chIdx);
    for (const ev of ch.events) {
      if (ev.instrument) {
        if (!instChannelType.has(ev.instrument)) {
          instChannelType.set(ev.instrument, chType);
        }
      }
    }
    // Also register the default instrument for the channel
    if (ch.defaultInstrument && !instChannelType.has(ch.defaultInstrument)) {
      instChannelType.set(ch.defaultInstrument, chType);
    }
  }

  // Assign channel type from instrument's own type field if available
  for (const [name, inst] of Object.entries(song.insts ?? {})) {
    const itype = String(inst.type ?? '').toLowerCase();
    if (!instChannelType.has(name)) {
      if (itype === 'pulse1') instChannelType.set(name, 'pulse1');
      else if (itype === 'pulse2') instChannelType.set(name, 'pulse2');
      else if (itype === 'triangle') instChannelType.set(name, 'triangle');
      else if (itype === 'noise') instChannelType.set(name, 'noise');
      else if (itype === 'dmc') instChannelType.set(name, 'dmc');
      else instChannelType.set(name, 'pulse1'); // default
    }
  }

  let instIdx = 0;

  for (const [name, inst] of Object.entries(song.insts ?? {})) {
    const chType = instChannelType.get(name) ?? 'pulse1';

    if (chType === 'dmc') {
      // DPCM instrument — placeholder for now (no bundled sample resolution at export time)
      const dpcmInst: FtmInstrumentDPCM = {
        index: instIdx,
        name,
        notes: new Map(),
      };
      // Map note C-2 (MIDI 36 in standard) as the default trigger
      dpcmInst.notes.set(36, {
        sampleIndex: 0,
        pitch: Number((inst as any).dmc_rate ?? 15),
        loop: Boolean((inst as any).dmc_loop ?? false),
        delta: (inst as any).dmc_level !== undefined ? Number((inst as any).dmc_level) : -1,
      });
      instsDpcm.push(dpcmInst);
      instIndexByName.set(name, instIdx++);
      continue;
    }

    // Build macros for this instrument
    const { macros, warnings: mw } = buildInstrumentMacros(inst, chType, name);
    warnings.push(...mw);

    // Register macros into the flat list
    const volMacroRef = macros.VOLUME ? allMacros.push(macros.VOLUME) - 1 : -1;
    const arpMacroRef = macros.ARPEGGIO ? allMacros.push(macros.ARPEGGIO) - 1 : -1;
    const pitchMacroRef = macros.PITCH ? allMacros.push(macros.PITCH) - 1 : -1;
    const dutyMacroRef = macros.DUTYSEQ ? allMacros.push(macros.DUTYSEQ) - 1 : -1;

    const i2a03: FtmInstrument2A03 = {
      index: instIdx,
      name,
      volSeq: volMacroRef >= 0 ? 0 : -1, // will be updated after dedup
      arpSeq: arpMacroRef >= 0 ? 0 : -1,
      pitchSeq: pitchMacroRef >= 0 ? 0 : -1,
      hipitchSeq: -1, // HIPITCH not generated yet
      dutySeq: dutyMacroRef >= 0 ? 0 : -1,
    };

    // Stash macro positions so we can look them up after dedup
    (i2a03 as any).__volMacroPos = volMacroRef;
    (i2a03 as any).__arpMacroPos = arpMacroRef;
    (i2a03 as any).__pitchMacroPos = pitchMacroRef;
    (i2a03 as any).__dutyMacroPos = dutyMacroRef;

    // Set static duty index from constant duty field (used in INST2A03 duty field)
    (i2a03 as any).__staticDuty = dutyStringToFtm(inst.duty);

    insts2a03.push(i2a03);
    instIndexByName.set(name, instIdx++);
  }

  // Deduplicate macros and assign final indices
  deduplicateMacros(allMacros);

  // Fix up instrument macro sequence indices after deduplication
  for (const inst2a03 of insts2a03) {
    const i = inst2a03 as any;
    if (i.__volMacroPos >= 0) inst2a03.volSeq = allMacros[i.__volMacroPos].index;
    if (i.__arpMacroPos >= 0) inst2a03.arpSeq = allMacros[i.__arpMacroPos].index;
    if (i.__pitchMacroPos >= 0) inst2a03.pitchSeq = allMacros[i.__pitchMacroPos].index;
    if (i.__dutyMacroPos >= 0) inst2a03.dutySeq = allMacros[i.__dutyMacroPos].index;
    // Clean up temp fields
    delete i.__volMacroPos;
    delete i.__arpMacroPos;
    delete i.__pitchMacroPos;
    delete i.__dutyMacroPos;
  }

  return { insts2a03, instsDpcm, allMacros, instIndexByName, warnings };
}

// ─── Track / pattern assembly ─────────────────────────────────────────────────

function buildTrack(
  song: SongLike,
  instIndexByName: Map<string, number>,
  warnings: string[],
): FtmTrack {
  const bpm = Number(song.bpm ?? 120);
  const speed = 6;
  const tempo = Math.max(32, Math.min(255, Math.round(bpm)));

  const channels = song.channels;
  const numChannels = Math.max(1, channels.length);

  // Per-channel frame grouping
  const channelFrames: ChannelEventLike[][][] = [];
  for (const ch of channels) {
    const frames = groupEventsIntoFrames(
      ch.events,
      song.pats ?? {},
    );
    channelFrames.push(frames);
  }

  // Number of frames = max across all channels
  const numFrames = channelFrames.reduce((max, cf) => Math.max(max, cf.length), 0);

  // Rows per pattern = max event count per frame, capped at 256
  let rowsPerPattern = 1;
  for (const cf of channelFrames) {
    for (const frame of cf) {
      rowsPerPattern = Math.max(rowsPerPattern, frame.length);
    }
  }
  rowsPerPattern = Math.min(256, rowsPerPattern);

  // Ensure all channel frame lists are padded to numFrames
  for (const cf of channelFrames) {
    while (cf.length < numFrames) cf.push([]);
  }

  // Build FTM patterns (per-channel per-frame), with deduplication of identical patterns
  const patterns = new Map<string, FtmPattern>();
  // patternIndex per channel (monotonically increasing, 0-based)
  const channelPatternCounters: number[] = Array(numChannels).fill(0);
  // For deduplication: hash → assigned pattern index per channel
  const channelPatternHash = channels.map(() => new Map<string, number>());

  const frames: FtmFrame[] = [];

  for (let f = 0; f < numFrames; f++) {
    const framePatternIndices: number[] = [];

    for (let c = 0; c < channels.length; c++) {
      const ch = channels[c];
      const chIdx = channelIdToIndex(ch.id);
      const chType = nesChannelType(chIdx);
      const frameEvents = channelFrames[c][f] ?? [];

      // Build rows
      const rows = buildPatternRows(
        frameEvents,
        rowsPerPattern,
        instIndexByName,
        chType,
        warnings,
      );

      // Simple hash for deduplication
      const hash = rows.map((r) => `${r.note}|${r.instrument}|${r.volume}|${r.effects.map((e) => e.code).join('+')}`.toString()).join(';');

      if (channelPatternHash[c].has(hash)) {
        framePatternIndices.push(channelPatternHash[c].get(hash)!);
      } else {
        const patIdx = channelPatternCounters[c]++;
        channelPatternHash[c].set(hash, patIdx);
        const key = `${c}_${patIdx}`;
        patterns.set(key, { channelIndex: c, patternIndex: patIdx, rows });
        framePatternIndices.push(patIdx);
      }
    }

    frames.push({ patterns: framePatternIndices });
  }

  // Determine max effect columns needed per channel
  const effectColumns: number[] = Array(numChannels).fill(1);
  for (const [, pat] of patterns) {
    const c = pat.channelIndex;
    for (const row of pat.rows) {
      effectColumns[c] = Math.max(effectColumns[c], row.effects.length);
    }
  }

  return { title: String(song.metadata?.name ?? 'Untitled'), speed, tempo, rowsPerPattern, frames, patterns, effectColumns };
}

// ─── Text serialisation ───────────────────────────────────────────────────────

function serializeRow(row: FtmRow, numEffectCols: number): string {
  const effects = [];
  for (let e = 0; e < numEffectCols; e++) {
    effects.push(row.effects[e]?.code ?? '...');
  }
  return `${row.note} ${row.instrument} ${row.volume} ${effects.join(' ')}`;
}

/**
 * Produce a complete FamiTracker text export string for an NES SongLike.
 */
export function writeFtmText(song: SongLike): string {
  const chip = String(song.chip ?? 'gameboy').toLowerCase();
  if (chip !== 'nes') {
    throw new Error(
      `FamiTracker text export requires chip 'nes', but got '${chip}'`,
    );
  }
  const lines: string[] = [];
  const warnings: string[] = [];

  const title = String(song.metadata?.name ?? 'Untitled');
  const artist = String(song.metadata?.artist ?? '');
  const copyright = '';

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push('# FamiTracker text export 0.4.2');
  lines.push('');
  lines.push(`TITLE    "${title}"`);
  lines.push(`AUTHOR   "${artist}"`);
  lines.push(`COPYRIGHT "${copyright}"`);
  lines.push('COMMENT  ""');
  lines.push('');
  lines.push('MACHINE  0');   // 0 = NTSC
  lines.push('FRAMERATE 0');  // 0 = default
  lines.push('EXPANSION 0');  // 0 = 2A03 only
  lines.push('VIBRATO  1');   // 1 = new vibrato style
  lines.push('SPLIT    32');
  lines.push('');

  // ── Instruments ──────────────────────────────────────────────────────────
  const { insts2a03, instsDpcm, allMacros, instIndexByName } = resolveInstruments(song);

  // ── Macros ─────────────────────────────────────────────────────────────────
  // Group by type for ordered output
  const macrosByType = new Map<MacroTypeName, FtmMacro[]>();
  for (const m of allMacros) {
    if (!macrosByType.has(m.type)) macrosByType.set(m.type, []);
    macrosByType.get(m.type)!.push(m);
  }

  const typeOrder: MacroTypeName[] = ['VOLUME', 'ARPEGGIO', 'PITCH', 'HIPITCH', 'DUTYSEQ'];
  for (const type of typeOrder) {
    const list = macrosByType.get(type) ?? [];
    for (const m of list) {
      lines.push(
        `MACRO ${MACRO_TYPE_INDEX[m.type]} ${m.index} ${m.loop} ${m.release} ${m.setting} : ${m.values.join(' ')}`,
      );
    }
  }
  if (allMacros.length > 0) lines.push('');

  // ── INST2A03 ───────────────────────────────────────────────────────────────
  for (const inst of insts2a03) {
    lines.push(
      `INST2A03 ${inst.index} ${inst.volSeq} ${inst.arpSeq} ${inst.pitchSeq} ${inst.hipitchSeq} ${inst.dutySeq} "${inst.name}"`,
    );
  }

  // ── DPCM INSTRUMENTS ──────────────────────────────────────────────────────
  for (const dpcm of instsDpcm) {
    lines.push(`INSDPCM ${dpcm.index} "${dpcm.name}"`);
  }

  if (insts2a03.length + instsDpcm.length > 0) lines.push('');

  // ── Track ──────────────────────────────────────────────────────────────────
  const track = buildTrack(song, instIndexByName, warnings);

  const colLine = track.effectColumns.join(' ');
  lines.push(`TRACK  ${track.rowsPerPattern} ${track.speed} ${track.tempo} "${track.title}"`);
  lines.push(`COLUMNS : ${colLine}`);
  lines.push('');

  // ── ORDER ─────────────────────────────────────────────────────────────────
  for (let f = 0; f < track.frames.length; f++) {
    const hex = track.frames[f].patterns.map((p) => p.toString(16).toUpperCase().padStart(2, '0'));
    lines.push(`ORDER ${f.toString(16).toUpperCase().padStart(2, '0')} : ${hex.join(' ')}`);
  }
  lines.push('');

  // ── PATTERNS ──────────────────────────────────────────────────────────────
  // Group patterns by channelIndex for output
  const patsByChannel = new Map<number, FtmPattern[]>();
  for (const pat of track.patterns.values()) {
    if (!patsByChannel.has(pat.channelIndex)) patsByChannel.set(pat.channelIndex, []);
    patsByChannel.get(pat.channelIndex)!.push(pat);
  }

  for (let c = 0; c < song.channels.length; c++) {
    const chPats = patsByChannel.get(c) ?? [];
    chPats.sort((a, b) => a.patternIndex - b.patternIndex);
    const numCols = track.effectColumns[c] ?? 1;

    for (const pat of chPats) {
      lines.push(`PATTERN ${pat.patternIndex.toString(16).toUpperCase().padStart(2, '0')}`);
      for (let r = 0; r < pat.rows.length; r++) {
        const row = pat.rows[r];
        const rowHex = r.toString(16).toUpperCase().padStart(2, '0');
        lines.push(`ROW ${rowHex} : ${serializeRow(row, numCols)}`);
      }
      lines.push('');
    }
  }

  // ── Warnings (appended as comments) ───────────────────────────────────────
  if (warnings.length > 0) {
    lines.push('# BeatBax export warnings:');
    for (const w of warnings) {
      lines.push(`# ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
