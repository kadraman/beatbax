/**
 * Import module exports (migrated into engine package)
 */
export { parseUGE, readUGEFile, midiNoteToUGE, ugeNoteToString, getUGESummary, getUGEDetailedJSON, InstrumentType, ChannelType, } from './uge/uge.reader.js';
// Remote import utilities
export { isRemoteImport, expandGitHubShorthand, normalizeRemoteUrl, validateRemoteUrl, } from './urlUtils.js';
export { RemoteInstrumentCache, } from './remoteCache.js';
//# sourceMappingURL=index.js.map