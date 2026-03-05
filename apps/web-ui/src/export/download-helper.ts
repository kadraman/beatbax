/**
 * Download helper - Browser file download utilities
 * Part of Phase 3: Export & Import
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:download');

/**
 * MIME types for supported export formats
 */
export const MIME_TYPES: Record<string, string> = {
  json: 'application/json',
  mid: 'audio/midi',
  midi: 'audio/midi',
  uge: 'application/octet-stream',
  wav: 'audio/wav',
  bax: 'text/plain',
};

/**
 * Sanitize a filename - replace invalid characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    || 'export';
}

/**
 * Get extension from filename (lowercase, without dot)
 */
export function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Ensure filename has the given extension
 */
export function ensureExtension(filename: string, ext: string): string {
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  if (!filename.toLowerCase().endsWith(`.${cleanExt}`)) {
    return `${filename}.${cleanExt}`;
  }
  return filename;
}

/**
 * Create a Blob from data (string or ArrayBuffer/Uint8Array)
 */
export function createBlob(
  data: string | ArrayBuffer | Uint8Array,
  mimeType: string
): Blob {
  if (typeof data === 'string') {
    return new Blob([data], { type: mimeType });
  }
  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: mimeType });
  }
  // Uint8Array — copy into a plain ArrayBuffer to satisfy strict BlobPart typing
  const ab = data.buffer instanceof ArrayBuffer
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    : new Uint8Array(data).buffer as ArrayBuffer;
  return new Blob([ab], { type: mimeType });
}

/**
 * Trigger a browser file download
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  try {
    anchor.click();
    log.debug('Download triggered:', filename, `(${blob.size} bytes, ${blob.type})`);
  } finally {
    // Clean up after a short delay to allow the download to start
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

/**
 * Download text data as a file
 */
export function downloadText(
  content: string,
  filename: string,
  mimeType = 'text/plain'
): void {
  const blob = createBlob(content, mimeType);
  triggerDownload(blob, filename);
}

/**
 * Download binary data as a file
 */
export function downloadBinary(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  mimeType = 'application/octet-stream'
): void {
  const blob = createBlob(data, mimeType);
  triggerDownload(blob, filename);
}

/**
 * Generate a timestamped filename
 */
export function generateFilename(base: string, ext: string): string {
  const cleanBase = sanitizeFilename(base);
  const cleanExt = ext.replace(/^\./, '');
  return `${cleanBase}.${cleanExt}`;
}

/**
 * Export history entry
 */
export interface ExportHistoryEntry {
  format: string;
  filename: string;
  timestamp: Date;
  size?: number;
}

/**
 * Export history manager - track recent exports
 */
export class ExportHistory {
  private history: ExportHistoryEntry[] = [];
  private maxEntries = 20;

  add(entry: ExportHistoryEntry): void {
    this.history.unshift(entry);
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }
  }

  getAll(): ExportHistoryEntry[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }

  getLastByFormat(format: string): ExportHistoryEntry | undefined {
    return this.history.find(e => e.format === format);
  }
}
