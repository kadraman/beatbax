import type { ExportPayload } from './types.js';

export type ExporterReturnValue =
  | string
  | Uint8Array
  | ArrayBuffer
  | ExportPayload
  | void
  | undefined;

export interface NormalizedExportPayload {
  data: string | Uint8Array;
  filename?: string;
  mimeType?: string;
}

export function isExportPayload(value: unknown): value is ExportPayload {
  if (typeof value !== 'object' || value === null || !('data' in value)) {
    return false;
  }
  const data = (value as ExportPayload).data;
  return typeof data === 'string' || data instanceof Uint8Array || data instanceof ArrayBuffer;
}

/**
 * Normalize exporter return values into a browser-safe payload shape.
 * Accepts raw `string` / `Uint8Array` / `ArrayBuffer` returns and structured `ExportPayload`.
 */
export function normalizeExporterResult(
  result: ExporterReturnValue,
): NormalizedExportPayload | null {
  if (result === undefined || result === null) {
    return null;
  }

  if (isExportPayload(result)) {
    const { data, filename, mimeType } = result;
    if (typeof data === 'string') {
      return { data, filename, mimeType };
    }
    if (data instanceof Uint8Array) {
      return { data, filename, mimeType };
    }
    return { data: new Uint8Array(data), filename, mimeType };
  }

  if (typeof result === 'string') {
    return { data: result };
  }
  if (result instanceof Uint8Array) {
    return { data: result };
  }
  if (result instanceof ArrayBuffer) {
    return { data: new Uint8Array(result) };
  }

  return null;
}
