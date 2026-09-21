/**
 * Shared types for CLI MIDI → .bax conversion (feature 006).
 */

export type MidiChipId = 'gameboy' | 'nes';

export type QuantizeMode = 'nearest' | 'floor' | 'ceil' | 'strict';

export type QuantizeGrid = '1/4' | '1/8' | '1/16' | '1/32';

export type ChipRole = 'pulse1' | 'pulse2' | 'wave' | 'triangle' | 'noise' | 'dmc';

export interface QuantizeOptions {
  mode: QuantizeMode;
  grid: QuantizeGrid;
  /** Max ticks a note may shift under nearest/floor/ceil; ignored by strict (which fails). */
  maxShiftTicks: number;
}

export interface DrumMap {
  [midiNote: string]: string;
}

export interface TrackMapping {
  midiTrack?: number;
  midiChannel?: number;
  target: ChipRole;
  instrument?: string;
  drumMap?: DrumMap;
}

export interface DmcReinforcementConfig {
  enabled: boolean;
  kickSample?: string;
  snareSample?: string;
}

/** Optional JSON `--config` override (and CLI-merged options). */
export interface MidiImportConfig {
  chip?: MidiChipId;
  ticksPerBeat?: number;
  patternTicks?: number;
  trackMappings?: TrackMapping[];
  dmcReinforcement?: DmcReinforcementConfig;
  quantize?: Partial<QuantizeOptions>;
  maxOverlapTicks?: number;
  maxBars?: number;
}

export interface MidiConvertOptions {
  /** Required chip target. */
  chip: MidiChipId;
  ticksPerBeat: number;
  patternTicks: number;
  quantize: QuantizeOptions;
  maxOverlapTicks: number;
  maxBars?: number;
  strict: boolean;
  trackMappings?: TrackMapping[];
  dmcReinforcement: DmcReinforcementConfig;
  /** Song title for emitted metadata (defaults from MIDI name / filename). */
  title?: string;
}

export interface MidiRawNote {
  /** Absolute start in MIDI PPQ ticks. */
  startMidiTicks: number;
  /** Duration in MIDI PPQ ticks. */
  durationMidiTicks: number;
  pitch: number;
  velocity: number;
  /** MIDI channel 0–15. */
  midiChannel: number;
  sourceTrackIndex: number;
  sourceEventIndex: number;
  trackName: string;
  program: number;
  isDrum: boolean;
}

export interface MidiTempoEvent {
  midiTicks: number;
  bpm: number;
}

export interface MidiTimeSigEvent {
  midiTicks: number;
  numerator: number;
  denominator: number;
}

export interface MidiParseResult {
  ppq: number;
  name: string;
  formatHint: '0' | '1' | 'unknown';
  notes: MidiRawNote[];
  tempos: MidiTempoEvent[];
  timeSignatures: MidiTimeSigEvent[];
  trackCount: number;
}

export interface QuantizedNote {
  startTick: number;
  durationTicks: number;
  pitch: number;
  velocity: number;
  midiChannel: number;
  sourceTrackIndex: number;
  sourceEventIndex: number;
  trackName: string;
  program: number;
  isDrum: boolean;
  /** Shift applied during quantization (BeatBax ticks). */
  shiftTicks: number;
}

export interface ClassifiedStream {
  id: string;
  roleHint: ChipRole;
  instrument: string;
  isDrum: boolean;
  notes: QuantizedNote[];
  sourceTrackIndex: number;
  midiChannel: number;
  priority: number;
}

export interface PackedHit {
  startTick: number;
  durationTicks: number;
  /** Melodic note name (C4) or drum token (kick). */
  token: string;
  velocity: number;
  /** Instrument to select via inst() before this hit when multiplexing. */
  instrument?: string;
}

export interface PackedChannel {
  channelIndex: number; // 1-based BeatBax channel
  role: ChipRole;
  defaultInstrument: string;
  hits: PackedHit[];
}

export interface PatternDef {
  name: string;
  /** Tokens that sum exactly to patternTicks. */
  tokens: string[];
  /** Content hash for reuse. */
  hash: string;
  /** First bar index that used this content (for comments). */
  sourceBarIndex: number;
}

export interface SequenceDef {
  name: string;
  /** Playlist of pattern names (after *N compression encoded in emit). */
  playlist: string[];
}

export interface ChannelEmitPlan {
  channelIndex: number;
  defaultInstrument: string;
  role: ChipRole;
  sequenceName: string;
}

export interface ConversionSummary {
  notesImported: number;
  notesQuantized: number;
  notesDropped: number;
  barsGenerated: number;
  patternsReused: number;
  patternsEmitted: number;
  channelsPacked: number;
  bpm: number;
  chip: MidiChipId;
}

export interface ConversionDiagnostic {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface MidiConvertResult {
  source: string;
  diagnostics: ConversionDiagnostic[];
  summary: ConversionSummary;
}
