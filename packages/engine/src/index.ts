export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';
export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  midiToFreq,
  midiToFreqForNote,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from './util/music.js';

// AST types — re-exported for external consumers (e.g. chip plugins)
export type { InstrumentNode, InstMap, AST, PatternEvent, SequenceItem, ChannelNode, EnvelopeAST, SweepAST, NoiseAST } from './parser/ast.js';

// ─── Plugin system ────────────────────────────────────────────────────────────

export type { ChipPlugin, ChipChannelBackend, ValidationError, SongValidationContext, ChipUIContributions, ChipHelpSection, ChipNewSongWizard } from './chips/types.js';
export { ChipRegistry, chipRegistry, gameboyPlugin, getSongValidationIssues } from './chips/index.js';
export type { ExporterPlugin, ExportOptions, ExporterUIContribution } from './export/types.js';
export { ExporterRegistry, exporterRegistry } from './export/registry.js';
export { BeatBaxEngine } from './engine.js';
export { resolveSong, resolveSongAsync } from './song/index.js';
export type { SongModel, ChannelModel, ChannelEvent } from './song/songModel.js';
