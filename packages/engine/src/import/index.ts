/**
 * Import module exports (migrated into engine package)
 */

export {
  parseUGE,
  readUGEFile,
  midiNoteToUGE,
  ugeNoteToString,
  getUGESummary,
  getUGEDetailedJSON,
  InstrumentType,
  ChannelType,
  subpatternFromNoiseMacro,
  type SubPatternCell,
  type DutyInstrument,
  type WaveInstrument,
  type NoiseInstrument,
  type Instrument,
  type PatternCell,
  type Pattern,
  type UGESong,
} from './uge/uge.reader.js';

export {
  extractUgeInstrumentLibrary,
  extractInstrumentsFromUGE,
  formatGameBoyIns,
  formatGameBoyInstrumentsDemo,
  sanitizeIdent,
  createNameAllocator,
  emptyExtractionResult,
  formatSubpatternBlock,
  type ExtractedInstrument,
  type ExtractionResult,
  type ExtractUgeLibraryOptions,
  type InstrumentKind,
} from './uge/ugeInstrumentsToBax.js';

// Remote import utilities
export {
  isRemoteImport,
  expandGitHubShorthand,
  normalizeRemoteUrl,
  validateRemoteUrl,
  type RemoteImportSecurityOptions,
} from './urlUtils.js';

export {
  RemoteInstrumentCache,
  type RemoteImportOptions,
  type RemoteImportProgress,
} from './remoteCache.js';

// MIDI → .bax conversion (feature 006)
export {
  convertMidiToBax,
  convertMidiParseResult,
  convertMidiWithCliArgs,
  resolveConvertOptions,
  parseImportConfig,
  defaultConvertOptions,
  parseChipId,
  parseQuantizeMode,
  parseQuantizeGrid,
  readMidiBytes,
  quantizeNotes,
  midiTicksToBaxTicks,
  classifyStreams,
  mapDrumPitch,
  DEFAULT_DRUM_MAP,
  packChannels,
  emitKitLines,
  buildPatternsAndSequences,
  compressPlaylist,
  hitsToBarTokens,
  hashTokens,
  emitBaxSource,
  type MidiConvertOptions,
  type MidiConvertResult,
  type MidiImportConfig,
  type ConversionSummary,
  type ConversionDiagnostic,
} from './midi/index.js';

