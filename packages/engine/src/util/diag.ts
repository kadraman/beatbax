import { SourceLocation } from '../parser/ast.js';
import { createLogger } from './logger.js';

const log = createLogger('diagnostics');

export type DiagLevel = 'WARN' | 'ERROR' | 'INFO';

export interface DiagMeta {
  file?: string;
  loc?: SourceLocation | null;
}

export function formatDiagnostic(level: DiagLevel, component: string, message: string, meta?: DiagMeta) {
  const lvl = level || 'WARN';
  const comp = component || 'unknown';
  let parts: string[] = [];
  parts.push(`[${lvl}]`);
  parts.push(`[${comp}]`);
  parts.push(message);
  const fields: string[] = [];
  if (meta) {
    if (meta.file) fields.push(`file=${meta.file}`);
    if (meta.loc && meta.loc.start && typeof meta.loc.start.line === 'number') {
      const col = meta.loc.start.column || 0;
      fields.push(`line=${meta.loc.start.line}`);
      fields.push(`column=${col}`);
    }
  }
  if (fields.length) parts.push(fields.join(', '));
  return parts.join(' ');
}

export function warn(component: string, message: string, meta?: DiagMeta) {
  log.warn(formatDiagnostic('WARN', component, message, meta));
}

export function error(component: string, message: string, meta?: DiagMeta) {
  log.error(formatDiagnostic('ERROR', component, message, meta));
}

export default { formatDiagnostic, warn, error };
