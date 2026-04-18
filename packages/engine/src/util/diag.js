import { createLogger } from './logger.js';
const log = createLogger('diagnostics');
export function formatDiagnostic(level, component, message, meta) {
    const lvl = level || 'WARN';
    const comp = component || 'unknown';
    let parts = [];
    parts.push(`[${lvl}]`);
    parts.push(`[${comp}]`);
    parts.push(message);
    const fields = [];
    if (meta) {
        if (meta.file)
            fields.push(`file=${meta.file}`);
        if (meta.loc && meta.loc.start && typeof meta.loc.start.line === 'number') {
            const col = meta.loc.start.column || 0;
            fields.push(`line=${meta.loc.start.line}`);
            fields.push(`column=${col}`);
        }
    }
    if (fields.length)
        parts.push(fields.join(', '));
    return parts.join(' ');
}
export function warn(component, message, meta) {
    log.warn(formatDiagnostic('WARN', component, message, meta));
}
export function error(component, message, meta) {
    log.error(formatDiagnostic('ERROR', component, message, meta));
}
export default { formatDiagnostic, warn, error };
//# sourceMappingURL=diag.js.map