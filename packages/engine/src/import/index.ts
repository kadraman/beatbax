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
  type SubPatternCell,
  type DutyInstrument,
  type WaveInstrument,
  type NoiseInstrument,
  type Instrument,
  type PatternCell,
  type Pattern,
  type UGESong,
} from './uge/uge.reader.js';

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

