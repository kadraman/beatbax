import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { ElectronAPI, DiagnosticsLogLevel } from '../../../shared/electron-api';

/** Send a warning or error to the main-process diagnostics log file. */
export function logDiagnostics(level: DiagnosticsLogLevel, source: string, message: string, error?: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined;
  try {
    const api = (window as unknown as { electronAPI?: Partial<ElectronAPI> }).electronAPI;
    api?.logDiagnostics?.({ level, source, message, ...(stack ? { stack } : {}) });
  } catch {
    /* logging must never break the renderer */
  }
}

/**
 * Forward playback, export, and Output panel warnings/errors. Parse and
 * validation results are not forwarded: they quote song text and fire while typing.
 */
export function installDiagnosticsForwarder(eventBus: EventBus): () => void {
  const unsubscribers = [
    eventBus.on('playback:error', ({ error }) => {
      logDiagnostics('error', 'playback', error?.message ?? String(error), error);
    }),
    eventBus.on('export:error', ({ format, error }) => {
      logDiagnostics('error', 'export', `Export ${format} failed: ${error?.message ?? String(error)}`, error);
    }),
    eventBus.on('output:message', ({ type, message, source }) => {
      if (type === 'warning') logDiagnostics('warn', source || 'output', message);
      else if (type === 'error') logDiagnostics('error', source || 'output', message);
    }),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
