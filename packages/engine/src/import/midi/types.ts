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

/** Chord / overlap reduction policy for one mapping (feature 089). */
export type MonoPolicy = 'earliest' | 'highest' | 'lowest' | 'newest';

export type PackingMode = 'streams' | 'lanes';

export type UnmappedTracksMode = 'auto' | 'drop';

export type TempoPolicy = 'first' | 'longest';

export interface TrackMapping {
  midiTrack?: number;
  /** MIDI channel: 0–15 (0-based) or 1–16 (1-based); both accepted by the matcher. */
  midiChannel?: number;
  target: ChipRole;
  instrument?: string;
  drumMap?: DrumMap;
  /** First source bar (1-based, inclusive) this mapping applies to. */
  fromBar?: number;
  /** Last source bar (1-based, inclusive) this mapping applies to. */
  toBar?: number;
  mono?: MonoPolicy;
  /** Semitones applied before `fold` (melodic targets only). */
  transpose?: number;
  /** `[lo, hi]` MIDI note range; notes are moved by octaves into it (melodic targets only). */
  fold?: [number, number];
  /** Drum targets only: keep only these MIDI note numbers. */
  include?: number[];
  /** Drum targets only: ignore these MIDI note numbers. */
  exclude?: number[];
}

/** Coarse GM program → timbre family for kit articulation. */
export type GmFamily = 'piano' | 'guitar' | 'bass' | 'strings' | 'pad' | 'lead';

export const GM_FAMILIES: readonly GmFamily[] = [
  'piano',
  'guitar',
  'bass',
  'strings',
  'pad',
  'lead',
] as const;

/** Inclusive GM program range → family (after merge into a 128-slot table). */
export interface ProgramFamilyRange {
  min: number;
  max: number;
  family: GmFamily;
}

export interface GbFamilyArticulation {
  level: number;
  period: number;
  dutyP1: number;
  dutyP2: number;
  waveVolume: number;
}

export interface NesFamilyArticulation {
  vol: number;
  dutyP1: number;
  dutyP2: number;
  volEnv?: number[];
  pitchEnvP1?: number[];
}

export interface FamilyArticulation {
  gb: GbFamilyArticulation;
  nes: NesFamilyArticulation;
}

/** Partial articulation override from JSON `--config`. */
export interface FamilyArticulationConfig {
  gb?: Partial<GbFamilyArticulation>;
  nes?: {
    vol?: number;
    dutyP1?: number;
    dutyP2?: number;
    /** Set to `null` to clear a default volEnv. */
    volEnv?: number[] | null;
    /** Set to `null` to clear a default pitchEnvP1. */
    pitchEnvP1?: number[] | null;
  };
}

export interface DmcReinforcementConfig {
  enabled: boolean;
  kickSample?: string;
  snareSample?: string;
}

/** Optional JSON `--config` override (and CLI-merged options). */
export interface MidiImportConfig {
  chip?: MidiChipId;
  /** Song title override when CLI `--title` is omitted. */
  title?: string;
  ticksPerBeat?: number;
  patternTicks?: number;
  trackMappings?: TrackMapping[];
  dmcReinforcement?: DmcReinforcementConfig;
  /** GM program or `min-max` → family id; merges over defaults. */
  programFamilies?: Record<string, string>;
  /** Per-family articulation field overrides; merges over defaults. */
  families?: Partial<Record<GmFamily, FamilyArticulationConfig>>;
  quantize?: Partial<QuantizeOptions>;
  maxOverlapTicks?: number;
  /**
   * When different drum tokens share a start tick, nudge lower-priority hits
   * forward by up to this many BeatBax ticks into empty slots (default 1; 0 = drop).
   */
  drumFlamTicks?: number;
  maxBars?: number;
  /**
   * Bars per arrangement section for Pattern Grid–compatible emit (default 8).
   * `0` keeps a single monolithic seq per channel.
   */
  sectionBars?: number;
  /** `lanes` packs mappings that share a target in config order (gap fill). Default `streams`. */
  packing?: PackingMode;
  /** `drop` excludes notes that match no mapping. Default `auto`. */
  unmappedTracks?: UnmappedTracksMode;
  /** Source tempo override (BPM). */
  bpm?: number;
  /** Tempo event selection when `bpm` is absent. Default `first`. */
  tempo?: TempoPolicy;
  /** First source bar of the output window (1-based, inclusive). */
  startBar?: number;
  /** Last source bar of the output window (1-based, inclusive). */
  endBar?: number;
  /** Shift every note by this many source sixteenths before quantization. */
  nudge?: number;
  /** Emit the arrangement notes comment block. */
  annotate?: boolean;
}

export interface MidiConvertOptions {
  /** Required chip target. */
  chip: MidiChipId;
  ticksPerBeat: number;
  patternTicks: number;
  quantize: QuantizeOptions;
  maxOverlapTicks: number;
  /** Max flam distance for stacked drum tokens (see MidiImportConfig.drumFlamTicks). */
  drumFlamTicks: number;
  maxBars?: number;
  /**
   * Bars per arrangement section (default 8). `0` = monolithic one-seq-per-channel.
   */
  sectionBars: number;
  strict: boolean;
  trackMappings?: TrackMapping[];
  dmcReinforcement: DmcReinforcementConfig;
  /** Index 0–127 → family (built from defaults + config). */
  programFamilyByProgram: GmFamily[];
  /** Resolved articulations per family. */
  familyArticulations: Record<GmFamily, FamilyArticulation>;
  /** Song title for emitted metadata (defaults from MIDI name / filename). */
  title?: string;
  /** Default `streams`. */
  packing?: PackingMode;
  /** Default `auto`. */
  unmappedTracks?: UnmappedTracksMode;
  bpm?: number;
  /** Default `first`. */
  tempo?: TempoPolicy;
  startBar?: number;
  endBar?: number;
  /** Source sixteenths (may be negative). Default 0. */
  nudge?: number;
  /** Default false. */
  annotate?: boolean;
}

/** `MidiConvertOptions` with the optional arrangement fields filled with their defaults. */
export type ResolvedMidiConvertOptions = MidiConvertOptions &
  Required<Pick<MidiConvertOptions, 'packing' | 'unmappedTracks' | 'tempo' | 'nudge' | 'annotate'>>;

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

export interface MidiTrackInfo {
  index: number;
  name: string;
  /** MIDI channel 0–15 from the track header. */
  channel: number;
  program: number;
  /** GM program name as reported by the MIDI reader (may be empty). */
  programName: string;
}

export interface MidiParseResult {
  ppq: number;
  name: string;
  formatHint: '0' | '1' | 'unknown';
  notes: MidiRawNote[];
  tempos: MidiTempoEvent[];
  timeSignatures: MidiTimeSigEvent[];
  trackCount: number;
  /** Per-track metadata (absent on hand-built parse results). */
  tracks?: MidiTrackInfo[];
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
  /**
   * Length before a drum hit was shortened to one step (FR-041). Counts toward
   * the song length only; `durationTicks` is what gets emitted.
   */
  extentTicks?: number;
}

export interface ClassifiedStream {
  id: string;
  roleHint: ChipRole;
  instrument: string;
  /** GM timbre family for kit articulation (ignored for drums). */
  gmFamily?: GmFamily;
  /** When true, pack must not rewrite instrument from family+slot role. */
  instrumentLocked?: boolean;
  /** True when this stream matched a trackMappings override (skip pitch-range refine). */
  mappingOverride?: boolean;
  isDrum: boolean;
  /** Optional per-override GM pitch → token map (from trackMappings[].drumMap). */
  drumMap?: DrumMap;
  notes: QuantizedNote[];
  sourceTrackIndex: number;
  midiChannel: number;
  priority: number;
  /** Index into `trackMappings` when the stream came from one mapping (089). */
  mappingIndex?: number;
  /** True when the stream is a lane of `packing: "lanes"` (binding target). */
  lane?: boolean;
  /** Reduction policy to apply before packing (089). */
  mono?: MonoPolicy;
}

/** Per-mapping note accounting (089 arrangement stats). */
export interface MappingStats {
  mappingIndex: number;
  target: ChipRole;
  /** Resolved instrument name (last seen). */
  instrument: string;
  midiTrack?: number;
  midiChannel?: number;
  fromBar?: number;
  toBar?: number;
  /** Notes selected by the mapping (after include/exclude and range). */
  matched: number;
  /** Notes that reached the output channel. */
  kept: number;
  laneOverlap: number;
  monoReduce: number;
  pitchOutOfRange: number;
  /** Notes removed by include/exclude (by choice; not counted as dropped). */
  filtered: number;
  /** 1-based channel the mapping was packed onto (when known). */
  channelIndex?: number;
}

export interface PackedHit {
  startTick: number;
  durationTicks: number;
  /** See `QuantizedNote.extentTicks`. */
  extentTicks?: number;
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
  /** Ordered section sequence names for this channel (one or more). */
  sequenceNames: string[];
}

export interface ConversionSummary {
  notesImported: number;
  notesQuantized: number;
  notesDropped: number;
  barsGenerated: number;
  patternsReused: number;
  patternsEmitted: number;
  channelsPacked: number;
  /** Written `bpm` (source tempo scaled by `ticksPerBeat / 4`, rounded). */
  bpm: number;
  chip: MidiChipId;
  /** Per-mapping accounting when `trackMappings` are configured (089). */
  mappingStats?: MappingStats[];
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
