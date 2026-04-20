/**
 * Shared type definitions for FamiTracker binary and text export.
 */

import type { InstrumentNode } from '@beatbax/engine';

/** Minimal song model interface compatible with SongModel (not re-exported by engine). */
export interface SongLike {
  pats: Record<string, string[]>;
  insts: Record<string, InstrumentNode>;
  seqs: Record<string, string[]>;
  channels: Array<{
    id: number;
    events: ChannelEventLike[];
    defaultInstrument?: string;
    speed?: number;
  }>;
  bpm?: number;
  chip?: string;
  volume?: number;
  metadata?: {
    name?: string;
    artist?: string;
    description?: string;
    tags?: string[];
  };
}

/** Minimal channel event type (ChannelEvent not re-exported by engine). */
export interface ChannelEventLike {
  type: string;
  // NoteEvent fields
  token?: string;
  instrument?: string;
  instProps?: Record<string, any>;
  effects?: Array<{ type: string; params: Array<string | number> }>;
  defaultNote?: string;
  // Metadata
  sourcePattern?: string;
  barNumber?: number;
}

/** FamiTracker 2A03 macro type names as they appear in the text export format. */
export type MacroTypeName = 'VOLUME' | 'ARPEGGIO' | 'PITCH' | 'HIPITCH' | 'DUTYSEQ';

/** Zero-based macro type indices used in INST2A03 sequence fields. */
export const MACRO_TYPE_INDEX: Record<MacroTypeName, number> = {
  VOLUME: 0,
  ARPEGGIO: 1,
  PITCH: 2,
  HIPITCH: 3,
  DUTYSEQ: 4,
};

/** A single FamiTracker macro (sequence). */
export interface FtmMacro {
  type: MacroTypeName;
  /** Assigned FTM sequence index (0-based). Populated by deduplication. */
  index: number;
  /** Loop point index, -1 = no loop. */
  loop: number;
  /** Release point index, -1 = no release. */
  release: number;
  /** Setting byte — always 0 for 2A03 sequences. */
  setting: number;
  values: number[];
}

/** A 2A03 instrument definition. */
export interface FtmInstrument2A03 {
  index: number;
  name: string;
  /** FTM sequence index for each macro type, -1 = none. */
  volSeq: number;
  arpSeq: number;
  pitchSeq: number;
  hipitchSeq: number;
  dutySeq: number;
}

/** A DPCM note mapping within a DPCM instrument. */
export interface DpcmNoteMapping {
  sampleIndex: number;
  /** FTM pitch index 0-15. */
  pitch: number;
  loop: boolean;
  /** DAC level override, -1 = none. */
  delta: number;
}

/** A DPCM instrument. */
export interface FtmInstrumentDPCM {
  index: number;
  name: string;
  /** note index (0-95) → DpcmNoteMapping */
  notes: Map<number, DpcmNoteMapping>;
}

/** An embedded DPCM sample. */
export interface FtmDpcmSample {
  index: number;
  name: string;
  data: Uint8Array;
}

/** A single FTM effect column entry. */
export interface FtmEffect {
  /** e.g. "037", "S03", "A50", "..." */
  code: string;
}

/** One row in a FamiTracker pattern. */
export interface FtmRow {
  /** e.g. "C-4", "C#4", "---", "===", "..." */
  note: string;
  /** 2-hex-digit instrument index ("00"–"3F"), or ".." = no change */
  instrument: string;
  /** 1-hex-digit volume ("0"–"F"), or "." = no change */
  volume: string;
  /** Effect column entries */
  effects: FtmEffect[];
}

/** A FamiTracker pattern (one channel, one frame index). */
export interface FtmPattern {
  channelIndex: number;
  patternIndex: number;
  rows: FtmRow[];
}

/** One FTM frame: one pattern index per channel. */
export interface FtmFrame {
  /** pattern index per channel (same order as song.channels) */
  patterns: number[];
}

/** The complete track/song model ready for text or binary serialisation. */
export interface FtmTrack {
  title: string;
  speed: number;
  tempo: number;
  /** Rows per pattern (max across all patterns, ≤ 256) */
  rowsPerPattern: number;
  frames: FtmFrame[];
  /** Keyed as `${channelIndex}_${patternIndex}` */
  patterns: Map<string, FtmPattern>;
  /** Number of effect columns per channel index */
  effectColumns: number[];
}

/** All data needed to serialise a song. */
export interface FtmSongData {
  title: string;
  artist: string;
  copyright: string;
  macros: FtmMacro[];
  instruments2a03: FtmInstrument2A03[];
  instrumentsDpcm: FtmInstrumentDPCM[];
  dpcmSamples: FtmDpcmSample[];
  track: FtmTrack;
  /** Number of 2A03 channels (4 or 5) */
  channelCount: number;
}

/** Channel type by 0-based NES channel index. */
export type NesChannelType = 'pulse1' | 'pulse2' | 'triangle' | 'noise' | 'dmc';

export function nesChannelType(channelIndex: number): NesChannelType {
  switch (channelIndex) {
    case 0: return 'pulse1';
    case 1: return 'pulse2';
    case 2: return 'triangle';
    case 3: return 'noise';
    case 4: return 'dmc';
    default: return 'pulse1';
  }
}
