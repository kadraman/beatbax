export { renderSongToPCM } from './audio/pcmRenderer.js';
export * from './import/index.js';
export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  listInstrumentNoteOptions,
  midiToFreq,
  midiToFreqForNote,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
  formatMacro,
} from './util/music.js';
export { listUgeNoteOptions } from './chips/gameboy/noiseNote.js';
export { serializeInstrument, parseInstrumentBody, formatInstrumentFieldValue } from './instruments/serialize.js';
export {
  generateWaveformPreset,
  samplesToHex,
  parseWaveHexInput,
  normalizeWaveSamples,
} from './instruments/waveform.js';
export { parseWaveTable } from './chips/gameboy/wave.js';

// AST types — re-exported for external consumers (e.g. chip plugins)
export type { InstrumentNode, InstMap, AST, PatternEvent, SequenceItem, ChannelNode, EnvelopeAST, SweepAST, NoiseAST } from './parser/ast.js';

// ─── Plugin system ────────────────────────────────────────────────────────────

export type { ChipPlugin, ChipChannelBackend, ValidationError, SongValidationContext, ChipSongContext, ChipUIContributions, ChipHelpSection, ChipHelpContext, ChipNewSongWizard, ChipInstrumentEditor, ChipInstrumentTypeDef, ChipInstrumentFieldDef, ChipInstrumentMacroDef, ChipInstrumentWaveformDef, ChipInstrumentPreset, ChipInstrumentConstraintNote } from './chips/types.js';
export { ChipRegistry, chipRegistry, gameboyPlugin, getSongValidationIssues } from './chips/index.js';
export type { ExporterPlugin, ExportOptions, ExporterUIContribution } from './export/types.js';
export { ExporterRegistry, exporterRegistry } from './export/registry.js';
export { BeatBaxEngine } from './engine.js';
export { resolveSong, resolveSongAsync } from './song/index.browser.js';
export type { SongModel, ChannelModel, ChannelEvent } from './song/songModel.js';
