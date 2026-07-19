/**
 * Intermediate Arkos Tracker 3 model used by the BeatBax exporter.
 *
 * Format pinned to AT3 XML `formatVersion` 3.0 (plain XML; unzipped `.aks`).
 */

export type ChannelLink =
  | 'noSoftwareNoHardware'
  | 'softwareOnly'
  | 'hardwareOnly'
  | 'softwareAndHardware'
  | 'softwareToHardware'
  | 'hardwareToSoftware';

export interface ArkosInstrumentCell {
  volume: number;
  noise: number;
  link: ChannelLink;
  primaryPeriod?: number;
  primaryArpeggioNoteInOctave?: number;
  primaryArpeggioOctave?: number;
  primaryPitch?: number;
  ratio?: number;
  hardwareEnvelope?: number;
  isRetrig?: boolean;
}

export interface ArkosInstrument {
  /** 0-based index in the song instrument table. Index 0 is always Empty. */
  index: number;
  name: string;
  colorArgb: number;
  speed: number;
  isRetrig: boolean;
  loopStartIndex: number;
  endIndex: number;
  isLooping: boolean;
  isSfxExported: boolean;
  cells: ArkosInstrumentCell[];
}

export interface ArkosEffect {
  index: number;
  name: string;
  logicalValue: number;
}

export interface ArkosCell {
  /** Row index within the track (0-based). */
  index: number;
  /** Arkos note 0–127, or 255 for no note. */
  note: number;
  /** Instrument index when present. */
  instrument?: number;
  effects: ArkosEffect[];
}

export interface ArkosTrack {
  index: number;
  cells: ArkosCell[];
}

export interface ArkosPattern {
  index: number;
  trackIndexes: number[];
  speedTrackIndex: number;
  eventTrackIndex: number;
  colorArgb: number;
}

/** Non-zero per-channel transposition (AT3 PositionSerializer format). */
export interface ArkosTransposition {
  /** 0-based channel index. */
  channel: number;
  /** Non-zero transposition in semitones. */
  value: number;
}

export interface ArkosPosition {
  patternIndex: number;
  height: number;
  markerName: string;
  markerColor: number;
  /** Only non-zero entries; empty means all channels untransposed. */
  transpositions: ArkosTransposition[];
}

export interface ArkosPsgConfig {
  type: 'ay' | 'ym';
  frequencyHz: number;
  referenceFrequencyHz: number;
  samplePlayerFrequencyHz: number;
  mixingOutput: string;
}

export interface ArkosSubsong {
  title: string;
  initialSpeed: number;
  endPosition: number;
  loopStartPosition: number;
  replayFrequencyHz: number;
  digiChannel: number;
  highlightSpacing: number;
  secondaryHighlight: number;
  psgs: ArkosPsgConfig[];
  positions: ArkosPosition[];
  patterns: ArkosPattern[];
  tracks: ArkosTrack[];
  speedTracks: Array<{ index: number; cells: Array<{ index: number; value: number }> }>;
  eventTracks: Array<{ index: number; cells: Array<{ index: number; value: number }> }>;
}

export interface ArkosSong {
  formatVersion: string;
  title: string;
  author: string;
  composer: string;
  comment: string;
  instruments: ArkosInstrument[];
  subsongs: ArkosSubsong[];
}

/** Minimal song shape accepted by the exporter (resolved SongModel-compatible). */
export interface SongLike {
  pats: Record<string, string[]>;
  insts: Record<string, Record<string, unknown>>;
  seqs: Record<string, string[]>;
  channels: Array<{
    id: number;
    events: ChannelEventLike[];
    defaultInstrument?: string;
    speed?: number;
  }>;
  bpm?: number;
  chip?: string;
  chipRegion?: string;
  volume?: number;
  metadata?: {
    name?: string;
    artist?: string;
    description?: string;
    tags?: string[];
  };
}

export interface ChannelEventLike {
  type: string;
  token?: string;
  instrument?: string;
  instProps?: Record<string, unknown>;
  effects?: Array<{ type: string; params: Array<string | number> }>;
  defaultNote?: string;
  sourcePattern?: string;
  barNumber?: number;
}

/** Spectrum / CPC chip aliases accepted by this exporter. */
export const ARKOS_SUPPORTED_CHIPS = [
  'spectrum-128',
  'spectrum',
  'ay',
  'ay-3-8912',
  'cpc',
  'amstrad-cpc',
] as const;

export const CPC_CHIP_ALIASES = new Set(['cpc', 'amstrad-cpc']);

export const AY_CLOCK_SPECTRUM_128 = 1_773_400;
export const AY_CLOCK_CPC = 1_000_000;
export const AY_TICK_RATE_HZ = 50;

/** Empty / reserved instrument colour (matches AT3 default Empty). */
export const EMPTY_INSTRUMENT_COLOR = 4290822336;
/** Default instrument colour (opaque teal). */
export const DEFAULT_INSTRUMENT_COLOR = 0xff2a9d8f;
/** Position marker colour (matches AT3 samples). */
export const DEFAULT_MARKER_COLOR = 4282400896;
/** Pattern colour (matches AT3 samples). */
export const DEFAULT_PATTERN_COLOR = 4286611584;

/**
 * MIDI C4 (60) maps to Arkos note 48 (UI "C-4", ~261.6 Hz).
 * AT3 note index is MIDI − 12 (not − 24): A4 is Arkos 57, not 45.
 */
export const MIDI_TO_ARKOS_OFFSET = 12;
