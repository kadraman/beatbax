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

/** NES 2A03 supports exactly 5 channels (pulse1, pulse2, triangle, noise, DMC). */
const NES_CHANNEL_COUNT = 5;

/**
 * Map a BeatBax channel ID (1-based) to a 0-based NES channel index.
 * Returns -1 and emits a warning when the ID is outside the valid NES range (1–5).
 * Clamping is intentionally avoided: silently merging out-of-range channels onto
 * the wrong NES channel (e.g. 6 → DMC) produces incorrect output.
 */
function channelIdToIndex(
  id: number,
  onWarn?: (msg: string) => void,
): number {
  const idx = id - 1;
  if (idx < 0 || idx >= NES_CHANNEL_COUNT) {
    const msg =
      `FamiTracker export: channel ${id} is outside the valid NES range (1–${NES_CHANNEL_COUNT}) ` +
      `and will be skipped. NES 2A03 has exactly ${NES_CHANNEL_COUNT} channels ` +
      `(pulse1, pulse2, triangle, noise, DMC). ` +
      `Cartridge expansions (e.g. VRC6) are not supported by this exporter.`;
    (onWarn ?? console.warn)(msg);
    return -1;
  }
  return idx;
}

// ─── Instrument resolution ────────────────────────────────────────────────────

interface ResolvedInstruments {
  insts2a03: FtmInstrument2A03[];
  instsDpcm: FtmInstrumentDPCM[];
  dpcmSamples: Array<{ index: number; name: string; data: Uint8Array }>;
  dmcTriggerNoteByInstrument: Map<string, number>;
  allMacros: FtmMacro[];
  instIndexByName: Map<string, number>;
  warnings: string[];
}

interface WriterOptions {
  resolveSampleAsset?: (ref: string) => Promise<ArrayBuffer>;
  onWarn?: (message: string) => void;
}

function parseBooleanLoose(value: unknown): boolean {
  const norm = String(value ?? '').trim().toLowerCase();
  return norm === 'true' || norm === '1' || norm === 'yes' || norm === 'on';
}

function toSampleName(ref: string, fallback: string): string {
  const trimmed = String(ref || '').trim();
  if (!trimmed) return fallback;
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const name = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return name || fallback;
}

function toUint8Array(data: ArrayBuffer): Uint8Array {
  return new Uint8Array(data);
}

function encodeDpcmDataLines(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  const chunkSize = 32;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    const hex = Array.from(chunk, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    lines.push(`DPCM : ${hex}`);
  }
  return lines;
}

async function resolveInstruments(song: SongLike, options?: WriterOptions): Promise<ResolvedInstruments> {
  const warnings: string[] = [];
  const allMacros: FtmMacro[] = [];
  const insts2a03: FtmInstrument2A03[] = [];
  const instsDpcm: FtmInstrumentDPCM[] = [];
  const dpcmSamples: Array<{ index: number; name: string; data: Uint8Array }> = [];
  const dmcTriggerNoteByInstrument = new Map<string, number>();
  const instIndexByName = new Map<string, number>();
  const dpcmSampleIndexByRef = new Map<string, number>();

  const addDpcmSample = (sampleRef: string, sampleBytes: Uint8Array): number => {
    const key = sampleRef || `__inline_${dpcmSamples.length}`;
    const existing = dpcmSampleIndexByRef.get(key);
    if (existing !== undefined) return existing;
    const index = dpcmSamples.length;
    dpcmSamples.push({
      index,
      name: toSampleName(sampleRef, `beatbax_sample_${index}.dmc`),
      data: sampleBytes.length > 0 ? sampleBytes : new Uint8Array([0x00]),
    });
    dpcmSampleIndexByRef.set(key, index);
    return index;
  };

  const ensureSilenceSample = (): number => {
    const key = '__silence__';
    const existing = dpcmSampleIndexByRef.get(key);
    if (existing !== undefined) return existing;
    const index = dpcmSamples.length;
    dpcmSamples.push({ index, name: 'beatbax_silence.dmc', data: new Uint8Array([0x00]) });
    dpcmSampleIndexByRef.set(key, index);
    return index;
  };

  // Determine which channel each instrument belongs to by scanning channel events
  const instChannelType = new Map<string, NesChannelType>();
  for (const ch of song.channels) {
    const chIdx = channelIdToIndex(ch.id, options?.onWarn);
    if (chIdx === -1) continue;
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

  let sharedDmcInstIndex: number | null = null;
  let sharedDmcInst: FtmInstrumentDPCM | null = null;
  let dmcNoteCursor = 36; // C-2

  for (const [name, inst] of Object.entries(song.insts ?? {})) {
    const chType = instChannelType.get(name) ?? 'pulse1';

    if (chType === 'dmc') {
      if (sharedDmcInstIndex === null || sharedDmcInst === null) {
        sharedDmcInstIndex = instIdx;
        const i2a03: FtmInstrument2A03 = {
          index: sharedDmcInstIndex,
          name: 'dmc-kit',
          volSeq: -1,
          arpSeq: -1,
          pitchSeq: -1,
          hipitchSeq: -1,
          dutySeq: -1,
        };
        insts2a03.push(i2a03);
        sharedDmcInst = {
          index: sharedDmcInstIndex,
          name: 'dmc-kit',
          notes: new Map(),
        };
        instsDpcm.push(sharedDmcInst);
        instIdx++;
      }

      let sampleIndex: number | undefined;
      const sampleRef = String((inst as any).dmc_sample ?? '').trim();
      if (sampleRef) {
        if (typeof options?.resolveSampleAsset === 'function') {
          try {
            const resolved = await options.resolveSampleAsset(sampleRef);
            sampleIndex = addDpcmSample(sampleRef, toUint8Array(resolved));
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push(`DMC instrument '${name}' could not resolve sample '${sampleRef}': ${message}`);
          }
        } else {
          warnings.push(`DMC instrument '${name}' references '${sampleRef}' but no sample resolver was provided; using silence sample`);
        }
      }
      if (sampleIndex === undefined) {
        sampleIndex = ensureSilenceSample();
      }

      const DMC_NOTE_MIN = 36;
      const DMC_NOTE_MAX = 95;
      const DMC_NOTE_RANGE = DMC_NOTE_MAX - DMC_NOTE_MIN + 1; // 60

      if (dmcNoteCursor > DMC_NOTE_MAX) {
        warnings.push(
          `FamiTracker export: DMC instrument '${name}' cannot be assigned a unique trigger note — ` +
          `the available KEYDPCM note range (${DMC_NOTE_MIN}–${DMC_NOTE_MAX}, ${DMC_NOTE_RANGE} slots) is exhausted. ` +
          `This instrument will be skipped in the DPCM kit. Consider reducing the number of DMC instruments.`,
        );
        // Still register in instIndexByName so pattern rows don't crash, but
        // do NOT add a KEYDPCM entry — the note will be left silent.
        instIndexByName.set(name, sharedDmcInstIndex);
        continue;
      }

      const noteIndex = dmcNoteCursor;
      dmcNoteCursor += 1;

      // Map each DMC source instrument to its own trigger note in the shared DPCM instrument.
      sharedDmcInst.notes.set(noteIndex, {
        sampleIndex,
        pitch: Number((inst as any).dmc_rate ?? 15),
        loop: parseBooleanLoose((inst as any).dmc_loop ?? 'false'),
        delta: (inst as any).dmc_level !== undefined ? Number((inst as any).dmc_level) : -1,
      });
      dmcTriggerNoteByInstrument.set(name, noteIndex);
      instIndexByName.set(name, sharedDmcInstIndex);
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

  return { insts2a03, instsDpcm, dpcmSamples, dmcTriggerNoteByInstrument, allMacros, instIndexByName, warnings };
}

// ─── Track / pattern assembly ─────────────────────────────────────────────────

function buildTrack(
  song: SongLike,
  instIndexByName: Map<string, number>,
  dmcTriggerNoteByInstrument: Map<string, number>,
  warnings: string[],
): FtmTrack {
  const bpm = Number(song.bpm ?? 120);
  const speed = 6;
  const tempo = Math.max(32, Math.min(255, Math.round(bpm)));

  const trackWarn = (msg: string) => warnings.push(msg);
  const channelsByIndex = new Map<number, SongLike['channels'][number]>();
  for (const ch of song.channels ?? []) {
    const chIdx = channelIdToIndex(ch.id, trackWarn);
    if (chIdx !== -1) channelsByIndex.set(chIdx, ch);
  }
  const numChannels = NES_CHANNEL_COUNT;

  // Per-channel frame grouping
  const channelFrames: ChannelEventLike[][][] = [];
  for (let c = 0; c < numChannels; c++) {
    const ch = channelsByIndex.get(c);
    const frames = groupEventsIntoFrames(
      ch?.events ?? [],
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

  // Warn once per unique pattern name when frame length is not a power of 2
  // (e.g. 17 rows causes a silent empty row at every pattern boundary in FamiTracker)
  const warnedPatterns = new Set<string>();
  for (const cf of channelFrames) {
    for (const frame of cf) {
      const len = frame.length;
      if (len > 0 && (len & (len - 1)) !== 0) {
        const patName = (frame[0] as ChannelEventLike).sourcePattern ?? '(unknown)';
        if (!warnedPatterns.has(patName)) {
          warnedPatterns.add(patName);
          warnings.push(
            `Pattern "${patName}" has ${len} rows (not a power of 2). ` +
            `FamiTracker works best with patterns of 8, 16, 32, or 64 rows; ` +
            `this causes a silent empty row at every pattern boundary.`,
          );
        }
      }
    }
  }

  // Ensure all channel frame lists are padded to numFrames
  for (const cf of channelFrames) {
    while (cf.length < numFrames) cf.push([]);
  }

  // Build FTM patterns (per-channel per-frame), with deduplication of identical patterns
  const patterns = new Map<string, FtmPattern>();
  // patternIndex per channel (monotonically increasing, 0-based)
  const channelPatternCounters: number[] = Array(numChannels).fill(0);
  // For deduplication: hash → assigned pattern index per channel
  const channelPatternHash = Array.from({ length: numChannels }, () => new Map<string, number>());

  const frames: FtmFrame[] = [];

  for (let f = 0; f < numFrames; f++) {
    const framePatternIndices: number[] = [];

    for (let c = 0; c < numChannels; c++) {
      const chIdx = c;
      const chType = nesChannelType(chIdx);
      const frameEvents = channelFrames[c][f] ?? [];

      // Build rows
      const rows = buildPatternRows(
        frameEvents,
        rowsPerPattern,
        instIndexByName,
        chType,
        warnings,
        dmcTriggerNoteByInstrument,
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

function emptyRowSegment(numEffectCols: number): string {
  const effects = Array.from({ length: numEffectCols }, () => '...');
  return `... .. . ${effects.join(' ')}`;
}

/**
 * Produce a complete FamiTracker text export string for an NES SongLike.
 */
export async function writeFtmText(song: SongLike, options?: WriterOptions): Promise<string> {
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
  const { insts2a03, instsDpcm, dpcmSamples, dmcTriggerNoteByInstrument, allMacros, instIndexByName, warnings: instrumentWarnings } = await resolveInstruments(song, options);
  warnings.push(...instrumentWarnings);

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

  // ── DPCM SAMPLE DATA ──────────────────────────────────────────────────────
  if (instsDpcm.length > 0) {
    for (const sample of dpcmSamples) {
      lines.push(`DPCMDEF ${sample.index} ${sample.data.length} "${sample.name}"`);
      lines.push(...encodeDpcmDataLines(sample.data));
      lines.push('');
    }
  }

  // ── INST2A03 ───────────────────────────────────────────────────────────────
  for (const inst of insts2a03) {
    lines.push(
      `INST2A03 ${inst.index} ${inst.volSeq} ${inst.arpSeq} ${inst.pitchSeq} ${inst.hipitchSeq} ${inst.dutySeq} "${inst.name}"`,
    );
  }

  // ── DPCM KEY MAPPINGS ─────────────────────────────────────────────────────
  for (const dpcm of instsDpcm) {
    const entries = [...dpcm.notes.entries()].sort((a, b) => a[0] - b[0]);
    for (const [noteIndex, mapping] of entries) {
      // FamiTracker's KEYDPCM octave field is offset by -1 from MIDI-style octave numbering.
      const octave = Math.max(0, Math.floor(noteIndex / 12) - 1);
      const key = Math.max(0, Math.min(11, noteIndex % 12));
      lines.push(
        `KEYDPCM ${dpcm.index} ${octave} ${key} ${mapping.sampleIndex} ${mapping.pitch} ${mapping.loop ? 1 : 0} 0 ${mapping.delta}`,
      );
    }
  }

  if (insts2a03.length + instsDpcm.length > 0) lines.push('');

  // ── Track ──────────────────────────────────────────────────────────────────
  const track = buildTrack(song, instIndexByName, dmcTriggerNoteByInstrument, warnings);

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
  // FamiTracker text uses one PATTERN block where each ROW contains all channel columns.
  const byChannelAndPattern = new Map<string, FtmPattern>();
  for (const pat of track.patterns.values()) {
    byChannelAndPattern.set(`${pat.channelIndex}_${pat.patternIndex}`, pat);
  }

  const patternIndices = new Set<number>();
  for (const frame of track.frames) {
    for (const p of frame.patterns) patternIndices.add(p);
  }
  if (patternIndices.size === 0) patternIndices.add(0);

  const sortedPatternIndices = [...patternIndices].sort((a, b) => a - b);
  const numChannels = track.effectColumns.length;

  for (const patIdx of sortedPatternIndices) {
    lines.push(`PATTERN ${patIdx.toString(16).toUpperCase().padStart(2, '0')}`);

    for (let r = 0; r < track.rowsPerPattern; r++) {
      const rowHex = r.toString(16).toUpperCase().padStart(2, '0');
      const segments: string[] = [];

      for (let c = 0; c < numChannels; c++) {
        const numCols = track.effectColumns[c] ?? 1;
        const pat = byChannelAndPattern.get(`${c}_${patIdx}`);
        const row = pat?.rows[r];
        segments.push(row ? serializeRow(row, numCols) : emptyRowSegment(numCols));
      }

      lines.push(`ROW ${rowHex} : ${segments.join(' : ')}`);
    }

    lines.push('');
  }

  // ── Warnings (appended as comments) ───────────────────────────────────────
  if (warnings.length > 0) {
    if (typeof options?.onWarn === 'function') {
      for (const w of warnings) {
        options.onWarn(w);
      }
    }

    lines.push('# BeatBax export warnings:');
    for (const w of warnings) {
      lines.push(`# ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
