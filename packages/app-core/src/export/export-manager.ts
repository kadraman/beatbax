/**
 * ExportManager - Handles song exports for browser and desktop clients.
 */

import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { chipRegistry } from '@beatbax/engine/chips';
import { createLogger } from '@beatbax/engine/util/logger';
import { normalizeExporterResult } from '@beatbax/engine/export';
import { exporterRegistry } from '../plugins/browser-exporter-registry.js';

import type { EventBus } from '../utils/event-bus.js';
import { exportStatus, exportFormat as exportFormatAtom } from '../stores/ui.store.js';
import { validateForExport } from './export-validator.js';
import { collectPcmWavExportWarnings } from './pcm-export-warnings.js';
import {
  downloadText,
  downloadBinary,
  ensureExtension,
  sanitizeFilename,
  MIME_TYPES,
  ExportHistory,
} from './download-helper.js';
import { settingAudioSampleRate } from '../stores/settings.store.js';

const log = createLogger('ui:export-manager');

/** Sanitize an open-document name for export; keep the original extension so
 *  `ensureExtension()` can replace `.bax` (including multi-dot names like
 *  `my.song.bax` → `my.song.uge`). */
function sanitizeDocumentFilename(name: string): string {
  return sanitizeFilename(name.trim()) || 'song';
}

/**
 * Available export formats — open string so plugin-provided IDs are accepted.
 */
export type ExportFormat = string;

/**
 * Export options
 */
export interface ExportOptions {
  /** Open document filename (e.g. `my.song.bax`); extension is replaced on export */
  filename?: string;
  /** Whether to validate before exporting */
  validate?: boolean;
}

/**
 * Result of an export operation
 */
export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  filename: string;
  size?: number;
  error?: Error;
  warnings?: string[];
  cancelled?: boolean;
}

/**
 * ExportManager - Coordinates all export operations
 */
export class ExportManager {
  private history = new ExportHistory();

  constructor(private eventBus: EventBus) {}

  /**
   * Export the current song to the given format
   */
  async export(
    source: string,
    format: ExportFormat,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const validate = options.validate !== false;
    const warnings: string[] = [];
    // Document name is available before parse; metadata may refine it after.
    let baseFilename = options.filename?.trim()
      ? sanitizeDocumentFilename(options.filename)
      : 'song';

    log.debug(`Export started: format=${format}`);
    this.eventBus.emit('export:started', { format });
    exportStatus.set('exporting');
    exportFormatAtom.set(format);

    try {
      // Parse source
      const ast = parse(source);
      // Prefer the open document name (e.g. ay_synth_channels.bax → ay_synth_channels.uge)
      // so export names match the file on disk. Fall back to song metadata when untitled.
      if (!options.filename?.trim()) {
        const metadataName = String((ast as any)?.metadata?.name ?? '').trim();
        if (metadataName) {
          baseFilename = sanitizeFilename(metadataName.toLowerCase());
        }
      }

      // Validate if requested
      if (validate) {
        const validation = validateForExport(ast, format);
        if (!validation.valid) {
          const errorMessage = validation.errors
            .map(e => e.suggestion ? `${e.message} — ${e.suggestion}` : e.message)
            .join('; ');
          throw new Error(`Validation failed: ${errorMessage}`);
        }
        warnings.push(...validation.warnings.map(w =>
          w.suggestion ? `${w.message} — ${w.suggestion}` : w.message
        ));
      }

      // Resolve song
      const resolved = resolveSong(ast as any, {
        onWarn: (w: any) => {
          const msg = typeof w === 'string' ? w : (w.message || String(w));
          warnings.push(msg);
          log.debug('Resolver warning:', msg);
        },
      });

      if (format === 'wav') {
        warnings.push(...collectPcmWavExportWarnings(resolved));
      }

      const result = await this.exportViaPlugin(
        resolved,
        baseFilename,
        format,
        (msg) => warnings.push(msg),
      );

      result.warnings = warnings;

      if (!result.success) {
        if (result.cancelled) {
          this.eventBus.emit('export:cancelled', { format, filename: result.filename });
          exportStatus.set('idle');
          log.debug(`Export cancelled: ${format}`);
        }
        return result;
      }

      // Record in history
      this.history.add({
        format,
        filename: result.filename,
        timestamp: new Date(),
        size: result.size,
      });

      this.eventBus.emit('export:success', { format, filename: result.filename });
      exportStatus.set('success');
      log.debug(`Export success: ${result.filename} (${result.size ?? 0} bytes)`);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.error(`Export failed (${format}):`, error);
      this.eventBus.emit('export:error', { format, error });
      exportStatus.set('error');
      return {
        success: false,
        format,
        filename: ensureExtension(baseFilename, this.extensionForFormat(format)),
        error,
      };
    }
  }

  private extensionForFormat(format: string): string {
    const plugin = exporterRegistry.get(format);
    if (plugin) {
      return plugin.extension.replace(/^\./, '') || format;
    }
    if (format === 'midi') return 'mid';
    return format;
  }

  /**
   * Export via a payload-returning exporter plugin.
   */
  private async exportViaPlugin(
    resolved: any,
    baseFilename: string,
    format: string,
    onWarn?: (msg: string) => void,
  ): Promise<ExportResult> {
    const plugin = exporterRegistry.get(format);
    if (!plugin) throw new Error(`Unknown export format: ${format}`);

    if (typeof plugin.validate === 'function') {
      const errors = plugin.validate(resolved);
      if (Array.isArray(errors) && errors.length > 0) {
        throw new Error(`Export failed: ${errors.join('; ')}`);
      }
    }

    const chipId = String(resolved?.chip ?? '').toLowerCase();
    const chipPlugin = chipId ? chipRegistry.get(chipId) : undefined;

    const ext = plugin.extension.replace(/^\./, '') || this.extensionForFormat(format);
    const filename = ensureExtension(baseFilename, ext);
    const result = await plugin.export(resolved, {
      resolveSampleAsset: typeof chipPlugin?.resolveSampleAsset === 'function'
        ? (ref: string) => chipPlugin.resolveSampleAsset!(ref)
        : undefined,
      onWarn,
      sampleRate: format === 'wav'
        ? parseInt(settingAudioSampleRate.get(), 10) || 44100
        : undefined,
    });

    const payload = normalizeExporterResult(result);
    if (!payload) {
      throw new Error(`Exporter '${plugin.id}' did not return downloadable data in browser mode.`);
    }

    // ExportManager owns the download name (document stem / metadata). Ignore
    // payload.filename so plugins cannot override with a differently cased title.
    const downloadName = filename;
    const mimeType = payload.mimeType || plugin.mimeType || MIME_TYPES[ext] || 'application/octet-stream';
    const savedFilename = typeof payload.data === 'string'
      ? await downloadText(payload.data, downloadName, mimeType)
      : await downloadBinary(payload.data, downloadName, mimeType);
    if (!savedFilename) return { success: false, format, filename: downloadName, cancelled: true };

    const size = typeof payload.data === 'string'
      ? payload.data.length
      : payload.data.byteLength;

    return {
      success: true,
      format,
      filename: savedFilename,
      size,
    };
  }

  /**
   * Get export history
   */
  getHistory() {
    return this.history.getAll();
  }
}
