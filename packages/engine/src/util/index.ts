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
