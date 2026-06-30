import { writeFileSync } from 'fs';
import { normalizeExporterResult, type ExporterReturnValue } from './payload.js';

/**
 * Write a returned exporter payload to disk (Node.js / CLI adapter).
 * Returns true when payload bytes were written from the return value.
 */
export function writeExportPayload(outputPath: string, result: ExporterReturnValue): boolean {
  const normalized = normalizeExporterResult(result);
  if (!normalized) {
    return false;
  }

  if (typeof normalized.data === 'string') {
    writeFileSync(outputPath, normalized.data, 'utf8');
  } else {
    writeFileSync(outputPath, Buffer.from(normalized.data));
  }

  return true;
}
