/**
 * Utility modules for BeatBax engine.
 */

// Logger - centralized logging system
export {
  createLogger,
  configureLogging,
  loadLoggingFromStorage,
  loadLoggingFromURL,
  getLoggingConfig,
  traceNodeCreation,
  traceConnection,
  traceDisconnect,
  type Logger,
  type LogLevel,
  type LoggerConfig,
} from './logger.js';

// Diagnostics - structured error/warning reporting
export {
  formatDiagnostic,
  warn,
  error,
  type DiagLevel,
  type DiagMeta,
} from './diag.js';

// Music helpers - shared pitch and macro utilities
export {
  NOTE_SEMITONES,
  noteToMidi,
  midiToNote,
  midiToFreq,
  type ParsedMacro,
  type MacroState,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
} from './music.js';
